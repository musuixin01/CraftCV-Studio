import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_EE_RESUME} from '../src/data/defaultResume.ts';
import {validateStoredResume} from '../src/utils/resumeGenerationGuard.ts';
import {compareEvidenceFact} from '../src/utils/evidenceAttachments.ts';
import {applyMasterEvidenceFact} from '../src/utils/masterFactAdoption.ts';

const copy=()=>structuredClone(DEFAULT_EE_RESUME);
const source=(facts)=>({
  id:'test-source',name:'synthetic-attachment.png',
  review:{documentType:'transcript',notes:[],facts},
});
const grade={
  target:'education.courseGrade',scope:'电子科技大学',label:'数字信号处理',
  value:'96',quote:'数字信号处理 96',
};
const avg={
  target:'education.weightedAverage',scope:'电子科技大学',label:'加权平均',
  value:'88.75',quote:'加权平均 88.75',
};

test('legacy resume remains valid with optional typed fields absent',()=>{
  assert.deepEqual(validateStoredResume(copy()),[]);
});
test('stored resume guards malformed optional grade data and credential types',()=>{
  const doc=copy();
  doc.education[0].courseGrades='not-an-array';
  assert.ok(validateStoredResume(doc).some(issue=>issue.includes('课程成绩')));
  doc.education[0].courseGrades=[{id:'cg1',course:'数字信号处理',score:96}];
  assert.ok(validateStoredResume(doc).some(issue=>issue.includes('课程成绩')));
  doc.education[0].courseGrades=[{id:'cg1',course:'数字信号处理',score:'96'}];
  doc.education[0].weightedAverage='88.75';
  assert.deepEqual(validateStoredResume(doc),[]);
  doc.awards[0].credentialType='unknown-type';
  assert.ok(validateStoredResume(doc).some(issue=>issue.includes('证书与奖项类型')));
});

test('score comparisons use the structured course and weighted mean, never GPA or the core-course list',()=>{
  const first=copy();
  assert.equal(compareEvidenceFact(first,grade).status,'needs-review');
  const withGrade=applyMasterEvidenceFact(first,source([grade]),0);
  assert.equal(compareEvidenceFact(withGrade,grade).status,'same');
  assert.equal(compareEvidenceFact(withGrade,{...grade,value:'97',quote:'数字信号处理 97'}).status,'conflict');
  const withMean=applyMasterEvidenceFact(withGrade,source([avg]),0);
  assert.equal(compareEvidenceFact(withMean,avg).current,'88.75');
  assert.equal(compareEvidenceFact(withMean,avg).status,'same');
  assert.equal(withMean.education[0].gpa,first.education[0].gpa);
  assert.equal(compareEvidenceFact(withMean,{...avg,value:'88.00'}).status,'conflict');
});

test('school association is exact, not an unsafe substring',()=>{
  const first=copy();
  assert.equal(compareEvidenceFact(first,{...grade,scope:'电子科技'}).status,'needs-review');
});

test('opt-in structured data is retained only in resume data, without automatic changes to legacy print fields',()=>{
  const first=copy();
  const next=applyMasterEvidenceFact(first,source([grade]),0);
  assert.equal(next.education[0].courses,first.education[0].courses);
  assert.equal(next.education[0].gpa,first.education[0].gpa);
  assert.ok(Array.isArray(next.education[0].courseGrades));
  assert.equal(next.factLedger.records.length,1);
});
