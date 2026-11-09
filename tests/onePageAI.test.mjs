import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  applyReviewedOnePageCandidates,
  collectOnePageTextFields,
  validateOnePageCandidate,
  validateOnePageJobSuggestion,
  validateOnePageKeepRecommendation,
  getOnePageWritingWarnings,
} from '../src/utils/onePageAI.ts';

const resume = {
  id:'draft', versionName:'test', updatedAt:'2026-11-08',
  basics: {
    name:'匿名校招求职者', phone:'13800000000', email:'hidden@example.com',
    avatarUrl:'data:image/png;base64,SECRET', title:'嵌入式软件工程师',
    summary:'具有嵌入式软件开发经验，曾经使用 STM32 完成串口通信驱动设计并实现 UART 数据解析。',
  },
  education: [
    {id:'e1',school:'匿名高校',degree:'本科',major:'电子信息工程',
      startDate:'2025',endDate:'2027',gpa:'3.87',ranking:'',
      courses:'电路分析、通信原理、计算机组成原理、微机原理',honors:''},
  ],
  sections: [],
  projects: [{
    id:'p1',name:'板级串口通信',role:'个人项目',startDate:'2025.09',
    endDate:'2026.01',repoUrl:'https://example.com/demo',techStack:['STM32','FreeRTOS'],
    summary:'完成 STM32 串口通信模块设计与实现，并通过 UART 对外设数据进行处理。',
    bullets:[
      '通过 DMA 配合 UART 处理串口输入数据，并在中断服务中更新缓冲区状态。',
      '配置 UART 数据包解析程序，按照预定义帧头与校验字段识别有效指令。',
    ],
  }],
  experience:[],skills:[],awards:[],customSections:[],
  style:{template:'pdf-classic',fontSize:'md',pageGoal:'one'},
};
test('AI one-page payload never includes identities, contacts, grades, dates, avatars or full document', () => {
  const fields=collectOnePageTextFields(resume);
  assert.ok(fields.length >= 3);
  const serialized=JSON.stringify(fields);
  for(const forbidden of ['13800000000','hidden@example.com','SECRET','3.87','2027','2025.09','https://example.com/demo']) {
    assert.ok(!serialized.includes(forbidden),forbidden);
  }
  assert.ok(fields.every(f=>typeof f.original==='string'&&f.original.length>=24));
});

test('free-text with contact identifiers is excluded before an AI request', () => {
  const draft = structuredClone(resume);
  draft.projects[0].summary = '我在项目中使用 UART，并填写了 13800138000 作为联系电话。';
  draft.basics.summary = '联系邮箱 person@example.com，主要完成 STM32 开发任务。';
  const fields = collectOnePageTextFields(draft);
  assert.equal(fields.some((f) => f.id === 'projects.0.summary'), false);
  assert.equal(fields.some((f) => f.id === 'basics.summary'), false);
  assert.ok(fields.some((f) => f.id === 'projects.0.bullets.0'));
});

test('deterministic guard allows shorter accurate phrasing but rejects claim invention and lost metrics',()=>{
  const field={id:'projects.0.bullets.0',label:'项目要点',original:'通过 DMA 配合 UART 处理串口输入数据，并在中断服务中更新缓冲区状态。'};
  assert.deepEqual(validateOnePageCandidate(field,'使用 DMA 和 UART 处理串口数据，中断时更新缓冲区。'),[]);
  assert.match(validateOnePageCandidate(field,'把 UART 连接改为 BLE 通信。').join(' '),/技术术语被删去|新增了/);
  assert.ok(validateOnePageCandidate(field,'原文').length);
  const number={...field,original:'利用 STM32 DMA 在 8ms 内完成操作，并通过 UART 通讯完成数据处理。'};
  assert.ok(validateOnePageCandidate(number,'利用 STM32 DMA 完成操作并通过 UART 通讯。').join('').includes('8'));
  assert.ok(validateOnePageCandidate(field,'').length);
});

test('RGS permits modest expressive polishing without forcing each sentence to shrink', () => {
  const field = {id:'projects.0.bullets.0',label:'项目要点',
    original:'基于 STM32 与 UART 完成串口数据接收，通过 DMA 维护缓冲区状态。'};
  const polished = '面向串口通信场景，基于 STM32 与 UART 完成数据接收，采用 DMA 维护缓冲区状态。';
  assert.ok(polished.length > field.original.length);
  assert.deepEqual(validateOnePageCandidate(field, polished), []);
  assert.deepEqual(getOnePageWritingWarnings(field.original, polished), []);
  const candidate = {id: field.id, proposed: polished, reason:'优化工程叙述的逻辑顺序'};
  const draft = structuredClone(resume);
  draft.projects[0].bullets[0] = field.original;
  assert.equal(applyReviewedOnePageCandidates(draft,[candidate]).projects[0].bullets[0],polished);
  assert.ok(validateOnePageCandidate(field,field.original).length,'no-op suggestions are not useful');
});

test('soft warnings leave legitimate nuanced revisions available but not silently selected', () => {
  const collaboration='参与 STM32 与 UART 串口数据采集，并调试 DMA 缓冲区。';
  const scoped='负责 STM32 与 UART 串口数据采集和 DMA 缓冲区调试。';
  assert.deepEqual(validateOnePageCandidate({id:'x',label:'x',original:collaboration},scoped),[]);
  assert.ok(getOnePageWritingWarnings(collaboration,scoped).some(w=>w.includes('职责')));
  const unfinished='基于 STM32 与 UART 完成初步串口联调，仍需进一步校准验证。';
  const incompleteRewrite='基于 STM32 与 UART 完成串口联调与校准。';
  assert.deepEqual(validateOnePageCandidate({id:'x',label:'x',original:unfinished},incompleteRewrite),[]);
  assert.ok(getOnePageWritingWarnings(unfinished,incompleteRewrite).some(w=>w.includes('项目阶段')));
  assert.ok(validateOnePageCandidate({id:'x',label:'x',original:collaboration},
    '主导 STM32 与 UART 串口数据采集，并调试 DMA 缓冲区。').length,
    'claiming lead ownership from participation remains disallowed');
  assert.ok(validateOnePageCandidate({id:'x',label:'x',original:unfinished},
    '基于 STM32 与 UART 完成串口联调，验证通过并稳定运行。').length,
    'pending verification cannot become a completed test');
});

test('job-focused candidate must cite actual resume evidence and an actual supplied JD', () => {
  const original = { id:'projects.0.bullets.0', label:'项目要点',
    original:'通过 DMA 配合 UART 处理串口输入数据，并在中断服务中更新缓冲区状态。' };
  const jd = '具备 DMA、UART 驱动开发能力，能够编写驱动和定位常见嵌入式问题。';
  const suggestion = {
    id:original.id,
    proposed:'使用 DMA 和 UART 处理串口数据，中断时更新缓冲区。',
    reason:'保留岗位需要的驱动技术及真实数据链路，删去重复动作描述。',
    relevance:'high', evidenceQuote:'DMA 配合 UART',
    jobBasis:'DMA、UART 驱动开发能力', tradeoff:'需核对中断维护缓冲区的具体方式',
  };
  assert.deepEqual(validateOnePageJobSuggestion(original,suggestion,jd),[]);
  assert.ok(validateOnePageJobSuggestion(original,{...suggestion,evidenceQuote:'实板高并发压力验证'},jd).some(x=>x.includes('原文证据')));
  assert.ok(validateOnePageJobSuggestion(original,{...suggestion,jobBasis:'3年团队管理经验'},jd).some(x=>x.includes('岗位要求')));
  assert.ok(validateOnePageJobSuggestion(original,{...suggestion,relevance:'highest'},jd).length);
  assert.ok(validateOnePageJobSuggestion(original,{...suggestion,proposed:'通过 DMA 和 UART 在 2ms 内完成测试。'},jd).length);
  assert.ok(validateOnePageJobSuggestion(original,{...suggestion,jobBasis:''},jd).length);
  assert.deepEqual(validateOnePageJobSuggestion(original,{...suggestion,jobBasis:''},''),[]);
});

test('recommendations to retain core technical evidence must quote the real field',()=>{
  const field={id:'projects.0.bullets.0',label:'项目',original:'通过 DMA 配合 UART 处理串口输入数据，并在中断服务中更新缓冲区状态。'};
  assert.deepEqual(validateOnePageKeepRecommendation(field,{
    id:field.id,evidenceQuote:'DMA 配合 UART',
    reason:'这是实际开发使用的底层技术证据，应优先保留。'
  }),[]);
  assert.ok(validateOnePageKeepRecommendation(field,{
    id:field.id,evidenceQuote:'FreeRTOS 调度实测 1ms',
    reason:'假装有工程验证。'
  }).length);
});

test('role-only and real-JD analyses are explicitly distinguished; changing requirements disables old approvals',()=>{
  const modal=fs.readFileSync('src/components/OnePageAICompactDialog.tsx','utf8');
  const backend=fs.readFileSync('server.ts','utf8');
  assert.match(backend,/jobDescription \? 'specific-jd' : 'role-only'/);
  assert.match(backend,/validateOnePageKeepRecommendation/);
  assert.match(backend,/jobBasis 必须从上述 JD 原文逐字摘录/);
  assert.match(modal,/岗位相关性（AI 估计）/);
  assert.match(modal,/本次仅根据岗位方向推断/);
  assert.match(modal,/岗位条件已更改，旧候选不可应用/);
  assert.match(modal,/disabled=\{!selected.length \|\| sourceChanged \|\| criteriaChanged\}/);
  assert.match(modal,/setAccepted\(valid\.filter\(\(suggestion\) => \{/);
});

test('one-click refinement defaults to all validated edits, keeps details optional, and confirms once', () => {
  const modal = fs.readFileSync('src/components/OnePageAICompactDialog.tsx', 'utf8');
  const app = fs.readFileSync('src/App.tsx', 'utf8');
  assert.match(modal, /setAccepted\(valid\.filter\(\(suggestion\) => \{/);
  assert.match(modal, /<details className=/);
  assert.match(modal, /查看岗位依据、技术证据与招聘 JD/);
  assert.match(modal, /确认精简 · 应用 \{selected\.length\} 处/);
  const aiApprove = modal.slice(modal.indexOf('const apply = () =>'),modal.indexOf('const confirmSpacing = () =>'));
  assert.ok(!aiApprove.includes('window.confirm'), 'AI confirmation must not cause a second popup');
  assert.match(aiApprove, /onApply\(updated, selected\.length\)/);
  assert.match(app, /pendingAiCompactCountRef/);
  assert.match(app, /onPageMetricsChange=\{handlePageMetricsChange\}/);
  assert.match(app, /setLastAiCompactReview\(\{ \.\.\.pending, metrics \}\)/);
  assert.match(app, /aria-label="精简完成后的 A4 检查"/);
});

test('confirmed changes update only selected text fields and preserve records/spacing',()=>{
  const before=structuredClone(resume);
  const field=collectOnePageTextFields(resume).find(x=>x.id==='projects.0.bullets.0');
  assert.ok(field);
  const candidate={id:field.id,proposed:'使用 DMA 和 UART 处理串口数据，中断时更新缓冲区。',reason:'删除冗余'};
  const after=applyReviewedOnePageCandidates(resume,[candidate]);
  assert.deepEqual(resume,before);
  assert.equal(after.projects[0].bullets[0],candidate.proposed);
  assert.equal(after.projects[0].bullets[1],resume.projects[0].bullets[1]);
  assert.equal(after.projects[0].techStack, resume.projects[0].techStack, 'tech stack reference unchanged');
  assert.deepEqual(after.education,resume.education);
  assert.deepEqual(after.style,resume.style);
  assert.deepEqual(after.basics,resume.basics);
});

test('unknown, duplicate or unverifiable AI revisions fail closed before overwrite',()=>{
  assert.throws(()=>applyReviewedOnePageCandidates(resume,[{id:'basics.phone',proposed:'删去号码',reason:''}]));
  const field=collectOnePageTextFields(resume).find(x=>x.id==='projects.0.bullets.0');
  assert.ok(field);
  const draft={id:field.id,proposed:'使用 DMA 和 UART 处理串口数据，中断时更新缓冲区。',reason:'删繁'};
  assert.throws(()=>applyReviewedOnePageCandidates(resume,[draft,draft]));
  assert.equal(applyReviewedOnePageCandidates(resume,[]),resume);
});

test('without AI, users see spacing confirmation and real model setup, not manual discussion', () => {
  const modal=fs.readFileSync('src/components/OnePageAICompactDialog.tsx','utf8');
  const app=fs.readFileSync('src/App.tsx','utf8');
  const model=fs.readFileSync('src/components/AIModelSelector.tsx','utf8');
  assert.match(modal,/确认压缩间距/);
  assert.match(modal,/window\.confirm\(`确定压缩排版间距吗/);
  assert.match(modal,/查看 AI 模型配置说明/);
  assert.match(modal,/craftcv-open-ai-model-settings/);
  assert.doesNotMatch(modal,/建议先讨论这三件事|当前发现 \{allFields.length\} 处可讨论/);
  assert.match(app,/onApplySpacing=\{\(\) => \{/);
  assert.match(app,/compactOnePageSpacing\(prev\.style\)/);
  assert.match(model,/window\.addEventListener\('craftcv-open-ai-model-settings'/);
});

test('full-resume AI refinement uses a separate consent-and-review path, never the section-only optimizer',()=>{
  const server=fs.readFileSync('server.ts','utf8');
  const app=fs.readFileSync('src/App.tsx','utf8');
  const modal=fs.readFileSync('src/components/OnePageAICompactDialog.tsx','utf8');
  assert.match(server,/app\.post\('\/api\/ai\/condense-one-page'/);
  assert.match(server,/validateOnePageJobSuggestion\(original,/);
  assert.match(modal,/catalog\.models\s*\?\?/);
  assert.match(modal,/onApply\(updated, selected\.length\)/);
  assert.match(app,/onRequestOnePageAI/);
});
