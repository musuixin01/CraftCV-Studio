import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyMasterEvidenceFact,isMasterFactAdopted,resolveMasterAdoptionTarget,
} from '../src/utils/masterFactAdoption.ts';
import {reconcileImportFactLedger} from '../src/utils/resumeImportReview.ts';
import {retrieveMasterFacts} from '../src/utils/masterFactRetrieval.ts';

const doc=()=>({
  id:'resume-1',
  basics:{title:'嵌入式软件工程师'},
  education:[
    {id:'ed-a',school:'郑州升达经贸管理学院',major:'电子信息工程',degree:'本科',
     startDate:'2025.07',endDate:'2027.06',gpa:'3.87/5.00',ranking:'',     courses:'数字信号处理',honors:''},
    {id:'ed-b',school:'另一学校',major:'计算机科学与技术',degree:'专科',
     startDate:'2022.09',endDate:'2025.06',gpa:'',ranking:'',courses:'',honors:''},
  ],
  awards:[
    {id:'aw-1',title:'河南省软件测试职业技能大赛',issuer:'河南省教育厅',
      date:'2024.09',level:'团体三等奖',description:''}
  ],
  projects:[],experience:[],skills:[],customSections:[],sections:[],style:{},
});
const fact=(target,scope,label,value,quote=value)=>({target,scope,label,value,quote});
const src=(facts,overrides={})=>({
  id:'source-a',name:'成绩单-匿名.png',
  review:{documentType:'transcript',facts,notes:[]},...overrides,
});
const grade=fact('education.gpa','郑州升达经贸管理学院','GPA 满分 5','3.90/5.00','GPA：3.90/5.00');

test('unique official school is resolved by exact identity, never substring of a different school',()=>{
  const candidate=resolveMasterAdoptionTarget(doc(),grade);
  assert.equal(candidate?.entryId,'ed-a');
  assert.equal(candidate?.path,'education/ed-a/gpa');
  assert.equal(candidate?.currentValue,'3.87/5.00');  assert.equal(resolveMasterAdoptionTarget(doc(),{...grade,scope:'郑州升达'}),null);
  assert.equal(resolveMasterAdoptionTarget(doc(),{...grade,scope:''}),null);
  const duplicate=doc();
  duplicate.education.push({...duplicate.education[0],id:'ed-c'});
  assert.equal(resolveMasterAdoptionTarget(duplicate,grade),null);
});

test('user adopts a supported fact only into the current resume and creates a source-backed, non-certified ledger record',()=>{
  const original=doc();
  const before=JSON.stringify(original);
  const source=src([grade]);
  const updated=applyMasterEvidenceFact(original,source,0,'2026-11-08T10:00:00.000Z');
  assert.equal(updated.education[0].gpa,'3.90/5.00');
  assert.equal(updated.education[1].major,'计算机科学与技术');
  assert.equal(updated.education[0].courses,'数字信号处理');
  assert.equal(JSON.stringify(original),before,'old resume must be unchanged for undo');
  assert.equal(updated.factLedger?.version,1);
  const entry=updated.factLedger.records[0];
  assert.equal(entry.path,'education/ed-a/gpa');
  assert.equal(entry.normalizedValue,'3.90/5.00');
  assert.equal(entry.status,'user-asserted');
  assert.equal(entry.candidateConfirmed,true);
  assert.equal(entry.cloudAllowed,false);
  assert.equal(entry.sources[0].sourceId,'evidence:source-a');

  assert.match(entry.sources[0].label,/本地母版附件/);
  assert.ok(!JSON.stringify(updated).includes('成绩单-匿名.png'));
  assert.ok(!JSON.stringify(updated).includes('GPA：3.90/5.00'));
  assert.equal(isMasterFactAdopted(updated,'source-a',grade),true);
  assert.strictEqual(applyMasterEvidenceFact(updated,source,0),updated,'idempotent repeated adoption');
});

test('fuzzy GPA label, weighted average and course grades are never written into the gpa field',()=>{
  assert.equal(resolveMasterAdoptionTarget(doc(),fact('education.gpa','郑州升达经贸管理学院',
    '成绩','88.75','成绩：88.75')),null);
  assert.equal(resolveMasterAdoptionTarget(doc(),fact('education.weightedAverage','郑州升达经贸管理学院',
    '加权平均分','88.75','加权平均：88.75'))?.field,'weightedAverage');  assert.equal(resolveMasterAdoptionTarget(doc(),fact('education.courseGrade','郑州升达经贸管理学院',
    '数字信号处理','96','数字信号处理：96')),null);
  assert.equal(resolveMasterAdoptionTarget(doc(),fact('certificate.name','大学英语考试',
    '证书名称','英语六级','英语六级')),null);
  assert.equal(resolveMasterAdoptionTarget(doc(),fact('education.school','郑州升达经贸管理学院',
    '学校','另一所学校','另一所学校')),null);
});

test('adoption must preserve a composite GPA and weighted-average field',()=>{
  const original=doc();
  original.education[0].gpa='3.87/5.00（均分 88.75）';
  assert.throws(()=>applyMasterEvidenceFact(original,src([grade]),0),/多个成绩口径/);
  assert.equal(original.education[0].gpa,'3.87/5.00（均分 88.75）');
  assert.equal(original.factLedger,undefined);
});

test('award adoption updates only an existing award with exact title and does not invent awards',()=>{
  const newLevel=fact('award.level','河南省软件测试职业技能大赛','奖项等级','团体二等奖','团体二等奖');
  const updated=applyMasterEvidenceFact(doc(),src([newLevel]),0);
  assert.equal(updated.awards[0].level,'团体二等奖');
  assert.equal(updated.factLedger?.records[0].path,'awards/aw-1/level');
  assert.equal(resolveMasterAdoptionTarget(doc(),{...newLevel,scope:'另一个赛项'}),null);
  assert.equal(updated.awards.length,1);
});

test('unread files, invalid index and quote mismatch never modify resumes',()=>{
  const original=doc();
  assert.throws(()=>applyMasterEvidenceFact(original,{id:'source-a',name:'x.png'},0),/失效/);
  assert.throws(()=>applyMasterEvidenceFact(original,src([grade]),7),/失效/);
  assert.throws(()=>applyMasterEvidenceFact(original,src([{...grade,quote:'未列出该值'}]),0),/未在识别摘录/);
  assert.equal(original.factLedger,undefined);
});

test('an imported ledger source is preserved for same value but not for a changed value',()=>{
  const original=doc();
  const oldRecord={
    factId:'old',path:'education/ed-a/major',claimType:'education',
    originalValue:'电子信息工程',normalizedValue:'电子信息工程',
    sources:[{sourceId:'import:id',kind:'ai-file-extraction',label:'旧来源',capturedAt:'2026-11-01'}],
    status:'inferred-suggestion',candidateConfirmed:false,editedAt:'2026-11-01',
    versionId:original.id,sensitivity:'normal',cloudAllowed:false,
  };
  original.factLedger={version:1,records:[oldRecord]};
  const same=fact('education.major','郑州升达经贸管理学院','专业','电子信息工程','专业：电子信息工程');
  const sameApplied=applyMasterEvidenceFact(original,src([same]),0);
  assert.equal(sameApplied.factLedger.records.length,1);
  assert.deepEqual(sameApplied.factLedger.records[0].sources.map(x=>x.sourceId),
    ['import:id','evidence:source-a']);
  const modified=applyMasterEvidenceFact(original,src([{...same,value:'软件工程',quote:'专业：软件工程'}]),0);
  assert.deepEqual(modified.factLedger.records[0].sources.map(x=>x.sourceId),
    ['evidence:source-a']);
});

test('later manual edits invalidate adopted candidate without deleting provenance or changing old snapshot',()=>{
  const accepted=applyMasterEvidenceFact(doc(),src([grade]),0);
  const typed={...accepted,education:accepted.education.map((item)=>
    item.id==='ed-a'?{...item,gpa:'3.95/5.00'}:item)};
  const reconciled=reconcileImportFactLedger(accepted,typed);
  assert.equal(accepted.factLedger.records[0].candidateConfirmed,true);
  assert.equal(reconciled.factLedger.records[0].candidateConfirmed,false);
  assert.equal(reconciled.factLedger.records[0].status,'user-asserted');
  assert.equal(reconciled.factLedger.records[0].cloudAllowed,false);
  assert.equal(reconciled.education[0].gpa,'3.95/5.00');
  assert.equal(isMasterFactAdopted(reconciled,'source-a',grade),false);
});

test('already-adopted values in the live resume are not resent as separate AI evidence quotations',()=>{
  const approved=fact('education.major','郑州升达经贸管理学院','专业','电子信息工程','专业：电子信息工程');
  const document=applyMasterEvidenceFact(doc(),src([approved]),0);
  const sources=[{id:'source-a',contentHash:'a'.repeat(64),
    review:{documentType:'transcript',facts:[approved],notes:[]}}];
  assert.deepEqual(retrieveMasterFacts(sources,document,'电子信息工程 嵌入式','education'),[]);
});

test('weighted average is an independent education field; GPA is unchanged',()=>{
  const original=doc();
  const avg=fact('education.weightedAverage','郑州升达经贸管理学院','加权平均','88.75','加权平均 88.75');
  const applied=applyMasterEvidenceFact(original,src([avg]),0);
  assert.equal(applied.education[0].weightedAverage,'88.75');
  assert.equal(applied.education[0].gpa,'3.87/5.00');
  assert.equal(applied.factLedger.records[0].path,'education/ed-a/weightedAverage');
  assert.equal(isMasterFactAdopted(applied,'source-a',avg),true);
  const reconciled=reconcileImportFactLedger(applied,{
    ...applied,education:applied.education.map(e=>e.id==='ed-a'?{...e,weightedAverage:'89.00'}:e)
  });
  assert.equal(reconciled.factLedger.records[0].candidateConfirmed,false);
});

test('same course score is added to structured grades and reused across role versions only on explicit adoption',()=>{
  const original=doc();
  const original2={...doc(),id:'resume-other-role',basics:{title:'测试工程师'}};
  const course=fact('education.courseGrade','郑州升达经贸管理学院','嵌入式微控制器应用开发','99','嵌入式微控制器应用开发 99');
  const source=src([course]);
  const first=applyMasterEvidenceFact(original,source,0);
  assert.equal(first.education[0].courseGrades.length,1);
  assert.equal(first.education[0].courseGrades[0].course,'嵌入式微控制器应用开发');
  assert.equal(first.education[0].courseGrades[0].score,'99');
  assert.equal(first.education[0].gpa,'3.87/5.00');
  assert.equal(original2.education[0].courseGrades,undefined);
  assert.equal(isMasterFactAdopted(first,source.id,course),true);
  const second=applyMasterEvidenceFact(original2,source,0);
  assert.equal(second.education[0].courseGrades[0].score,'99');
  assert.equal(second.id,'resume-other-role');
  assert.equal(second.factLedger.records[0].versionId,'resume-other-role');
  assert.notEqual(second.factLedger.records[0].factId, first.factLedger.records[0].factId);
  assert.strictEqual(applyMasterEvidenceFact(first,source,0),first);
  const manuallyChanged={...first,education:first.education.map(e=>e.id==='ed-a'?{
    ...e,courseGrades:e.courseGrades.map(g=>({...g,score:'98'}))
  }:e)};
  const reconciled=reconcileImportFactLedger(first,manuallyChanged);
  assert.equal(reconciled.factLedger.records[0].candidateConfirmed,false);
});

test('different subjects are separate records and duplicate subject names cannot be guessed',()=>{
  const a=fact('education.courseGrade','郑州升达经贸管理学院','数字信号处理','96','数字信号处理：96');
  const b=fact('education.courseGrade','郑州升达经贸管理学院','嵌入式微控制器应用开发','99','嵌入式微控制器应用开发：99');
  const withOne=applyMasterEvidenceFact(doc(),src([a,b]),0);
  const withBoth=applyMasterEvidenceFact(withOne,src([a,b]),1);
  assert.deepEqual(withBoth.education[0].courseGrades.map(g=>g.score),['96','99']);
  assert.equal(withBoth.factLedger.records.length,2);
  const duplicate=structuredClone(withBoth);
  duplicate.education[0].courseGrades.push({id:'manual',course:'数字信号处理',score:'95'});
  assert.equal(resolveMasterAdoptionTarget(duplicate,a,'source-a',0),null);
});

test('invalid/ambiguous course grade refuses to append to any education row',()=>{
  const base=doc();
  for(const row of [
    fact('education.courseGrade','郑州升达经贸管理学院','课程成绩','99','课程成绩 99'),
    fact('education.courseGrade','郑州升达经贸管理学院','数字信号处理','102','数字信号处理 102'),
    fact('education.courseGrade','郑州升达经贸管理学院','数字信号处理','满分','数字信号处理 满分'),
    fact('education.courseGrade','另一所未知学校','数字信号处理','96','数字信号处理 96'),
  ])assert.throws(()=>applyMasterEvidenceFact(base,src([row]),0),/无法唯一定位/);
  assert.equal(base.education[0].courseGrades,undefined);
});

test('certificate is created inside existing certificate-award section, typed and source-backed',()=>{
  const certificate=fact('certificate.name','颁证单位','证书名称','嵌入式系统工程师技能证书','嵌入式系统工程师技能证书');
  const docBefore=doc();
  const used=applyMasterEvidenceFact(docBefore,src([certificate]),0);
  assert.equal(used.awards.length,2);
  const item=used.awards[1];
  assert.equal(item.credentialType,'certificate');
  assert.equal(item.title,'嵌入式系统工程师技能证书');
  assert.equal(item.date,'');
  assert.equal(used.factLedger.records[0].path,'awards/'+item.id+'/title');
  assert.equal(isMasterFactAdopted(used,'source-a',certificate),true);
  assert.equal(docBefore.awards.length,1);
  const afterRepeat=applyMasterEvidenceFact(used,src([certificate]),0);
  assert.strictEqual(afterRepeat,used);
});

test('certificate level and issue date match exact existing title, and do not invent records alone',()=>{
  const certificate=fact('certificate.name','','证书名称','嵌入式技术等级证书','嵌入式技术等级证书');
  const level=fact('certificate.level','嵌入式技术等级证书','证书等级','高级','证书等级：高级');
  const issued=fact('certificate.date','嵌入式技术等级证书','证书签发日期','2024.09','证书签发日期：2024.09');
  const rows=src([certificate,level,issued]);
  assert.throws(()=>applyMasterEvidenceFact(doc(),rows,1),/无法唯一定位/);
  const named=applyMasterEvidenceFact(doc(),rows,0);
  const namedAndLeveled=applyMasterEvidenceFact(named,rows,1);
  const finished=applyMasterEvidenceFact(namedAndLeveled,rows,2);
  assert.equal(finished.awards[1].credentialType,'certificate');
  assert.equal(finished.awards[1].level,'高级');
  assert.equal(finished.awards[1].date,'2024.09');
  assert.equal(finished.factLedger.records.length,3);
});

test('new award title can create a new award but must not duplicate same title',()=>{
  const title=fact('award.title','河南省教育厅','奖项名称','某某创新设计竞赛三等奖','获某某创新设计竞赛三等奖');
  const result=applyMasterEvidenceFact(doc(),src([title]),0);
  assert.equal(result.awards.length,2);
  assert.equal(result.awards[1].credentialType,'award');
  assert.strictEqual(applyMasterEvidenceFact(result,src([title]),0),result);
  const duplicated=structuredClone(result);
  duplicated.awards.push({...result.awards[1],id:'other'});
  assert.equal(resolveMasterAdoptionTarget(duplicated,title,'source-a',0),null);
});

test('legacy award structures without credentialType remain editable',()=>{
  const existing=doc();
  assert.equal(existing.awards[0].credentialType,undefined);
  const medal=fact('award.level','河南省软件测试职业技能大赛','奖项级别','团体二等奖','团体二等奖');
  const updated=applyMasterEvidenceFact(existing,src([medal]),0);
  assert.equal(updated.awards[0].level,'团体二等奖');
  assert.equal(updated.awards[0].credentialType,undefined);
  assert.equal(updated.awards.length,1);
});

test('renaming a course invalidates the existing evidence adoption even if score stays unchanged',()=>{
  const course=fact('education.courseGrade','郑州升达经贸管理学院','数字信号处理','96','数字信号处理 96');
  const accepted=applyMasterEvidenceFact(doc(),src([course]),0);
  const typed={...accepted,education:accepted.education.map(e=>e.id==='ed-a'?{
    ...e,courseGrades:e.courseGrades.map(g=>({...g,course:'计算机网络'}))
  }:e)};
  const reconciled=reconcileImportFactLedger(accepted,typed);
  assert.equal(reconciled.factLedger.records[0].candidateConfirmed,false);
});

test('distinct certificate titles from the same issuer do not cause false conflict',async()=>{
  const {auditEvidence}=await import('../src/utils/evidenceAudit.ts');
  const a=fact('certificate.name','软件技能鉴定中心','证书名称','软件测试员','软件测试员');
  const b=fact('certificate.name','软件技能鉴定中心','证书名称','嵌入式工程师','嵌入式工程师');
  const result=auditEvidence([
    {id:'a',contentHash:'a'.repeat(64),review:{documentType:'certificate',facts:[a],notes:[]}},
    {id:'b',contentHash:'b'.repeat(64),review:{documentType:'certificate',facts:[b],notes:[]}}
  ],doc());
  assert.equal(result.attention,0);
  assert.equal(result.indexed,2);
});

test('grade adopted at nonzero fact index is not redundantly retrieved by AI',()=>{
  const unrelated=fact('education.gpa','郑州升达经贸管理学院','GPA','3.87/5.00','GPA 3.87/5.00');
  const course=fact('education.courseGrade','郑州升达经贸管理学院','数字信号处理','96','数字信号处理 96');
  const source=src([unrelated,course]);
  const accepted=applyMasterEvidenceFact(doc(),source,1);
  assert.equal(isMasterFactAdopted(accepted,source.id,course,1),true);
  const retrieved=retrieveMasterFacts([{id:source.id,contentHash:'a'.repeat(64),review:source.review}],
    accepted,'数字信号处理','education');
  assert.equal(retrieved.some((item)=>item.value==='96'),false);
});
