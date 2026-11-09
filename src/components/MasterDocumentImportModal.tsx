import React,{useEffect,useMemo,useState} from 'react';
import {Check,FileText,Loader2,Plus,Trash2,X} from 'lucide-react';
import {extractLocalResumeText} from '../utils/localResumeTextExtractor';
import {parseResumeTextBlocks,type MasterDocumentCandidates} from '../utils/resumeTextStructurer';
import {saveMasterDocument,updateMasterDocument,type MasterSourceDocument,
  type MasterSelection} from '../utils/masterDocumentImportStore';

type Group='education'|'projects'|'experience'|'skills'|'awards';
const GROUPS:[Group,string][]=[
  ['education','教育经历'],['projects','项目经历'],['experience','工作／实习'],
  ['skills','专业技能'],['awards','荣誉奖项'],
];
const FIELDS:Record<Group,Array<[string,string,'input'|'textarea']>>={
  education:[['school','学校','input'],['degree','学历','input'],['major','专业','input'],
    ['startDate','起始日期','input'],['endDate','结束日期','input'],['gpa','绩点','input'],
    ['courses','课程','textarea'],['honors','荣誉','textarea']],
  projects:[['name','项目名称','input'],['role','个人角色','input'],
    ['startDate','起始日期','input'],['endDate','结束日期','input'],
    ['summary','项目概述','textarea'],['techStack','技术栈（用逗号分隔）','textarea'],
    ['bullets','项目内容（每行一条）','textarea']],
  experience:[['company','单位','input'],['position','岗位','input'],
    ['startDate','起始日期','input'],['endDate','结束日期','input'],
    ['techStack','技术栈（用逗号分隔）','textarea'],
    ['bullets','工作内容（每行一条）','textarea']],
  skills:[['category','类别','input'],['items','技能','textarea']],
  awards:[['title','奖项名称','input'],['issuer','颁发方','input'],
    ['date','获奖日期','input'],['level','等级','input'],['description','说明','textarea']],
};
type Row=MasterDocumentCandidates[Group][number];
function stringify(row:Row,key:string):string{
  const value=(row as unknown as Record<string,unknown>)[key];
  return Array.isArray(value)?value.join(key==='bullets'?'\n':'、'):String(value??'');
}
function updateRow<T extends Row>(row:T,key:string,value:string):T {
  const copy=structuredClone(row);
  (copy as unknown as Record<string,unknown>)[key]=key==='techStack'?
    value.split(/[,，、]/).map((x)=>x.trim()).filter(Boolean):
    key==='bullets'?value.split('\n').map((x)=>x.trim()).filter(Boolean):value;
  return copy;
}
function makeEmpty(group:Group):Row{
  const id='file-'+group+'-'+crypto.randomUUID();
  switch(group){
    case 'education':return {id,school:'',degree:'',major:'',startDate:'',endDate:'',
      gpa:'',ranking:'',courses:'',honors:''};
    case 'projects':return {id,name:'',role:'',startDate:'',endDate:'',repoUrl:'',
      techStack:[],summary:'',bullets:[]};
    case 'experience':return {id,company:'',position:'',department:'',location:'',
      startDate:'',endDate:'',techStack:[],bullets:[]};
    case 'skills':return {id,category:'专业技能',items:''};
    case 'awards':return {id,title:'',issuer:'',date:'',level:'',description:''};
  }
}
function fromRecord(doc:MasterSourceDocument):MasterDocumentCandidates{
  return {sourceFormat:doc.format,sourceLines:doc.sourceLines,intro:[],unclassified:[],
    warnings:doc.warnings,education:structuredClone(doc.education),
    projects:structuredClone(doc.projects),experience:structuredClone(doc.experience),
    skills:structuredClone(doc.skills),awards:structuredClone(doc.awards),summary:doc.summary};
}
function allSelection(doc:MasterDocumentCandidates):MasterSelection{
  return {education:doc.education.map((x)=>x.id),projects:doc.projects.map((x)=>x.id),
    experience:doc.experience.map((x)=>x.id),skills:doc.skills.map((x)=>x.id),
    awards:doc.awards.map((x)=>x.id),summary:!!doc.summary.trim()};
}
const emptySelection=():MasterSelection=>({education:[],projects:[],experience:[],skills:[],awards:[],summary:false});
export const MasterDocumentImportModal:React.FC<{
  file?:File;record?:MasterSourceDocument;onClose:()=>void;onImported:()=>void;
}>=({file,record,onClose,onImported})=>{
  const [draft,setDraft]=useState<MasterDocumentCandidates|null>(record?fromRecord(record):null);
  const [selected,setSelected]=useState<MasterSelection>(()=>record?allSelection(fromRecord(record)):emptySelection());
  const [busy,setBusy]=useState(!record);
  const [error,setError]=useState('');
  const [showOriginal,setShowOriginal]=useState(false);
  useEffect(()=>{
    if(record){const candidate=fromRecord(record);setDraft(candidate);setSelected(allSelection(candidate));setBusy(false);return;}
    if(!file)return;
    let cancelled=false;
    setError('');setDraft(null);setSelected(emptySelection());setBusy(true);
    extractLocalResumeText(file).then((extracted)=>{
      if(!cancelled){const candidate=parseResumeTextBlocks(extracted);setDraft(candidate);setSelected(allSelection(candidate));}
    }).catch((e)=>{
      if(!cancelled)setError(e instanceof Error?e.message:'提取文件失败；原文件仍安全保存在母版。');
    }).finally(()=>{if(!cancelled)setBusy(false);});
    return ()=>{cancelled=true;};
  },[file,record]);
  const total=useMemo(()=>draft?GROUPS.reduce((n,[key])=>n+draft[key].length,0)
    +(draft.summary.trim()?1:0):0,[draft]);
  const chosenCount=GROUPS.reduce((sum,[group])=>sum+selected[group].length,0)
    +(selected.summary&&draft?.summary.trim()?1:0);
  const edit=(group:Group,id:string,key:string,value:string)=>{
    setDraft((before)=>{
      if(!before)return before;
      const next=structuredClone(before);
      const rows=next[group] as Row[];
      const index=rows.findIndex((x)=>x.id===id);
      if(index>=0)rows[index]=updateRow(rows[index],key,value);
      return next;
    });
  };
  const remove=(group:Group,id:string)=>{
    setDraft((before)=>before?{...before,[group]:before[group].filter((x)=>x.id!==id)}:before);
    setSelected((before)=>({...before,[group]:before[group].filter((entry)=>entry!==id)}));
  };
  const add=(group:Group)=>{
    const added=makeEmpty(group);
    setDraft((before)=>before?{...before,[group]:[...before[group],added]}:before);
    setSelected((before)=>({...before,[group]:[...before[group],added.id]}));
  };
  const save=async()=>{
    if(busy||!draft||!chosenCount)return;
    const required:Record<Group,keyof Row|string>={
      education:'school',projects:'name',experience:'company',skills:'items',awards:'title',
    };
    for(const [group,label] of GROUPS){
      for(const row of (draft[group] as Row[]).filter((x)=>selected[group].includes(x.id))){
        if(!stringify(row,required[group]).trim()){
          setError(label+'存在未填写的名称/内容，请补全或移除这条记录后再保存。');
          return;
        }
      }
    }
    if(!window.confirm(
      (record?'保存对这份结构化内容的修改？':'将这份原稿中 '+total+' 条内容保存到可编辑内容区？')+
      '\n原始 Word/PDF 不会更改；既有岗位简历不会被覆盖。'
    ))return;
    setBusy(true);setError('');
    try{
      if(record)await updateMasterDocument(record, draft, selected);
      else if(file)await saveMasterDocument(draft,file,selected);
      else throw new Error('来源文件已失效。');
      onImported();
    }catch(e){setError(e instanceof Error?e.message:'保存失败，原内容未修改。');}
    finally{setBusy(false);}
  };
  return <div className="fixed inset-0 z-[160] bg-slate-950/50 backdrop-blur-sm flex justify-center items-center p-3 sm:p-5">
    <section role="dialog" aria-modal="true" aria-label="提取到可编辑内容库"
      className="os26-floating-dock bg-white w-full max-w-3xl max-h-[94vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden">
      <header className="p-4 border-b border-slate-200 flex justify-between items-start gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900"> {record?'编辑已提取的母版内容':'一键提取到内容库'}</h2>
          <p className="text-xs text-slate-600 mt-1">{record?.name||file?.name}</p>
          <p className="text-[11px] text-slate-500 mt-1">原文件只读，识别内容可以修改；保存后进入内容库，默认不会改写任何简历。</p>
        </div>
        <button type="button" onClick={onClose} disabled={busy} aria-label="关闭提取窗口" className="p-2 rounded-lg hover:bg-slate-100"><X size={16}/></button>
      </header>
      <div className="overflow-y-auto min-h-0 p-4 space-y-3">
        {busy&&<p role="status" className="flex gap-2 items-center text-xs text-blue-700"><Loader2 size={14} className="animate-spin"/>正在本地提取文字…</p>}
        {error&&<p role="alert" className="bg-red-50 text-red-800 rounded-lg p-3 text-xs">{error}</p>}
        {draft&&<>
          {draft.warnings.length>0&&<details className="rounded-xl bg-amber-50/50 border border-amber-200 p-3 text-xs">
            <summary className="font-semibold text-amber-900 cursor-pointer">{draft.warnings.length} 项读取提示（建议核对）</summary>
            {draft.warnings.map((s,i)=><p key={i} className="mt-1 text-amber-800">{s}</p>)}
          </details>}
          <p className="text-xs text-slate-600">已找到 {total} 条可编辑内容。可直接保存，也可以修改字段、补充或移除误识别内容；原 Word/PDF 不会改变。</p>
          {GROUPS.map(([group,label])=><section key={group} className="border border-slate-200 rounded-xl">
            <div className="px-3 py-2 bg-slate-50 flex justify-between items-center gap-2 rounded-t-xl">
              <strong className="text-xs text-slate-800">{label} · {draft[group].length}</strong>
              <button type="button" disabled={busy||draft[group].length>=35} onClick={()=>add(group)}
                className="text-blue-700 text-xs font-semibold flex gap-1 items-center disabled:opacity-40"><Plus size={13}/>添加一条</button>
            </div>
            {draft[group].map((row,index)=><div key={row.id} className="border-t border-slate-100 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-slate-500">第 {index+1} 条（可编辑）</p>
                <button type="button" onClick={()=>remove(group,row.id)} disabled={busy}
                  className="text-[11px] text-red-700 flex gap-1 items-center"><Trash2 size={12}/>移除此条</button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {FIELDS[group].map(([key,label,kind])=><label key={key} className={(kind==='textarea'?'sm:col-span-2 ':'')+'space-y-1'}>
                  <span className="block text-[11px] text-slate-600">{label}</span>
                  {kind==='textarea'?<textarea className="os26-input w-full p-2 text-xs" rows={key==='bullets'?3:2}
                    value={stringify(row,key)} onChange={(e)=>edit(group,row.id,key,e.target.value)}/>:
                    <input className="os26-input w-full px-2 py-1.5 text-xs"
                      value={stringify(row,key)} onChange={(e)=>edit(group,row.id,key,e.target.value)}/>}
                </label>)}
              </div>
            </div>)}
          </section>)}
          <section className="rounded-xl border border-slate-200 p-3 space-y-1">
            <label className="block text-xs font-semibold text-slate-700">个人总结</label>
            <textarea className="os26-input w-full p-2 text-xs" rows={3} value={draft.summary}
              onChange={(e)=>setDraft((d)=>d?{...d,summary:e.target.value}:d)}/>
          </section>
          <button type="button" onClick={()=>setShowOriginal((v)=>!v)} className="text-xs text-blue-700">
            {showOriginal?'收起原文':'查看原稿提取文字（供核对）'}
          </button>
          {showOriginal&&<pre className="max-h-60 overflow-auto bg-slate-50 border border-slate-200 p-3 rounded-xl whitespace-pre-wrap break-words text-[11px]">
            {draft.sourceLines.join('\n')}
          </pre>}
        </>}
      </div>
      <footer className="p-4 bg-white border-t border-slate-200 flex items-center justify-between gap-2">
        <span className="text-[11px] text-slate-500">{total} 条可编辑内容 · 原文件保持不变</span>
        <button type="button" disabled={busy||!draft||!chosenCount} onClick={save}
          className="px-4 py-2 bg-[#0071e3] text-white rounded-xl text-xs font-semibold disabled:opacity-40 flex items-center gap-1">
          {busy?<Loader2 size={14} className="animate-spin"/>:<Check size={14}/>}
          {record?'保存修改':'保存到内容库'}
        </button>
      </footer>
    </section>
  </div>;
};
