import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getImportReviewSections, createImportFactLedger, detectImportConflicts, reconcileImportFactLedger,
} from '../src/utils/resumeImportReview.ts';

const sample = {
  id:'source-1',versionName:'review',updatedAt:'2026-01-01',
  basics:{name:'测试甲',title:'工程师',phone:'123',email:'example@example.invalid',location:'',github:'',website:'',politicalStatus:'',graduationYear:'2027',avatarUrl:'',showAvatar:false,summary:''},
  sections:[], style:{template:'modern'},
  education:[{id:'edu-1',school:'学校A',degree:'本科',major:'专业A',startDate:'2025',endDate:'2027',gpa:'3.8/5',ranking:'',courses:'',honors:''}],
  projects:[],experience:[],skills:[],awards:[],customSections:[],
};
test('AI extraction remains an unverified claim even after candidate approval',()=>{
  const sections=getImportReviewSections(sample);
  assert.ok(sections.some((section)=>section.title==='教育经历'));
  const ledger=createImportFactLedger(sample,{kind:'ai-file-extraction',label:'resume.pdf'},true,'2026-01-02T00:00:00.000Z');
  const record=ledger.records.find((item)=>item.path==='education/edu-1/gpa');
  assert.equal(record?.normalizedValue,'3.8/5');
  assert.equal(record?.status,'inferred-suggestion');
  assert.equal(record?.candidateConfirmed,true);
  assert.equal(record?.cloudAllowed,false);
  assert.equal(ledger.records.find((r)=>r.path==='basics/email')?.sensitivity,'personal');
  assert.equal(ledger.records.find((r)=>r.path==='basics/name')?.sources[0].kind,'ai-file-extraction');
});
test('an empty or missing fact is never filled from a demo resume',()=>{
  const doc={...sample,basics:{...sample.basics,name:'',email:''},education:[]};
  const ledger=createImportFactLedger(doc,{kind:'ai-pasted-text',label:'pasted'},false);
  assert.ok(!ledger.records.some((r)=>r.path==='basics/name'));
  assert.ok(!ledger.records.some((r)=>r.path.startsWith('education/')));
  assert.equal(ledger.records[0].candidateConfirmed,false);
});
test('same-school grades or dates are flagged as differences without auto reconciliation',()=>{
  const candidate={...sample,education:[{...sample.education[0],gpa:'4.0/5',endDate:'2028'}]};
  const old=JSON.stringify(sample);
  const issues=detectImportConflicts(sample,candidate);
  assert.equal(issues.length,2);
  assert.ok(issues.some((issue)=>issue.label.includes('成绩')&&issue.original==='3.8/5'&&issue.incoming==='4.0/5'));
  assert.equal(JSON.stringify(sample),old);
});
test('missing values and different schools are not treated as proven conflicts',()=>{
  const doc={...sample,basics:{...sample.basics,phone:''},education:[{...sample.education[0],school:'学校B'}]};
  assert.deepEqual(detectImportConflicts(sample,doc),[]);
});
test('editing imported GPA keeps original source but marks new value as unverified user assertion',()=>{
  const withLedger={...sample,factLedger:createImportFactLedger(sample,{kind:'ai-file-extraction',label:'resume.pdf'},true)};
  const edited={...withLedger,education:[{...sample.education[0],gpa:'4.0/5'}]};
  const synced=reconcileImportFactLedger(withLedger,edited,'2026-01-02');
  const rec=synced.factLedger.records.find((r)=>r.path==='education/edu-1/gpa');
  assert.equal(rec?.originalValue,'3.8/5');
  assert.equal(rec?.normalizedValue,'4.0/5');
  assert.equal(rec?.status,'user-asserted');
  assert.equal(rec?.candidateConfirmed,false);
  assert.equal(rec?.sources[0].label,'resume.pdf');
  assert.strictEqual(reconcileImportFactLedger(synced,synced),synced);
  assert.strictEqual(reconcileImportFactLedger(withLedger,{...edited,style:{...edited.style,template:'modern'}}).factLedger?.records.find((r)=>r.path==='basics/name')?.candidateConfirmed,true);
});
test('new manual values are tracked without fabricated sources',()=>{
  const withLedger={...sample,factLedger:createImportFactLedger(sample,{kind:'ai-pasted-text',label:'pasted'},true)};
  const edited={...withLedger,basics:{...sample.basics,summary:'用户手动填写的简介'}};
  const doc=reconcileImportFactLedger(withLedger,edited);
  const rec=doc.factLedger.records.find((r)=>r.path==='basics/summary');
  assert.equal(rec.status,'user-asserted');
  assert.deepEqual(rec.sources,[]);
  assert.equal(rec.candidateConfirmed,false);
});
