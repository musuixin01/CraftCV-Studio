import type { ResumeDocument, ResumeFactClaimType, ResumeFactRecord } from '../types/resume';
import type { EvidenceFact } from './evidenceAttachments';
import type { PrivateEvidenceAttachment } from './evidenceStore';

/** Exact association only; same institution/competition titles in different versions remain independent. */
function key(text: string): string {
  return text.trim().replace(/[\s（）()，,。·:：]/g, '').toLocaleLowerCase();
}
const EDUCATION_FIELDS = new Set(['degree','major','startDate','endDate','gpa','ranking','weightedAverage']);
const AWARD_FIELDS = new Set(['issuer','date','level']);
const VAGUE_COURSE = /^(?:课程|课程成绩|科目|科目成绩|成绩|单科成绩|分数)$/;
const VALID_SCORE = /^(?:100(?:\.0{1,2})?|(?:\d|[1-9]\d)(?:\.\d{1,2})?)$/;

export interface MasterAdoptionTarget {
  collection: 'education'|'awards';
  entryId: string;
  field: string;
  path: string;
  currentValue: string;
  label: string;
  operation?: 'upsert-course-grade'|'create-award';
  course?: string;
  credentialType?: 'certificate'|'award';
}
export function resolveMasterAdoptionTarget(
  doc: ResumeDocument, fact: EvidenceFact, sourceId = '', factIndex = 0,
): MasterAdoptionTarget | null {
  const [domain, originalField] = fact.target.split('.');
  const scope=key(fact.scope);
  const field=domain==='certificate'?
    (originalField==='name'?'title':originalField==='date'?'date':originalField==='level'?'level':'')
    :originalField;

  if(domain==='education' && (EDUCATION_FIELDS.has(field)||field==='courseGrade')) {
    if(!scope||!fact.value.trim())return null;
    if(field==='gpa' && !/(?:\bGPA\b|绩点)/i.test(fact.label+' '+fact.quote))return null;
    const matches=doc.education.filter((entry)=>key(entry.school)===scope);
    if(matches.length!==1)return null;
    const match=matches[0];
    if(field==='courseGrade') {
      const course=fact.label.trim();
      if(!course||VAGUE_COURSE.test(course)||!VALID_SCORE.test(fact.value.trim()))return null;
      const matches=(match.courseGrades??[]).filter((grade)=>key(grade.course)===key(course));
      if(matches.length>1 || (!matches.length && !/^[-\w]{1,100}$/.test(sourceId)))return null;
      const entryId=matches[0]?.id ?? 'cg-'+sourceId+'-'+factIndex;
      return {
        collection:'education',entryId:match.id,field:'courseGrades',
        path:'education/'+encodeURIComponent(match.id)+'/courseGrades/'+encodeURIComponent(entryId)+'/score',
        currentValue:matches[0]?.score??'',label:match.school+' · '+course,
        course,operation:'upsert-course-grade',
      };
    }
    return {
      collection:'education',entryId:match.id,field,
      path:'education/'+encodeURIComponent(match.id)+'/'+field,
      currentValue:String(match[field as keyof typeof match]??''),
      label:match.school+' · '+fact.label,
    };
  }

  if((domain==='award'||domain==='certificate') && (field==='title'||AWARD_FIELDS.has(field))) {
    if(!fact.value.trim())return null;
    const isTitle=field==='title';
    const credentialType=domain==='certificate'?'certificate':'award';
    const identity=isTitle?key(fact.value):scope;
    if(!identity)return null;
    const matches=doc.awards.filter((entry)=>key(entry.title)===identity);
    if(matches.length>1)return null;
    // Existing entries with conflicting explicit categories must never be silently changed.
    if(matches.length===1 && matches[0].credentialType &&
      matches[0].credentialType!==credentialType)return null;
    if(!isTitle && matches.length!==1)return null;
    if(isTitle && !matches.length) {
      if(!/^[-\w]{1,100}$/.test(sourceId))return null;
      const entryId='aw-evidence-'+sourceId+'-'+factIndex;
      return {
        collection:'awards',entryId,field:'title',
        path:'awards/'+encodeURIComponent(entryId)+'/title',
        currentValue:'',label:(credentialType==='certificate'?'证书':'荣誉奖项')+' · '+fact.value,
        operation:'create-award',credentialType,
      };
    }
    const match=matches[0];
    return {
      collection:'awards',entryId:match.id,field,
      path:'awards/'+encodeURIComponent(match.id)+'/'+field,
      currentValue:String(match[field as keyof typeof match]??''),
      label:match.title+' · '+fact.label,credentialType,
    };
  }
  return null;
}

export function isMasterFactAdopted(doc: ResumeDocument, sourceId: string, fact: EvidenceFact, index = 0): boolean {
  const target=resolveMasterAdoptionTarget(doc,fact,sourceId,index);
  return Boolean(target && doc.factLedger?.records.some((record)=>
    record.path===target.path &&
    record.normalizedValue===target.currentValue &&
    record.normalizedValue===fact.value.trim() &&
    record.candidateConfirmed &&
    record.status==='user-asserted' &&
    record.sources.some((source)=>source.sourceId==='evidence:'+sourceId)));
}

/** The candidate must be explicitly compared with its source and accepted for this resume version. */
export function applyMasterEvidenceFact(
  doc: ResumeDocument,
  source: Pick<PrivateEvidenceAttachment,'id'|'name'|'review'>,
  factIndex: number,
  capturedAt = new Date().toISOString(),
): ResumeDocument {
  if(!source.review || !Number.isSafeInteger(factIndex) || factIndex<0 ||
    factIndex>=source.review.facts.length)throw new Error('证据候选已失效，未更改当前简历。');
  if(!/^[-\w]{1,100}$/.test(source.id) || !source.name || source.name.length>160)
    throw new Error('来源附件标识无效，未更改简历。');
  const fact=source.review.facts[factIndex];
  const target=resolveMasterAdoptionTarget(doc,fact,source.id,factIndex);
  if(!target)throw new Error('无法唯一定位学校、课程或奖项，或分数格式不明确。请人工核对原件。');
  if(!key(fact.quote).includes(key(fact.value)))
    throw new Error('候选值未在识别摘录中出现，请对照原件手动处理。');
  if(target.field==='gpa' && /(?:加权|均分)/.test(target.currentValue) &&
    !/(?:加权|均分)/.test(fact.value))
    throw new Error('原成绩字段含多个成绩口径，不能用单个 GPA 覆盖加权均分；请手动拆分后采用。');
  if(isMasterFactAdopted(doc,source.id,fact,factIndex))return doc;
  if(doc.factLedger?.records.length && doc.factLedger.records.length>=2000 &&
    !doc.factLedger.records.some((record)=>record.path===target.path))
    throw new Error('事实账本已达到安全记录上限。');
  const sourceId='evidence:'+source.id;
  const provenance={
    sourceId,kind:'ai-file-extraction' as const,
    label:('本地母版附件 · '+fact.label).slice(0,100),
    capturedAt,
  };
  const existing=doc.factLedger?.records.find((record)=>record.path===target.path);
  const value=fact.value.trim();
  const sources=existing?.normalizedValue===value?
    [...existing.sources.filter((record)=>record.sourceId!==sourceId),provenance].slice(-12)
    :[provenance];
  const claimType:ResumeFactClaimType=
    ['gpa','ranking','weightedAverage','courseGrades'].includes(target.field)?'metric':
    ['startDate','endDate','date'].includes(target.field)?'date':
    target.collection==='awards'?'award':'education';
  const updated:ResumeFactRecord={
    factId:existing?.factId??doc.id+':'+target.path,
    path:target.path,claimType,originalValue:value,normalizedValue:value,sources,
    status:'user-asserted',candidateConfirmed:true,editedAt:capturedAt,
    versionId:doc.id,sensitivity:'normal',cloudAllowed:false,
  };
  const records=[...(doc.factLedger?.records.filter((record)=>record.path!==target.path)??[]),updated];
  let next:ResumeDocument;
  if(target.operation==='create-award') {
    next={...doc,awards:[...doc.awards,{
      id:target.entryId,title:value,issuer:'',date:'',level:'',description:'',
      credentialType:target.credentialType,
    }]};
  } else if(target.operation==='upsert-course-grade') {
    const gradeId=decodeURIComponent(target.path.split('/')[3]);
    next={...doc,education:doc.education.map((entry)=>{
      if(entry.id!==target.entryId)return entry;
      const grades=entry.courseGrades??[];
      const index=grades.findIndex((grade)=>grade.id===gradeId);
      const grade={id:gradeId,course:target.course!,score:value};
      return {...entry,courseGrades:index<0?[...grades,grade]:
        grades.map((item,i)=>i===index?{...item,score:value}:item)};
    })};
  } else {
    next=target.collection==='education'
      ?{...doc,education:doc.education.map((entry)=>entry.id===target.entryId?
        {...entry,[target.field]:value}:entry)}
      :{...doc,awards:doc.awards.map((entry)=>entry.id===target.entryId?
        {...entry,[target.field]:value,...(target.credentialType==='certificate'?{credentialType:'certificate' as const}:{})}:entry)};
  }
  return {...next,factLedger:{version:1,records},updatedAt:capturedAt};
}
