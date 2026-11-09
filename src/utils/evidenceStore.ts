import type { EvidenceReview } from './evidenceAttachments';

const DB_NAME = 'craftcv-private-evidence-v1';
const STORE = 'attachments';
/** Curated user-confirmed project/experience records live in the same private master DB. */
export const MASTER_CONTENT_STORE = 'contentEntries';
/** Structured resume imports share the same private master; no second database. */
export const MASTER_SOURCE_STORE = 'sourceDocuments';
/** Original user-added DOCX/PDF blobs; no extraction or mutations on add. */
export const MASTER_FILE_STORE = 'masterFiles';
/** A single private evidence master, shared by every resume version in this browser. */
export const MASTER_EVIDENCE_SLOT_ID = '__master_evidence__';

export interface PrivateEvidenceAttachment {
  id: string;
  /** Legacy data retained per old resume slot; new material belongs to the shared master. */
  slotId: string;
  name: string;
  mimeType: string;
  size: number;
  addedAt: string;
  blob: Blob;
  contentHash?: string;
  review?: EvidenceReview;
  reviewedAt?: string;
  /** AI readings are candidate evidence, not verified resume facts. */
}

export async function evidenceSHA256(blob: Blob): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('当前浏览器不支持安全的附件指纹计算，请使用受支持的本地或 HTTPS 环境。');
  const bytes = await globalThis.crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(bytes)].map((byte)=>byte.toString(16).padStart(2,'0')).join('');
}

export function openEvidenceDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('浏览器未开放 IndexedDB，不能安全保存证据附件。'));
  return new Promise((resolve,reject)=>{
    const request = indexedDB.open(DB_NAME,5);
    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.objectStoreNames.contains(STORE)
        ? request.transaction!.objectStore(STORE)
        : db.createObjectStore(STORE,{keyPath:'id'});
      if(!store.indexNames.contains('slotId')) store.createIndex('slotId','slotId',{unique:false});
      if(!store.indexNames.contains('contentHash')) store.createIndex('contentHash','contentHash',{unique:true});
      if(!db.objectStoreNames.contains(MASTER_CONTENT_STORE)) {
        const contents=db.createObjectStore(MASTER_CONTENT_STORE,{keyPath:'id'});
        contents.createIndex('sourceKey','sourceKey',{unique:true});
      }
      if(!db.objectStoreNames.contains(MASTER_SOURCE_STORE)) {
        const sources=db.createObjectStore(MASTER_SOURCE_STORE,{keyPath:'id'});
        sources.createIndex('sourceHash','sourceHash',{unique:true});
      }
      if(!db.objectStoreNames.contains(MASTER_FILE_STORE)) {
        const files=db.createObjectStore(MASTER_FILE_STORE,{keyPath:'id'});
        files.createIndex('contentHash','contentHash',{unique:true});
      }
    };
    request.onerror = () => reject(new Error('本地证据存储不可用，请检查浏览器隐私模式或磁盘配额。'));
    request.onblocked = () => reject(new Error('旧版证据库正被其他 CraftCV 标签页占用，请关闭其他标签页后重试。'));
    request.onsuccess = () => resolve(request.result);
  });
}

async function transact<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openEvidenceDB();
  try {
    return await new Promise<T>((resolve,reject)=>{
      const tx = db.transaction(STORE,mode);
      const request = run(tx.objectStore(STORE));
      let result: T;
      request.onsuccess = () => { result = request.result; };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(new Error('证据文件本地存储失败，可能是磁盘空间、重复文件或浏览器配额不足。'));
      tx.onabort = () => reject(new Error('证据文件写入已中止，原有文件不受影响。'));
    });
  } finally { db.close(); }
}

/** Includes older per-slot attachments without moving, copying or deleting them. */
export async function listEvidence(): Promise<PrivateEvidenceAttachment[]> {
  const rows = await transact<PrivateEvidenceAttachment[]>('readonly',(store)=>store.getAll());
  return rows.sort((a,b)=>b.addedAt.localeCompare(a.addedAt));
}

/** Exact-byte identity, not filename. Old records without hashes remain reusable. */
export async function findEvidenceByContentHash(hash: string, rows?: PrivateEvidenceAttachment[]): Promise<PrivateEvidenceAttachment | undefined> {
  if(!/^[a-f0-9]{64}$/.test(hash)) throw new Error('附件内容指纹无效');
  const candidates = rows ?? await listEvidence();
  const direct = candidates.find((item)=>item.contentHash===hash);
  if(direct) return direct;
  for (const item of candidates) {
    if(item.contentHash)continue;
    if(await evidenceSHA256(item.blob)===hash) return item;
  }
  return undefined;
}

export async function saveEvidence(item: PrivateEvidenceAttachment): Promise<void> {
  await transact<IDBValidKey>('readwrite',(store)=>store.put(item));
}
export async function readEvidence(id: string): Promise<PrivateEvidenceAttachment | undefined> {
  return transact<PrivateEvidenceAttachment | undefined>('readonly',(store)=>store.get(id));
}
export async function deleteEvidence(id: string): Promise<void> {
  await transact<undefined>('readwrite',(store)=>store.delete(id));
}
/** Atomically skip deleted/already-read records; a late AI reply must not revive a deleted source. */
export async function saveEvidenceReviewIfPresent(id: string, review: EvidenceReview): Promise<boolean> {
  const db = await openEvidenceDB();
  try {
    return await new Promise<boolean>((resolve,reject)=>{
      const tx = db.transaction(STORE,'readwrite');
      const store = tx.objectStore(STORE);
      let exists = false;
      const get = store.get(id) as IDBRequest<PrivateEvidenceAttachment | undefined>;
      get.onsuccess = () => {
        const current = get.result;
        if(!current)return;
        exists = true;
        if(!current.review)store.put({...current,review,reviewedAt:new Date().toISOString()});
      };
      tx.oncomplete=()=>resolve(exists);
      tx.onerror=()=>reject(new Error('附件识别结果本地保存失败，保留原件以供重试。'));
      tx.onabort=()=>reject(new Error('附件识别结果未写入，本次不改变已有证据。'));
    });
  } finally { db.close(); }
}
