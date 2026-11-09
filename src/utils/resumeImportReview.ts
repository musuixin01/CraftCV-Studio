import type {
  ResumeDocument, ResumeFactClaimType, ResumeFactLedger,
} from '../types/resume';

/** Non-empty source values presented before any AI extraction is written to a resume. */
export interface ImportReviewFact {
  path: string;
  label: string;
  value: string;
  claimType: ResumeFactClaimType;
  sensitivity: 'normal' | 'personal';
}
export interface ImportReviewSection { title: string; facts: ImportReviewFact[] }
export interface ImportConflict {
  label: string;
  original: string;
  incoming: string;
}

type Field = [string, string, ResumeFactClaimType, ('normal' | 'personal')?];
const basicFields: Field[] = [
  ['name','姓名','identity','personal'], ['title','求职意向','role'],
  ['directionTags','方向标签','role'], ['phone','电话','identity','personal'],
  ['email','邮箱','identity','personal'], ['location','地区','identity','personal'],
  ['github','GitHub','identity'], ['website','个人网站','identity'],
  ['schoolTag','学校标签','education'], ['statusTag','在读状态','education'],
  ['politicalStatus','政治面貌','identity','personal'], ['graduationYear','毕业时间','date'],
  ['summary','个人简介','action'],
];
const sectionFields: Array<{key: 'education'|'projects'|'experience'|'skills'|'awards'; label: string; fields: Field[]}> = [
  {key:'education',label:'教育经历',fields:[
    ['school','学校','education'],['degree','学历','education'],['major','专业','education'],
    ['startDate','开始时间','date'],['endDate','结束时间','date'],['gpa','成绩与绩点','metric'],
    ['weightedAverage','加权平均分','metric'],['ranking','排名','metric'],
    ['courses','主修课程','education'],['honors','荣誉','award'],  ]},
  {key:'projects',label:'项目经历',fields:[
    ['name','项目名称','role'],['role','个人职责','role'],['startDate','开始时间','date'],
    ['endDate','结束时间','date'],['repoUrl','项目仓库','action'],
    ['techStack','技术栈','skill'],['summary','项目简介','action'],['bullets','项目要点','action'],
  ]},
  {key:'experience',label:'工作 / 实习',fields:[
    ['company','单位','role'],['position','岗位','role'],['department','部门','role'],
    ['location','地区','role'],['startDate','开始时间','date'],['endDate','结束时间','date'],
    ['techStack','技术栈','skill'],['bullets','工作要点','action'],
  ]},
  {key:'skills',label:'专业技能',fields:[
    ['category','类别','skill'],['items','技能内容','skill'],
  ]},
  {key:'awards',label:'荣誉奖项',fields:[
    ['title','奖项名称','award'],['issuer','颁发机构','award'],
    ['date','获奖时间','date'],['level','奖项级别','award'],
    ['description','说明','award'],
  ]},
];

function displayValue(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return value.map((item) => item.trim()).filter(Boolean).join('；');
  }
  return '';
}

/** Uses record IDs, not collection order, for the paths of imported entries. */
export function getImportReviewSections(doc: ResumeDocument): ImportReviewSection[] {
  const sections: ImportReviewSection[] = [];
  const basics: ImportReviewFact[] = [];
  for (const [key,label,claimType,sensitivity] of basicFields) {
    const value = displayValue((doc.basics as unknown as Record<string, unknown>)[key]);
    if (value) basics.push({path:'basics/'+key,label,value,claimType,sensitivity:sensitivity ?? 'normal'});
  }
  if (basics.length) sections.push({title:'基本信息',facts:basics});

  for (const section of sectionFields) {
    const facts: ImportReviewFact[] = [];
    const entries = doc[section.key] as unknown as Array<Record<string, unknown>>;
    entries.forEach((entry, index) => {
      const id = typeof entry.id === 'string' ? entry.id : String(index);
      for (const [key,label,claimType,sensitivity] of section.fields) {
        const value = displayValue(entry[key]);
        if (value) facts.push({
          path:section.key+'/'+encodeURIComponent(id)+'/'+key,
          label:(index+1)+' · '+label,value,claimType,sensitivity:sensitivity ?? 'normal',
        });
      }
      if (section.key==='education' && Array.isArray(entry.courseGrades)) {
        for (const raw of entry.courseGrades) {
          if (!raw || typeof raw!=='object' || Array.isArray(raw))continue;
          const grade=raw as Record<string,unknown>;
          if (typeof grade.id!=='string' || typeof grade.course!=='string' || typeof grade.score!=='string')continue;
          if (grade.score.trim()) facts.push({
            path:'education/'+encodeURIComponent(id)+'/courseGrades/'+encodeURIComponent(grade.id)+'/score',
            label:(index+1)+' · '+grade.course+'课程成绩',
            value:grade.score.trim(),claimType:'metric',sensitivity:'normal',
          });
        }
      }
    });
    if (facts.length) sections.push({title:section.label,facts});
  }
  return sections;
}

/** Explicit user review confirms a candidate, not the truth or independent verification of the facts. */
export function createImportFactLedger(
  doc: ResumeDocument,
  source: {kind:'ai-file-extraction'|'ai-pasted-text';label:string},
  candidateConfirmed: boolean,
  capturedAt = new Date().toISOString(),
): ResumeFactLedger {
  const sourceId = 'import:'+doc.id;
  const records = getImportReviewSections(doc).flatMap((section) =>
    section.facts.map((fact) => ({
      factId:doc.id+':'+fact.path,
      path:fact.path,
      claimType:fact.claimType,
      originalValue:fact.value,
      normalizedValue:fact.value,
      sources:[{sourceId,kind:source.kind,label:source.label,capturedAt}],
      status:'inferred-suggestion' as const,
      candidateConfirmed,
      editedAt:capturedAt,
      versionId:doc.id,
      sensitivity:fact.sensitivity,
      // Extraction permission is not reusable authorization for later model calls.
      cloudAllowed:false,
    })));
  return {version:1,records};
}

/** Show potential discrepancies before overwriting; do not silently select either value. */
export function detectImportConflicts(current: ResumeDocument, incoming: ResumeDocument): ImportConflict[] {
  const result: ImportConflict[] = [];
  const comparableBasics: Array<[keyof ResumeDocument['basics'],string]> = [
    ['name','姓名'],['phone','电话'],['email','邮箱'],['graduationYear','毕业时间'],
  ];
  for (const [key,label] of comparableBasics) {
    const original = displayValue(current.basics[key]);
    const next = displayValue(incoming.basics[key]);
    if (original && next && original !== next) result.push({label,original,incoming:next});
  }
  for (const nextEdu of incoming.education) {
    if (!nextEdu.school?.trim()) continue;
    const originalEdu = current.education.find((edu) =>
      edu.school.trim() === nextEdu.school.trim() &&
      (!edu.major || !nextEdu.major || edu.major.trim() === nextEdu.major.trim()));
    if (!originalEdu) continue;
    for (const [key,label] of [
      ['degree','学历'],['startDate','入学日期'],['endDate','毕业日期'],
      ['gpa','成绩或绩点'],['ranking','排名'],
    ] as const) {
      const original = displayValue(originalEdu[key]);
      const incomingValue = displayValue(nextEdu[key]);
      if (original && incomingValue && original !== incomingValue) {
        result.push({label:nextEdu.school+' · '+label,original,incoming:incomingValue});
      }
    }
  }
  return result;
}

/**
 * Keep an imported ledger aligned with later manual edits. No mutation of the
 * underlying evidence snapshot, and never upgrade a source to "verified".
 */
export function reconcileImportFactLedger(previous: ResumeDocument, next: ResumeDocument, now = new Date().toISOString()): ResumeDocument {
  if (previous.id !== next.id || !next.factLedger || previous.factLedger !== next.factLedger) return next;
  const facts = getImportReviewSections(next).flatMap((section) => section.facts);
  const byPath = new Map(facts.map((fact) => [fact.path, fact]));
  let changed = false;
  const existingPaths = new Set<string>();
  const records = next.factLedger.records.map((record) => {
    existingPaths.add(record.path);
    const fact = byPath.get(record.path);
    const newValue = fact?.value ?? '';
    // A course name is part of the meaning of its score. Editing the name must
    // invalidate source adoption even when the numeric score stays identical.
    const coursePath=record.path.match(/^education\/([^/]+)\/courseGrades\/([^/]+)\/score$/);
    let courseLabelChanged=false;
    if(coursePath && record.candidateConfirmed) {
      const educationId=decodeURIComponent(coursePath[1]);
      const gradeId=decodeURIComponent(coursePath[2]);
      const grade=next.education.find((edu)=>edu.id===educationId)?.courseGrades?.find((item)=>item.id===gradeId);
      const sourceNames=record.sources.filter((source)=>source.sourceId.startsWith('evidence:') &&
        source.label.startsWith('本地母版附件 · ')).map((source)=>source.label.slice('本地母版附件 · '.length));
      courseLabelChanged=Boolean(grade && sourceNames.length &&
        !sourceNames.every((name)=>name.trim()===grade.course.trim()));
    }
    if (newValue === record.normalizedValue && !courseLabelChanged) return record;
    changed = true;
    return {
      ...record,
      normalizedValue:newValue,
      status: (newValue ? 'user-asserted' : 'missing') as typeof record.status,
      candidateConfirmed:false,
      editedAt:now,
      cloudAllowed:false,
    };
  });
  for (const fact of facts) {
    if (existingPaths.has(fact.path)) continue;
    changed = true;
    records.push({
      factId:next.id+':'+fact.path,
      path:fact.path,
      claimType:fact.claimType,
      originalValue:'',
      normalizedValue:fact.value,
      sources:[],
      status:'user-asserted',
      candidateConfirmed:false,
      editedAt:now,
      versionId:next.id,
      sensitivity:fact.sensitivity,
      cloudAllowed:false,
    });
  }
  return changed ? {...next,factLedger:{version:1,records}} : next;
}
