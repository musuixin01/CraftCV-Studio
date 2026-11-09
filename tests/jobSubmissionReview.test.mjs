import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_EE_RESUME } from '../src/data/defaultResume.ts';
import { analyzeJobEvidence, reviewResumeSubmission } from '../src/utils/jobSubmissionReview.ts';
import { buildExportQualityReport } from '../src/utils/exportQualityPreflight.ts';

const sample=()=>structuredClone(DEFAULT_EE_RESUME);
const ats=()=>buildExportQualityReport({
  format:'ats',basics:{name:'候选人',title:'嵌入式工程师',phone:'123',email:'user@example.org'},
  visibleSectionCount:4,fontLoading:false,singlePageOnly:false,
  geometry:{sheetWidthPx:800,sheetHeightPx:1132,scrollHeightPx:1132,scrollWidthPx:800,clientWidthPx:800},
});
test('job suggestions point to real resume records; no invented technical achievements',()=>{
  const resume=sample();
  const before=JSON.stringify(resume);
  const result=analyzeJobEvidence(resume,'嵌入式 STM32 FreeRTOS FPGA 软件测试');
  assert.ok(result.suggestions.some(item=>item.kind==='project' && item.title.includes('FreeRTOS')));
  assert.ok(result.suggestions.every(item=>item.sourcePath && item.id));
  assert.ok(result.matches.inspected.includes('STM32'));
  assert.ok(result.matches.inspected.includes('软件测试'));
  assert.equal(JSON.stringify(resume),before);
  assert.equal(result.suggestions.some(item=>item.title.includes('不存在的项目')),false);
});
test('structured grades are recommended but explicitly not printed automatically',()=>{
  const resume=sample();
  resume.education[0].courseGrades=[
    {id:'cg-dsp',course:'数字信号处理',score:'96'},
    {id:'cg-generic',course:'其他课程',score:'90'},
  ];
  const grade=analyzeJobEvidence(resume,'数字信号处理 DSP FPGA');
  const proposal=grade.suggestions.find(item=>item.id.includes('cg-dsp'));
  assert.equal(proposal?.shownInResume,false);
  assert.equal(proposal?.sourcePath,'education/edu-1/courseGrades/cg-dsp/score');
  assert.equal(grade.suggestions.some(item=>item.title.includes('其他课程')),false);
  assert.equal(resume.education[0].courses.includes('96'),false);
});
test('student weighted mean is recommended only for relevant academic requirements',()=>{
  const resume=sample();
  resume.education[0].weightedAverage='88.75';
  assert.equal(analyzeJobEvidence(resume,'嵌入式固件开发').suggestions.some(x=>x.kind==='education'),false);
  assert.equal(analyzeJobEvidence(resume,'成绩单及学业成绩 GPA 要求').suggestions.some(x=>x.kind==='education'),true);
});
test('existing skills count as located; absent keywords are unknown, not new abilities',()=>{
  const resume=sample();
  resume.projects=[];resume.awards=[];
  resume.skills=[{id:'s1',category:'工具',items:'Python、Linux、嵌入式 MCU'}];
  const x=analyzeJobEvidence(resume,'Python、Linux、嵌入式 MCU 和 Rust 研发');
  assert.ok(x.matches.matched.includes('Python'));
  assert.ok(x.matches.matched.includes('Linux'));
  assert.equal(x.suggestions.length,0);
  assert.ok(!JSON.stringify(x).includes('Rust已掌握'));
});
test('full RGS preflight never asserts final PDF is verified or scores interviews',()=>{
  const report=reviewResumeSubmission(sample(),'STM32 FreeRTOS',ats());
  assert.equal(report.finalPdfVerified,false);
  assert.equal(report.status,'REVIEW_REQUIRED');
  assert.ok(report.issues.some(x=>x.id==='pdf-file'&&x.rule==='Q-07'));
  assert.ok(report.topIssues.length<=5);
  assert.ok(!JSON.stringify(report).includes('成功率'));
});
test('missing layout geometry yields NEEDS_LAYOUT, not READY',()=>{
  const report=reviewResumeSubmission(sample(),'嵌入式',null);
  assert.equal(report.status,'NEEDS_LAYOUT');
  assert.ok(report.issues.some(x=>x.id==='layout-unchecked'));
  assert.equal(report.estimatedPages,null);
});
test('malformed fact ledger blocks data readiness even with valid page dimensions',()=>{
  const resume=sample();
  resume.factLedger={version:1,records:[{path:'x',status:'untrusted'}]};
  const report=reviewResumeSubmission(resume,'STM32',ats());
  assert.equal(report.status,'BLOCKED');
  assert.ok(report.issues.some(x=>x.rule==='Q-01'));
});
test('unsupported or unconfirmed factLedger content is surfaced but not labeled verified',()=>{
  const resume=sample();
  resume.factLedger={version:1,records:[{
    factId:'i',path:'education/edu-1/major',claimType:'education',
    normalizedValue:'未确认专业',originalValue:'未确认专业',status:'inferred-suggestion',
    candidateConfirmed:false,editedAt:'2026-11-08',versionId:resume.id,
    sources:[{sourceId:'import:x',kind:'ai-file-extraction',label:'资料',capturedAt:'2026-11-08'}],
    sensitivity:'normal',cloudAllowed:false,
  }]};
  const report=reviewResumeSubmission(resume,'STM32',ats());
  assert.ok(report.issues.some(x=>x.id==='source'));
  assert.equal(report.finalPdfVerified,false);
});
test('quantified improvement requires review and contains an actionable location',()=>{
  const resume=sample();
  resume.projects[0].bullets.push('系统延迟降低 60%，已量化改善');
  const report=reviewResumeSubmission(resume,'STM32',ats());
  const metric=report.issues.find(x=>x.id==='metrics');
  assert.equal(metric?.rule,'Q-03');
  assert.match(metric?.path??'',/projects\/.+\/bullets/);
});
test('image PDF is explicitly not ATS text; page measurement stays an estimate',()=>{
  const resume=sample();
  const pdf=buildExportQualityReport({
    format:'image',basics:resume.basics,visibleSectionCount:3,fontLoading:false,
    geometry:{sheetWidthPx:794,sheetHeightPx:1123,scrollHeightPx:1123,scrollWidthPx:794,clientWidthPx:794},
  });
  const report=reviewResumeSubmission(resume,'嵌入式',pdf);
  assert.equal(report.inspectedFormat,'image');
  assert.ok(report.issues.some(x=>x.id==='ats'));
  assert.equal(report.finalPdfVerified,false);
});
test('changing the JD changes recommendations without mutating the stored resume',()=>{
  const resume=sample();
  const snapshot=JSON.stringify(resume);
  const embedded=analyzeJobEvidence(resume,'FreeRTOS UART STM32');
  const testing=analyzeJobEvidence(resume,'软件测试 SQL C#');
  assert.notDeepEqual(embedded.matches.inspected,testing.matches.inspected);
  assert.equal(JSON.stringify(resume),snapshot);
});
