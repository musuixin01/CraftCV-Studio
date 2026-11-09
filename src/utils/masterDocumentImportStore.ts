import type {AwardItem,EducationItem,ExperienceItem,ProjectItem,SkillCategory} from '../types/resume';
import {MASTER_CONTENT_STORE, MASTER_SOURCE_STORE,openEvidenceDB} from './evidenceStore.ts';
import {masterEntryFromResume,type MasterContentEntry,MAX_MASTER_CONTENT_ITEMS} from './masterContentStore.ts';
import {DEFAULT_EE_RESUME} from '../data/defaultResume.ts';
import type {MasterDocumentCandidates} from './resumeTextStructurer';

export interface MasterSourceDocument {
  id:string;
  sourceHash:string;
  name:string;
  format:'docx'|'pdf';
  size:number;
  importedAt:string;
  updatedAt?:string;
  /** Records extracted from this chosen source and explicitly confirmed by user. */
  education:EducationItem[];
  projects:ProjectItem[];
  experience:ExperienceItem[];
  skills:SkillCategory[];
  awards:AwardItem[];
  summary:string;
  sourceLines:string[];
  warnings:string[];
  confirmedByUser:true;
}
export type MasterSelection={
  education:string[];projects:string[];experience:string[];skills:string[];awards:string[];
  summary:boolean;
};
export const MAX_MASTER_SOURCE_DOCUMENTS=60;
export function validateSelection(
  parsed:MasterDocumentCandidates,selected:MasterSelection,
):MasterDocumentCandidates {
  const chosen=<T extends {id:string}>(rows:T[],ids:string[],kind:string):T[]=>{
    if(!Array.isArray(ids)||ids.length>60||new Set(ids).size!==ids.length)
      throw new Error(kind+'选择项存在重复或超出限制');
    const wanted=new Set(ids);
    if(rows.filter((row)=>wanted.has(row.id)).length!==wanted.size)
      throw new Error(kind+'候选条目已发生变化，请重新选择');
    return rows.filter((row)=>wanted.has(row.id)).map((row)=>structuredClone(row));
  };
  const result={
    ...parsed,
    education:chosen(parsed.education,selected.education,'教育'),
    projects:chosen(parsed.projects,selected.projects,'项目'),
    experience:chosen(parsed.experience,selected.experience,'工作/实习'),
    skills:chosen(parsed.skills,selected.skills,'技能'),
    awards:chosen(parsed.awards,selected.awards,'奖项'),
    summary:selected.summary?parsed.summary:'',
  };
  if(!result.education.length&&!result.projects.length&&!result.experience.length&&
    !result.skills.length&&!result.awards.length&&!result.summary)
    throw new Error('请至少确认一条真实简历信息，不能保存空的母版来源。');
  return result;
}
const ALLOWED_HASH=/^[a-f\d]{64}$/;
function validateSource(record:MasterSourceDocument):void {
  if(!ALLOWED_HASH.test(record.sourceHash)||record.name.length>210||
    record.size>12*1024*1024||record.size<1||
    !['docx','pdf'].includes(record.format)||
    !/^import-[a-f\d]{28}$/.test(record.id)||
    record.sourceLines.length>4200||record.sourceLines.some((row)=>row.length>1400)||
    JSON.stringify(record).length>380_000||
    !record.confirmedByUser)
    throw new Error('母版来源记录不完整或过长，本次未写入。');
}
function toContentEntries(record:MasterSourceDocument):MasterContentEntry[]{
  const doc=structuredClone(DEFAULT_EE_RESUME);
  doc.id=record.id;
  doc.versionName=record.name;
  doc.projects=record.projects;
  doc.experience=record.experience;
  return [
    ...record.projects.map((item)=>masterEntryFromResume(doc,'project',item.id)),
    ...record.experience.map((item)=>masterEntryFromResume(doc,'experience',item.id)),
  ];
}
/** Source import and project/experience records are written atomically in one existing DB. */
export async function saveMasterDocument(
  parsed:MasterDocumentCandidates,file:File,selection:MasterSelection,
):Promise<MasterSourceDocument>{
  const bytes=await file.arrayBuffer();
  if(!crypto.subtle)throw new Error('浏览器必须支持本地 SHA-256，无法在不安全环境中记录来源。');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))
    .map((v)=>v.toString(16).padStart(2,'0')).join('');
  const selected=validateSelection(parsed,selection);
  const record:MasterSourceDocument={
    id:'import-'+hash.slice(0,28),sourceHash:hash,name:file.name,format:parsed.sourceFormat,
    size:file.size,importedAt:new Date().toISOString(),education:selected.education,
    projects:selected.projects,experience:selected.experience,skills:selected.skills,
    awards:selected.awards,summary:selected.summary,
    sourceLines:parsed.sourceLines.map((s)=>s.slice(0,1400)),
    warnings:parsed.warnings.slice(0,50),confirmedByUser:true,
  };
  validateSource(record);
  const content=toContentEntries(record);
  const db=await openEvidenceDB();
  try{
    await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction([MASTER_SOURCE_STORE,MASTER_CONTENT_STORE],'readwrite');
      const source=tx.objectStore(MASTER_SOURCE_STORE);
      const master=tx.objectStore(MASTER_CONTENT_STORE);
      const duplicate=source.index('sourceHash').get(hash);
      duplicate.onsuccess=()=>{
        if(duplicate.result){tx.abort();return;}
        const sourceCount=source.count();
        sourceCount.onsuccess=()=>{
          if(sourceCount.result>=MAX_MASTER_SOURCE_DOCUMENTS){tx.abort();return;}
          const masterCount=master.count();
          masterCount.onsuccess=()=>{
            if(masterCount.result+content.length>MAX_MASTER_CONTENT_ITEMS){tx.abort();return;}
            source.add(record);
            for(const entry of content)master.add(entry);
          };
        };
      };
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(new Error('母版导入失败，可能是来源重复、内容冲突或浏览器存储不可用。全部写入已回滚。'));
      tx.onabort=()=>reject(new Error('该 Word/PDF 已导入过，或已达到容量限制。本次没有覆盖母版数据。'));
    });
  }finally{db.close();}
  return record;
}

/** Edit a structured copy, keeping the original uploaded file untouched.
 * Compare the saved source snapshot to reject stale updates across tabs.
 */
export async function updateMasterDocument(
  previous:MasterSourceDocument,parsed:MasterDocumentCandidates,selection:MasterSelection,
):Promise<void>{
  const chosen=validateSelection(parsed,selection);
  const next:MasterSourceDocument={
    ...previous,education:chosen.education,projects:chosen.projects,
    experience:chosen.experience,skills:chosen.skills,awards:chosen.awards,
    summary:chosen.summary,updatedAt:new Date().toISOString(),
  };
  validateSource(next);
  const desired=toContentEntries(next);
  const db=await openEvidenceDB();
  try{
    await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction([MASTER_SOURCE_STORE,MASTER_CONTENT_STORE],'readwrite');
      const sources=tx.objectStore(MASTER_SOURCE_STORE);
      const master=tx.objectStore(MASTER_CONTENT_STORE);
      const currentReq=sources.get(previous.id) as IDBRequest<MasterSourceDocument|undefined>;
      currentReq.onsuccess=()=>{
        const current=currentReq.result;
        if(!current || JSON.stringify(current)!==JSON.stringify(previous)){
          tx.abort();return;
        }
        const allReq=master.getAll() as IDBRequest<MasterContentEntry[]>;
        allReq.onsuccess=()=>{
          const existing=allReq.result.filter((row)=>row.originResumeId===previous.id);
          const delta=allReq.result.length-existing.length+desired.length;
          if(delta>MAX_MASTER_CONTENT_ITEMS){tx.abort();return;}
          const wanted=new Set(desired.map((row)=>row.sourceKey));
          for(const old of existing)if(!wanted.has(old.sourceKey))master.delete(old.id);
          for(const entry of desired){
            const old=existing.find((row)=>row.sourceKey===entry.sourceKey);
            master.put(old?{...entry,id:old.id,addedAt:old.addedAt}:entry);
          }
          sources.put(next);
        };
      };
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(new Error('保存可编辑母版失败，原记录未改变。'));
      tx.onabort=()=>reject(new Error('其他标签页已修改该来源，或内容库达到限制。请刷新后重试，旧资料保持不变。'));
    });
  }finally{db.close();}
}
export async function listMasterDocuments():Promise<MasterSourceDocument[]> {
  const db=await openEvidenceDB();
  try{
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction(MASTER_SOURCE_STORE,'readonly');
      const request=tx.objectStore(MASTER_SOURCE_STORE).getAll() as IDBRequest<MasterSourceDocument[]>;
      request.onsuccess=()=>resolve(request.result.sort((a,b)=>b.importedAt.localeCompare(a.importedAt)));
      request.onerror=()=>reject(new Error('无法读取已确认的 Word/PDF 母版来源。'));
    });
  }finally{db.close();}
}
export async function deleteMasterDocument(id:string):Promise<void> {
  if(!/^import-[a-f\d]{28}$/.test(id))throw new Error('母版来源 ID 无效。');
  const db=await openEvidenceDB();
  try{
    await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction([MASTER_SOURCE_STORE,MASTER_CONTENT_STORE],'readwrite');
      const source=tx.objectStore(MASTER_SOURCE_STORE);
      const content=tx.objectStore(MASTER_CONTENT_STORE);
      const get=source.get(id) as IDBRequest<MasterSourceDocument|undefined>;
      get.onsuccess=()=>{
        if(!get.result){tx.abort();return;}
        source.delete(id);
        for(const kind of ['project','experience'] as const){
          for(const item of get.result[kind==='project'?'projects':'experience']){
            const key=[kind,id,item.id].map((part)=>encodeURIComponent(part)).join(':');
            const found=content.index('sourceKey').get(key) as IDBRequest<MasterContentEntry|undefined>;
            found.onsuccess=()=>{if(found.result)content.delete(found.result.id);};
          }
        }
      };
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(new Error('移除母版来源失败，原有记录未改变。'));
      tx.onabort=()=>reject(new Error('母版来源不存在，未删除任何条目。'));
    });
  }finally{db.close();}
}
