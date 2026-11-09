
import React, {useEffect,useMemo,useRef,useState} from 'react';
import {AlertCircle,FileCheck2,FilePlus2,FileSearch,Loader2,Trash2,X} from 'lucide-react';
import type {ResumeDocument} from '../types/resume';
import {
  compareEvidenceFact,evidenceMimeFromFile,MAX_EVIDENCE_FILES_PER_SLOT,
  validateEvidenceReview,
} from '../utils/evidenceAttachments';
import {
  deleteEvidence,evidenceSHA256,findEvidenceByContentHash,listEvidence,


  MASTER_EVIDENCE_SLOT_ID,readEvidence,saveEvidence,saveEvidenceReviewIfPresent,type PrivateEvidenceAttachment,
} from '../utils/evidenceStore';
import {auditEvidence} from '../utils/evidenceAudit';
import {evidenceFactKey} from '../utils/evidenceAudit';
import {isMasterFactAdopted,resolveMasterAdoptionTarget} from '../utils/masterFactAdoption';
import {selectedAIModelId} from '../utils/aiModelClient';
import {MasterContentPanel} from './MasterContentPanel';

interface ModelInfo {
  id:string;name:string;providerLabel:string;local:boolean;
  supportsImage:boolean;supportsPdf:boolean;
}
interface EvidenceAttachmentsModalProps {
  isOpen:boolean;
  resume:ResumeDocument;
  onAdoptFact:(source:PrivateEvidenceAttachment,factIndex:number)=>boolean;
  onClose:()=>void;
}


async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error('无法读取附件数据'));
    reader.onload=()=>{
      const data=String(reader.result||'');
      const index=data.indexOf(',');
      if (index<0) reject(new Error('附件编码失败'));
      else resolve(data.slice(index+1));
    };
    reader.readAsDataURL(blob);
  });
}

function supportsFile(model:ModelInfo|null,mimeType:string):boolean {
  return Boolean(model && (mimeType==='application/pdf'?model.supportsPdf:model.supportsImage));
}

/** Shared evidence master. Attachments are not silently written into the actual resume. */
export const EvidenceAttachmentsModal:React.FC<EvidenceAttachmentsModalProps> = ({

  isOpen,resume,onClose,onAdoptFact,
})=>{
  const [files,setFiles]=useState<PrivateEvidenceAttachment[]>([]);
  const [model,setModel]=useState<ModelInfo|null>(null);
  const [fetchingModels,setFetchingModels]=useState(false);
  const [busy,setBusy]=useState<string|null>(null);
  const [error,setError]=useState('');
  const [info,setInfo]=useState('');
  const [expandedSourceIds,setExpandedSourceIds]=useState<Record<string,boolean>>({});
  const [previewId,setPreviewId]=useState<string|null>(null);
  const [previewUrl,setPreviewUrl]=useState('');
  const fileInput=useRef<HTMLInputElement|null>(null);
  const abortRef=useRef<AbortController|null>(null);
  const mounted=useRef(false);
  const workingRef=useRef(false);
  const epochRef=useRef(0);

  const reload=async()=>{
    const found=await listEvidence();
    if(mounted.current)setFiles(found);
  };
  const refreshModels=async():Promise<ModelInfo|null>=>{
    if(mounted.current)setFetchingModels(true);
    try{
      const response=await fetch('/api/ai/models',{cache:'no-store'});
      if(!response.ok)throw new Error('读取模型配置失败');
      const data=await response.json() as {defaultId?:string;models?:ModelInfo[]};
      const selected=selectedAIModelId()||data.defaultId;
      const found=data.models?.find((entry)=>entry.id===selected)||null;
      if(mounted.current)setModel(found);
      return found;
    }finally{if(mounted.current)setFetchingModels(false);}
  };

  useEffect(()=>{
    if(!isOpen)return;
    const epoch=++epochRef.current;
    mounted.current=true;
    setBusy(null);setFiles([]);setError('');setInfo('');setPreviewId(null);setModel(null);
    setExpandedSourceIds({});
    reload().catch((err)=>{if(epochRef.current===epoch)setError(err instanceof Error?err.message:'无法读取本地证据母版');});
    refreshModels().catch((err)=>{if(epochRef.current===epoch)setError(err instanceof Error?err.message:'读取模型配置失败');});
    return ()=>{
      epochRef.current++;
      mounted.current=false;
      abortRef.current?.abort();
    };
  },[isOpen]);

  useEffect(()=>{
    if(!isOpen||!previewId){setPreviewUrl('');return;}
    const item=files.find((row)=>row.id===previewId);
    if(!item){setPreviewUrl('');return;}
    const url=URL.createObjectURL(item.blob);
    setPreviewUrl(url);
    return ()=>URL.revokeObjectURL(url);
  },[isOpen,previewId,files]);

  const audit=useMemo(()=>auditEvidence(files,resume),[files,resume]);
  if(!isOpen)return null;

  const close=()=>{
    epochRef.current++;
    abortRef.current?.abort();
    setPreviewId(null);
    onClose();
  };

  /** Runs only for a file without a stored AI result. Caller owns explicit user upload/retry. */
  const recognize=async(item:PrivateEvidenceAttachment,selected:ModelInfo,epoch:number):Promise<boolean>=>{
    if(item.review || !supportsFile(selected,item.mimeType) || epoch!==epochRef.current)return false;
    const controller=new AbortController();
    abortRef.current=controller;
    try{
      const base64Data=await blobToBase64(item.blob);
      if(controller.signal.aborted || epoch!==epochRef.current)return false;
      const response=await fetch('/api/ai/extract-evidence',{
        method:'POST',
        headers:{'Content-Type':'application/json','X-CraftCV-AI-Model':selected.id},
        body:JSON.stringify({fileName:item.name,mimeType:item.mimeType,base64Data}),
        signal:controller.signal,
      });
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||'附件识别失败');
      const review=validateEvidenceReview(result.review);
      if(controller.signal.aborted || epoch!==epochRef.current)return false;
      // Atomic update cannot resurrect deleted sources or overwrite a newer result.
      const saved=await saveEvidenceReviewIfPresent(item.id,review);
      if(saved)await reload();
      return saved;    }finally{
      if(abortRef.current===controller)abortRef.current=null;
    }
  };

  /** Upload is the action that initiates recognition; no separate consent checkbox. */
  const addFiles=async(event:React.ChangeEvent<HTMLInputElement>)=>{
    const chosen=Array.from(event.target.files||[]);
    event.target.value='';
    if(!chosen.length||workingRef.current)return;
    workingRef.current=true;
    const epoch=epochRef.current;
    setBusy('upload');setError('');setInfo('');
    let added=0,reused=0,recognized=0,pending=0;
    const failures:string[]=[];
    try{
      // Validate and hash every file before any write; repeats share one source record.
      const prepared:{file:File;mime:string;hash:string}[]=[];
      const batchHashes=new Set<string>();
      for(const file of chosen){
        const mime=evidenceMimeFromFile(file);
        const hash=await evidenceSHA256(file);
        if(batchHashes.has(hash)){reused++;continue;}
        batchHashes.add(hash);
        prepared.push({file,mime,hash});
      }
      if(epoch!==epochRef.current)return;
      const existing=await listEvidence();
      const incoming:{file:File;mime:string;hash:string;item?:PrivateEvidenceAttachment}[]=[];
      for(const entry of prepared){
        const item=await findEvidenceByContentHash(entry.hash,existing);
        incoming.push({...entry,item});
      }
      const newCount=incoming.filter((item)=>!item.item).length;
      if(existing.length+newCount>MAX_EVIDENCE_FILES_PER_SLOT)
        throw new Error('母版资料库最多保存 '+MAX_EVIDENCE_FILES_PER_SLOT+' 份不同的附件；重复文件不会占用额外名额。');

      // Model identity is frozen for this user-initiated batch.
      let selected:ModelInfo|null=null;
      try{selected=await refreshModels();}
      catch{failures.push('当前模型列表不可用，附件仍保存在本机，可稍后点击「识别待处理」');}
      for(const entry of incoming){
        if(epoch!==epochRef.current)return;
        let item=entry.item;
        if(item){reused++;}
        else{
          item={
            id:crypto.randomUUID(),slotId:MASTER_EVIDENCE_SLOT_ID,
            name:entry.file.name,mimeType:entry.mime,size:entry.file.size,
            addedAt:new Date().toISOString(),blob:entry.file,contentHash:entry.hash,
          };
          try{
            await saveEvidence(item);
            added++;
          }catch{
            // Another tab may have saved the same SHA-256 while this batch was preparing.
            const concurrent=await findEvidenceByContentHash(entry.hash);
            if(!concurrent)throw new Error('母版附件保存失败，请检查浏览器存储空间。');
            item=concurrent;reused++;
          }
          await reload();
        }
        if(item.review)continue; // Cache hit: never charge for reading the same bytes.
        if(!selected || !supportsFile(selected,item.mimeType)){pending++;continue;}
        setBusy(item.id);
        try{
          if(await recognize(item,selected,epoch))recognized++;
          else pending++;
        }catch(err){
          if(err instanceof Error && err.name==='AbortError')return;
          pending++;
          failures.push(item.name+'：'+(err instanceof Error?err.message:'识别失败'));
        }
      }
      if(epoch!==epochRef.current)return;
      await reload();
      setInfo('已加入母版 '+added+' 份，复用 '+reused+' 份；本次新识别 '+recognized+' 份'+
        (pending?'，待处理 '+pending+' 份':'')+'。已读附件不会重复识别，也不会自动改写正式简历。');
      if(failures.length)setError(failures.slice(0,3).join('；'));
    }catch(err){
      if(epoch===epochRef.current)setError(err instanceof Error?err.message:'上传与自动识别失败');
      await reload().catch(()=>{});
    }finally{
      workingRef.current=false;
      if(epoch===epochRef.current)setBusy(null);
    }
  };

  const retry=async(item:PrivateEvidenceAttachment)=>{
    if(workingRef.current||item.review)return;
    workingRef.current=true;
    const epoch=epochRef.current;
    setBusy(item.id);setError('');setInfo('');
    try{
      const selected=await refreshModels();
      if(!selected)throw new Error('没有配置 AI 模型，附件仍保存在母版中。');
      if(!supportsFile(selected,item.mimeType))throw new Error('当前模型不支持此附件格式，请先切换模型。');
      if(await recognize(item,selected,epoch)){
        if(epoch===epochRef.current)setInfo('识别结果已加入共享母版；之后无需重复读取。');
      }
    }catch(err){
      if(epoch===epochRef.current && !(err instanceof Error&&err.name==='AbortError'))
        setError(err instanceof Error?err.message:'识别失败，保留附件以供稍后再试。');
    }finally{
      workingRef.current=false;
      if(epoch===epochRef.current)setBusy(null);
    }
  };

  const remove=async(item:PrivateEvidenceAttachment)=>{

    if(workingRef.current||!window.confirm('确定从所有简历共用的母版中删除“'+item.name+'”及其识别结果吗？如某些简历版本已采用其中的事实，来源记录将失去本机原件引用；此操作不可撤销。'))return;
    try{
      await deleteEvidence(item.id);
      if(previewId===item.id)setPreviewId(null);
      await reload();setInfo('已从共享母版中移除附件及识别结果。');
    }catch(err){setError(err instanceof Error?err.message:'删除附件失败');}
  };


  const adoptFact=async(item:PrivateEvidenceAttachment,index:number)=>{
    if(workingRef.current||!item.review)return;
    const epoch=epochRef.current;
    setError('');setInfo('');
    try{
      const latest=await readEvidence(item.id);
      if(epoch!==epochRef.current)return;
      if(!latest?.review || !item.review.facts[index] ||
        evidenceFactKey(latest.review.facts[index])!==evidenceFactKey(item.review.facts[index])){
        throw new Error('附件识别结果已变化，请重新打开资料库。');
      }
      const latestAudit=auditEvidence(await listEvidence(),resume).facts.find((entry)=>
        entry.sourceId===latest.id && entry.index===index);
      if(!latestAudit||latestAudit.issues.some((issue)=>issue!=='与当前简历的对应字段存在差异'))
        throw new Error('该字段存在来源冲突或识别异常，不能直接采用；请对照原件后在编辑器处理。');
      const target=resolveMasterAdoptionTarget(resume,latest.review.facts[index],latest.id,index);      if(!target)throw new Error('当前简历没有可唯一定位的对应字段，请在编辑器人工填写。');
      if(isMasterFactAdopted(resume,latest.id,latest.review.facts[index],index)){        setInfo('当前版本已经采用过该事实，无需再次操作。');return;
      }
      const chosen=latest.review.facts[index];
      const confirmed=window.confirm(
        '请对照附件原件核实这一项（不是官方认证）：\n\n'+target.label+
        '\n当前简历：'+(target.currentValue||'（空）')+
        '\n将采用：'+chosen.value+
        '\n文件：'+latest.name+'\n来源摘录：'+chosen.quote+
        '\n\n只更新当前岗位版本的这个字段，并记录来源，可用撤销恢复。是否确认？'
      );
      if(!confirmed)return;
      // The user may have kept the native confirm open while another tab deleted the source.
      const finalSource=await readEvidence(latest.id);
      if(epoch!==epochRef.current)return;
      if(!finalSource?.review || !finalSource.review.facts[index] ||
        evidenceFactKey(finalSource.review.facts[index])!==evidenceFactKey(chosen))
        throw new Error('来源文件已被删除或变更，取消本次采用。');
      if(onAdoptFact(latest,index)){
        setExpandedSourceIds((previous)=>({...previous,[item.id]:true}));
        if(epoch===epochRef.current)setInfo('已采用到当前简历版本并写入事实账本。后续 AI 可使用该字段的正式简历值，附件不会再被重复读取。');
      }else setError('采用未完成，简历可能已变化。请重新检查当前字段。');
    }catch(err){
      if(epoch===epochRef.current)setError(err instanceof Error?err.message:'采用事实失败，原数据保持不变。');
    }
  };

  const readCount=files.filter((item)=>Boolean(item.review)).length;

  return (
    <div className="no-print fixed inset-0 z-[70] bg-slate-950/45 backdrop-blur-md flex items-center justify-center p-3 sm:p-5" role="presentation">
      <section role="dialog" aria-modal="true" aria-label="简历母版资料库" className="os26-floating-dock w-full max-w-4xl max-h-[94vh] flex flex-col rounded-3xl overflow-hidden shadow-2xl">
        <header className="flex items-start justify-between gap-3 px-5 sm:px-6 py-4 border-b border-slate-900/[0.08]">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2"><FileCheck2 className="w-5 h-5 text-[#0071e3]"/>母版资料库</h2>
            <p className="text-xs text-slate-600 mt-1">项目、工作经历与证明附件共用同一母版 · 岗位版本之间独立使用</p>
          </div>
          <button type="button" onClick={close} aria-label="关闭附件" className="p-2 rounded-xl hover:bg-slate-900/5 text-slate-600"><X size={18}/></button>
        </header>
        <div className="overflow-y-auto min-h-0 p-5 sm:p-6 space-y-4 text-sm">
          <MasterContentPanel resume={resume}/>
          <div className="rounded-2xl bg-white/65 border border-slate-200/80 p-4 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="font-semibold text-slate-800">上传即自动识别 · 相同文件只读取一次</div>
              <p className="text-xs text-slate-600">母版已有 {files.length} 份附件，已读取 {readCount} 份；自动归档 {audit.indexed} 项、多材料一致 {audit.consistent} 项、需要关注 {audit.attention+audit.noteCount} 项。支持 PDF、PNG、JPG、WebP；最多 {MAX_EVIDENCE_FILES_PER_SLOT} 份不同文件、单件 8MB。以文件内容 SHA-256 去重，重命名不触发重复识别。</p>
            </div>
            <button type="button" disabled={Boolean(busy)} onClick={()=>fileInput.current?.click()} className="shrink-0 rounded-xl bg-[#0071e3] text-white px-4 py-2.5 text-xs font-semibold flex gap-2 justify-center items-center disabled:opacity-50">
              {busy?<Loader2 size={16} className="animate-spin"/>:<FilePlus2 size={16}/>}上传并识别
            </button>
            <input ref={fileInput} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp" onChange={addFiles} className="hidden"/>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-3 space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <strong className="text-xs text-slate-700">识别模型与上传说明</strong>
              <button type="button" onClick={()=>refreshModels().catch((err)=>setError(String(err)))} className="text-xs font-semibold text-[#0071e3]">刷新模型</button>
            </div>
            <p className="text-xs text-slate-700">{fetchingModels?'读取模型配置中…':model
              ? '当前：'+model.providerLabel+' / '+model.name+(model.local?'（本机处理）':'（云端处理）')
              :'当前未配置模型。可先保存文件，配置支持视觉/PDF 的模型后点击「识别待处理」。'}</p>
            <p className="text-xs leading-relaxed text-slate-600">选择「上传并识别」后，未读且格式兼容的附件会直接发送给上述选定模型，<strong>不另弹授权确认</strong>。云端模型将接收文件中的个人信息与成绩，并可能产生费用和数据留存；请仅上传有权处理的资料。已识别附件完全复用本地结果，不重复调用模型。</p>
          </div>
          {error&&<p role="alert" className="rounded-xl px-3 py-2 bg-red-50 border border-red-200 text-xs text-red-800"><AlertCircle size={14} className="inline mr-1"/>{error}</p>}
          {info&&<p role="status" className="rounded-xl px-3 py-2 bg-blue-50 border border-blue-100 text-xs text-blue-800">{info}</p>}
          {audit.attention+audit.noteCount>0
            ? <p role="status" className="rounded-xl px-3 py-2 bg-amber-50 border border-amber-100 text-xs text-amber-900">自动检查发现 {audit.attention} 个字段问题与 {audit.noteCount} 条识别备注，已在对应附件下展开。其他事实已自动归档，不必逐条操作。</p>
            : audit.total>0
              ? <p role="status" className="rounded-xl px-3 py-2 bg-slate-50 border border-slate-200 text-xs text-slate-700">已自动整理 {audit.total} 项来源候选信息，无需逐项确认。{audit.consistent>0?'其中 '+audit.consistent+' 项得到多材料一致结果；':''}原件真实性尚未经过第三方认证。</p>
              : null}
          {!files.length&&<div className="py-8 text-center text-slate-500 text-xs">母版暂时没有附件。上传一次后可供所有简历版本使用。</div>}
          {files.map((item)=>{
            const compatible=supportsFile(model,item.mimeType);
            const auditedFacts=audit.facts.filter((entry)=>entry.sourceId===item.id);
            const needsAttention=auditedFacts.filter((entry)=>entry.status==='attention');
            const consistentCount=auditedFacts.filter((entry)=>entry.status==='consistent').length;
            const isExpanded=Boolean(expandedSourceIds[item.id]);
            const visibleFacts=isExpanded?auditedFacts:needsAttention;
            const adoptedCount=auditedFacts.filter((entry)=>isMasterFactAdopted(resume,item.id,entry.fact,entry.index)).length;            return <article key={item.id} className="rounded-2xl border border-slate-200/80 bg-white/70 p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-900 break-words flex gap-2 items-center"><FileSearch className="w-4 h-4 shrink-0 text-[#0071e3]"/>{item.name}</div>
                  <p className="text-[11px] text-slate-500 mt-1">{(item.size/1024/1024).toFixed(2)}MB · 母版本地资料 · {item.review?'已识别并缓存':'未识别，待处理'}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={()=>setPreviewId(previewId===item.id?null:item.id)} className="px-2.5 py-1.5 rounded-lg text-xs text-slate-700 bg-slate-100">{previewId===item.id?'收起原件':'查看原件'}</button>
                  {item.review
                    ? <span className="px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-700 bg-blue-50">已读取 · 无需重复</span>
                    : <button type="button" disabled={Boolean(busy)||!compatible} onClick={()=>retry(item)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#0071e3] text-white disabled:bg-slate-200 disabled:text-slate-400 flex items-center gap-1.5">
                        {busy===item.id?<Loader2 className="w-3 h-3 animate-spin"/>:<FileSearch className="w-3 h-3"/>}识别待处理
                      </button>}
                  <button type="button" aria-label={'删除 '+item.name} disabled={Boolean(busy)} onClick={()=>remove(item)} className="p-2 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"><Trash2 size={14}/></button>
                </div>
              </div>
              {!item.review&&model&&!compatible&&<p className="text-xs text-amber-800">当前模型不支持该附件格式，请切换到支持{item.mimeType==='application/pdf'?' PDF':'图片'}的模型。</p>}
              {previewId===item.id&&previewUrl&&<div className="bg-white border border-slate-200 rounded-xl p-2 h-[240px] overflow-auto">
                {item.mimeType==='application/pdf'
                  ? <object data={previewUrl} type="application/pdf" aria-label={item.name} className="w-full h-full"><p>浏览器无法嵌入 PDF 预览，请查看原件。</p></object>
                  : <img src={previewUrl} alt={'原始证据：'+item.name} className="max-w-full max-h-full mx-auto object-contain"/>}
              </div>}
              {item.review&&<div className="space-y-2.5 border-t border-slate-200 pt-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-slate-800">自动整理（{auditedFacts.length} 项）：归档 {auditedFacts.length-needsAttention.length-consistentCount} · 多材料一致 {consistentCount} · 待关注 {needsAttention.length} · 当前版本已采用 {adoptedCount}</p>
                    <p className="text-[11px] text-slate-500 mt-1">正常项目已存入母版，无需逐条确认；系统只展开有歧义的字段。</p>
                  </div>
                  {auditedFacts.length>0&&<button
                    type="button"
                    aria-expanded={isExpanded}
                    onClick={()=>setExpandedSourceIds((previous)=>({...previous,[item.id]:!previous[item.id]}))}
                    className="rounded-lg px-2.5 py-1.5 text-xs text-[#0071e3] hover:bg-blue-50"
                  >{isExpanded?'只显示待核对':'查看全部 '+auditedFacts.length+' 项'}</button>}
                </div>
                {auditedFacts.length===0&&<p className="text-xs text-amber-800">没有提取到可以索引的事实。结果已缓存，建议检查原件是否清晰。</p>}
                {auditedFacts.length>0&&!isExpanded&&needsAttention.length===0&&<p className="text-xs text-slate-600">此附件暂未发现结构性问题或同字段冲突。已保存来源候选，原件真实性尚未认证。</p>}
                {visibleFacts.map((entry)=>{
                  const {fact,status,issues,index}=entry;
                  const comparison=compareEvidenceFact(resume,fact);
                  const adopted=isMasterFactAdopted(resume,item.id,fact,index);
                  const target=resolveMasterAdoptionTarget(resume,fact,item.id,index);
                  const compositeGpa=Boolean(target?.field==='gpa' && /(?:加权|均分)/.test(target.currentValue) && !/(?:加权|均分)/.test(fact.value));
                  const canAdopt=Boolean(target && !compositeGpa && issues.every((issue)=>issue==='与当前简历的对应字段存在差异'));
                  return <div key={entry.key+index} className={'rounded-xl border px-3 py-2.5 text-xs space-y-1 '+(status==='attention'?'bg-amber-50/60 border-amber-200':'bg-white/80 border-slate-200')}>
                    <div className="flex flex-wrap justify-between gap-2 items-center">
                      <strong className="text-slate-800">{fact.label}</strong>
                      <span className={'px-2 py-0.5 rounded-lg text-[11px] '+(status==='attention'?'bg-amber-100 text-amber-800':status==='consistent'?'bg-blue-50 text-blue-700':'bg-slate-100 text-slate-700')}>
                        {status==='attention'?'需要核对':status==='consistent'?'多材料一致':'已自动归档'}
                      </span>
                    </div>
                    {fact.scope&&<p className="text-slate-500">所属：{fact.scope}</p>}
                    <p className="text-slate-900">附件提取：<span className="font-semibold select-text">{fact.value}</span></p>
                    {comparison.current&&<p className="text-slate-700">当前简历：{comparison.current}</p>}
                    <p className="text-slate-500 select-text break-words">来源摘录：“{fact.quote}”</p>
                    {status==='consistent'&&<p className="text-blue-700">有 {entry.consistentSourceCount} 份不同字节的材料显示一致，不代表独立机构认证。</p>}
                    {issues.map((reason,i)=><p key={i} className="text-amber-800">异常：{reason}</p>)}
                    {adopted
                      ? <span className="text-xs font-semibold text-blue-700">已采用到当前简历 · 已记录来源</span>
                      : canAdopt
                        ? <button type="button" disabled={Boolean(busy)} onClick={()=>adoptFact(item,index)} className="text-xs font-semibold text-[#0071e3] hover:underline disabled:opacity-50">核对并采用到当前版本</button>
                        : <span className="text-[11px] text-slate-500">{compositeGpa?'GPA 字段包含多种成绩口径，需在编辑器手动拆分':'无法安全定位或存在资料冲突，请人工处理'}</span>}
                    <button type="button" onClick={()=>navigator.clipboard.writeText(fact.value).then(()=>setInfo('已复制候选事实，可到简历编辑器核实后使用。')).catch(()=>setError('复制失败，请手动选择文字。'))} className="text-xs text-[#0071e3] hover:underline">复制候选信息</button>
                  </div>;
                })}
                {item.review.notes.map((note,i)=><p key={i} className="text-xs text-amber-800">识别备注：{note}</p>)}
              </div>}
            </article>;
          })}
          <p className="text-[11px] text-slate-500 leading-relaxed">共享母版在所有简历版本中可查看；采用操作仅改变当前版本。附件原件与完整 OCR 不随 JSON/PDF 导出，已明确采用的字段值和来源 ID 会随当前版本保存。清理浏览器数据可能丢失原件；AI 识别不等于官方真实性认证。</p>
        </div>
        <footer className="px-5 sm:px-6 py-3 border-t border-slate-900/[0.06] flex justify-end">
          <button type="button" onClick={close} className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 text-slate-800">{busy?'结束查看（取消等待）':'完成，返回简历'}</button>
        </footer>
      </section>
    </div>
  );
};
