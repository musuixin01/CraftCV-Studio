#!/usr/bin/env node
// CraftCV role quality evaluation: offline by default; never calls an AI implicitly.
// Explicit live use: --live --model=provider:model --max-cases=1..4
// Cloud use additionally requires --approve-cloud-cost. Fixtures are fictional.
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {validateRoleAIRequest,validateRoleAISuggestion} from '../src/utils/roleResumeAI.ts';
import {ROLE_EVAL_FIXTURE_VERSION,ROLE_EVAL_SCENARIOS,ROLE_EVAL_CASES} from '../tests/fixtures/roleResumeQualityCases.mjs';

const args=process.argv.slice(2);
const live=args.includes('--live');
const modelArg=args.find(x=>x.startsWith('--model='))?.slice(8);
const countArg=args.find(x=>x.startsWith('--max-cases='))?.slice(12);
const limit=countArg===undefined?1:Number(countArg);
const approvedPaid=args.includes('--approve-cloud-cost');
const out=path.resolve('_private','test-artifacts','role-quality-qa');
function fixtureSuggestion(item,field){
  return {id:field.id,proposed:item.proposed,
    reason:'依据原文已有事实专业整理表述，不补造不存在的职责或结果。',
    evidenceQuote:field.original.slice(0,Math.min(12,field.original.length))};
}
function offline(){
  const byId=new Map(ROLE_EVAL_SCENARIOS.map(x=>[x.id,x]));
  const checks=ROLE_EVAL_CASES.map(item=>{
    const scenario=byId.get(item.scenarioId);
    const field=scenario?.fields.find(x=>x.id===item.fieldId);
    if(!scenario||!field)throw Error('评测数据不一致：未知岗位或字段。');
    const issues=validateRoleAISuggestion(field,fixtureSuggestion(item,field));
    const actual=issues.length===0;
    return {role:item.scenarioId,category:item.category,case:item.description,
      expectedAccepted:item.accepted,actualAccepted:actual,correct:actual===item.accepted,issues};
  });
  const safe=checks.filter(x=>x.expectedAccepted),risk=checks.filter(x=>!x.expectedAccepted);
  const totals={cases:checks.length,expectedSafe:safe.length,expectedRisk:risk.length,
    acceptedSafe:safe.filter(x=>x.actualAccepted).length,
    blockedRisk:risk.filter(x=>!x.actualAccepted).length,
    mismatches:checks.filter(x=>!x.correct).length};
  return {type:'OFFLINE_RULE_TESTS_NOT_MODEL_QUALITY',realModelCalled:false,paidCalls:0,
    fixtureVersion:ROLE_EVAL_FIXTURE_VERSION,createdAt:new Date().toISOString(),
    scenarios:ROLE_EVAL_SCENARIOS.map(x=>({id:x.id,audience:x.audience,fields:x.fields.length})),
    totals,checks,
    limits:[
      '静态测试由预先编写的匿名样本构成；不代表 AI 的真实能力、写作专业性或幻觉率。',
      '词法规则不能完整检出跨项目责任混用、同义措辞夸大、关键事实漏写或所有个人信息。',
      '真实模型评测需要单独配置模型，并由人工对输出逐项打分；不因通过正则规则就自动采纳。'
    ]};
}
async function evaluateLive(){
  if(!Number.isInteger(limit)||limit<1||limit>4)throw Error('max-cases 只允许 1–4');
  if(!modelArg)throw Error('必须明确 --model=provider:model 才可执行实际模型测试。');
  // Intentionally fixed loopback origin; never send evaluation data to an arbitrary endpoint.
  const base='http://127.0.0.1:3000';
  let resp;
  try{resp=await fetch(base+'/api/ai/models',{signal:AbortSignal.timeout(5000)});}
  catch{throw Error('本地 CraftCV 服务未启动或无法连接：请检查 127.0.0.1:3000。');}
  if(!resp.ok)throw Error('本地 CraftCV 模型配置接口不可用。');
  const catalog=await resp.json();
  const model=(catalog.models??[]).find(x=>x.id===modelArg);
  if(!model)throw Error('指定模型未配置或不可用，不执行真实评测。');
  if(!model.local&&!approvedPaid)
    throw Error('云端模型可能计费，需明确加 --approve-cloud-cost 才能发送匿名测试数据。');
  const results=[];
  for(const scenario of ROLE_EVAL_SCENARIOS.slice(0,limit)){
    const payload=validateRoleAIRequest(scenario);
    const start=Date.now();
    let response;
    try{
      const reply=await fetch(base+'/api/ai/draft-role-resume',{
        method:'POST',
        headers:{'Content-Type':'application/json','X-CraftCV-AI-Model':model.id},
        body:JSON.stringify(payload),signal:AbortSignal.timeout(120000)});
      const raw=await reply.json();
      const originals=new Map(scenario.fields.map(x=>[x.id,x]));
      const suggestions=Array.isArray(raw.suggestions)?raw.suggestions:[];
      const reviewItems=suggestions.map(item=>{
        const field=originals.get(item?.id);
        return {id:String(item?.id??''),original:field?.original??null,
          proposed:typeof item.proposed==='string'?item.proposed:null,
          reason:typeof item.reason==='string'?item.reason:null,
          evidenceQuote:typeof item.evidenceQuote==='string'?item.evidenceQuote:null,
          issues:field?validateRoleAISuggestion(field,item):['未知字段']};
      });
      response={role:scenario.id,audience:scenario.audience,
        result:reply.ok?'PENDING_HUMAN_REVIEW':'NO_ACCEPTED_SUGGESTIONS',
        httpStatus:reply.status,modelRejectedCount:raw.rejectedCount??null,
        checkedFields:scenario.fields.length,reviewItems,
        notes:typeof raw.notes==='string'?raw.notes.slice(0,500):'',
        humanRatings:{truthfulness:null,clarity:null,jobFit:null,completeness:null}};
    }catch(error){
      response={role:scenario.id,result:'REQUEST_FAILURE',
        cause:error instanceof Error?error.name:'unknown',reviewItems:[]};
    }
    results.push({...response,elapsedMs:Date.now()-start});
  }
  return {type:'LIVE_MODEL_RESULTS_NEED_HUMAN_REVIEW',realModelCalled:true,
    fixtureVersion:ROLE_EVAL_FIXTURE_VERSION,createdAt:new Date().toISOString(),
    model:{id:model.id,provider:model.provider,local:model.local},
    requested:results.length,results,
    costs:'not reported by the endpoint; no cost or token estimates are asserted',
    caution:'使用匿名样本；机器校验不等于人工确认，不可把模型输出作为真实经历。'};
}
function markdown(result){
  const lines=['# CraftCV 岗位简历质量评测', '',
    '评测时间：'+result.createdAt,
    '评测类型：'+result.type,
    '测试集版本：'+result.fixtureVersion,''];
  if(!live){
    lines.push('真实模型调用：0；模型费用：0。',
      '涵盖岗位：'+result.scenarios.map(x=>x.audience).join(' / '),
      '正常改写通过：'+result.totals.acceptedSafe+'/'+result.totals.expectedSafe,
      '高风险改写拦截：'+result.totals.blockedRisk+'/'+result.totals.expectedRisk,
      '预期不符：'+result.totals.mismatches,'','## 不能证明的事情','',
      ...result.limits.map(x=>'- '+x));
  }else{
    lines.push('模型：'+result.model.id,'测试岗位数：'+result.requested,
      '真实模型请求已执行，仅使用匿名虚构经历；完整输出见 JSON。','',
      '人工审阅时按真实性、表达清晰度、岗位关联性、关键信息完整性分别打分 1–5；未评分前不得将此报告作为模型质量通过的证明。');
  }
  return lines.join('\n')+'\n';
}
try{
  const result=live?await evaluateLive():offline();
  await mkdir(out,{recursive:true});
  const prefix=live?'live':'offline';
  const jsonFile=path.join(out,prefix+'-report.json');
  const mdFile=path.join(out,prefix+'-summary.md');
  await writeFile(jsonFile,JSON.stringify(result,null,2)+'\n',{encoding:'utf8'});
  await writeFile(mdFile,markdown(result),{encoding:'utf8'});
  console.log(JSON.stringify({type:result.type,
    modelsCalled:result.realModelCalled,
    totals:result.totals??{requested:result.requested},
    files:[jsonFile,mdFile]},null,2));
  if(!live&&result.totals.mismatches)process.exitCode=1;
}catch(error){
  console.error('评测未启动：'+(error instanceof Error?error.message:'未知异常'));
  process.exitCode=1;
}
