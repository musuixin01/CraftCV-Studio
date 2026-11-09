import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Check,FolderPlus,FileUp,Loader2,Pencil,Trash2} from 'lucide-react';
import type {ResumeDocument} from '../types/resume';
import {isDemoIdentity} from '../utils/masterContentDraft';
import {MasterDocumentImportModal} from './MasterDocumentImportModal';
import {addMasterRawFile,listMasterRawFiles,readMasterRawFile,deleteMasterRawFile,
  type MasterRawFileInfo} from '../utils/masterRawFiles';
import {listMasterDocuments,deleteMasterDocument,type MasterSourceDocument} from '../utils/masterDocumentImportStore';
import {deleteMasterContent,listMasterContent,masterEntryFromResume,
  saveMasterContent,type MasterContentEntry,type MasterContentKind} from '../utils/masterContentStore';

interface MasterContentPanelProps {
  resume:ResumeDocument;
}
type Candidate={kind:MasterContentKind;id:string;title:string;detail:string};
export const MasterContentPanel:React.FC<MasterContentPanelProps> = ({resume})=>{
  const [rows,setRows]=useState<MasterContentEntry[]>([]);
  const [documentSources,setDocumentSources]=useState<MasterSourceDocument[]>([]);
  const [rawFiles,setRawFiles]=useState<MasterRawFileInfo[]>([]);
  const [extractFile,setExtractFile]=useState<File|null>(null);
  const [editRecord,setEditRecord]=useState<MasterSourceDocument|null>(null);
  const fileInput=useRef<HTMLInputElement|null>(null);
  const [revision,setRevision]=useState(0);
  const [selected,setSelected]=useState<string[]>([]);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');
  const isDemoResume=isDemoIdentity(resume);
  const candidates=useMemo<Candidate[]>(()=>[
    ...resume.projects.filter((x)=>x.name.trim()).map((x)=>({
      kind:'project' as const,id:x.id,title:x.name,
      detail:(x.techStack.join(' / ')||x.role||x.summary).slice(0,150),
    })),
    ...resume.experience.filter((x)=>x.company.trim()).map((x)=>({
      kind:'experience' as const,id:x.id,title:x.company+' · '+x.position,
      detail:x.bullets.join('；').slice(0,150),
    })),
  ],[resume.projects,resume.experience]);
  const importedKeys=useMemo(()=>new Set(rows.map((x)=>
    x.kind+':'+x.originResumeId+':'+x.data.id)),[rows]);
  const available=isDemoResume?[]:candidates.filter((x)=>!importedKeys.has(x.kind+':'+resume.id+':'+x.id));
  const key=(candidate:Candidate)=>candidate.kind+':'+candidate.id;
  useEffect(()=>{
    let mounted=true;
    Promise.all([listMasterContent(),listMasterDocuments(),listMasterRawFiles()])
      .then(([items,documents,raw])=>{if(mounted){setRows(items);setDocumentSources(documents);setRawFiles(raw);}})
      .catch((e)=>{if(mounted)setError(e instanceof Error?e.message:'无法读取母版内容');});
    return ()=>{mounted=false;};
  },[revision]);
  const collect=async()=>{
    if(busy||isDemoResume||!selected.length)return;
    const chosen=available.filter((x)=>selected.includes(key(x)));
    if(!chosen.length)return;
    if(!window.confirm(
      '确认将选中的 '+chosen.length+' 条项目／实习经历收录到所有岗位版本共用的母版？\n\n'+
      '请确保这些是本人真实做过、可以在面试中解释的经历。此操作不会更改当前简历；后续可移除母版条目。'
    ))return;
    setBusy(true);setError('');setNotice('');
    let done=0;
    try{
      for(const candidate of chosen){
        const item=masterEntryFromResume(resume,candidate.kind,candidate.id);
        await saveMasterContent(item);
        done++;
      }
      setRows(await listMasterContent());
      setSelected([]);
      setNotice('已从当前版本收录 '+done+' 条项目／工作经历。其他版本可按岗位选择使用，不会被自动改写。');
    }catch(e){
      setRows(await listMasterContent().catch(()=>rows));
      setError('已收录 '+done+' 条，后续操作中止：'+(e instanceof Error?e.message:'保存失败'));
    }finally{setBusy(false);}
  };
  const remove=async(item:MasterContentEntry)=>{
    if(busy||!window.confirm('确定从共享母版移除「'+item.title+'」吗？\n不会删除已经从它生成的岗位版本，但后续检索和生成不再使用该条。'))return;
    setBusy(true);setError('');
    try{
      await deleteMasterContent(item.id);
      setRows(await listMasterContent());
      setNotice('仅从母版内容库移除了「'+item.title+'」，现有简历版本保持不变。');
    }catch(e){setError(e instanceof Error?e.message:'移除失败');}
    finally{setBusy(false);}
  };


  const addOriginals=async(files:File[]|null)=>{
    if(!files?.length||busy)return;
    setBusy(true);setError('');setNotice('');
    let added=0;
    const rejected:string[]=[];
    try{
      for(const file of files){
        try{await addMasterRawFile(file);added++;}
        catch(e){rejected.push(file.name+'：'+(e instanceof Error?e.message:'添加失败'));}
      }
      setRevision((v)=>v+1);
      if(added)setNotice('已直接保存 '+added+' 份原始 Word/PDF；未提取、未修改、未调用 AI。需要修改时再点击一键提取。');
      if(rejected.length)setError(rejected.slice(0,3).join('；')+(rejected.length>3?'等 '+rejected.length+' 份失败':''));
    }finally{setBusy(false);}
  };
  const extractOriginal=async(info:MasterRawFileInfo)=>{
    if(busy)return;
    setBusy(true);setError('');
    try{setExtractFile(await readMasterRawFile(info.id));}
    catch(e){setError(e instanceof Error?e.message:'读取文件失败');}
    finally{setBusy(false);}
  };
  const removeOriginal=async(info:MasterRawFileInfo)=>{
    if(busy||!window.confirm('确认移除本机母版中的原文件「'+info.name+'」吗？\\n已经提取的可编辑内容将保留；其他简历版本不会变化。'))return;
    setBusy(true);setError('');
    try{
      await deleteMasterRawFile(info.id);setRevision((v)=>v+1);
      setNotice('原文件已从本地母版移除；提取过的结构化内容未删除。');
    }catch(e){setError(e instanceof Error?e.message:'移除失败');}
    finally{setBusy(false);}
  };
  const removeSource=async(record:MasterSourceDocument)=>{
    if(busy||!window.confirm(
      '确认删除这一份已收录的 Word/PDF 母版来源吗？\n'+record.name+
      '\n\n将同时移除该来源直接导入的项目和工作条目，但不会修改已经创建的岗位版本或原始磁盘文件。'
    ))return;
    setBusy(true);setError('');
    try{
      await deleteMasterDocument(record.id);
      setRevision((v)=>v+1);
      setNotice('已移除这一份母版来源及其关联经历，岗位版本保持不变。');
    }catch(e){setError(e instanceof Error?e.message:'移除来源失败');}
    finally{setBusy(false);}
  };
  return <section aria-label="母版内容库" className="rounded-2xl border border-slate-200 bg-white/75 p-4 space-y-3">
    <div className="flex items-center justify-between gap-3">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-slate-900 flex gap-2 items-center">
          <FolderPlus className="w-4 h-4 text-[#0071e3]"/>可复用项目与工作经历
        </h3>
        <p className="text-[11px] leading-relaxed text-slate-600">
          与下方证据附件共用本机母版。只收录你明确选择的真实经历，供岗位生成与润色使用；不要求为每条日常职责上传第三方证明。
        </p>
      </div>
      <span className="text-xs text-slate-500 shrink-0">{rows.length} 条</span>
    </div>
    {error&&<p role="alert" className="text-xs text-red-800 bg-red-50 px-3 py-2 rounded-xl">{error}</p>}
    {notice&&<p role="status" className="text-xs text-blue-800 bg-blue-50 px-3 py-2 rounded-xl">{notice}</p>}

    <div className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/45 px-3 py-3">
      <div className="flex gap-3 items-center justify-between flex-wrap">
        <div>
          <p className="text-xs font-semibold text-slate-900">Word / PDF 原文件</p>
          <p className="text-[11px] text-slate-600 mt-1">
            添加即保存，默认不提取、不修改。使用 AI 润色或岗位诊断时按需读取相关文字；原文件不会自动发送给模型。
          </p>
        </div>
        <button type="button" disabled={busy} onClick={()=>fileInput.current?.click()}
          className="bg-[#0071e3] text-white rounded-xl px-3 py-2 text-xs font-semibold flex gap-2 items-center disabled:opacity-40">
          {busy?<Loader2 size={14} className="animate-spin"/>:<FileUp size={14}/>}添加 Word / PDF
        </button>
        <input ref={fileInput} type="file" multiple className="hidden"
          accept=".docx,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf"
          onChange={(e)=>{const fs=Array.from(e.currentTarget.files??[]);e.currentTarget.value='';void addOriginals(fs);}}/>
      </div>
      {rawFiles.length>0&&<div className="space-y-2">
        {rawFiles.map((info)=>{
          const structured=documentSources.find((record)=>record.sourceHash===info.contentHash);
          return <div key={info.id} className="rounded-lg bg-white/80 border border-slate-200 p-2.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold truncate text-slate-800" title={info.name}>{info.name}</p>
              <p className="text-[11px] text-slate-500">{info.format.toUpperCase()} · {(info.size/1024).toFixed(0)} KB · {structured?'已有可编辑内容':'原件已保存，待需要时提取'}</p>
            </div>
            <div className="shrink-0 flex items-center gap-2">
              <button type="button" disabled={busy} onClick={()=>structured?setEditRecord(structured):void extractOriginal(info)}
                className="text-[11px] text-[#0071e3] font-semibold rounded-lg hover:bg-blue-50 p-1.5 disabled:opacity-40">
                {structured?'编辑提取内容':'一键提取'}
              </button>
              <button type="button" disabled={busy} onClick={()=>removeOriginal(info)}
                aria-label={'移除原文件 '+info.name} className="text-slate-500 hover:text-red-700 p-1.5 disabled:opacity-40">
                <Trash2 size={14}/>
              </button>
            </div>
          </div>;
        })}
      </div>}
      {documentSources.length>0&&<details className="rounded-xl border border-slate-200 bg-white/70 p-3">
        <summary className="text-xs text-slate-700 font-semibold cursor-pointer">
          已保存的结构化副本（{documentSources.length}）
        </summary>
        <div className="space-y-2 mt-3">
          {documentSources.map((record)=><div key={record.id} className="flex items-center justify-between gap-3 p-2 border-t border-slate-100">
            <div className="min-w-0">
              <p className="text-xs text-slate-800 font-semibold truncate">{record.name}</p>
              <p className="text-[11px] text-slate-500">教育 {record.education.length} · 项目 {record.projects.length} · 工作 {record.experience.length} · 技能 {record.skills.length} · 奖项 {record.awards.length}</p>
            </div>
            <button type="button" onClick={()=>setEditRecord(record)} className="text-xs text-blue-700 font-semibold flex items-center gap-1">
              <Pencil size={13}/>编辑
            </button>
            <button type="button" disabled={busy} onClick={()=>removeSource(record)}
              aria-label={'移除结构化来源 '+record.name} className="text-red-700 p-2 disabled:opacity-40"><Trash2 size={13}/></button>
          </div>)}
        </div>
      </details>}
    </div>
    {(extractFile||editRecord)&&<MasterDocumentImportModal file={extractFile??undefined}
      record={editRecord??undefined}
      onClose={()=>{setExtractFile(null);setEditRecord(null);}}
      onImported={()=>{setExtractFile(null);setEditRecord(null);setRevision((v)=>v+1);
        setNotice('可编辑副本已保存到现有内容库，原始 Word/PDF 保持不变。');}}/>}

    <div className="space-y-2">
      <p className="text-xs font-semibold text-slate-700">从当前简历版本选择收录</p>
      {isDemoResume&&<p role="status" className="text-xs text-amber-800 bg-amber-50 px-3 py-2 rounded-lg">当前为演示简历，不能把演示项目收录为本人母版。请先切换或导入真实简历。</p>}
      {available.length===0&&<p className="text-xs text-slate-500">
        {candidates.length?'当前版本项目和实习都已收录；可在编辑器继续完善。':'当前版本还没有可收录的项目或实习，请先在内容编辑中添加真实经历。'}
      </p>}
      {available.map((item)=>{
        const id=key(item),checked=selected.includes(id);
        return <label key={id} className="flex gap-2.5 items-start rounded-xl border border-slate-200 p-2.5 cursor-pointer hover:bg-slate-50">
          <input type="checkbox" checked={checked} disabled={busy} onChange={()=>
            setSelected((current)=>checked?current.filter((x)=>x!==id):[...current,id])}
            className="mt-1 accent-[#0071e3]" />
          <span className="flex-1 min-w-0">
            <strong className="block text-xs text-slate-800">{item.title}</strong>
            <span className="block mt-1 text-[11px] text-slate-500 break-words">
              {item.kind==='project'?'项目':'工作／实习'} · {item.detail||'待完善描述'}
            </span>
          </span>
        </label>;
      })}
      {available.length>0&&<div className="flex flex-wrap gap-2 items-center">
        <button type="button" onClick={collect} disabled={busy||selected.length===0}
          className="rounded-lg px-3 py-2 bg-slate-900 text-white disabled:opacity-40 text-xs font-semibold flex items-center gap-2">
          {busy?<Loader2 className="w-3.5 h-3.5 animate-spin"/>:<Check className="w-3.5 h-3.5"/>}
          确认收录 {selected.length} 条
        </button>
        <span className="text-[11px] text-slate-500">不会自动覆盖其他岗位版本</span>
      </div>}
    </div>
    {rows.length>0&&<div className="border-t border-slate-200 pt-3 space-y-2">
      <p className="text-xs font-semibold text-slate-700">已保存的母版经历</p>
      <div className="max-h-52 overflow-y-auto space-y-1.5">
        {rows.map((row)=><div key={row.id} className="flex gap-2 items-center justify-between bg-slate-50/80 rounded-lg px-3 py-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-800 truncate">{row.title}</p>
            <p className="text-[11px] text-slate-500 truncate">{row.kind==='project'?'项目':'工作／实习'} · 来源：{row.originVersion} · 本人确认收录</p>
          </div>
          <button type="button" aria-label={'从母版移除 '+row.title} disabled={busy} onClick={()=>remove(row)}
            className="p-2 text-slate-500 hover:text-red-600 disabled:opacity-40">
            <Trash2 className="w-3.5 h-3.5"/>
          </button>
        </div>)}
      </div>
    </div>}
  </section>;
};
