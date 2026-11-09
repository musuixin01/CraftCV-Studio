import React,{useEffect,useMemo,useState} from 'react';
import {CheckCircle2,ChevronLeft,FilePlus2,Loader2,Sparkles,X} from 'lucide-react';
import type {ResumeDocument} from '../types/resume';
import {listMasterContent,type MasterContentEntry} from '../utils/masterContentStore';
import {listMasterDocuments,type MasterSourceDocument} from '../utils/masterDocumentImportStore';
import {composeResumeFromMaster,isDemoIdentity,rankMasterContent} from '../utils/masterContentDraft';
import {masterRoleFields,rankMasterRoleFields,MAX_ROLE_MASTER_FIELDS,
  type MasterRoleField,type MasterRoleFieldKind} from '../utils/masterRoleFields';
import {ResumePreview} from './ResumePreview';
import {FullResumeCompare} from './FullResumeCompare';
import {aiFetch,selectedAIModelId,saveSelectedAIModelId} from '../utils/aiModelClient';
import {collectOnePageTextFields,getOnePageWritingWarnings} from '../utils/onePageAI';
import {validateRoleAIRequest,filterRoleAISuggestions,previewRoleAIChanges,
  type RoleResumeAISuggestion} from '../utils/roleResumeAI';

interface MasterComposeDialogProps {
  open:boolean;resume:ResumeDocument;onClose:()=>void;
  onCreate:(draft:ResumeDocument,role:string,jd:string,
    selected:MasterContentEntry[],structuredCount?:number,aiChanges?:number)=>boolean;
}
interface PreparedDraft {
  draft:ResumeDocument;
  selected:MasterContentEntry[];
  fields:MasterRoleField[];
  role:string;
  jd:string;
}
const FIELD_GROUPS:{kind:MasterRoleFieldKind;name:string;note:string}[]=[
  {kind:'education',name:'教育背景',note:'选中后替换新版本的教育模块'},
  {kind:'skills',name:'专业技能',note:'选中后替换新版本的技能模块，不根据 JD 自动补技能'},
  {kind:'awards',name:'奖项和证书',note:'选中后替换新版本的奖项模块'},
];

export const MasterComposeDialog:React.FC<MasterComposeDialogProps>=({
  open,resume,onClose,onCreate,
})=>{
  const [library,setLibrary]=useState<MasterContentEntry[]>([]);
  const [sources,setSources]=useState<MasterSourceDocument[]>([]);
  const [role,setRole]=useState('');
  const [jd,setJd]=useState('');
  const [checked,setChecked]=useState<string[]>([]);
  const [fieldsChecked,setFieldsChecked]=useState<string[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [draftSnapshot,setDraftSnapshot]=useState('');
  const [prepared,setPrepared]=useState<PreparedDraft|null>(null);
  const [showOriginal,setShowOriginal]=useState(false);
  const [aiReview,setAIReview]=useState(false);
  const [aiSuggestions,setAISuggestions]=useState<RoleResumeAISuggestion[]>([]);
  const [aiAccepted,setAIAccepted]=useState<string[]>([]);
  const [aiNotes,setAINotes]=useState('');
  const [aiRejected,setAIRejected]=useState(0);
  const [aiModelName,setAIModelName]=useState('');
  const aiChosen=aiSuggestions.filter((x)=>aiAccepted.includes(x.id));
  const aiSourceFields=useMemo(()=>prepared?
    new Map(collectOnePageTextFields(prepared.draft).map((field)=>[field.id,field])):
    new Map<string,ReturnType<typeof collectOnePageTextFields>[number]>(),[prepared]);


  useEffect(()=>{
    if(!open)return;
    let live=true;
    setLibrary([]);setSources([]);setChecked([]);setFieldsChecked([]);
    setError('');setPrepared(null);setAIReview(false);setAISuggestions([]);setAIAccepted([]);setBusy(true);
    setRole(resume.basics.title);setJd('');setDraftSnapshot(JSON.stringify(resume));
    Promise.all([listMasterContent(),listMasterDocuments()])
      .then(([entries,docs])=>{if(live){setLibrary(entries);setSources(docs);}})
      .catch((e)=>{if(live)setError(e instanceof Error?e.message:'无法读取母版内容库');})
      .finally(()=>{if(live)setBusy(false);});
    return ()=>{live=false;};
  },[open]);

  const ranked=useMemo(()=>rankMasterContent(library,role+' '+jd),[library,role,jd]);
  const fieldCatalog=useMemo(()=>masterRoleFields(sources),[sources]);
  const rankedFields=useMemo(()=>rankMasterRoleFields(fieldCatalog,role+' '+jd),[fieldCatalog,role,jd]);
  const hasDemoResume=isDemoIdentity(resume);
  const selectedCount=checked.length+fieldsChecked.length;
  const modify=()=>{setPrepared(null);setError('');};
  const propose=()=>{
    modify();
    const relevant=ranked.filter((row)=>row.score>0);
    const projects=relevant.filter((row)=>row.entry.kind==='project').slice(0,4);
    const experiences=relevant.filter((row)=>row.entry.kind==='experience').slice(0,2);
    setChecked([...projects,...experiences].map((row)=>row.entry.id));
    setFieldsChecked([
      ...rankedFields.filter((row)=>row.score>0&&row.field.kind==='skills').slice(0,6),
      ...rankedFields.filter((row)=>row.score>0&&row.field.kind==='education').slice(0,2),
      ...rankedFields.filter((row)=>row.score>0&&row.field.kind==='awards').slice(0,2),
    ].map((row)=>row.field.key));
  };
  const toggleContent=(id:string)=>{
    modify();
    setChecked((before)=>before.includes(id)?before.filter((item)=>item!==id):
      before.length>=14?before:[...before,id]);
  };
  const toggleField=(key:string)=>{
    modify();
    setFieldsChecked((before)=>before.includes(key)?before.filter((item)=>item!==key):
      before.length>=MAX_ROLE_MASTER_FIELDS?before:[...before,key]);
  };
  function assertSourceFresh<T extends {id:string}>(older:T[],newer:T[],ids:string[],errorText:string):void{
    for(const id of ids){
      const oldRow=older.find((row)=>row.id===id);
      const newRow=newer.find((row)=>row.id===id);
      if(!oldRow||!newRow||JSON.stringify(oldRow)!==JSON.stringify(newRow))
        throw new Error(errorText);
    }
  }
  const prepare=async()=>{
    if(busy||!selectedCount||hasDemoResume)return;
    setError('');
    if(draftSnapshot!==JSON.stringify(resume)){
      setError('当前简历内容已变化，请关闭并重新打开生成窗口。');return;
    }
    setBusy(true);
    try{
      const [latest,latestSources]=await Promise.all([listMasterContent(),listMasterDocuments()]);
      assertSourceFresh(library,latest,checked,'所选项目或工作经历发生变化，请关闭后重新选择。');
      const freshFields=masterRoleFields(latestSources);
      const selectedFieldRows=fieldsChecked.map((key)=>{
        const old=fieldCatalog.find((field)=>field.key===key);
        const next=freshFields.find((field)=>field.key===key);
        if(!old||!next||JSON.stringify(old.data)!==JSON.stringify(next.data))
          throw new Error('所选教育、技能或奖项已被修改，请关闭生成器并重新选择。');
        return next;
      });
      const selected=latest.filter((row)=>checked.includes(row.id));
      const draft=composeResumeFromMaster(resume,latest,{
        role,selectedIds:checked,selectedFieldIds:fieldsChecked,
        structuredSources:latestSources,
      });
      setPrepared({draft,role:role.trim(),jd:jd.trim(),selected,fields:selectedFieldRows});
      setAIReview(false);setAISuggestions([]);setAIAccepted([]);
      setShowOriginal(false);
    }catch(e){setError(e instanceof Error?e.message:'无法预览当前岗位版本');}
    finally{setBusy(false);}
  };

  const writeWithAI=async()=>{
    if(!prepared||busy||hasDemoResume)return;
    setError('');
    try{
      // Never truncate a "full-document" request without telling the user.
      // All eligible prose fields must fit the bounded privacy contract.
      const fields=collectOnePageTextFields(prepared.draft);
      const payload=validateRoleAIRequest({
        targetRole:prepared.role,jobDescription:prepared.jd,fields,
      });
      setBusy(true);
      const catalogRes=await aiFetch('/api/ai/models',{cache:'no-store'});
      if(!catalogRes.ok)throw new Error('当前模型列表不可用，仍可创建本地岗位稿。');
      const catalog=await catalogRes.json() as {
        models?:Array<{id:string;name:string;local:boolean}>;
        defaultId?:string|null;
      };
      const models=catalog.models??[];
      if(!models.length)throw new Error('尚未配置 AI 模型，当前可直接生成本地岗位稿。');
      const saved=selectedAIModelId();
      const model=models.find((item)=>item.id===saved)||
        models.find((item)=>item.id===catalog.defaultId)||models[0];
      if(saved!==model.id)saveSelectedAIModelId(model.id);
      const notice='本次将向「'+model.name+'」发送 '+payload.fields.length+
        ' 段已选岗位稿中的描述文字及目标岗位/JD；不发送姓名、联系方式、学校等结构化身份字段或原 Word/PDF 文件。自由描述和 JD 中如包含个人、单位或学校信息，仍可能被模型读取。'+
        (model.local?'模型标记为本机运行。':'该模型可能由云服务处理文本、产生 API 费用。')+
        '\n模型只返回修改建议，你需要审阅后才能生成新版本。确认调用？';
      if(!window.confirm(notice))return;
      const response=await aiFetch('/api/ai/draft-role-resume',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify(payload),
        signal:AbortSignal.timeout(90000),
      });
      const data=await response.json() as {
        suggestions?:unknown;notes?:unknown;rejectedCount?:unknown;error?:string;
      };
      if(!response.ok)throw new Error(data.error||'AI 专业改写失败，原稿未改变。');
      const checked=filterRoleAISuggestions(payload.fields,data.suggestions);
      if(!checked.suggestions.length)
        throw new Error('未发现通过事实校验的改写候选，可直接使用本地稿。');
      setAISuggestions(checked.suggestions);
      setAIAccepted(checked.suggestions.filter((item)=>{
        const original=payload.fields.find((field)=>field.id===item.id)!;
        return getOnePageWritingWarnings(original.original,item.proposed).length===0;
      }).map((item)=>item.id));
      setAINotes(typeof data.notes==='string'?data.notes.slice(0,500):'');
      setAIRejected((typeof data.rejectedCount==='number'?data.rejectedCount:0)+checked.rejectedCount);
      setAIModelName(model.name);
      setAIReview(true);
    }catch(e){
      setError(e instanceof Error?e.message:'AI 请求失败，原候选稿保持不变。');
    }finally{setBusy(false);}
  };
  const finish=async()=>{
    if(!prepared||busy)return;
    if(draftSnapshot!==JSON.stringify(resume)){
      setError('基础简历已变更，请重新打开生成器。');setPrepared(null);return;
    }
    setBusy(true);setError('');
    try{
      const [latest,latestSources]=await Promise.all([listMasterContent(),listMasterDocuments()]);
      assertSourceFresh(prepared.selected,latest,prepared.selected.map((row)=>row.id),
        '母版项目/工作经历在预览后发生变化，必须重新预览。');
      const freshFields=masterRoleFields(latestSources);
      for(const row of prepared.fields){
        const current=freshFields.find((item)=>item.key===row.key);
        if(!current||JSON.stringify(current.data)!==JSON.stringify(row.data))
          throw new Error('教育/技能/奖项已在预览后变化，必须重新预览。');
      }
      const chosen=aiReview?aiChosen:[];
      const finalDraft=chosen.length?previewRoleAIChanges(prepared.draft,chosen):prepared.draft;
      const created=onCreate(finalDraft,prepared.role,prepared.jd,prepared.selected,
        prepared.fields.length,chosen.length);
      if(!created)throw new Error('新版本未保存，请检查本地存储空间。');
      onClose();
    }catch(e){setError(e instanceof Error?e.message:'创建版本失败');}
    finally{setBusy(false);}
  };
  if(!open)return null;
  return <div className="fixed inset-0 z-[85] bg-slate-950/45 backdrop-blur-[5px] flex items-center justify-center p-3" role="presentation">
    <section role="dialog" aria-modal="true" aria-label="从母版生成岗位简历"
      className={'os26-floating-dock max-h-[94vh] w-full flex flex-col overflow-hidden rounded-2xl shadow-2xl '+(prepared?'max-w-6xl':'max-w-2xl')}>
      <header className="px-5 py-4 border-b border-slate-200 flex justify-between items-start gap-4">
        <div>
          <h2 className="font-semibold text-slate-900 flex gap-2 items-center text-sm">
            <FilePlus2 className="w-4 h-4 text-[#0071e3]"/>
            {prepared?(aiReview?'AI 专业改写 · 全文对比审阅':'预览待创建的岗位版本'):'从母版生成岗位简历'}
          </h2>
          <p className="text-xs text-slate-600 mt-1">
            {prepared?'只读预览；确认后才新增岗位版本，原稿和内容库不会被覆盖。':
              '从已提取保存的内容库选择真实经历、教育、技能和奖项，先预览再创建独立版本。'}
          </p>
        </div>
        <button type="button" aria-label="关闭生成简历" disabled={busy} onClick={onClose}
          className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4"/></button>
      </header>
      <div className="overflow-auto flex-1 min-h-0 p-5 space-y-4">
        {error&&<p role="alert" className="text-xs text-red-800 bg-red-50 p-3 rounded-lg">{error}</p>}
        {prepared?<>
          {aiReview?<>
            <div className="rounded-xl bg-slate-50/75 border border-slate-200 p-3 flex flex-wrap justify-between gap-3 items-center">
              <div>
                <strong className="text-xs text-slate-900">已收到 {aiSuggestions.length} 条通过事实规则的建议</strong>
                <p className="text-[11px] text-slate-600 mt-1">模型：{aiModelName} · 默认采用 {aiAccepted.length} 条 · 拦截 {aiRejected} 条异常建议</p>
                {aiNotes&&<p className="text-xs text-slate-700 mt-2">{aiNotes}</p>}
              </div>
              <button type="button" onClick={()=>setAIAccepted(
                aiSuggestions.filter((x)=>{
                  const original=aiSourceFields.get(x.id)?.original??'';
                  return !getOnePageWritingWarnings(original,x.proposed).length;
                }).map((x)=>x.id)
              )} className="text-xs text-blue-700 font-semibold">只选择低风险建议</button>
            </div>
            <div className="h-[58vh] min-h-[360px] flex flex-col">
              <FullResumeCompare original={prepared.draft} selected={aiChosen}/>
            </div>
            <section className="rounded-xl border border-slate-200 bg-white p-3">
              <h3 className="text-xs font-semibold text-slate-900">逐项审阅 AI 改写 · {aiAccepted.length}/{aiSuggestions.length} 已选</h3>
              <p className="text-[11px] text-slate-600 mt-1">勾选立即更新右侧完整 A4。未经选择的修改不会进入新岗位版本；内容真实性仍需本人核对。</p>
              <div className="space-y-2 mt-3 max-h-[34vh] overflow-y-auto">
                {aiSuggestions.map((item)=>{
                  const original=aiSourceFields.get(item.id);
                  const warnings=getOnePageWritingWarnings(original?.original??'',item.proposed);
                  const enabled=aiAccepted.includes(item.id);
                  return <label key={item.id} className={'block border rounded-xl p-3 cursor-pointer '+(enabled?'border-blue-300 bg-blue-50/25':'border-slate-200')}>
                    <div className="flex gap-2 items-start">
                      <input type="checkbox" className="mt-0.5 accent-[#0071e3]" checked={enabled} disabled={busy}
                        onChange={()=>setAIAccepted((before)=>enabled?before.filter((id)=>id!==item.id):[...before,item.id])}/>
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <p className="text-xs font-semibold text-slate-900">{original?.label||item.id}</p>
                        <p className="text-[11px] text-slate-500">原文：{original?.original}</p>
                        <p className="text-xs text-slate-900">拟改写：{item.proposed}</p>
                        <p className="text-[11px] text-blue-800">理由：{item.reason}</p>
                        <p className="text-[11px] text-slate-600">原文依据：「{item.evidenceQuote}」</p>
                        {warnings.map((warn,index)=><p key={index} className="text-[11px] text-amber-800">需人工核对：{warn}</p>)}
                      </div>
                    </div>
                  </label>;
                })}
              </div>
            </section>
          </>:<>
            <div className="flex items-center justify-between flex-wrap gap-2 rounded-xl border border-blue-100 bg-blue-50/40 p-3">
              <div className="space-y-1">
                <strong className="text-xs text-slate-900">{prepared.role}</strong>
                <p className="text-xs text-slate-600">已选择 {prepared.selected.length} 条项目/工作经历、{prepared.fields.length} 条教育/技能/奖项</p>
              </div>
              <button type="button" className="text-xs font-semibold text-[#0071e3]" onClick={()=>setShowOriginal((v)=>!v)}>
                {showOriginal?'显示岗位候选稿':'对照当前原始版本'}
              </button>
            </div>
            <p className="text-xs text-slate-600">以下是完整 A4 只读预览；尚未保存。可以直接创建，或主动调用 AI 获得跨模块文字改写建议。</p>
            <div className="h-[57vh] overflow-auto bg-slate-100 border border-slate-200 rounded-xl p-4">
              <div className="mx-auto w-[794px] max-w-none origin-top-left">
                <ResumePreview previewId="master-compose-readonly" resume={showOriginal?resume:prepared.draft}/>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 items-center justify-between border-t border-slate-200 pt-3">
              <div className="max-w-xl">
                <p className="text-xs font-semibold text-slate-800">AI 整份专业润色（可选）</p>
                <p className="text-[11px] text-slate-600 mt-1">只发送适合改写的描述字段及 JD，不主动发送姓名、学校或联系方式等结构化字段和原文件；自由描述中的其他个人信息仍可能被模型读取，云端模型可能收费。不强制压缩到一页。</p>
              </div>
              <button type="button" disabled={busy} onClick={()=>aiSuggestions.length?setAIReview(true):void writeWithAI()}
                className="px-3 py-2 border border-blue-300 text-[#0071e3] text-xs font-semibold rounded-xl flex gap-1.5 items-center disabled:opacity-40">
                {busy?<Loader2 size={14} className="animate-spin"/>:<Sparkles size={14}/>}
                {aiSuggestions.length?'继续审阅 AI 建议':'用 AI 专业改写'}
              </button>
            </div>
          </>}
        </>:<>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-700 block">目标岗位</label>
            <input value={role} maxLength={120} onChange={(e)=>{modify();setRole(e.target.value);}}
              className="os26-input px-3 py-2 text-xs w-full" placeholder="如：嵌入式软件工程师"/>
            <label className="text-xs font-semibold text-slate-700 block">岗位要求 JD（选填，用于本地推荐素材）</label>
            <textarea value={jd} maxLength={8000} onChange={(e)=>{modify();setJd(e.target.value);}}
              className="os26-input p-3 text-xs w-full" rows={3}
              placeholder="粘贴岗位职责和任职要求；也可手动选择内容库中的真实素材。"/>
          </div>
          {hasDemoResume&&<p role="alert" className="text-xs text-amber-800 bg-amber-50 px-3 py-2 rounded-lg">
            当前简历含演示数据。请先导入真实简历或切换到真实版本。
          </p>}
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-slate-800">可复用项目/工作 {library.length} 条 · 教育/技能/奖项 {fieldCatalog.length} 条</p>
            <button type="button" disabled={busy||(!ranked.some((x)=>x.score>0)&&!rankedFields.some((x)=>x.score>0))}
              onClick={propose} className="text-xs text-[#0071e3] font-semibold flex gap-1 items-center disabled:opacity-40">
              <Sparkles className="w-3.5 h-3.5"/>按岗位推荐
            </button>
          </div>
          {!busy&&!library.length&&!fieldCatalog.length&&<p className="text-xs text-slate-600 border border-dashed rounded-lg p-4">
            内容库尚无可用结构化素材。可以在「母版资料」中收录真实项目/经历，或对已添加的 Word/PDF 点击「一键提取」并保存。
          </p>}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-900">项目与工作经历（最多 14 条）</h3>
            <div className="space-y-2 max-h-[28vh] overflow-auto">
              {ranked.map(({entry,score,matched})=>{
                const active=checked.includes(entry.id);
                return <label key={entry.id} className={'flex gap-3 border rounded-xl p-3 cursor-pointer '+(active?'border-[#0071e3]/55 bg-blue-50/40':'border-slate-200 bg-white/75')}>
                  <input type="checkbox" checked={active} disabled={busy} className="mt-1 accent-[#0071e3]"
                    onChange={()=>toggleContent(entry.id)}/>
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-xs font-semibold text-slate-900">{entry.title}
                      <span className="text-slate-500 font-normal"> · {entry.kind==='project'?'项目':'工作/实习'}</span></p>
                    <p className="text-[11px] text-slate-500">来源：{entry.originVersion}</p>
                    <p className="text-[11px] text-slate-600 line-clamp-2">
                      {(entry.kind==='project'?entry.data.summary:entry.data.bullets.join('；')).slice(0,185)}
                    </p>
                    <p className="text-[11px] text-[#0071e3]">{score>0?'关联：'+matched.slice(0,5).join('、'):'暂无 JD 术语匹配，可手动选择'}</p>
                  </div>
                  {active&&<CheckCircle2 className="w-4 h-4 shrink-0 text-[#0071e3]"/>}
                </label>;
              })}
            </div>
          </section>
          {FIELD_GROUPS.map(({kind,name,note})=>{
            const items=rankedFields.filter((row)=>row.field.kind===kind);
            if(!items.length)return null;
            return <section key={kind} className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-xs font-semibold text-slate-900">{name} · {items.length} 条</h3>
                <p className="text-[11px] text-slate-500">{note}</p>
              </div>
              <div className="space-y-2 max-h-56 overflow-auto">
                {items.map(({field,score,matched})=>{
                  const active=fieldsChecked.includes(field.key);
                  return <label key={field.key} className={'flex gap-2.5 cursor-pointer rounded-lg p-3 border '+(active?'border-[#0071e3]/50 bg-blue-50/40':'border-slate-200 bg-white/75')}>
                    <input type="checkbox" checked={active} disabled={busy} onChange={()=>toggleField(field.key)}
                      className="mt-1 accent-[#0071e3]"/>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-900">{field.title}</p>
                      <p className="text-[11px] text-slate-600 line-clamp-2 mt-1">{field.description}</p>
                      <p className="text-[11px] text-slate-500 mt-1">来源：{field.sourceName} · {score>0?'匹配 '+matched.slice(0,4).join('、'):'未匹配 JD，手动选择'}</p>
                    </div>
                    {active&&<CheckCircle2 className="w-4 h-4 shrink-0 text-[#0071e3]"/>}
                  </label>;
                })}
              </div>
            </section>;
          })}
          <p className="text-[11px] leading-relaxed text-slate-600">
            只替换你明确选择的教育、技能或奖项模块；未选择的模块沿用当前真实简历。
            如选择项目/工作经历，会按所选内容重新组成该两类模块。JD 仅帮助排序，不能自动变成个人技能。
          </p>
        </>}
      </div>
      <footer className="px-5 py-4 border-t border-slate-200 flex items-center justify-between gap-3">
        {prepared?
          <button type="button" onClick={()=>{if(aiReview)setAIReview(false);else setPrepared(null);setError('');}} disabled={busy}
            className="text-xs text-slate-700 font-semibold flex gap-1.5 items-center">
            <ChevronLeft className="w-4 h-4"/>{aiReview?'返回本地预览':'返回选材'}
          </button>:
          <p className="text-xs text-slate-600">已选 {selectedCount} 条 · 先预览，再新建</p>}
        <button type="button" disabled={busy||hasDemoResume||(!prepared&&(!role.trim()||!selectedCount))}
          onClick={()=>{void (prepared?finish():prepare());}}
          className="bg-[#0071e3] text-white px-4 py-2.5 rounded-xl text-xs font-semibold disabled:opacity-40 flex gap-2 items-center">
          {busy&&<Loader2 className="w-4 h-4 animate-spin"/>}
          {prepared?(aiReview?'确认采用 '+aiAccepted.length+' 处并生成岗位版本':'确认生成岗位版本'):'预览待生成简历'}
        </button>
      </footer>
    </section>
  </div>;
};
