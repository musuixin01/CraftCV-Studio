import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_EE_RESUME} from '../src/data/defaultResume.ts';
import {collectOnePageTextFields} from '../src/utils/onePageAI.ts';
import {validateRoleAIRequest,validateRoleAISuggestion,
  filterRoleAISuggestions,previewRoleAIChanges} from '../src/utils/roleResumeAI.ts';

const field={id:'projects.0.bullets.0',label:'项目 1 · 要点 1',
  original:'参与开发 STM32 和 FreeRTOS 多任务数据采集模块，完成 UART 接口调试，项目仍在验证中。'};
const safe={
  id:field.id,
  proposed:'参与 STM32 与 FreeRTOS 多任务数据采集模块开发，完成 UART 接口调试，项目仍在验证中。',
  evidenceQuote:'参与开发 STM32 和 FreeRTOS',
  reason:'更清晰地突出已有的多任务采集及接口调试工作',
};
test('role drafting only sends bounded editable descriptive text, no PII',()=>{
  const request=validateRoleAIRequest({
    targetRole:'嵌入式软件工程师',jobDescription:'STM32 固件开发',fields:[field],
  });
  assert.equal(request.fields.length,1);
  assert.equal(request.targetRole,'嵌入式软件工程师');
  assert.throws(()=>validateRoleAIRequest({...request,jobDescription:'hr@example.com'}),/联系方式/);
  assert.throws(()=>validateRoleAIRequest({...request,targetRole:'13912345678'}),/联系方式/);
  assert.throws(()=>validateRoleAIRequest({...request,fields:[field,field]}),/格式|无效/);
  assert.throws(()=>validateRoleAIRequest({...request,fields:[{...field,original:'test@example.com'+field.original}]}),/敏感/);
  assert.throws(()=>validateRoleAIRequest({...request,fields:[{...field,id:'basics.name'}]}),/无效/);
  assert.throws(()=>validateRoleAIRequest({...request,fields:[{...field,original:'x'.repeat(1700)}]}),/无效/);
});
test('model may rewrite existing facts but cannot add invented metrics, technology or leadership',()=>{
  assert.deepEqual(validateRoleAISuggestion(field,safe),[]);
  assert.ok(validateRoleAISuggestion(field,{...safe,proposed:safe.proposed+' 系统性能提升30%'}).length);
  assert.ok(validateRoleAISuggestion(field,{...safe,proposed:safe.proposed+' 熟练运用 Kubernetes'}).length);
  assert.ok(validateRoleAISuggestion(field,{...safe,proposed:safe.proposed.replace('参与','主导')}).length);
  assert.ok(validateRoleAISuggestion(field,{...safe,proposed:safe.proposed.replace('仍在验证中','已稳定运行')}).length);
  const duty={...field,original:'整理客户反馈并协助设计团队修改帮助文档，工作不含预算审批。'};
  const dutySafe={...safe,proposed:'整理客户反馈、协助设计团队修改帮助文档，不负责预算审批。',
    evidenceQuote:'整理客户反馈并协助'};
  assert.deepEqual(validateRoleAISuggestion(duty,dutySafe),[]);
  assert.ok(validateRoleAISuggestion(duty,{
    ...dutySafe,proposed:'整理客户反馈并协助修改帮助文档，同时负责预算审批。',
  }).length);
  assert.ok(validateRoleAISuggestion(field,{
    ...safe,proposed:safe.proposed.replace('参与','全面负责'),
  }).length);

  assert.ok(validateRoleAISuggestion(field,{...safe,evidenceQuote:'原文里不存在的整句'}).length);
  assert.ok(validateRoleAISuggestion(field,{...safe,id:'skills.0.items'}).length);
});
test('server filtering is deterministic and rejects duplicates, unsupported field IDs and invalid claims',()=>{
  const result=filterRoleAISuggestions([field],[
    safe,safe,{...safe,id:'projects.1.summary'},
    {...safe,id:field.id,proposed:safe.proposed+' 已投入生产'},
  ]);
  assert.equal(result.suggestions.length,1);
  assert.equal(result.rejectedCount,3);
  assert.throws(()=>filterRoleAISuggestions([field],{}),/数量|格式/);
});
test('full role AI draft only alters explicitly accepted text, never original resume or locked identity',()=>{
  const base=structuredClone(DEFAULT_EE_RESUME);
  base.id='qa-safe-role';
  base.basics.name='QA 测试候选人';
  base.projects[0].bullets[0]=field.original;
  const original=JSON.stringify(base);
  const eligible=collectOnePageTextFields(base);
  const target=eligible.find(x=>x.id===field.id);
  assert.ok(target);
  const changed=previewRoleAIChanges(base,[{id:field.id,proposed:safe.proposed,reason:safe.reason}]);
  assert.equal(changed.projects[0].bullets[0],safe.proposed);
  assert.equal(changed.basics.name,base.basics.name);
  assert.equal(changed.projects[0].name,base.projects[0].name);
  assert.equal(changed.education[0].school,base.education[0].school);
  assert.equal(JSON.stringify(base),original);
  assert.throws(()=>previewRoleAIChanges(base,[{
    id:field.id,proposed:safe.proposed+' 提升 50%',reason:safe.reason,
  }]),/校验/);
  assert.throws(()=>previewRoleAIChanges(base,[{
    id:field.id,proposed:safe.proposed.replace('仍在验证中','已稳定运行'),reason:safe.reason,
  }]),/状态|原文/);
});

test('reviewed AI proposal cannot bypass explicit duty-scope contradiction at final adoption',()=>{
  const resume=structuredClone(DEFAULT_EE_RESUME);
  resume.projects[0].bullets[0]='整理客户反馈并协助设计团队修改帮助文档，工作不含预算审批。';
  const before=JSON.stringify(resume);
  assert.throws(()=>previewRoleAIChanges(resume,[{
    id:'projects.0.bullets.0',
    proposed:'整理客户反馈并协助设计团队修改帮助文档，同时负责预算审批。',
    reason:'错误的管理职责升级',
  }]),/职责|原文/);
  assert.throws(()=>previewRoleAIChanges(resume,[{
    id:'projects.0.bullets.0',
    proposed:'全面负责客户反馈处理，协助设计团队修改帮助文档，工作不含预算审批。',
    reason:'错误的管理职责升级',
  }]),/职责|原文/);
  assert.equal(JSON.stringify(resume),before);
});
test('never fabricate changes for short source text: they remain unchanged and excluded',()=>{
  const source=structuredClone(DEFAULT_EE_RESUME);
  source.projects[0].summary='负责测试';
  const ids=new Set(collectOnePageTextFields(source).map(x=>x.id));
  assert.equal(ids.has('projects.0.summary'),false);
});
