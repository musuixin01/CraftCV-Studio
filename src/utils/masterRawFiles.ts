import { MASTER_FILE_STORE, openEvidenceDB, evidenceSHA256 } from './evidenceStore.ts';

export interface MasterRawFile {
  id:string;
  contentHash:string;
  name:string;
  format:'docx'|'pdf';
  size:number;
  addedAt:string;
  blob:Blob;
}
export type MasterRawFileInfo=Omit<MasterRawFile,'blob'>;
export const MAX_MASTER_RAW_FILES=40;
export const MAX_MASTER_TOTAL_BYTES=60*1024*1024;
export const MAX_MASTER_FILE_BYTES=12*1024*1024;

export function validateMasterFile(file:File): 'docx'|'pdf' {
  const lower=file.name.toLocaleLowerCase();
  const format=lower.endsWith('.docx')?'docx':lower.endsWith('.pdf')?'pdf':null;
  if(!format)throw new Error('仅支持 Word .docx 和 .pdf；旧版 .doc 请另存为 DOCX。');
  if(file.size<=0||file.size>MAX_MASTER_FILE_BYTES)
    throw new Error('单文件需在 12 MB 以内，且不得为空。');
  if(file.name.length>210)throw new Error('文件名过长，请缩短后重新添加。');
  return format;
}
export async function validateMasterSignature(file:File,format:'docx'|'pdf'):Promise<void>{
  const prefix=new Uint8Array(await file.slice(0,8).arrayBuffer());
  if(format==='docx'&&!(prefix[0]===0x50&&prefix[1]===0x4b))
    throw new Error('DOCX 文件签名错误，请检查文件是否损坏或伪装了扩展名。');
  if(format==='pdf'&&new TextDecoder('ascii').decode(prefix.slice(0,5))!=='%PDF-')
    throw new Error('PDF 文件签名错误，请检查文件是否完整。');
}
export async function addMasterRawFile(file:File):Promise<MasterRawFileInfo>{
  const format=validateMasterFile(file);
  await validateMasterSignature(file,format);
  const hash=await evidenceSHA256(file);
  const record:MasterRawFile={
    id:'raw-'+hash.slice(0,28),contentHash:hash,name:file.name,format,size:file.size,
    addedAt:new Date().toISOString(),blob:file,
  };
  const db=await openEvidenceDB();
  try{
    await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction(MASTER_FILE_STORE,'readwrite');
      const store=tx.objectStore(MASTER_FILE_STORE);
      const records=store.getAll() as IDBRequest<MasterRawFile[]>;
      records.onsuccess=()=>{
        if(records.result.some((item)=>item.contentHash===hash)||
          records.result.length>=MAX_MASTER_RAW_FILES||
          records.result.reduce((n,item)=>n+item.size,0)+file.size>MAX_MASTER_TOTAL_BYTES){
          tx.abort();return;
        }
        store.add(record);
      };
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(new Error('保存原文件失败，可能是磁盘配额或浏览器存储不可用，原母版保持不变。'));
      tx.onabort=()=>reject(new Error('该文件已经添加过，或母版文件数/总容量超限（40 份、60 MB），未重复保存。'));
    });
  }finally{db.close();}
  const {blob:_,...metadata}=record;
  return metadata;
}
export async function listMasterRawFiles():Promise<MasterRawFileInfo[]> {
  const db=await openEvidenceDB();
  try{
    return await new Promise((resolve,reject)=>{
      const req=db.transaction(MASTER_FILE_STORE,'readonly').objectStore(MASTER_FILE_STORE).getAll() as IDBRequest<MasterRawFile[]>;      req.onsuccess=()=>resolve(req.result.map(({blob:_,...item})=>item)
        .sort((a,b)=>b.addedAt.localeCompare(a.addedAt)));
      req.onerror=()=>reject(new Error('无法读取本地母版文件列表。'));
    });
  }finally{db.close();}
}
export async function readMasterRawFile(id:string):Promise<File>{
  if(!/^raw-[a-f\d]{28}$/.test(id))throw new Error('母版文件编号无效。');
  const db=await openEvidenceDB();
  try{
    const record=await new Promise<MasterRawFile|undefined>((resolve,reject)=>{
      const req=db.transaction(MASTER_FILE_STORE,'readonly').objectStore(MASTER_FILE_STORE).get(id) as IDBRequest<MasterRawFile|undefined>;      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(new Error('读取母版原文件失败。'));
    });
    if(!record)throw new Error('原文件已被移除，请刷新母版。');
    return new File([record.blob],record.name,{type:record.format==='pdf'?'application/pdf':
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
  }finally{db.close();}
}
export async function deleteMasterRawFile(id:string):Promise<void>{
  if(!/^raw-[a-f\d]{28}$/.test(id))throw new Error('母版文件编号无效。');
  const db=await openEvidenceDB();
  try{
    await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction(MASTER_FILE_STORE,'readwrite');
      const store=tx.objectStore(MASTER_FILE_STORE);
      const req=store.get(id);
      req.onsuccess=()=>{if(!req.result){tx.abort();return;}store.delete(id);};
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(new Error('移除本地母版文件失败。'));
      tx.onabort=()=>reject(new Error('母版文件已不存在。'));
    });
  }finally{db.close();}
}
