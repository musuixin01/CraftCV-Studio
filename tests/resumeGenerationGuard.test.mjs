import test from 'node:test';
import assert from 'node:assert/strict';
import { validateOptimizedItem, validateParsedResume, validateTailoredSummary, validateStoredResume, newClaimWarnings } from '../src/utils/resumeGenerationGuard.ts';

const project = {
  id: 'p1', name: '串口控制', role: '参与开发', startDate: '2025.09',
  endDate: '2025.12', repoUrl: '', techStack: ['STM32', 'FreeRTOS'],
  summary: '通过串口控制设备', bullets: ['配置 USART1 115200 bps，通过中断处理输入指令'],
};

test('allows faithful writing edits while keeping identity and number facts', () => {
  assert.deepEqual(validateOptimizedItem('projects', project, {
    ...project,
    summary: '基于串口中断实现设备控制',
    bullets: ['配置 USART1（115200 bps）并处理中断接收的指令'],
  }), []);
});

test('rejects fabricated performance, project scope and skills', () => {
  assert.match(validateOptimizedItem('projects', project, {
    ...project, bullets: ['USART1 吞吐率提高 60%'],
  }).join('；'), /数字/);
  assert.match(validateOptimizedItem('projects', project, {
    ...project, bullets: ['新增 Rust 核心驱动'],
  }).join('；'), /技术名词/);
  assert.match(validateOptimizedItem('projects', project, {
    ...project, role: '独立负责',
  }).join('；'), /原始事实字段/);
  assert.match(validateOptimizedItem('projects', project, {
    ...project, techStack: ['STM32','FreeRTOS','Rust'],
  }).join('；'), /技术|类型|事实/);
});

test('rejects disappearing bullets or malformed AI JSON objects', () => {
  assert.ok(validateOptimizedItem('projects', project, { ...project, bullets: [] }).length);
  assert.ok(validateOptimizedItem('projects', project, 'not JSON').length);
  assert.ok(validateOptimizedItem('projects', project, { ...project, id:'p2' }).length);
  assert.ok(validateOptimizedItem('projects', project, { ...project, mystery:'new' }).length);
});

test('keeps education school GPA dates awards and company immutable', () => {
  const edu = { id:'e1',school:'大学A',degree:'本科',startDate:'2025.09',endDate:'2027.06',major:'电子信息',gpa:'3.87/5',courses:'C语言',honors:'校级奖学金' };
  assert.ok(validateOptimizedItem('education',edu,{ ...edu,gpa:'4.87/5'}).length);
  assert.deepEqual(validateOptimizedItem('education',edu,{ ...edu,courses:'C语言程序设计'}),[]);
  assert.ok(validateOptimizedItem('awards',{id:'a1',title:'优秀奖',level:'校级',date:'2025',issuer:'学校',description:'参与竞赛'},
      {id:'a1',title:'一等奖',level:'校级',date:'2025',issuer:'学校',description:'参与竞赛'}).length);
});

const minimal = {
  basics:{name:'学生甲',title:'',phone:'',email:'',summary:''},
  education:[],skills:[],projects:[],experience:[],awards:[],
};
test('accepts sparse faithful extraction with empty unknown facts',()=>{
  assert.deepEqual(validateParsedResume(minimal),[]);
});
test('rejects malformed or injected extraction fields',()=>{
  assert.ok(validateParsedResume({ ...minimal, education:'not array' }).length);
  assert.ok(validateParsedResume({ ...minimal, basics:{...minimal.basics,gpa:'4.0'} }).length);
  assert.ok(validateParsedResume({ ...minimal, projects:[{name:'P',bullets:[123]}] }).length);
  assert.ok(validateParsedResume(null).length);
});
test('JD summary suggestion cannot inject unsupported metrics or technology',()=>{
  const resume={ basics:{summary:'使用 C++ 和 STM32 开发'}, projects:[] };
  assert.ok(validateTailoredSummary(resume,'拥有 10 年经验').length);
  assert.ok(validateTailoredSummary(resume,'掌握 Rust').length);
  assert.deepEqual(validateTailoredSummary(resume,'使用 C++ 和 STM32 开发'),[]);
});
test('rejects new unmeasured ownership or verification claims even without digits',()=>{
  assert.ok(newClaimWarnings({description:'参与编写控制代码'}, {description:'主导开发并已投入生产'}).length);
  assert.ok(newClaimWarnings({description:'完成串口通信代码'}, {description:'实板验证通过，零故障运行'}).length);
});

test('generation and polishing reject unsupported role promotion or false completion without new digits',()=>{
  const participating={title:'STM32 固件开发', role:'参与开发',bullets:['参与 STM32 UART 串口接收开发，仍需实板调试验证。']};
  const promoted={...participating,bullets:['主导 STM32 UART 串口接收开发，仍需实板调试验证。']};
  const falseSuccess={...participating,bullets:['参与 STM32 UART 串口接收开发，已验证通过并稳定运行。']};
  assert.match(newClaimWarnings(participating,promoted).join('；'),/主导|独立负责/);
  assert.match(newClaimWarnings(participating,falseSuccess).join('；'),/仍需调试|验证通过|已上线/);
  assert.match(validateOptimizedItem('projects',{
    id:'p', name:'固件项目',role:'参与开发',summary:'',techStack:['STM32','UART'],bullets:participating.bullets,
  },{
    id:'p', name:'固件项目',role:'参与开发',summary:'',techStack:['STM32','UART'],bullets:promoted.bullets,
  }).join('；'),/主导|独立负责/);
  assert.deepEqual(newClaimWarnings(participating,{
    ...participating,bullets:['参与 STM32 UART 串口接收开发，完善中断处理，并继续实板调试验证。'],
  }),[],'accurate polishing must remain permitted');
  assert.deepEqual(newClaimWarnings({text:'独立开发 STM32 控制功能，已通过实板验证。'},
    {text:'主导 STM32 控制功能，已通过实板验证。'}),[],
    'source already states direct ownership and successful validation');
});

test('unknown data source remains a suggestion, not new evidence',()=>{
  assert.ok(newClaimWarnings({title:'MCU'}, {title:'MCU',result:'成功降低功耗 30%'}).length);
});

test('damaged JSON backup does not qualify for overwriting current resume',()=>{
  const base = {
    basics:{name:'甲',title:'',phone:'',email:'',summary:''},
    style:{template:'modern'},
    sections:[{id:'sec1',type:'summary',title:'简介',visible:true}],
    education:[],projects:[],experience:[],skills:[],awards:[],
  };
  assert.deepEqual(validateStoredResume(base),[]); // older backup may omit customSections
  assert.ok(validateStoredResume({...base,skills:null}).length);
  assert.ok(validateStoredResume({...base,style:null}).length);
  assert.ok(validateStoredResume({...base,sections:[{}]}).length);
});

test('legacy backup and valid optional ledger load; damaged ledger fails closed',()=>{
  const base={basics:{name:'用户甲',title:'',phone:'',email:'',summary:''},style:{template:'modern'},
    sections:[{id:'sec1',type:'summary',title:'简介',visible:true}],
    education:[],projects:[],experience:[],skills:[],awards:[]};
  assert.deepEqual(validateStoredResume(base),[]);
  assert.deepEqual(validateStoredResume({...base,factLedger:{version:1,records:[]}}),[]);
  assert.ok(validateStoredResume({...base,factLedger:{version:1,records:[{status:'verified-source'}]}}).length);
  assert.ok(validateStoredResume({...base,factLedger:{version:2,records:[]}}).length);
});

test('old backups remain flexible and explicit page limit is validated', () => {
  const base = { basics:{name:'匿名',title:'',phone:'',email:'',summary:''},
    style:{template:'modern'}, sections:[{id:'s',type:'summary',title:'简介',visible:true}],
    education:[],projects:[],experience:[],skills:[],awards:[] };
  assert.deepEqual(validateStoredResume(base), []);
  assert.deepEqual(validateStoredResume({ ...base, style:{ ...base.style, pageGoal:'one' } }), []);
  assert.deepEqual(validateStoredResume({ ...base, style:{ ...base.style, pageGoal:'flexible' } }), []);
  assert.match(validateStoredResume({ ...base, style:{ ...base.style, pageGoal:'invalid' } }).join(' '), /pageGoal/);
});

test('public repository evidence is not personal evidence for new numbers or technologies',()=>{
  const source={...project,techStack:['STM32'],summary:'已有串口配置',bullets:['已有串口控制'],
    evidence:{repository:'org/demo',revision:'abc',commitShas:[],sourceFiles:[],
      warnings:[],notice:'仓库 README 提到 Rust 和 60% 性能提升',
      codeSignals:[{technology:'Rust',category:'language',sourceFiles:[]}]}};
  const proposed={...source,bullets:['添加 Rust 驱动，吞吐率提升 60%']};
  const issues=validateOptimizedItem('projects',source,proposed).join('；');
  assert.match(issues,/技术名词/);
  assert.match(issues,/数字|性能提升/);
  assert.deepEqual(validateOptimizedItem('projects',source,{...source,summary:'已有串口配置'}),[]);
  const resume={basics:{name:'甲',summary:'了解 STM32',phone:'13800006000'},
    projects:[source],factLedger:{version:1,records:[{normalizedValue:'Rust 60%'}]}};
  const summary=validateTailoredSummary(resume,'熟悉 Rust 并提升 60%').join('；');
  assert.match(summary,/技术名词/);
  assert.match(summary,/数字|性能提升/);
});

test('reusing a real configuration number for an invented performance claim is rejected',()=>{
  const source={text:'配置 UART 115200 bps'};
  const claim={text:'吞吐率提升 115200%（未经测量）'};
  assert.match(newClaimWarnings(source,claim).join('；'),/性能提升|量化收益/);
});
