import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_EE_RESUME} from '../src/data/defaultResume.ts';
import {masterEntryFromResume} from '../src/utils/masterContentStore.ts';
import {composeResumeFromMaster} from '../src/utils/masterContentDraft.ts';
import {masterRoleFields,rankMasterRoleFields,applyMasterRoleFields} from '../src/utils/masterRoleFields.ts';

const hash='a'.repeat(28);
function realisticResume(){
  const doc=structuredClone(DEFAULT_EE_RESUME);
  doc.id='test-existing-base';
  doc.versionName='匿名真实测试数据';
  doc.basics.name='匿名候选人';
  doc.basics.title='软件工程师';
  doc.basics.phone='';
  doc.basics.email='';
  doc.basics.github='';
  doc.basics.website='';
  doc.basics.avatarUrl='';
  doc.basics.showAvatar=false;
  doc.basics.directionTags='QA 测试方向';
  doc.basics.statusTag='QA 测试身份';
  doc.basics.location='匿名测试城市';
  doc.basics.graduationYear='2028';
  doc.basics.schoolTag='QA 本科学校';
  doc.basics.summary='旧岗位个人总结';
  doc.projects=[{id:'project-1',name:'自动化测试平台',role:'开发',
    startDate:'2024.01',endDate:'2024.07',repoUrl:'',
    techStack:['Python'],summary:'编写平台接口',bullets:['编写数据校验']}];
  doc.experience=[{id:'exp-1',company:'测试机构',position:'测试开发',
    department:'',location:'',startDate:'2023.01',endDate:'2023.06',
    techStack:['Python'],bullets:['开发测试工具']}];
  doc.education=[{id:'ed-old',school:'原学校',degree:'本科',major:'软件工程',
    startDate:'2021',endDate:'2025',gpa:'',ranking:'',courses:'',honors:''}];
  doc.skills=[{id:'s-old',category:'原技能',items:'Python'}];
  doc.awards=[{id:'a-old',title:'原奖项',issuer:'匿名机构',
    date:'2023',level:'',description:''}];
  return doc;
}
function source(){
  return {id:'import-'+hash,sourceHash:'a'.repeat(64),
    name:'qa-verified.docx',format:'docx',size:10000,importedAt:'2026-11-09T00:00:00Z',
    confirmedByUser:true,
    education:[{id:'ed-new',school:'现代测试大学',degree:'本科',major:'电子信息工程',
      startDate:'2025.09',endDate:'2027.07',gpa:'',ranking:'',
      courses:'嵌入式系统原理',honors:''}],
    projects:[{id:'p-new',name:'STM32 监控终端',role:'开发',
      startDate:'2025.01',endDate:'2025.06',repoUrl:'',techStack:['STM32','FreeRTOS'],
      summary:'开发多任务控制',bullets:['实现串口通信']}],
    experience:[],
    skills:[{id:'s-new',category:'嵌入式开发',items:'STM32、FreeRTOS、UART'},
      {id:'s-other',category:'Web 开发',items:'React、Vue'}],
    awards:[{id:'a-new',title:'嵌入式设计竞赛二等奖',issuer:'匿名竞赛组委会',
      date:'2025',level:'省级',description:''}],
    summary:'本人确认的岗位总结',
    sourceLines:['旧版 Word 原文（不能重读）'],warnings:[],
  };
}
test('fields expose education, skills, and awards with source, never original raw line',()=>{
  const one=source();
  const result=masterRoleFields([one]);
  assert.deepEqual(result.map(x=>x.kind),['education','skills','skills','awards']);
  assert.ok(result.every(x=>x.sourceId===one.id&&x.sourceName===one.name));
  assert.ok(result.every(x=>!x.description.includes('旧版 Word')));
  const ranked=rankMasterRoleFields(result,'嵌入式开发 STM32 FreeRTOS');
  assert.equal(ranked[0].field.title,'嵌入式开发');
  assert.ok(ranked[0].matched.includes('stm32'));
});
test('combined master materials replace only explicitly selected sections; source untouched',()=>{
  const base=realisticResume(), one=source();
  const baseBefore=JSON.stringify(base), sourceBefore=JSON.stringify(one);
  const library=[masterEntryFromResume(base,'project','project-1')];
  const fields=masterRoleFields([one]);
  const selected=fields.filter(x=>x.kind==='education'||x.kind==='skills'&&x.title==='嵌入式开发'||x.kind==='awards').map(x=>x.key);
  const draft=composeResumeFromMaster(base,library,{
    role:'嵌入式软件工程师',selectedIds:[library[0].id],
    selectedFieldIds:selected,structuredSources:[one],
  });
  assert.equal(draft.education[0].school,'现代测试大学');
  assert.equal(draft.skills[0].items,'STM32、FreeRTOS、UART');
  assert.equal(draft.awards[0].title,'嵌入式设计竞赛二等奖');
  assert.equal(draft.projects[0].name,'自动化测试平台');
  assert.equal(draft.experience.length,0,'legacy project/work chooser intentionally replaces those groups');
  assert.equal(draft.basics.summary,'','old job summary is not recycled');
  assert.equal(JSON.stringify(base),baseBefore);
  assert.equal(JSON.stringify(one),sourceBefore);
});
test('structured-only selection preserves unrelated modules and their claims',()=>{
  const base=realisticResume(), one=source();
  const fact=(id,path)=>({factId:id,path,claimType:'action',originalValue:'测试数据',
    normalizedValue:'测试数据',sources:[],status:'user-asserted',candidateConfirmed:true,
    editedAt:'2026-11-09T00:00:00Z',versionId:base.id,sensitivity:'normal',cloudAllowed:false});
  base.factLedger={version:1,records:[
    fact('ed','education/ed-old/gpa'),
    fact('pr','projects/project-1/summary'),
    fact('sk','skills/s-old/items'),
  ]};
  const [education]=masterRoleFields([one]).filter(x=>x.kind==='education');
  const draft=composeResumeFromMaster(base,[],{
    role:base.basics.title,selectedIds:[],selectedFieldIds:[education.key],
    structuredSources:[one],
  });
  assert.equal(draft.projects[0].id,'project-1');
  assert.equal(draft.experience[0].id,'exp-1');
  assert.equal(draft.skills[0].id,'s-old');
  assert.equal(draft.awards[0].id,'a-old');
  assert.equal(draft.education[0].school,'现代测试大学');
  assert.deepEqual(draft.factLedger.records.map(x=>x.factId),['pr','sk']);
});
test('stale or duplicated field selection cannot create a resume',()=>{
  const base=realisticResume(), one=source();
  const fields=masterRoleFields([one]);
  assert.throws(()=>composeResumeFromMaster(base,[],{
    role:'工程师',selectedIds:[],selectedFieldIds:['unknown'],structuredSources:[one],
  }),/变化/);
  assert.throws(()=>composeResumeFromMaster(base,[],{
    role:'工程师',selectedIds:[],selectedFieldIds:[fields[0].key,fields[0].key],
    structuredSources:[one],
  }),/重复/);
  assert.throws(()=>composeResumeFromMaster(base,[],{
    role:'工程师',selectedIds:[],selectedFieldIds:[fields[0].key],
    structuredSources:[],
  }),/变化/);
  assert.throws(()=>composeResumeFromMaster(base,[],{
    role:'工程师',selectedIds:[],selectedFieldIds:[],structuredSources:[one],
  }),/请选择/);
});
test('field composition never reads sourceLines or file blob even if they are hostile getters',()=>{
  const one=source();
  Object.defineProperty(one,'sourceLines',{get(){throw new Error('Original text accessed')}})
  Object.defineProperty(one,'blob',{get(){throw new Error('Original file accessed')}})
  const base=realisticResume(), [field]=masterRoleFields([one]);
  const draft=composeResumeFromMaster(base,[],{
    role:'硬件工程师',selectedIds:[],selectedFieldIds:[field.key],structuredSources:[one],
  });
  assert.equal(draft.education[0].school,'现代测试大学');
});
