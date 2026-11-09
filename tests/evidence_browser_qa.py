"""
Isolated Chrome UI regression: automatic AI on upload, master cache and SHA-256 dedup.
Never uses real personal files or paid providers. Requires Python requests/websockets.
Run from CraftCV-Studio root with: py -3.12 tests/evidence_browser_qa.py
"""
import base64
import json
import os
import subprocess
import time
from pathlib import Path

import requests
from websockets.sync.client import connect

ROOT = Path.cwd()
QA = ROOT / "_private" / "test-artifacts" / "evidence-ui-qa"
QA.mkdir(parents=True, exist_ok=True)
# A dedicated app origin prevents old QA browser data from affecting current assertions.
PORT, CDP_PORT = 3226, 9376
URL = f"http://127.0.0.1:{PORT}/"
ENV = dict(os.environ, PORT=str(PORT), HOST="127.0.0.1")
# Synthetic, not a user's document.
IMAGE_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9dUaZVIAAAAASUVORK5CYII="
MODEL = {"models": [{"id": "openai:mock-vision", "name": "mock-vision",
        "providerLabel": "测试视觉模型", "provider": "openai", "local": False,
        "supportsImage": True, "supportsPdf": False}], "defaultId": "openai:mock-vision",
        "supportedProviders": []}
REVIEW = {"documentType": "transcript", "facts": [
    {"target": "education.major", "scope": "郑州升达经贸管理学院",
     "label": "专业", "value": "计算机科学与技术", "quote": "专业：计算机科学与技术"}

], "notes": []}
CONFLICT_REVIEW = {"documentType":"transcript","facts":[
    {"target":"education.major","scope":"郑州升达经贸管理学院",
     "label":"专业","value":"软件技术","quote":"专业：软件技术"}
], "notes":[]}
INJECTION = """
(()=> {

  // Isolated QA browser seed, before the app evaluates its skills library.
  if (!localStorage.getItem('qa-skill-reset-seeded')) {
    localStorage.removeItem('craftcv_ai_skills_reset_20261109_v1');
    localStorage.setItem('craftcv_ai_skills_v1',JSON.stringify([
      {id:'skill-custom-qa',name:'测试自定义技能',category:'测试',description:'模拟',
       skillMarkdown:'# QA skill',isBuiltIn:false}
    ]));
    localStorage.setItem('craftcv_selected_skill_ids_v1','["skill-custom-qa"]');
    localStorage.setItem('craftcv_auto_skill_mode_v1','false');
    localStorage.setItem('qa-unrelated-storage','keep');
    localStorage.setItem('qa-skill-reset-seeded','1');
  }
  const original = window.fetch.bind(window);
  window.__evidenceRequestCount = 0;
  window.__jdRequestCount=0;
  window.__jdPayload=null;
  window.fetch = (input, options) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url === '/api/ai/models') {
      return Promise.resolve(new Response(JSON.stringify(MODEL_DATA), {
        status: 200, headers: {'content-type': 'application/json'}
      }));
    }
    if (url === '/api/ai/extract-evidence') {
      window.__evidenceRequestCount += 1;
      const supplied = JSON.parse(options.body);
      window.__evidenceSentOneFile = Boolean(supplied.base64Data && supplied.fileName === 'qa-sample.png');

      return Promise.resolve(new Response(JSON.stringify({review: supplied.fileName === 'qa-conflict.png' ? CONFLICT_DATA : REVIEW_DATA,modelId:'openai:mock-vision'}),{
        status:200,headers:{'content-type':'application/json'}
      }));
    }
    if (url === '/api/ai/jd-match') {
      window.__jdRequestCount += 1;
      window.__jdPayload = JSON.parse(options.body);
      return Promise.resolve(new Response(JSON.stringify({
        matchScore:67,matchedKeywords:[],missingKeywords:['RTOS'],
        executiveSummary:'仅用于本地接口回归的匿名模拟结果。',
        tailoredSummary:'',actionableSuggestions:[]
      }),{status:200,headers:{'content-type':'application/json'}}));
    }
    return original(input,options);
  };
})();
""".replace("MODEL_DATA",json.dumps(MODEL,ensure_ascii=False)).replace(

    "REVIEW_DATA",json.dumps(REVIEW,ensure_ascii=False)).replace(
    "CONFLICT_DATA",json.dumps(CONFLICT_REVIEW,ensure_ascii=False))
SERVER_LOG = open(QA/"server.log","wb")
CHROME_LOG = open(QA/"chrome.log","wb")
server = chrome = None
report = {"synthetic_data_only": True, "external_ai_called": False, "checks": []}
try:
    server = subprocess.Popen(["node","--import","tsx","server.ts"],cwd=ROOT,
                              env=ENV,stdout=SERVER_LOG,stderr=SERVER_LOG)
    for _ in range(100):
        if server.poll() is not None:
            raise RuntimeError("Isolated app server exited")
        try:
            if requests.get(URL,timeout=1).status_code==200:
                break
        except requests.RequestException:
            pass
        time.sleep(.2)
    else:
        raise RuntimeError("Isolated app server timed out")

    # Invalid file is rejected by real Express endpoint, before model access.
    invalid = requests.post(URL+"api/ai/extract-evidence",
        json={"fileName":"bad.png","mimeType":"image/png","base64Data":"invalid"},
        timeout=3)
    assert invalid.status_code==400,invalid.status_code
    report["checks"].append("Real Express rejects invalid evidence payload with HTTP 400")
    # Server-side payload validation runs before selecting any cloud model.
    blocked = requests.post(URL+"api/ai/jd-match",json={
        "resumeData":{},"jobDescription":"测试岗位",
        "masterFacts":[{"sourceId":"../../private","target":"education.major",
                        "scope":"学校","label":"专业","value":"电子信息工程",
                        "quote":"专业：电子信息工程","status":"indexed"}]
    },timeout=3)
    assert blocked.status_code == 400,blocked.status_code
    report["checks"].append("JD endpoint rejects malformed source context before any model access")

    chrome = subprocess.Popen([
      r"C:\Program Files\Google\Chrome\Application\chrome.exe",
      "--headless=new","--no-first-run","--no-default-browser-check",
      "--disable-extensions","--disable-background-networking",
      f"--remote-debugging-port={CDP_PORT}","--remote-allow-origins=*",
      "--window-size=1440,1060","--user-data-dir="+str(QA/"chrome-profile"),
      "about:blank",
    ],cwd=ROOT,env=ENV,stdout=CHROME_LOG,stderr=CHROME_LOG)
    tab=None
    for _ in range(100):
        try:
            pages=requests.get(f"http://127.0.0.1:{CDP_PORT}/json",timeout=1).json()
            tab=next((p for p in pages if p.get("type")=="page"),None)
            if tab:
                break
        except requests.RequestException:
            pass
        time.sleep(.2)
    assert tab is not None, "Chrome CDP unavailable"
    with connect(tab["webSocketDebuggerUrl"],origin="http://localhost",max_size=16*1024*1024) as ws:
        seq=[0]
        def call(method,params=None):
            seq[0]+=1
            i=seq[0]
            ws.send(json.dumps({"id":i,"method":method,"params":params or {}}))
            while True:
                message=json.loads(ws.recv())
                if message.get("id")==i:
                    if "error" in message:
                        raise RuntimeError(str(message["error"]))
                    return message.get("result",{})
        def ev(source):
            result=call("Runtime.evaluate",{
                "expression":source,"returnByValue":True,"awaitPromise":True,
            })
            if "exceptionDetails" in result:
                raise RuntimeError(str(result["exceptionDetails"])[:600])
            return result.get("result",{}).get("value")
        def wait_until(expression,timeout=10):
            started=time.monotonic()
            while time.monotonic()-started<timeout:
                if ev(expression):
                    return
                time.sleep(.15)
            raise AssertionError("UI wait failed: "+expression)
        def click(label):
            source="(()=>{const b=[...document.querySelectorAll('button')].find(el=>el.textContent.includes("+json.dumps(label,ensure_ascii=False)+"));if(!b)return false;b.click();return true})()"
            assert ev(source),label+" button missing"
        call("Page.enable")
        call("Runtime.enable")
        call("Page.addScriptToEvaluateOnNewDocument",{"source":INJECTION})
        call("Page.navigate",{"url":URL})
        wait_until("document.querySelectorAll('button').length>20")
        # The AI library stays functional, but all system-defined packs are gone.
        assert ev("(()=>{const a=[...document.querySelectorAll('nav a')].find(x=>x.textContent.includes('AI技能库'));if(!a)return false;a.click();return true})()")
        wait_until("document.querySelector('#ai-skill-library-card')!==null")
        assert ev("document.querySelector('#ai-skill-library-card').innerText.includes('自定义 SKILL.md 技能')")
        assert ev("!document.querySelector('#ai-skill-library-card').innerText.includes('恢复内置默认规则')")
        assert ev("!document.querySelector('#ai-skill-library-card').innerText.includes('嵌入式 MCU 与 FreeRTOS 深度规范')")
        assert ev("document.querySelector('#ai-skill-library-card').innerText.includes('新增自定义技能')")
        assert ev("document.querySelector('#ai-skill-library-card').innerText.includes('暂无自定义技能包')")
        assert ev("localStorage.getItem('craftcv_ai_skills_reset_20261109_v1')")=="complete"
        assert ev("localStorage.getItem('craftcv_ai_skills_v1')") is None
        assert ev("localStorage.getItem('craftcv_selected_skill_ids_v1')") is None
        assert ev("localStorage.getItem('craftcv_auto_skill_mode_v1')") is None
        assert ev("localStorage.getItem('qa-unrelated-storage')")=="keep"
        report["checks"].append("One-time skill reset empties existing packs in Chrome, preserves unrelated storage and library UI")

        report["checks"].append("AI custom skill library remains available while built-in packs and reset control are absent")


        click("母版资料")
        wait_until("document.querySelector('[role=dialog]')!==null")
        assert ev("window.__evidenceRequestCount") == 0
        report["checks"].append("Opening evidence drawer does not send to any AI")

        def upload_file(filename,variant=False):
            expression = f"""(()=>{{
                const bytes=Uint8Array.from(atob('{IMAGE_B64}'),c=>c.charCodeAt(0));
                if({str(variant).lower()}) bytes[bytes.length-1] ^= 1;
                const upload=new File([bytes],{json.dumps(filename)},{{type:'image/png'}});
                const dt=new DataTransfer();dt.items.add(upload);
                const input=document.querySelector('[role=dialog] input[type=file][accept*="image/png"]');
                if(!input)return false;
                input.files=dt.files;
                input.dispatchEvent(new Event('change',{{bubbles:true}}));
                return true;
            }})()"""
            assert ev(expression), "Failed to choose synthetic image"

        assert ev("document.querySelectorAll('[role=dialog] input[type=checkbox]').length") == 0
        upload_file("qa-sample.png")
        wait_until("document.querySelector('[role=dialog]')?.innerText.includes('自动整理（1 项）')")
        assert ev("window.__evidenceRequestCount")==1
        assert ev("window.__evidenceSentOneFile") is True
        assert ev("document.querySelector('[role=dialog]')?.innerText.includes('自动归档 1 项')")
        assert ev("document.querySelector('[role=dialog]')?.innerText.includes('需要关注 0 项')")
        assert ev("!document.querySelector('[role=dialog]')?.innerText.includes('专业：计算机科学与技术')")
        report["checks"].append("Normal extracted fact automatically archived and initially collapsed")
        click("查看全部 1 项")
        wait_until("document.querySelector('[role=dialog]')?.innerText.includes('专业：计算机科学与技术')")
        click("只显示待核对")
        report["checks"].append("Full source quote available on demand without mandatory user review")

        upload_file("same-content-renamed.png")
        wait_until("document.querySelector('[role=dialog]')?.innerText.includes('复用 1 份')")
        assert ev("window.__evidenceRequestCount")==1
        assert ev("document.querySelectorAll('[role=dialog] article').length")==1
        report["checks"].append("SHA-256 rejects renamed duplicate and no second AI request occurs")

        # Different synthetic bytes, same institution and a contradictory major.
        upload_file("qa-conflict.png",variant=True)
        wait_until("document.querySelector('[role=dialog]')?.innerText.includes('需要关注 2 项')")
        assert ev("window.__evidenceRequestCount")==2
        assert ev("document.querySelectorAll('[role=dialog] article').length")==2
        assert ev("document.querySelector('[role=dialog]')?.innerText.includes('不同证据材料或同一材料对该字段给出不同结果')")
        assert ev("document.querySelector('[role=dialog]')?.innerText.includes('专业：计算机科学与技术')")
        assert ev("document.querySelector('[role=dialog]')?.innerText.includes('专业：软件技术')")
        report["checks"].append("Contradictory source values automatically expand attention fields")
        png=call("Page.captureScreenshot",{"format":"png"})
        (QA/"evidence-modal-desktop.png").write_bytes(base64.b64decode(png["data"]))

        click("完成，返回简历")
        wait_until("document.querySelector('[role=dialog]')===null")
        call("Page.reload",{"ignoreCache":True})
        # CDP Page.reload returns before the old document necessarily disappears.
        # Wait for the new page's injected request counter, not just old button count.
        wait_until("window.__evidenceRequestCount===0",timeout=20)
        wait_until("document.querySelectorAll('button').length>20")
        click("母版资料")
        wait_until("document.querySelector('[role=dialog]')?.innerText.includes('qa-sample.png')")
        wait_until("document.querySelector('[role=dialog]')?.innerText.includes('需要关注 2 项')")
        assert ev("window.__evidenceRequestCount")==0
        assert ev("document.querySelector('[role=dialog]')?.innerText.includes('无需重复')")
        report["checks"].append("Reload re-derives attention without a new model call")

        ev("window.confirm=()=>true;true")
        for filename in ["qa-sample.png","qa-conflict.png"]:
            expression = "(()=>{const button=document.querySelector('[role=dialog] button[aria-label=' + JSON.stringify(" + json.dumps('删除 '+filename,ensure_ascii=False) + ") + ']');if(!button)return false;button.click();return true})()"
            assert ev(expression),"Missing synthetic source deletion action"
            wait_until("!document.querySelector('[role=dialog]')?.innerText.includes("+json.dumps(filename,ensure_ascii=False)+")")
        report["checks"].append("Two test files removed through confirmation without other data")
        # Synthetic master fact -> JD request integration, without touching a real AI provider.
        inject_source = """(async()=>{
            const store=await import('/src/utils/evidenceStore.ts');
            const blob=new Blob(['SYNTHETIC_PRIVATE_FILE_BYTES'],{type:'image/png'});
            await store.saveEvidence({
                id:'qa-grade-source',slotId:store.MASTER_EVIDENCE_SLOT_ID,
                name:'SYNTHETIC_PRIVATE_FILE.jpg',mimeType:'image/png',size:blob.size,
                blob,contentHash:'c'.repeat(64),addedAt:new Date().toISOString(),
                review:{documentType:'transcript',notes:[],facts:[{
                    target:'education.courseGrade',scope:'郑州升达经贸管理学院',
                    label:'嵌入式微控制器应用开发',value:'99',
                    quote:'嵌入式微控制器应用开发 99'
                }]}
            });
            return true;
        })()"""
        assert ev(inject_source) is True
        click("完成，返回简历")
        wait_until("document.querySelector('[role=dialog]')===null")
        assert ev("(()=>{const link=[...document.querySelectorAll('nav a')].find(x=>x.textContent.includes('AI岗位匹配'));if(!link)return false;link.click();return true})()")
        wait_until("(()=>[...document.querySelectorAll('button')].some(x=>x.textContent.includes('开始 AI 岗位匹配诊断')))()")
        # Local-first review and JD evidence recommendations must work offline
        # without sending anything to the selected AI provider.
        wait_until("document.body.innerText.includes('')")
        wait_until("document.body.innerText.includes('与岗位相关的现有资料')")
        assert ev("document.body.innerText.includes('投递前质量审查')")
        assert ev("window.__jdRequestCount")==0
        click("开始投递检查")
        wait_until("document.body.innerText.includes('规则提示')")
        assert ev("document.body.innerText.includes('最终 PDF 文件尚未验收')") is True
        assert ev("document.body.innerText.includes('检测到演示简历')") is True
        assert ev("window.__jdRequestCount")==0
        report["checks"].append("Browser JD evidence suggestions and RGS submission review work without calling AI")
        quality_png=call("Page.captureScreenshot",{"format":"png"})
        (QA/"job-submission-review.png").write_bytes(base64.b64decode(quality_png["data"]))
        assert ev("(()=>{const s=document.querySelector('section[aria-label=\"投递前质量审查\"]');if(!s)return false;s.scrollIntoView({block:'start',behavior:'instant'});return true})()")
        quality_detail=call("Page.captureScreenshot",{"format":"png"})
        (QA/"job-submission-review-detail.png").write_bytes(base64.b64decode(quality_detail["data"]))

        click("开始 AI 岗位匹配诊断")
        wait_until("window.__jdRequestCount===1")
        assert ev("window.__jdPayload.masterFacts.length") == 1
        assert ev("window.__jdPayload.masterFacts[0].value") == "99"
        assert ev("window.__jdPayload.masterFacts[0].sourceId") == "qa-grade-source"
        assert ev("'blob' in window.__jdPayload") is False
        assert ev("!JSON.stringify(window.__jdPayload).includes('SYNTHETIC_PRIVATE_FILE_BYTES')")
        wait_until("document.body.innerText.includes('查看本次提供给 AI 的 1 条母版候选及来源')")
        report["checks"].append("JD button sends only a relevant, bounded, source-linked candidate; no raw file")
        assert ev("""(async()=>{const store=await import('/src/utils/evidenceStore.ts');await store.deleteEvidence('qa-grade-source');return true})()""") is True
        report["checks"].append("Synthetic JD master source deleted after end-to-end check")
        # Explicit one-field adoption: source stays local; only selected field and
        # provenance ledger enter the current resume, and the action can be undone.
        adopted_fixture = """(async()=>{
            const store=await import('/src/utils/evidenceStore.ts');
            const blob=new Blob(['SYNTHETIC_ADOPTION_IMAGE'],{type:'image/png'});
            await store.saveEvidence({
                id:'qa-adopt-source',slotId:store.MASTER_EVIDENCE_SLOT_ID,
                name:'synthetic-education-certificate.png',mimeType:'image/png',
                size:blob.size,blob,contentHash:'e'.repeat(64),
                addedAt:new Date().toISOString(),
                review:{documentType:'transcript',notes:[],facts:[{
                    target:'education.degree',scope:'电子科技大学',
                    label:'学历',value:'硕士',quote:'学历：硕士'
                }]}
            });
            return true;
        })()"""
        assert ev(adopted_fixture) is True
        click("母版资料")
        wait_until("document.querySelector('[role=dialog]')?.innerText.includes('synthetic-education-certificate.png')")
        try:
            wait_until("document.querySelector('[role=dialog]')?.innerText.includes('核对并采用到当前版本')")
        except AssertionError:
            print('ADOPTION_UI_DEBUG',json.dumps(ev("document.querySelector('[role=dialog]')?.innerText.slice(-2600)"),ensure_ascii=True))
            print('ADOPTION_COUNTS_DEBUG',json.dumps(ev("(()=>{const a=[...document.querySelectorAll('[role=dialog] article')];return a.map(x=>({title:x.innerText.slice(0,100),action:x.innerText.includes('采用'),buttons:[...x.querySelectorAll('button')].map(b=>b.textContent)}))})()"),ensure_ascii=True))
            raise
        assert ev("JSON.parse(localStorage.getItem('craftcv_ee_resume_v4_movable')).education[0].degree")=="本科"
        click("核对并采用到当前版本")
        wait_until("document.querySelector('[role=dialog]')?.innerText.includes('已采用到当前简历')")
        wait_until("JSON.parse(localStorage.getItem('craftcv_ee_resume_v4_movable'))?.education?.[0]?.degree==='硕士'")
        assert ev("""(()=>{
            const resume=JSON.parse(localStorage.getItem('craftcv_ee_resume_v4_movable'));
            return resume.factLedger?.records?.some(
                record=>record.path==='education/edu-1/degree' &&
                record.status==='user-asserted' &&
                record.candidateConfirmed===true &&
                record.cloudAllowed===false &&
                record.sources.some(source=>source.sourceId==='evidence:qa-adopt-source')
            );
        })()""") is True
        assert ev("document.querySelector('[role=dialog]')?.innerText.includes('当前版本已采用 1')") is True
        adopted_png=call("Page.captureScreenshot",{"format":"png"})
        (QA/"evidence-adopted-desktop.png").write_bytes(base64.b64decode(adopted_png["data"]))
        report["checks"].append("Adopting explicit educational field stores source link and non-certified ledger; UI marks adopted")

        click("完成，返回简历")
        wait_until("document.querySelector('[role=dialog]')===null")
        click("开始 AI 岗位匹配诊断")
        wait_until("window.__jdRequestCount===2")
        assert ev("window.__jdPayload.resumeData.education[0].degree")=="硕士"
        assert ev("window.__jdPayload.masterFacts.every(x=>x.sourceId!=='qa-adopt-source')") is True
        report["checks"].append("AI JD reads the adopted resume field without resending its raw source quote")

        assert ev("(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='撤销');if(!b||b.disabled)return false;b.click();return true})()")
        wait_until("JSON.parse(localStorage.getItem('craftcv_ee_resume_v4_movable'))?.education?.[0]?.degree==='本科'")
        report["checks"].append("One-step Undo restores former value and prior provenance state")
        assert ev("""(async()=>{const store=await import('/src/utils/evidenceStore.ts');await store.deleteEvidence('qa-adopt-source');return true})()""") is True
        report["checks"].append("Synthetic adoption source deleted without changing any original project file")
        # Typed course grades, weighted mean and new certificate share the same private master,
        # but each change requires an explicit one-version adoption.
        typed_fixture = """(async()=>{
            const store=await import('/src/utils/evidenceStore.ts');
            const blob=new Blob(['SYNTHETIC_STRUCTURED_CREDENTIAL'],{type:'image/png'});
            await store.saveEvidence({
                id:'qa-structured-source',slotId:store.MASTER_EVIDENCE_SLOT_ID,
                name:'synthetic-structured.pdf',mimeType:'image/png',
                size:blob.size,blob,contentHash:'f'.repeat(64),
                addedAt:new Date().toISOString(),
                review:{documentType:'transcript',notes:[],facts:[
                    {target:'education.courseGrade',scope:'电子科技大学',
                     label:'数字信号处理',value:'96',quote:'数字信号处理 96'},
                    {target:'education.weightedAverage',scope:'电子科技大学',
                     label:'加权平均分',value:'88.75',quote:'加权平均分 88.75'},
                    {target:'certificate.name',scope:'示例职业技能鉴定单位',
                     label:'证书名称',value:'匿名技能证书',quote:'证书名称：匿名技能证书'}
                ]}
            });return true;
        })()"""
        assert ev(typed_fixture) is True
        click("母版资料")
        wait_until("document.querySelector('[role=dialog]')?.innerText.includes('synthetic-structured.pdf')")
        click("查看全部 3 项")
        for count in (1,2,3):
            click("核对并采用到当前版本")
            wait_until("document.querySelector('[role=dialog]')?.innerText.includes('当前版本已采用 "+str(count)+"')")
        assert ev("""(()=>{
            const doc=JSON.parse(localStorage.getItem('craftcv_ee_resume_v4_movable'));
            return doc.education[0].courseGrades?.some(x=>x.course==='数字信号处理'&&x.score==='96')
             && doc.education[0].weightedAverage==='88.75'
             && doc.education[0].gpa==='3.87/5.00（均分 88.75）'
             && doc.awards.some(x=>x.title==='匿名技能证书'&&x.credentialType==='certificate')
             && doc.factLedger.records.filter(x=>x.sources.some(y=>y.sourceId==='evidence:qa-structured-source')).length===3;
        })()""") is True
        report["checks"].append("Chrome UI explicitly adopts structured score, separate weighted mean, new typed certificate and source ledger")

        screenshot=call("Page.captureScreenshot",{"format":"png"})
        (QA/"evidence-structured-adopted.png").write_bytes(base64.b64decode(screenshot["data"]))
        click("完成，返回简历")
        wait_until("document.querySelector('[role=dialog]')===null")
        assert ev("(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='撤销');if(!b||b.disabled)return false;b.click();return true})()")
        wait_until("""!JSON.parse(localStorage.getItem('craftcv_ee_resume_v4_movable')).awards.some(x=>x.title==='匿名技能证书')""")
        assert ev("JSON.parse(localStorage.getItem('craftcv_ee_resume_v4_movable')).education[0].weightedAverage")=="88.75"
        report["checks"].append("Undo removes only the last certificate adoption without touching separate grade records")
        assert ev("""(async()=>{const store=await import('/src/utils/evidenceStore.ts');await store.deleteEvidence('qa-structured-source');return true})()""") is True
        report["checks"].append("Structured QA source removed from isolated browser after verification")



finally:
    if chrome is not None and chrome.poll() is None:
        chrome.terminate()
        try:
            chrome.wait(timeout=10)
        except subprocess.TimeoutExpired:
            chrome.kill()
            chrome.wait(timeout=5)
    if server is not None and server.poll() is None:
        server.terminate()
        try:
            server.wait(timeout=10)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait(timeout=5)
    SERVER_LOG.close()
    CHROME_LOG.close()
    (QA/"evidence-browser-report.json").write_text(
        json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
print(json.dumps(report,ensure_ascii=False,indent=2))
