"""Isolated browser QA for master-content collection -> role version generation.
Uses synthetic records only, mocks all AI endpoints and keeps a reusable test profile.
Run: py -3.12 -B tests/masterContent_browser_qa.py
"""
import base64
import json
import os
import subprocess
import time
from pathlib import Path

import requests
from websockets.sync.client import connect

ROOT=Path.cwd()
QA=ROOT/"_private"/"test-artifacts"/"master-content-ui-qa"
QA.mkdir(parents=True,exist_ok=True)
PORT,CDP=3215,9365
URL=f"http://127.0.0.1:{PORT}/"
ENV=dict(os.environ,PORT=str(PORT),HOST="127.0.0.1")
LOG=open(QA/"server.log","wb")
CHROME_LOG=open(QA/"chrome.log","wb")
server=chrome=None
report={"synthetic_data_only":True,"external_ai_called":False,"checks":[]}
INJECTION="""(()=>{
  const original=window.fetch.bind(window);
  window.__masterQaAiCalls=0;
  window.fetch=(input,options)=>{
    const url=typeof input==='string'?input:input.url;
    if(url==='/api/ai/models')return Promise.resolve(new Response(
      JSON.stringify({models:[],defaultId:null,supportedProviders:[]}),
      {status:200,headers:{'content-type':'application/json'}}));
    if(url.startsWith('/api/ai/')){
      window.__masterQaAiCalls+=1;
      return Promise.resolve(new Response(JSON.stringify({error:'QA blocks model calls'}),{status:409}));
    }
    return original(input,options);
  };
})();"""
try:
  server=subprocess.Popen(["node","--import","tsx","server.ts"],cwd=ROOT,
                          env=ENV,stdout=LOG,stderr=LOG)
  for _ in range(100):
    if server.poll() is not None:raise RuntimeError("App server exited")
    try:
      if requests.get(URL,timeout=1).status_code==200:break
    except requests.RequestException:pass
    time.sleep(.2)
  else:raise RuntimeError("App server failed to start")
  rejected=requests.post(URL+"api/ai/draft-role-resume",json={
    "targetRole":"软件工程师","jobDescription":"","fields":[{
      "id":"basics.name","label":"姓名","original":"这个字段不允许交给任何 AI 模型，属于个人身份信息。"
    }]
  },timeout=5)
  assert rejected.status_code==400,rejected.status_code
  report["checks"].append("Real server rejects locked-identity payload before AI model invocation")

  chrome=subprocess.Popen([
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    "--headless=new","--no-first-run","--no-default-browser-check",
    "--disable-extensions","--disable-background-networking",
    f"--remote-debugging-port={CDP}","--remote-allow-origins=*",
    "--window-size=1450,1000","--user-data-dir="+str(QA/"chrome-profile"),
    "about:blank"
  ],cwd=ROOT,env=ENV,stdout=CHROME_LOG,stderr=CHROME_LOG)
  tab=None
  for _ in range(100):
    try:
      pages=requests.get(f"http://127.0.0.1:{CDP}/json",timeout=1).json()
      tab=next((page for page in pages if page.get("type")=="page"),None)
      if tab:break
    except requests.RequestException:pass
    time.sleep(.2)
  assert tab,"Chrome CDP not available"
  with connect(tab["webSocketDebuggerUrl"],origin="http://localhost",max_size=16*1024*1024) as ws:
    seq=[0]
    def call(method,params=None):
      seq[0]+=1; target=seq[0]
      ws.send(json.dumps({"id":target,"method":method,"params":params or {}}))
      while True:
        response=json.loads(ws.recv())
        if response.get("id")==target:
          if "error" in response:raise RuntimeError(str(response["error"]))
          return response.get("result",{})
    def ev(source):
      result=call("Runtime.evaluate",{"expression":source,
        "returnByValue":True,"awaitPromise":True})
      if "exceptionDetails" in result:raise RuntimeError(str(result["exceptionDetails"])[:500])
      return result.get("result",{}).get("value")
    def wait_until(expr,timeout=12):
      started=time.monotonic()
      while time.monotonic()-started<timeout:
        if ev(expr):return
        time.sleep(.15)
      raise AssertionError("Timed out: "+expr)
    def click(text):
      expr="(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes("+json.dumps(text,ensure_ascii=False)+"));if(!b)return false;b.click();return true})()"
      assert ev(expr),"Missing button: "+text
    call("Page.enable")
    call("Runtime.enable")
    call("Page.addScriptToEvaluateOnNewDocument",{"source":INJECTION})
    call("Page.navigate",{"url":URL})
    wait_until("document.querySelectorAll('button').length>20")
    # Let the initial React mount finish saving its default demo slots before seeding.
    wait_until("JSON.parse(localStorage.getItem('craftcv_resume_slots_v2_lanes')||'[]').length===2")
    time.sleep(.6)
    # Seed a realistic-but-fake saved resume in the isolated browser only.
    seed="""(()=>{
      const key='craftcv_ee_resume_v4_movable';
      const resume=JSON.parse(localStorage.getItem(key));
      if(!resume)return false;
      resume.id='qa-real-resume';resume.versionName='QA 自有履历';
      resume.basics.name='匿名测试候选人';resume.basics.title='软件工程师';
      resume.basics.summary='负责软件工程模块和维护';
      resume.basics.phone='';resume.basics.email='';resume.basics.github='';
      resume.basics.website='';resume.basics.avatarUrl='';resume.basics.showAvatar=false;
      resume.basics.schoolTag='QA 测试大学';resume.basics.statusTag='QA 匿名测试';
      resume.basics.directionTags='QA 测试流程';resume.basics.politicalStatus='';
      resume.basics.location='QA 测试城市';resume.basics.graduationYear='2026';
      resume.education=[{id:'qa-edu',school:'QA 测试大学',degree:'本科',
        major:'计算机',startDate:'2022',endDate:'2026',gpa:'',ranking:'',
        courses:'',honors:''}];
      resume.projects=[{id:'qa-project',name:'QA 多任务监测终端',role:'固件开发',
        startDate:'2024',endDate:'2025',repoUrl:'',techStack:['STM32','FreeRTOS','UART'],
        summary:'负责采样和故障告警',bullets:['实现 FreeRTOS 多任务采样与 UART 串口通信，并完成故障告警模块的联调工作']}];
      resume.experience=[{id:'qa-experience',company:'QA 测试公司',position:'测试开发',
        department:'技术',location:'',startDate:'2023',endDate:'2024',
        techStack:['Python','Linux'],bullets:['编写 Python 自动化测试脚本，并对 Linux 应用的缺陷进行定位与修复']}];
      resume.skills=[{id:'qa-skills',category:'真实项目技能',items:'STM32、Python'}];
      resume.awards=[];resume.customSections=[];delete resume.factLedger;
      localStorage.setItem(key,JSON.stringify(resume));
      localStorage.setItem('craftcv_resume_slots_v2_lanes',JSON.stringify([{
        id:'qa-base-slot',name:'QA 合成真实履历',roleCategory:'软件工程师',
        versionTag:'v1.0',targetCompany:'测试',notes:'QA only',
        updatedAt:new Date().toISOString(),data:resume}]));
      return true;
    })()"""
    assert ev(seed) is True
    call("Page.reload",{"ignoreCache":True})
    wait_until("document.body?.innerText.includes('QA 多任务监测终端')",timeout=20)
    wait_until("JSON.parse(localStorage.getItem('craftcv_resume_slots_v2_lanes')||'[]').length===1")
    assert ev("JSON.parse(localStorage.getItem('craftcv_resume_slots_v2_lanes'))[0].id")=="qa-base-slot"

    report["checks"].append("Browser loaded the synthetic real-resume slot without real personal files")
    ev("window.confirm=()=>true;true")
    click("母版资料")
    wait_until("document.querySelector('section[aria-label=\"母版内容库\"]')!==null")
    assert ev("document.querySelectorAll('section[aria-label=\"母版内容库\"] input[type=checkbox]').length")==2
    report["checks"].append("Existing evidence master shows project and experience collection controls")
    assert ev("""(()=>{
      const inputs=[...document.querySelectorAll('section[aria-label="母版内容库"] input[type=checkbox]')];
      inputs.forEach(x=>x.click());return inputs.length===2;
    })()""")
    wait_until("document.body.innerText.includes('确认收录 2 条')")
    click("确认收录 2 条")
    wait_until("document.querySelector('section[aria-label=\"母版内容库\"]')?.innerText.includes('已保存的母版经历')")
    n=ev("""(async()=> {
      const db=await indexedDB.open('craftcv-private-evidence-v1');
      return await new Promise(resolve=>db.onsuccess=()=>{
        const store=db.result.transaction('contentEntries').objectStore('contentEntries');
        const request=store.count();request.onsuccess=()=>{const n=request.result;db.result.close();resolve(n)};
      });
    })()""")
    assert n==2,n
    report["checks"].append("Explicitly confirmed two synthetic records in the existing IndexedDB master")
    # Seed only synthetic, already-confirmed DOCX structured fields in the isolated QA database.
    seeded=ev("""(async()=>{
      const req=indexedDB.open('craftcv-private-evidence-v1');
      return await new Promise((resolve,reject)=>{
        req.onsuccess=()=>{
          const db=req.result;
          const tx=db.transaction('sourceDocuments','readwrite');
          tx.objectStore('sourceDocuments').add({
            id:'import-'+'c'.repeat(28),sourceHash:'c'.repeat(64),
            name:'qa-confirmed-resume.docx',format:'docx',size:2048,
            importedAt:'2026-11-09T12:00:00Z',confirmedByUser:true,
            education:[{id:'doc-ed',school:'QA 新大学',degree:'本科',major:'电子信息工程',
              startDate:'2024',endDate:'2028',gpa:'',ranking:'',courses:'嵌入式系统',honors:''}],
            skills:[{id:'doc-sk',category:'嵌入式开发',items:'STM32、FreeRTOS、UART'}],
            awards:[{id:'doc-aw',title:'QA 嵌入式竞赛二等奖',
              issuer:'匿名竞赛',date:'2025',level:'省级',description:''}],
            projects:[],experience:[],summary:'',sourceLines:['old source text must never be read'],
            warnings:[]
          });
          tx.oncomplete=()=>{db.close();resolve(true)};
          tx.onerror=()=>reject(new Error('QA data seeding failed'));
        };
        req.onerror=()=>reject(new Error('IndexedDB open failed'));
      });
    })()""")
    assert seeded is True
    report["checks"].append("Seeded only confirmed structured education, skill and award data without original Word/PDF files")

    ev("document.querySelector('[aria-label=\"关闭附件\"]').click();true")
    wait_until("document.querySelector('[role=dialog]')===null")
    assert ev("""(()=>{
      const a=[...document.querySelectorAll('nav a')].find(el=>el.textContent.includes('简历管理'));
      if(!a)return false;a.click();return true;
    })()""")
    wait_until("document.body.innerText.includes('从母版生成岗位版')")
    click("从母版生成岗位版")
    wait_until("document.querySelector('[aria-label=\"从母版生成岗位简历\"]')!==null")
    wait_until("document.querySelector('[aria-label=\"从母版生成岗位简历\"]')?.innerText.includes('可复用项目/工作 2 条')")
    # Preserve the actual event contract of the React checkboxes.
    checked=ev("""(()=>{
      const dialog=document.querySelector('[aria-label="从母版生成岗位简历"]');
      const roleInput=dialog.querySelector('input:not([type=checkbox])');
      const inputSetter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
      inputSetter.call(roleInput,'嵌入式软件工程师');
      roleInput.dispatchEvent(new Event('input',{bubbles:true}));
      const textarea=dialog.querySelector('textarea');
      const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;
      setter.call(textarea,'STM32 FreeRTOS UART Python 自动化测试');
      textarea.dispatchEvent(new Event('input',{bubbles:true}));
      const inputs=[...dialog.querySelectorAll('input[type=checkbox]')];
      inputs.forEach(x=>x.click());
      return inputs.length;
    })()""")
    assert checked==5,checked
    wait_until("document.querySelector('[aria-label=\"从母版生成岗位简历\"]')?.innerText.includes('已选 5 条')")
    assert not ev("document.querySelector('[aria-label=\"从母版生成岗位简历\"]')?.innerText.includes('当前简历含演示数据')")

    click("预览待生成简历")
    wait_until("document.querySelector('[aria-label=\"从母版生成岗位简历\"]')?.innerText.includes('预览待创建的岗位版本')",timeout=25)
    assert ev("JSON.parse(localStorage.getItem('craftcv_resume_slots_v2_lanes')).length")==1,"Preview must not save a new slot"
    assert not ev("document.querySelector('[aria-label=\"从母版生成岗位简历\"]')?.innerText.includes('点击此处填写个人简介')"), 'Placeholder must not appear in read-only A4 preview'

    report["checks"].append("Full A4 preview opens before saving, leaving the source slot untouched")
    preview_image=call("Page.captureScreenshot",{"format":"png"})
    (QA/"master-role-preview.png").write_bytes(base64.b64decode(preview_image["data"]))


    click("用 AI 专业改写")
    wait_until("document.querySelector('[aria-label=\\\"从母版生成岗位简历\\\"]')?.innerText.includes('尚未配置 AI 模型')")
    assert ev("JSON.parse(localStorage.getItem('craftcv_resume_slots_v2_lanes')).length")==1
    assert ev("window.__masterQaAiCalls")==0
    report["checks"].append("No configured model leaves local A4 draft available, with zero AI calls")

    click("确认生成岗位版本")
    wait_until("document.querySelector('[aria-label=\"从母版生成岗位简历\"]')===null")

    wait_until("""(()=>{
      const slots=JSON.parse(localStorage.getItem('craftcv_resume_slots_v2_lanes')||'[]');
      return slots.length===2&&slots[1].data.projects.some(x=>x.name==='QA 多任务监测终端');
    })()""")
    proof=ev("""(()=>{
      const slots=JSON.parse(localStorage.getItem('craftcv_resume_slots_v2_lanes'));
      return {
        base:slots[0].data.projects.map(x=>x.id),
        created:slots[1].data.projects.map(x=>x.name),
        work:slots[1].data.experience.map(x=>x.company),
        role:slots[1].data.basics.title,
        summary:slots[1].data.basics.summary,
        school:slots[1].data.education.map(x=>x.school),
        skills:slots[1].data.skills.map(x=>x.items),
        awards:slots[1].data.awards.map(x=>x.title),
        baseSchool:slots[0].data.education.map(x=>x.school),
        modelCalls:window.__masterQaAiCalls,
        total:slots.length
      };
    })()""")
    assert proof["base"]==["qa-project"],proof
    assert proof["created"]==["QA 多任务监测终端"],proof
    assert proof["work"]==["QA 测试公司"],proof
    assert proof["role"]=="嵌入式软件工程师",proof
    assert proof["summary"]=="",proof
    assert proof['school']==['QA 新大学'],proof
    assert proof['skills']==['STM32、FreeRTOS、UART'],proof
    assert proof['awards']==['QA 嵌入式竞赛二等奖'],proof
    assert proof['baseSchool']==['QA 测试大学'],proof
    assert proof["modelCalls"]==0,proof
    report["checks"].append("Confirmed independent role version with selected master project and work history; source slot unchanged")
    report['checks'].append('Generated new role version also contains selected education, skills and award from confirmed DOCX fields')
    report["checks"].append("No AI endpoint was called during collection or local role-draft generation")
    # Simulate another tab updating selected education AFTER preview; creation must fail closed.
    assert ev("""(()=>{
      const a=[...document.querySelectorAll('nav a')].find(x=>x.textContent.includes('简历管理'));
      if(!a)return false;a.click();return true;
    })()""")
    wait_until("document.body.innerText.includes('从母版生成岗位版')")
    click("从母版生成岗位版")
    wait_until("document.querySelector('[aria-label=\\\"从母版生成岗位简历\\\"]')?.innerText.includes('教育背景 · 1 条')")
    assert ev("""(()=>{
      const dialog=document.querySelector('[aria-label="从母版生成岗位简历"]');
      const label=[...dialog.querySelectorAll('label')].find(x=>x.textContent.includes('QA 新大学'));
      if(!label)return false;
      label.querySelector('input[type=checkbox]').click();return true;
    })()""")
    wait_until("document.querySelector('[aria-label=\\\"从母版生成岗位简历\\\"]')?.innerText.includes('已选 1 条')")
    click("预览待生成简历")
    wait_until("document.querySelector('[aria-label=\\\"从母版生成岗位简历\\\"]')?.innerText.includes('预览待创建的岗位版本')")
    updated=ev("""(async()=>{
      return await new Promise((resolve,reject)=>{
        const q=indexedDB.open('craftcv-private-evidence-v1');
        q.onsuccess=()=>{
          const db=q.result;
          const tx=db.transaction('sourceDocuments','readwrite');
          const store=tx.objectStore('sourceDocuments');
          const request=store.get('import-'+'c'.repeat(28));
          request.onsuccess=()=>{
            const record=request.result;
            record.education[0].major='QA externally changed field';
            store.put(record);
          };
          tx.oncomplete=()=>{db.close();resolve(true)};
          tx.onerror=()=>reject(new Error('QA field update failed'));
        };
      });
    })()""")
    assert updated is True
    click("确认生成岗位版本")
    wait_until("document.querySelector('[aria-label=\\\"从母版生成岗位简历\\\"]')?.innerText.includes('必须重新预览')")
    assert ev("JSON.parse(localStorage.getItem('craftcv_resume_slots_v2_lanes')).length")==2
    report["checks"].append("Out-of-date preview is rejected after master changes; no extra version is saved")
    # The AI branch is an explicit user action. Mock it inside the isolated browser
    # to verify privacy, diffs, acceptance and version saving without external API calls.
    assert ev("""(()=>{
      const button=document.querySelector('button[aria-label="关闭生成简历"]');
      if(!button)return false;button.click();return true;
    })()""")
    wait_until("document.querySelector('[aria-label=\\\"从母版生成岗位简历\\\"]')===null")
    stubbed=ev("""(()=>{
      const previous=window.fetch.bind(window);
      window.__roleAiQa={calls:0,body:null};
      window.fetch=(input,options)=>{
        const url=typeof input==='string'?input:input.url;
        if(url==='/api/ai/models')return Promise.resolve(new Response(JSON.stringify({
          models:[{id:'ollama:qa-mock',name:'QA 本机模拟',local:true}],
          defaultId:'ollama:qa-mock'
        }),{status:200,headers:{'content-type':'application/json'}}));
        if(url==='/api/ai/draft-role-resume'){
          const body=JSON.parse(options.body);
          window.__roleAiQa.calls++;window.__roleAiQa.body=body;
          const target=body.fields.find(x=>x.original.includes('实现 FreeRTOS'));
          const other=body.fields.find(x=>x.original.includes('编写 Python'));
          if(!target)throw Error('Synthetic expected field missing');
          const good={id:target.id,
            proposed:target.original.replace('实现 FreeRTOS','完成 FreeRTOS'),
            reason:'保留任务调度和串口开发事实，调整词序让已有贡献更清晰',
            evidenceQuote:'实现 FreeRTOS'};
          const unsafe=other?{id:other.id,proposed:other.original+' 使用 Kubernetes 提升效率99%',
            reason:'用不存在的结果夸大事实',evidenceQuote:'编写 Python'}:undefined;
          return Promise.resolve(new Response(JSON.stringify({
            suggestions:[good,...(unsafe?[unsafe]:[])],
            rejectedCount:0,notes:'本次仅整理了已有职责和技术细节。',
          }),{status:200,headers:{'content-type':'application/json'}}));
        }
        return previous(input,options);
      };
      return true;
    })()""")
    assert stubbed
    click("从母版生成岗位版")
    wait_until("document.querySelector('[aria-label=\\\"从母版生成岗位简历\\\"]')?.innerText.includes('可复用项目/工作 2 条')")
    picked=ev("""(()=>{
      const dialog=document.querySelector('[aria-label="从母版生成岗位简历"]');
      const labels=[...dialog.querySelectorAll('label')];
      const matches=labels.filter(x=>x.textContent.includes('QA 多任务监测终端')||
        x.textContent.includes('QA 测试公司'));
      matches.forEach(x=>x.querySelector('input[type=checkbox]').click());
      return matches.length;
    })()""")
    assert picked==2,picked
    click("预览待生成简历")
    wait_until("document.querySelector('[aria-label=\\\"从母版生成岗位简历\\\"]')?.innerText.includes('预览待创建的岗位版本')")
    assert ev("window.__roleAiQa.calls")==0,"Local preview must never auto-call AI"
    click("用 AI 专业改写")
    wait_until("document.querySelector('[aria-label=\\\"从母版生成岗位简历\\\"]')?.innerText.includes('AI 专业改写 · 全文对比审阅')",timeout=25)
    assert ev("document.querySelector('[aria-label=\\\"完整简历修改前后对比\\\"]')!==null")
    transfer=ev("""(()=>{
      const state=window.__roleAiQa;
      return {calls:state.calls,fieldCount:state.body.fields.length,
        hasContacts:JSON.stringify(state.body).includes('13912345678'),
        hasSchool:JSON.stringify(state.body).includes('QA 新大学'),
        hasFile:JSON.stringify(state.body).includes('base64Data'),
        slots:JSON.parse(localStorage.getItem('craftcv_resume_slots_v2_lanes')).length};
    })()""")
    assert transfer['calls']==1 and transfer['fieldCount']>=2,transfer
    assert not transfer['hasContacts'] and not transfer['hasSchool'] and not transfer['hasFile'],transfer
    assert transfer['slots']==2,transfer
    assert ev("document.querySelector('[aria-label=\\\"从母版生成岗位简历\\\"]')?.innerText.includes('拦截 1 条异常建议')")
    report["checks"].append("Explicit AI request sends only bounded editable prose; fabricated second suggestion rejected client-side")
    snap=call("Page.captureScreenshot",{"format":"png"})
    (QA/"master-role-ai-review.png").write_bytes(base64.b64decode(snap["data"]))
    toggled=ev("""(()=>{
      const dialog=document.querySelector('[aria-label="从母版生成岗位简历"]');
      const label=[...dialog.querySelectorAll('label')].find(x=>x.textContent.includes('拟改写：'));
      const box=label?.querySelector('input[type=checkbox]');
      if(!box||!box.checked)return false;
      box.click();return true;
    })()""")
    assert toggled
    wait_until("document.querySelector('[aria-label=\\\"从母版生成岗位简历\\\"]')?.innerText.includes('逐项审阅 AI 改写 · 0/1 已选')")
    assert ev("JSON.parse(localStorage.getItem('craftcv_resume_slots_v2_lanes')).length")==2
    toggled_back=ev("""(()=>{
      const label=[...document.querySelectorAll('label')].find(x=>x.textContent.includes('拟改写：'));
      if(!label)return false;label.querySelector('input[type=checkbox]').click();return true;
    })()""")
    assert toggled_back
    wait_until("document.querySelector('[aria-label=\\\"从母版生成岗位简历\\\"]')?.innerText.includes('逐项审阅 AI 改写 · 1/1 已选')")
    click("确认采用 1 处并生成岗位版本")
    wait_until("document.querySelector('[aria-label=\\\"从母版生成岗位简历\\\"]')===null")
    adopted=ev("""(()=>{
      const slots=JSON.parse(localStorage.getItem('craftcv_resume_slots_v2_lanes'));
      return {count:slots.length,base:slots[0].data.projects[0].bullets[0],
        newText:slots[2]?.data.projects[0]?.bullets[0],
        notes:slots[2]?.notes};
    })()""")
    assert adopted['count']==3 and '完成 FreeRTOS' in adopted['newText'],adopted
    assert '实现 FreeRTOS' in adopted['base'],adopted
    assert 'AI 文本改写 1 处' in adopted['notes'],adopted
    report["checks"].append("Full two-A4 diff lets user untick/reselect one safe suggestion, then creates new isolated role slot")
    image=call("Page.captureScreenshot",{"format":"png"})
    (QA/"master-content-generated.png").write_bytes(base64.b64decode(image["data"]))
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
