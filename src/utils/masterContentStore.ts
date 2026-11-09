import type { ExperienceItem, ProjectItem, ResumeDocument } from '../types/resume';
import { MASTER_CONTENT_STORE, openEvidenceDB } from './evidenceStore.ts';

export type MasterContentKind = 'project' | 'experience';
export type MasterContentEntry =
  | { id: string; sourceKey: string; kind: 'project'; data: ProjectItem; title: string;
      originVersion: string; originResumeId: string; addedAt: string; updatedAt: string; userConfirmed: true }
  | { id: string; sourceKey: string; kind: 'experience'; data: ExperienceItem; title: string;
      originVersion: string; originResumeId: string; addedAt: string; updatedAt: string; userConfirmed: true };

export const MAX_MASTER_CONTENT_ITEMS = 120;
export const MAX_MASTER_CONTENT_BYTES = 24000;
const kindFrom = (kind:MasterContentKind,entry:ProjectItem|ExperienceItem) =>
  kind==='project' ? (entry as ProjectItem).name : (entry as ExperienceItem).company;

function validEntry(entry:MasterContentEntry):void {
  const raw=JSON.stringify(entry);
  if(raw.length>MAX_MASTER_CONTENT_BYTES || !/^[a-z0-9:_%-]{2,380}$/i.test(entry.sourceKey) ||
    !/^master-[a-z0-9-]{8,95}$/i.test(entry.id) || !entry.userConfirmed ||
    !['project','experience'].includes(entry.kind) || !entry.title.trim() ||
    !entry.data || typeof entry.data!=='object' || !('id' in entry.data) ||
    !Array.isArray(entry.data.techStack) ||
    (entry.kind==='project'&&(!Array.isArray(entry.data.bullets)||typeof entry.data.summary!=='string')) ||
    (entry.kind==='experience'&&!Array.isArray(entry.data.bullets)) ||
    entry.data.bullets.length>40 || entry.data.techStack.length>40 ||
    entry.data.bullets.some((x)=>typeof x!=='string'||x.length>1500) ||
    entry.data.techStack.some((x)=>typeof x!=='string'||x.length>100)
  )throw new Error('内容库条目格式或大小超出安全限制，未写入任何资料。');
}
function sourceKey(resumeId:string,kind:MasterContentKind,entryId:string):string {
  return [kind,resumeId,entryId].map((s)=>encodeURIComponent(s)).join(':');
}
export function masterEntryFromResume(
  doc:ResumeDocument,kind:MasterContentKind,sourceId:string,
):MasterContentEntry {
  const item=kind==='project'?doc.projects.find((row)=>row.id===sourceId):
    doc.experience.find((row)=>row.id===sourceId);
  if(!item)throw new Error('选中的经历在当前版本中不存在，已取消收录。');
  const title=kindFrom(kind,item).trim();
  if(!title)throw new Error('经历名称或单位不能为空。请先在编辑器补全。');
  const now=new Date().toISOString();
  const data=JSON.parse(JSON.stringify(item)) as typeof item;
  const common={id:'master-'+crypto.randomUUID(),sourceKey:sourceKey(doc.id,kind,sourceId),
    title,originVersion:doc.versionName||doc.basics.title,originResumeId:doc.id,
    addedAt:now,updatedAt:now,userConfirmed:true as const};
  const result:MasterContentEntry=kind==='project'?
    {...common,kind:'project',data:data as ProjectItem}:
    {...common,kind:'experience',data:data as ExperienceItem};
  validEntry(result);
  return result;
}
/** Same physical IndexedDB as the evidence attachments: a second object store, not a second library. */
async function operation<T>(mode:IDBTransactionMode,action:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T> {
  const db=await openEvidenceDB();
  try {
    return await new Promise<T>((resolve,reject)=>{
      const tx=db.transaction(MASTER_CONTENT_STORE,mode);
      const request=action(tx.objectStore(MASTER_CONTENT_STORE));
      let result:T;
      request.onsuccess=()=>{result=request.result;};
      tx.oncomplete=()=>resolve(result);
      tx.onerror=()=>reject(new Error('内容库读写失败，可能与浏览器配额、重复条目或其他标签页操作有关。'));
      tx.onabort=()=>reject(new Error('内容库事务被取消，原有内容未改变。'));
    });
  }finally{db.close();}
}
export async function listMasterContent():Promise<MasterContentEntry[]> {
  const rows=await operation<MasterContentEntry[]>('readonly',(store)=>store.getAll());
  return rows.filter((entry)=>entry?.userConfirmed===true &&
    (entry.kind==='project'||entry.kind==='experience'))
    .sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
}
/** Explicitly upsert one selected record; never mutate the source resume. */
export async function saveMasterContent(entry:MasterContentEntry):Promise<void> {
  validEntry(entry);
  const db=await openEvidenceDB();
  try{
    await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction(MASTER_CONTENT_STORE,'readwrite');
      const store=tx.objectStore(MASTER_CONTENT_STORE);
      const get=store.index('sourceKey').get(entry.sourceKey) as IDBRequest<MasterContentEntry|undefined>;
      get.onsuccess=()=>{
        const prior=get.result;
        if(prior)store.put({...entry,id:prior.id,addedAt:prior.addedAt});
        else {
          const count=store.count();
          count.onsuccess=()=>{
            if(count.result>=MAX_MASTER_CONTENT_ITEMS){tx.abort();return;}
            store.add(entry);
          };
        }
      };
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(new Error('内容库收录失败：来源记录重复或本地存储不可用。'));
      tx.onabort=()=>reject(new Error('已达到 120 条内容上限，或收录被取消；未修改原有资料。'));
    });
  }finally{db.close();}
}
export async function deleteMasterContent(id:string):Promise<void> {
  if(!/^master-[a-z0-9-]{8,95}$/i.test(id))throw new Error('内容库条目 ID 无效');
  await operation<undefined>('readwrite',(store)=>store.delete(id));
}
