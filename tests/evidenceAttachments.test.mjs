import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evidenceMimeFromFile,validateEvidenceReview,compareEvidenceFact,
  MAX_EVIDENCE_FILE_BYTES,
} from '../src/utils/evidenceAttachments.ts';
import {validateEvidenceUploadPayload,parseEvidenceAIResponse} from '../src/server/evidenceExtraction.ts';

const sampleResume={
  education:[{id:'ed1',school:'信阳职业技术学院',major:'软件工程',degree:'专科',gpa:'',courses:''}],
  awards:[{id:'award1',title:'河南省软件测试职业技能大赛',level:'三等奖',date:'2023.07'}],
  experience:[],
};

test('private evidence accepts only bounded image/PDF files',()=>{
  assert.equal(evidenceMimeFromFile({name:'成绩单.PNG',size:500,type:'image/png'}),'image/png');
  assert.equal(evidenceMimeFromFile({name:'scan.pdf',size:180,type:''}),'application/pdf');
  assert.throws(()=>evidenceMimeFromFile({name:'scan.docx',size:180,type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}),/仅支持/);
  assert.throws(()=>evidenceMimeFromFile({name:'scan.pdf',size:MAX_EVIDENCE_FILE_BYTES+1,type:'application/pdf'}),/8MB/);
  assert.throws(()=>evidenceMimeFromFile({name:'scan.pdf',size:10,type:'image/png'}),/不一致/);
});

test('server verifies PDF magic and canonical base64 before any model access',()=>{
  const bytes=Buffer.from('%PDF-1.7\nsource');
  const data={fileName:'成绩.pdf',mimeType:'application/pdf',base64Data:bytes.toString('base64')};
  assert.equal(validateEvidenceUploadPayload(data).mimeType,'application/pdf');
  assert.throws(()=>validateEvidenceUploadPayload({...data,fileName:'成绩.png',mimeType:'image/png'}),/格式/);
  assert.throws(()=>validateEvidenceUploadPayload({...data,base64Data:'!!!!!!!!'}),/无效|大小/);
  assert.throws(()=>validateEvidenceUploadPayload({...data,fileName:'../file.pdf'}),/无效/);
  assert.throws(()=>validateEvidenceUploadPayload({...data,base64Data:Buffer.from('not a PDF').toString('base64')}),/不匹配/);
  assert.throws(()=>validateEvidenceUploadPayload({...data,base64Data:'A'.repeat(12_000_000)}),/大小/);
});

test('source recognition must include exact candidate quotes and allowlisted targets',()=>{
  const good={documentType:'transcript',facts:[{
    target:'education.major',scope:'信阳职业技术学院',label:'专业',
    value:'软件技术（Web开发与设计）',quote:'专业：软件技术（Web开发与设计）',
  }],notes:['请核实毕业证专业名称']};
  assert.deepEqual(validateEvidenceReview(good),good);
  assert.deepEqual(parseEvidenceAIResponse(JSON.stringify(good)),good);
  assert.throws(()=>validateEvidenceReview({...good,facts:[{...good.facts[0],target:'resume.delete'}]}),/未知字段/);
  assert.throws(()=>validateEvidenceReview({...good,facts:[{...good.facts[0],quote:''}]}),/无来源/);
  assert.throws(()=>validateEvidenceReview({...good,documentType:'medical'}),/缺失/);
});

test('education conflict is compared locally with correct institution only',()=>{
  const fact={target:'education.major',scope:'信阳职业技术学院',label:'专业',
    value:'软件技术（Web开发与设计）',quote:'软件技术（Web开发与设计）'};
  const result=compareEvidenceFact(sampleResume,fact);
  assert.equal(result.status,'conflict');
  assert.equal(result.current,'软件工程');
  assert.equal(compareEvidenceFact(sampleResume,{...fact,scope:'另一所学校'}).status,'needs-review');
  assert.equal(compareEvidenceFact(sampleResume,{...fact,target:'education.gpa',value:'3.9'}).status,'not-in-resume');
  assert.equal(compareEvidenceFact(sampleResume,{...fact,target:'education.weightedAverage',value:'88.75'}).status,'not-in-resume');
});

test('different award titles do not falsely mark records as conflicting',()=>{
  const award={target:'award.date',scope:'2023年河南省高等职业教育技能大赛软件测试赛项',
    label:'证书日期',value:'2024.09',quote:'2024年9月'};
  assert.equal(compareEvidenceFact(sampleResume,award).status,'needs-review');
  assert.equal(compareEvidenceFact(sampleResume,{...award,scope:'河南省软件测试职业技能大赛'}).status,'conflict');
});

test('byte-level SHA-256 identifies renamed identical documents and differs for changed bytes', async ()=>{
  const {evidenceSHA256,findEvidenceByContentHash,MASTER_EVIDENCE_SLOT_ID}=await import('../src/utils/evidenceStore.ts');
  const oldBlob=new Blob(['source A'],{type:'application/pdf'});
  const hash=await evidenceSHA256(oldBlob);
  assert.match(hash,/^[0-9a-f]{64}$/);
  assert.equal(await evidenceSHA256(new Blob(['source A'])),hash);
  assert.notEqual(await evidenceSHA256(new Blob(['source B'])),hash);
  const legacy={id:'old-1',slotId:'legacy-slot',name:'old.pdf',blob:oldBlob};
  assert.equal((await findEvidenceByContentHash(hash,[legacy]))?.id,'old-1');
  const cached={...legacy,id:'new-master',slotId:MASTER_EVIDENCE_SLOT_ID,contentHash:hash,
    review:{documentType:'transcript',facts:[],notes:[]}};
  assert.equal((await findEvidenceByContentHash(hash,[cached]))?.id,'new-master');
  await assert.rejects(findEvidenceByContentHash('invalid',[]),/指纹/);
});
