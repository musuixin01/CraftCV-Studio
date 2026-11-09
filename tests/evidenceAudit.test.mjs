import test from 'node:test';
import assert from 'node:assert/strict';
import {auditEvidence} from '../src/utils/evidenceAudit.ts';

const resume = {
  education:[{id:'edu-1',school:'信阳职业技术学院',major:'软件工程',degree:'专科',
    startDate:'',endDate:'',gpa:'',ranking:'',courses:'',honors:''}],
  awards:[],experience:[],
};
const emptyResume={education:[],awards:[],experience:[]};
const hash=(digit)=>digit.repeat(64);
const fact=(target,scope,label,value,quote=value)=>({target,scope,label,value,quote});
const source=(id,facts,options={})=>({
  id,contentHash:options.hash||hash(id==='a'?'a':'b'),
  review:{documentType:options.kind||'transcript',facts,notes:options.notes||[]},
});

test('clean transcript claim is automatically indexed without user-by-user confirmation',()=>{
  const f=fact('education.major','另一所学校','专业','电子信息工程','专业：电子信息工程');
  const inputs=[source('a',[f])];
  const original=JSON.stringify(inputs);
  const result=auditEvidence(inputs,resume);
  assert.equal(result.indexed,1);
  assert.equal(result.consistent,0);
  assert.equal(result.attention,0);
  assert.equal(result.facts[0].status,'indexed');
  assert.equal(JSON.stringify(inputs),original);
});

test('different byte fingerprints matching same field are multi-document-consistent, not verified',()=>{
  const f=fact('education.degree','信阳职业技术学院','学历','专科','学历：专科');
  const result=auditEvidence([source('a',[f]),source('b',[{...f,quote:'学历：专科'}])],resume);
  assert.equal(result.consistent,2);
  assert.equal(result.attention,0);
  assert.equal(result.facts[0].consistentSourceCount,2);
  assert.equal(result.facts[0].status,'consistent');
});

test('same file hash cannot corroborate itself, even across duplicated source records',()=>{
  const f=fact('education.degree','信阳职业技术学院','学历','专科');
  const result=auditEvidence([
    source('a',[f],{hash:hash('c')}),source('b',[f],{hash:hash('c')}),
  ],resume);
  assert.equal(result.consistent,0);
  assert.equal(result.indexed,2);
});

test('legacy evidence without a hash does not pretend to provide an independent source',()=>{
  const f=fact('education.degree','信阳职业技术学院','学历','专科');
  const result=auditEvidence([{id:'legacy',review:{documentType:'transcript',facts:[f],notes:[]}},source('a',[f])],resume);
  assert.equal(result.consistent,0);
});

test('different majors under the same institution become visible exceptions; missing-school match is not fabricated',()=>{
  const first=fact('education.major','信阳职业技术学院','专业','软件工程','专业：软件工程');
  const second=fact('education.major','信阳职业技术学院','专业','软件技术','专业：软件技术');
  const result=auditEvidence([source('a',[first]),source('b',[second])],resume);
  assert.equal(result.attention,2);
  assert.ok(result.facts.every(entry=>entry.issues.some(issue=>issue.includes('不同结果'))));
  assert.equal(result.facts[0].issues.length,1); // same as resume, only source disagreement
});

test('same document with conflicting extracted values cannot corroborate itself',()=>{
  const values=[
    fact('education.degree','同一学院','学历','专科'),
    fact('education.degree','同一学院','学历','本科'),
  ];
  const result=auditEvidence([source('a',values)],emptyResume);
  assert.equal(result.attention,2);
  assert.equal(result.consistent,0);
});

test('a candidate differing from an unambiguous current resume field is a review exception',()=>{
  const result=auditEvidence([
    source('a',[fact('education.major','信阳职业技术学院','专业','软件技术','专业：软件技术')])
  ],resume);
  assert.equal(result.attention,1);
  assert.ok(result.facts[0].issues.some(issue=>issue.includes('当前简历')));
});

test('GPA never merges with weighted average, and grades for different courses never clash',()=>{
  const result=auditEvidence([
    source('a',[fact('education.gpa','同一学院','GPA 满分 5','3.87/5.00','GPA：3.87/5.00'),
      fact('education.courseGrade','同一学院','嵌入式微控制器应用开发','99','嵌入式微控制器应用开发 99')]),
    source('b',[fact('education.weightedAverage','同一学院','加权平均','88.75','加权平均：88.75'),
      fact('education.courseGrade','同一学院','数字信号处理','96','数字信号处理 96')]),
  ],emptyResume);
  assert.equal(result.attention,0);
  assert.equal(result.consistent,0);
  assert.equal(result.indexed,4);
});

test('award event year and certificate issue date are not interchangeable',()=>{
  const result=auditEvidence([
    source('a',[fact('award.date','软件测试赛项','赛事年度','2023','2023年软件测试赛项')]),
    source('b',[fact('award.date','软件测试赛项','证书签发日期','2024.09','2024年9月签发')]),
  ],emptyResume);
  assert.equal(result.attention,0);
  assert.equal(result.consistent,0);
  assert.equal(result.indexed,2);
});

test('date quotation accepts equivalent 2024.09 versus 2024年9月',()=>{
  const result=auditEvidence([
    source('a',[fact('certificate.date','软件测试证书','证书颁发日期','2024.09','证书颁发于2024年9月')])
  ],emptyResume);
  assert.equal(result.attention,0);
  assert.equal(result.indexed,1);
});

test('missing source, unsupported quotation, and OCR notes are prominent but do not invalidate unrelated clean facts',()=>{
  const result=auditEvidence([
    source('a',[
      fact('education.major','','专业','电子信息工程','专业：电子信息工程'),
      fact('education.degree','信阳职业技术学院','学历','专科','本科'),
      fact('education.school','同一学院','学校','同一学院','学校：同一学院'),
    ],{notes:['盖章不清晰，建议查看原件']})
  ],emptyResume);
  assert.equal(result.attention,2);
  assert.equal(result.indexed,1);
  assert.equal(result.noteCount,1);
  assert.equal(result.total,3);
});

test('empty recognition remains distinguishable from complete, confirmed recognition',()=>{
  const result=auditEvidence([source('a',[],{notes:['未能识别全部内容']})],emptyResume);
  assert.equal(result.total,0);
  assert.equal(result.noteCount,1);
  assert.equal(result.attention,0);
});

test('root identity facts do not require artificial parent scope',()=>{
  const result=auditEvidence([source('a',[
    fact('education.school','','学校','郑州升达经贸管理学院','学校：郑州升达经贸管理学院'),
    fact('certificate.name','','证书名称','高级软件测试员','证书名称：高级软件测试员'),
  ])],emptyResume);
  assert.equal(result.attention,0);
  assert.equal(result.indexed,2);
});

test('team award level is not merged with individual award level',()=>{
  const result=auditEvidence([
    source('a',[fact('award.level','河南省软件测试大赛','等级','团体三等奖','获得团体三等奖')]),
    source('b',[fact('award.level','河南省软件测试大赛','等级','个人三等奖','获得个人三等奖')]),
  ],emptyResume);
  assert.equal(result.attention,0);
  assert.equal(result.consistent,0);
  assert.equal(result.indexed,2);
});
