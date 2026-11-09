"""Anonymous browser integration: DOCX/PDF local extraction -> confirmation -> shared master v4.
Creates QA files in the same reusable _private/test-artifacts/doc-import-qa folder.
Never sends user files or contacts an external AI model.
"""
import base64,json,os,subprocess,time
from pathlib import Path
import requests
from websockets.sync.client import connect

ROOT=Path.cwd()
QA=ROOT/"_private"/"test-artifacts"/"doc-import-qa"
QA.mkdir(parents=True,exist_ok=True)
LOG=open(QA/"server.log","wb")
CHROME_LOG=open(QA/"chrome.log","wb")
PORT,CDP=3221,9371
ENV=dict(os.environ,PORT=str(PORT),HOST="127.0.0.1")
report={"checks":[],"anonymous_only":True}
server=chrome=None

def fixture_files():
  from docx import Document
  from reportlab.pdfgen.canvas import Canvas
  from reportlab.pdfbase import pdfmetrics
  from reportlab.pdfbase.cidfonts import UnicodeCIDFont
  from PIL import Image
  lines=[
    "匿名测试候选人","教育背景",
    "测试科技大学 本科 专业：计算机科学 2022.09—2026.06",
    "项目经历","智能监测系统 2025.03—2025.09",
    "技术栈：STM32、FreeRTOS、UART","• 实现多任务传感器采样",
    "实习经历","测试软件有限公司｜软件开发 2024.07—2025.01",
    "• 编写自动化测试脚本","专业技能","开发语言：C、Python",
    "荣誉奖项","省赛软件测试团体三等奖 2024",
  ]
  doc=Document()
  for i,line in enumerate(lines):
    if line in ("教育背景","项目经历","实习经历","专业技能","荣誉奖项"):
      doc.add_heading(line,2)
    else:doc.add_paragraph(line)
  word=QA/"qa-resume.docx"
  doc.save(word)
  pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
  pdf=QA/"qa-text.pdf"
  c=Canvas(str(pdf),pagesize=(595,842))
  c.setFont("STSong-Light",11)
  y=802
  for line in lines:
    c.drawString(48,y,line)
    y-=34
  c.showPage();c.save()
  scanned=QA/"qa-scanned.pdf"
  blank=Image.new("RGB",(640,900),"white")
  png=QA/"qa-image.png";blank.save(png)
  c=Canvas(str(scanned),pagesize=(595,842))
  c.drawImage(str(png),0,0,width=595,height=842)
  c.showPage();c.save()
  return word,pdf,scanned

try:
  word,pdf,scanned=fixture_files()
  server=subprocess.Popen(["node","--import","tsx","server.ts"],cwd=ROOT,env=ENV,stdout=LOG,stderr=LOG)
  for _ in range(110):
    if server.poll() is not None:raise RuntimeError("Development server exited")
    try:
      if requests.get(f"http://127.0.0.1:{PORT}/",timeout=.8).status_code==200:break
    except requests.RequestException:pass
    time.sleep(.18)
  else:raise RuntimeError("No live HTTP server")
  chrome=subprocess.Popen([r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    "--headless=new","--no-first-run","--no-default-browser-check",
    "--disable-extensions","--disable-background-networking",
    f"--remote-debugging-port={CDP}","--remote-allow-origins=*",
    "--window-size=1420,1020","--user-data-dir="+str(QA/"chrome-profile"),
    "about:blank"],cwd=ROOT,env=ENV,stdout=CHROME_LOG,stderr=CHROME_LOG)
  tab=None
  for _ in range(100):
    try:
      items=requests.get(f"http://127.0.0.1:{CDP}/json",timeout=.8).json()
      tab=next((x for x in items if x.get("type")=="page"),None)
      if tab:break
    except requests.RequestException:pass
    time.sleep(.17)
  assert tab,"Chrome CDP unavailable"
  with connect(tab["webSocketDebuggerUrl"],origin="http://localhost",max_size=20*1024*1024) as ws:
    index=[0]
    def call(method,params=None):
      index[0]+=1
      n=index[0]
      ws.send(json.dumps({"id":n,"method":method,"params":params or {}}))
      while True:
        result=json.loads(ws.recv())
        if result.get("id")==n:
          if "error" in result:raise RuntimeError(str(result["error"]))
          return result.get("result",{})
    def ev(script):
      result=call("Runtime.evaluate",{"expression":script,"returnByValue":True,"awaitPromise":True})
      if "exceptionDetails" in result:raise RuntimeError(str(result["exceptionDetails"])[:450])
      return result.get("result",{}).get("value")
    def wait(expression,seconds=20):
      began=time.monotonic()
      while time.monotonic()-began<seconds:
        if ev(expression):return
        time.sleep(.2)
      raise AssertionError("Timed out: "+expression)
    def click(text,scope="document"):
      phrase=json.dumps(text,ensure_ascii=False)
      assert ev(f"""(()=>{{const root={scope};const b=[...root.querySelectorAll('button')].find(x=>x.textContent.includes({phrase}));if(!b)return false;b.click();return true}})()"""),"Missing "+text
    def file_input(path):
      root=call("DOM.getDocument",{"depth":-1})["root"]["nodeId"]
      selector='section[aria-label="母版内容库"] input[type=file]'
      item=call("DOM.querySelector",{"nodeId":root,"selector":selector})["nodeId"]
      assert item,"File chooser missing"
      call("DOM.setFileInputFiles",{"nodeId":item,"files":[str(path.resolve())]})
    def db_counts():
      return ev("""(async()=>{
        return await new Promise((resolve,reject)=>{
          const q=indexedDB.open('craftcv-private-evidence-v1');
          q.onsuccess=()=>{
            const db=q.result;
            const tx=db.transaction(['sourceDocuments','contentEntries','masterFiles'],'readonly');
            const a=tx.objectStore('sourceDocuments').count();
            const b=tx.objectStore('contentEntries').count();
            const c=tx.objectStore('masterFiles').count();
            let n1=-1,n2=-1,n3=-1;
            a.onsuccess=()=>n1=a.result;
            b.onsuccess=()=>n2=b.result;
            c.onsuccess=()=>n3=c.result;
            tx.oncomplete=()=>{db.close();resolve([n1,n2,n3])};
            tx.onerror=()=>reject(new Error('count failed'));
          };
          q.onerror=()=>reject(new Error('open failed'));
        });
      })()""")
    call("Page.enable");call("DOM.enable");call("Runtime.enable")
    call("Page.addScriptToEvaluateOnNewDocument",{"source":"""(()=>{
      window.__qaModelCalls=0;
      const orig=window.fetch.bind(window);
      window.fetch=(input,config)=>{
        const url=typeof input==='string'?input:input.url;
        if(url==='/api/ai/models')return Promise.resolve(new Response(
          JSON.stringify({models:[],defaultId:null,supportedProviders:[]}),
          {status:200,headers:{'content-type':'application/json'}}));
        if(url.startsWith('/api/ai/')){
          window.__qaModelCalls++;
          return Promise.resolve(new Response(JSON.stringify({error:'QA network blocked'}),{status:409}));
        }
        return orig(input,config);
      };
    })()"""})
    call("Page.navigate",{"url":f"http://127.0.0.1:{PORT}/"})
    wait("document.querySelectorAll('button').length>20")
    ev("window.confirm=()=>true;true")
    click("母版资料")
    wait("document.querySelector('section[aria-label=\\\"母版内容库\\\"]')!==null")
    file_input(word)
    wait("document.querySelector('section[aria-label=\\\"母版内容库\\\"]')?.innerText.includes('qa-resume.docx')")
    assert db_counts()==[0,0,1],db_counts()
    assert ev("document.querySelector('section[aria-label=\\\"提取到可编辑内容库\\\"]')===null")
    report['checks'].append('Adding DOCX saves raw Blob only: no auto-extraction or AI')
    raw_reference=ev("""(async()=>{
      const loader=await import('/src/utils/masterRawRetrieval.ts');
      const extracts=await loader.loadMasterRawExcerpts('STM32 FreeRTOS');
      return {count:extracts.length,hasRtos:extracts.some(x=>x.excerpt.includes('FreeRTOS'))};
    })()""")
    assert raw_reference['count']>=1 and raw_reference['hasRtos'],raw_reference
    assert db_counts()==[0,0,1],db_counts()
    report["checks"].append("A manually started read can access newly added DOCX without prior extraction or AI upload")

    click("一键提取")
    wait("document.querySelector('section[aria-label=\\\"提取到可编辑内容库\\\"]')!==null")
    wait("document.querySelector('section[aria-label=\\\"提取到可编辑内容库\\\"]')?.innerText.includes('已找到')")
    docx_text=ev("document.querySelector('section[aria-label=\\\"提取到可编辑内容库\\\"]')?.innerText.slice(0,1050)")
    assert "教育" in docx_text and "项目" in docx_text,docx_text[:200]
    report["checks"].append("DOCX original saved locally, extraction panel displays editable grouped candidates")
    assert ev("document.querySelector('section[aria-label=\\\"提取到可编辑内容库\\\"]')?.querySelectorAll('input[type=checkbox]').length===0"),"Simple flow should have no mandatory checkbox stage"
    click("保存到内容库")
    wait("document.querySelector('section[aria-label=\\\"提取到可编辑内容库\\\"]')===null")
    assert db_counts()[0]==1,db_counts()
    report["checks"].append("Confirmed DOCX structured source persisted to the existing IndexedDB")
    after_extract=ev("""(async()=>{
      const loader=await import('/src/utils/masterSourceRetrieval.ts');
      const original=File.prototype.arrayBuffer;
      let rawReads=0;
      File.prototype.arrayBuffer=function(){rawReads++;return original.call(this)};
      try{
        const ctx=await loader.loadMasterAIReferences('STM32 FreeRTOS 监测系统');
        return {raw:ctx.masterRaw.length,structured:ctx.masterStructured.length,
          rawReads,hasSkills:ctx.masterStructured.some(x=>x.excerpt.includes('FreeRTOS'))};
      }finally{File.prototype.arrayBuffer=original}
    })()""")
    assert after_extract['raw']==0 and after_extract['structured']==1 and after_extract['rawReads']==0 and after_extract['hasSkills'],after_extract
    report["checks"].append("Once extraction is saved, AI uses content library fields and never opens original DOCX again")



    click("编辑提取内容")
    wait("document.querySelector('section[aria-label=\\\"提取到可编辑内容库\\\"]')!==null")
    changed=ev("""(()=>{
      const dialog=document.querySelector('section[aria-label="提取到可编辑内容库"]');
      const input=[...dialog.querySelectorAll('input')].find(x=>x.value.includes('智能监测系统'));
      if(!input)return false;
      const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
      setter.call(input,'QA 人工修订监测项目');
      input.dispatchEvent(new Event('input',{bubbles:true}));
      return true;
    })()""")
    assert changed,"Editable project name input missing"
    click("保存修改")
    wait("document.querySelector('section[aria-label=\\\"提取到可编辑内容库\\\"]')===null")
    revised=ev("""(async()=>{
      const q=indexedDB.open('craftcv-private-evidence-v1');
      return await new Promise((resolve,reject)=>{
        q.onsuccess=()=>{
          const db=q.result;
          const tx=db.transaction(['sourceDocuments','masterFiles'],'readonly');
          const source=tx.objectStore('sourceDocuments').getAll();
          const raws=tx.objectStore('masterFiles').getAll();
          let project='',rawCount=0,validBlob=false;
          source.onsuccess=()=>project=source.result.find(x=>x.format==='docx')?.projects[0]?.name??'';
          raws.onsuccess=()=>{rawCount=raws.result.length;validBlob=raws.result[0]?.blob?.size>0};
          tx.oncomplete=()=>{db.close();resolve({project,rawCount,validBlob})};
          tx.onerror=()=>reject(new Error('read failed'));
        };
      });
    })()""")
    assert revised['project']=='QA 人工修订监测项目' and revised['rawCount']==1 and revised['validBlob'],revised
    report["checks"].append("Editing extracted structured record persists while original DOCX Blob stays untouched")
    after_edit=ev("""(async()=>{
      const loader=await import('/src/utils/masterSourceRetrieval.ts');
      const original=File.prototype.arrayBuffer;
      let rawReads=0;
      File.prototype.arrayBuffer=function(){rawReads++;return original.call(this)};
      try{
        const ctx=await loader.loadMasterAIReferences('人工修订监测项目 FreeRTOS');
        return {raw:ctx.masterRaw.length,structured:ctx.masterStructured.length,rawReads,
          hasEdit:ctx.masterStructured.some(x=>x.excerpt.includes('QA 人工修订监测项目')),
          hasStale:ctx.masterStructured.some(x=>x.excerpt.includes('智能监测系统'))};
      }finally{File.prototype.arrayBuffer=original}
    })()""")
    assert after_edit['raw']==0 and after_edit['structured']==1 and after_edit['rawReads']==0 and after_edit['hasEdit'] and not after_edit['hasStale'],after_edit
    report["checks"].append("Subsequent AI context follows edited structure, not stale original text; zero raw File reads")


    file_input(pdf)
    wait("document.querySelector('section[aria-label=\\\"母版内容库\\\"]')?.innerText.includes('qa-text.pdf')")
    assert db_counts()[0]==1 and db_counts()[2]==2,db_counts()
    report['checks'].append('Adding PDF likewise only stores the original file')
    click("一键提取")
    wait("document.querySelector('section[aria-label=\\\"提取到可编辑内容库\\\"]')!==null")
    wait("document.querySelector('section[aria-label=\\\"提取到可编辑内容库\\\"]')?.innerText.includes('已找到')",seconds=40)
    pdf_text=ev("document.querySelector('section[aria-label=\\\"提取到可编辑内容库\\\"]')?.innerText.slice(0,1050)")
    assert "教育" in pdf_text and "项目" in pdf_text,pdf_text[:210]
    report["checks"].append("Chinese text PDF extracted with PDF.js CMap and fonts locally")
    assert ev("document.querySelector('section[aria-label=\\\"提取到可编辑内容库\\\"]')?.querySelectorAll('input[type=checkbox]').length===0")
    click("保存到内容库")
    wait("document.querySelector('section[aria-label=\\\"提取到可编辑内容库\\\"]')===null")
    assert db_counts()[0]==2,db_counts()
    report["checks"].append("PDF confirmed structured source saved separately; DOCX preserved")

    sources=ev("""(async()=>{
      return await new Promise((resolve,reject)=>{
        const q=indexedDB.open('craftcv-private-evidence-v1');
        q.onsuccess=()=>{
          const db=q.result;const tx=db.transaction('sourceDocuments','readonly');
          const all=tx.objectStore('sourceDocuments').getAll();
          all.onsuccess=()=>{const result=all.result.map(x=>({
            format:x.format,education:x.education.length,
            projects:x.projects.length,experience:x.experience.length,
            skills:x.skills.length,awards:x.awards.length,
          }));db.close();resolve(result);};
          all.onerror=()=>reject(new Error('Source read failed'));
        };
        q.onerror=()=>reject(new Error('DB open failed'));
      });
    })()""")
    assert len(sources)==2,sources
    assert all(all(record[field]>=1 for field in ('education','projects','experience','skills','awards'))
               for record in sources),sources
    report["checks"].append("Both confirmed sources retained education, projects, experience, skills and awards")
    file_input(scanned)
    wait("document.querySelector('section[aria-label=\\\"母版内容库\\\"]')?.innerText.includes('qa-scanned.pdf')")
    assert db_counts()[0]==2 and db_counts()[2]==3,db_counts()
    click("一键提取")
    wait("document.querySelector('section[aria-label=\\\"提取到可编辑内容库\\\"] [role=alert]')!==null",seconds=35)
    error=ev("document.querySelector('section[aria-label=\\\"提取到可编辑内容库\\\"] [role=alert]')?.innerText")
    assert error and ("文字层" in error or "扫描" in error),error
    assert db_counts()[0]==2
    assert ev("window.__qaModelCalls")==0
    report["checks"].append("Image-only PDF kept as raw file, produces OCR warning and no invented structured content")
    report["checks"].append("All three import flows made zero AI calls and retained both confirmed sources")
    image=call("Page.captureScreenshot",{"format":"png"})
    (QA/"scanned-pdf-warning.png").write_bytes(base64.b64decode(image["data"]))
    (QA/"report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(report,ensure_ascii=False,indent=2))
finally:
  for proc in (chrome,server):
    if proc and proc.poll() is None:
      proc.terminate()
      try:proc.wait(timeout=8)
      except subprocess.TimeoutExpired:
        proc.kill();proc.wait(timeout=3)
  LOG.close();CHROME_LOG.close()
