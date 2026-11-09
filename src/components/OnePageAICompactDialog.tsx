import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Check, Loader2, ShieldCheck, X } from 'lucide-react';
import type { ResumeDocument } from '../types/resume';
import { aiFetch, saveSelectedAIModelId, selectedAIModelId } from '../utils/aiModelClient';
import { compactOnePageSpacing } from '../utils/onePageResume';
import { globalSectionGapPx } from '../utils/sectionSpacing';
import { FullResumeCompare } from './FullResumeCompare';
import {
  MAX_ONEPAGE_AI_FIELDS,
  MAX_ONEPAGE_AI_TEXT_LENGTH,
  MAX_ONEPAGE_JOB_DESCRIPTION,
  applyReviewedOnePageCandidates,
  collectOnePageTextFields,
  validateOnePageJobSuggestion,
  getOnePageWritingWarnings,
  validateOnePageKeepRecommendation,
  type OnePageJobSuggestion,
  type OnePageKeepRecommendation,
  type OnePageTextField,
} from '../utils/onePageAI';

interface Props {
  resume: ResumeDocument;
  onClose: () => void;
  onApply: (updated: ResumeDocument, count: number) => void;
  onApplySpacing: () => void;
}

type State = 'checking' | 'generating' | 'ready' | 'unavailable' | 'error';
type DraftResponse = {
  suggestions?: OnePageJobSuggestion[];
  keep?: OnePageKeepRecommendation[];
  basis?: 'role-only' | 'specific-jd';
  notes?: string;
  rejectedCount?: number;
  checkedFields?: number;
  error?: string;
};

export const OnePageAICompactDialog: React.FC<Props> = ({
  resume, onClose, onApply, onApplySpacing,
}) => {
  const [state, setState] = useState<State>('checking');
  const [error, setError] = useState('');
  const [notes, setNotes] = useState('');
  const [rejectedCount, setRejectedCount] = useState(0);
  const [candidates, setCandidates] = useState<OnePageJobSuggestion[]>([]);
  const [keep, setKeep] = useState<OnePageKeepRecommendation[]>([]);
  const [basis, setBasis] = useState<'role-only' | 'specific-jd'>('role-only');
  const [targetRole, setTargetRole] = useState(resume.basics.title?.trim() || '校招技术岗位');
  const [jobDescription, setJobDescription] = useState('');
  const [runVersion, setRunVersion] = useState(0);
  const [accepted, setAccepted] = useState<string[]>([]);
  const lastAnalyzed = useRef({ role: '', jd: '' });
  const [isLocal, setIsLocal] = useState(false);
  const [hasConfiguredModel, setHasConfiguredModel] = useState(false);
  const initialResumeRef = useRef(JSON.stringify(resume));
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const allFields = useMemo(() => collectOnePageTextFields(resume), [resume]);
  const fields = useMemo(() => {
    let total = 0;
    const ordered = [...allFields].sort((a, b) => b.original.length - a.original.length);
    return ordered.filter((field, i) => {
      if (i >= MAX_ONEPAGE_AI_FIELDS || total + field.original.length > MAX_ONEPAGE_AI_TEXT_LENGTH) return false;
      total += field.original.length;
      return true;
    });
  }, [allFields]);
  const fieldLookup = useMemo(() => new Map(fields.map((field) => [field.id, field])), [fields]);
  const selected = candidates.filter((item) => accepted.includes(item.id));
  const sourceChanged = JSON.stringify(resume) !== initialResumeRef.current;
  const criteriaChanged = state === 'ready' && (
    targetRole.trim() !== lastAnalyzed.current.role ||
    jobDescription.trim() !== lastAnalyzed.current.jd
  );
  const proposedSpacing = compactOnePageSpacing(resume.style);
  const hasSpacingChanges = JSON.stringify(proposedSpacing) !== JSON.stringify(resume.style);
  const savedCharacters = selected.reduce((sum, item) => sum +
    ((fieldLookup.get(item.id)?.original.length ?? 0) - item.proposed.length), 0);
  const reviewNeededCount = candidates.filter((item) => {
    const original = fieldLookup.get(item.id)?.original;
    return original && getOnePageWritingWarnings(original, item.proposed).length > 0;
  }).length;

  useEffect(() => {
    closeRef.current?.focus();
    const controller = new AbortController();
    const run = async () => {
      try {
        setState('checking');
        setError('');
        const currentRole = targetRole.trim() || '校招技术岗位';
        const currentJD = jobDescription.trim();
        if (currentJD.length > MAX_ONEPAGE_JOB_DESCRIPTION) {
          throw new Error('岗位要求最长 3000 字，请保留岗位职责和任职要求。');
        }
        const catalogRes = await aiFetch('/api/ai/models', { cache: 'no-store', signal: controller.signal });
        if (!catalogRes.ok) throw new Error('无法检查当前 AI 模型配置');
        const catalog = await catalogRes.json() as {
          models?: Array<{ id: string; local: boolean }>;
          defaultId?: string | null;
        };
        const configured = catalog.models ?? [];
        setHasConfiguredModel(configured.length > 0);
        if (!configured.length) {
          setState('unavailable');
          return;
        }
        if (!fields.length) {
          setError('当前没有足够长的可安全精简描述，可以先尝试压缩排版间距。');
          setState('unavailable');
          return;
        }
        const savedId = selectedAIModelId();
        const selectedId = configured.some((model) => model.id === savedId)
          ? savedId : (catalog.defaultId || configured[0].id);
        if (savedId !== selectedId) saveSelectedAIModelId(selectedId);
        setIsLocal(configured.some((m) => m.id === selectedId && m.local));
        setState('generating');
        const res = await aiFetch('/api/ai/condense-one-page', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            targetRole: currentRole,
            jobDescription: currentJD,
            fields,
          }),
        });
        const data = await res.json() as DraftResponse;
        if (!res.ok) {
          if (res.status === 409) {
            setState('unavailable');
            return;
          }
          throw new Error(data.error || 'AI 精简请求失败');
        }
        const valid = (data.suggestions ?? []).filter((suggestion) => {
          const source = fieldLookup.get(suggestion.id);
          return !!source && validateOnePageJobSuggestion(source, suggestion, currentJD).length === 0;
        });
        const retained = (data.keep ?? []).filter((item) => {
          const source = fieldLookup.get(item.id);
          return !!source && validateOnePageKeepRecommendation(source, item).length === 0;
        });
        const rank = { high: 0, medium: 1, low: 2 };
        setCandidates([...valid].sort((a, b) => rank[a.relevance] - rank[b.relevance]));
        setKeep(retained);
        setBasis(currentJD ? 'specific-jd' : 'role-only');
        lastAnalyzed.current = { role: currentRole, jd: currentJD };
        // Default to all structurally validated candidates; optional detail
        // view lets users exclude any that need further human review.
        // Favor a one-click experience for ordinary polish. When the wording
        // changes scope or omits a pending milestone, show it for optional
        // review instead of silently applying or categorically rejecting it.
        setAccepted(valid.filter((suggestion) => {
          const original = fieldLookup.get(suggestion.id)?.original;
          return original && getOnePageWritingWarnings(original, suggestion.proposed).length === 0;
        }).map((suggestion) => suggestion.id));
        setRejectedCount((data.rejectedCount ?? 0) + (data.suggestions?.length ?? 0) - valid.length);
        setNotes(data.notes ?? '');
        setState('ready');
      } catch (e: unknown) {
        if (controller.signal.aborted) return;
        setError(e instanceof Error ? e.message : 'AI 服务暂时不可用');
        setState('error');
      }
    };
    void run();
    return () => controller.abort();
    // New analysis happens only when opened or the user explicitly asks to
    // re-analyze; changing JD alone must not silently incur model charges.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runVersion]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && state !== 'generating') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, state]);

  const apply = () => {
    if (!selected.length || sourceChanged || criteriaChanged) {
      setError('无候选内容，或原简历已变化。关闭后重新生成，避免覆盖新修改。');
      return;
    }
    try {
      const updated = applyReviewedOnePageCandidates(resume, selected);
      if (JSON.stringify(resume) !== initialResumeRef.current || criteriaChanged) {
        setError('简历已变化，请先重新生成精简候选。');
        return;
      }
      // The primary "确认精简" button is the user's explicit approval.
      // Do not ask for a redundant second confirmation dialog.
      onApply(updated, selected.length);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '精简候选校验失败');
    }
  };
  const confirmSpacing = () => {
    if (sourceChanged || !hasSpacingChanges) return;
    const before = globalSectionGapPx(resume.style);
    const after = globalSectionGapPx(proposedSpacing);
    if (!window.confirm(`确定压缩排版间距吗？全局模块间距 ${before}px → ${after}px，行距及页边距改为紧凑；字号、正文、个人信息及各模块独立间距不变。可撤销，最终是否一页仍需导出检查。`)) return;
    onApplySpacing();
    onClose();
  };
  const openModelHelp = () => {
    onClose();
    window.dispatchEvent(new Event('craftcv-open-ai-model-settings'));
  };

  return (
    <div className="no-print fixed inset-0 z-[90] bg-slate-950/45 backdrop-blur-[6px] flex items-center justify-center p-2">
      <section role="dialog" aria-modal="true" aria-labelledby="onepage-ai-title"
        className={'bg-white rounded-xl shadow-2xl w-full flex flex-col overflow-hidden ' +
          (state === 'ready' ? 'max-w-[1900px] h-[calc(100dvh-16px)]' : 'max-w-[790px] max-h-[96vh]')}>
        <header className={'flex items-center justify-between gap-3 border-b border-slate-100 shrink-0 ' +
          (state === 'ready' ? 'px-4 py-2.5' : 'p-5')}>
          <div>
            <h2 id="onepage-ai-title" className="text-[16px] font-bold text-slate-950 flex items-center gap-2">
              <Bot className="w-5 h-5 text-[#0071e3]" /> 一页简历 · AI 一键精简
            </h2>
            {state !== 'ready' && <p className="text-[12px] text-slate-600 mt-1 leading-relaxed">
              仅处理可编辑的文字描述，保留姓名、联系方式、日期、成绩、技术指标和原有条目数量；应用前必须由你确认。
            </p>}
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="关闭精简面板"
            className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 shrink-0 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </header>
        <div className={state === 'ready'
          ? 'px-3 py-2 flex-1 min-h-0 overflow-y-auto lg:overflow-hidden flex flex-col gap-2'
          : 'p-5 flex-1 overflow-y-auto space-y-4'}>
          {state === 'checking' || state === 'generating' ? (
            <div role="status" className="py-16 text-center space-y-3">
              <Loader2 className="w-7 h-7 animate-spin mx-auto text-[#0071e3]" />
              <p className="text-sm font-medium text-slate-800">
                {state === 'checking' ? '正在检查已配置的 AI 模型…' : '正在生成精简草稿，尚未修改简历…'}
              </p>
            </div>
          ) : null}
          {state === 'unavailable' && (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-slate-900">{hasConfiguredModel ? '当前没有可安全精简的长描述' : '当前没有配置 AI 模型'}</p>
              <p className="text-[13px] text-slate-600 leading-relaxed">
                可以先压缩排版间距；如需 AI 润色精简，可配置模型后重新点击「AI 一键精简」。不会自动删除内容或修改简历。
              </p>
              <div className="space-y-3">
                <div className="rounded-xl border border-slate-200 px-4 py-3 space-y-2">
                  <p className="text-[13px] font-semibold text-slate-900">方案一 · 压缩间距</p>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    全局模块间距 {globalSectionGapPx(resume.style)}px → {globalSectionGapPx(proposedSpacing)}px；
                    行距、页边距切换为紧凑。字号、经历、项目要点、已单独设置的模块间距不变。
                  </p>
                  <button type="button" onClick={confirmSpacing} disabled={!hasSpacingChanges || sourceChanged}
                    className="rounded-lg px-3.5 py-2 text-xs font-semibold bg-[#0071e3] text-white disabled:opacity-50 cursor-pointer">
                    {hasSpacingChanges ? '确认压缩间距' : '间距已是紧凑设置'}
                  </button>
                  {sourceChanged && <p className="text-xs text-rose-700">简历已发生修改，请关闭后重新操作。</p>}
                </div>
                {!hasConfiguredModel && (
                  <div className="rounded-xl border border-slate-200 px-4 py-3 space-y-2">
                    <p className="text-[13px] font-semibold text-slate-900">方案二 · 配置 AI 润色精简</p>
                    <p className="text-xs text-slate-600 leading-relaxed">使用现有模型设置：在本机服务器配置 .env 中的模型和密钥，重启服务并刷新模型列表。这里不会收集或保存 API Key；配置完成后可自动生成安全精简方案，查看概况后点击「确认精简」一次应用。</p>
                    <button type="button" onClick={openModelHelp}
                      className="rounded-lg px-3.5 py-2 text-xs font-semibold border border-[#0071e3]/30 text-[#0071e3] hover:bg-blue-50 cursor-pointer">
                      查看 AI 模型配置说明
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
          {state === 'error' && (
            <div role="alert" className="rounded-lg bg-rose-50 p-4 text-[13px] text-rose-800 space-y-2">
              <p className="font-semibold">AI 生成失败，原简历未修改。</p>
              <p>{error}</p>
              <button type="button" onClick={onClose} className="text-blue-700 font-semibold underline cursor-pointer">
                关闭后调整间距或检查模型配置
              </button>
            </div>
          )}
          {state === 'ready' && (
            <>
              <div role="status" className="shrink-0 rounded-lg border border-blue-100 bg-blue-50/40 px-3 py-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
                  <strong className="text-[12px] text-slate-900">精简方案已准备好</strong>
                  <span className="text-[11px] text-slate-600">
                    {lastAnalyzed.current.role} · {candidates.length} 处建议 · 已选 {selected.length} 处 ·
                    {savedCharacters >= 0 ? ` 预计净减少 ${savedCharacters} 字` : ` 预计净增加 ${-savedCharacters} 字`}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-3 gap-y-1">
                  {rejectedCount > 0 && <span className="text-amber-800">已拦截 {rejectedCount} 处不合规建议</span>}
                  {reviewNeededCount > 0 && <span className="text-amber-800">{reviewNeededCount} 处需核对后选择</span>}
                  <span>{basis === 'specific-jd' ? '参考岗位 JD' : '按岗位方向分析'}</span>
                </div>
              </div>
              <details aria-label="逐项采纳修改" className="shrink-0 rounded-lg border border-slate-200 bg-white">
                <summary className="cursor-pointer px-3 py-1.5 text-[11px] font-semibold text-slate-700 select-none">
                  修改项 · 已选择 {selected.length}/{candidates.length} 处
                  <span className="font-normal text-slate-500 ml-2">展开后可取消单项，右侧简历会同步更新</span>
                </summary>
                <div className="flex flex-wrap gap-x-3 gap-y-2 border-t border-slate-100 px-3 py-2 max-h-[24vh] overflow-y-auto">
                  {candidates.map((item) => {
                    const source = fieldLookup.get(item.id);
                    if (!source) return null;
                    const warnings = getOnePageWritingWarnings(source.original, item.proposed);
                    return (
                      <label key={item.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-[11px] cursor-pointer max-w-full">
                        <input type="checkbox" checked={accepted.includes(item.id)}
                          aria-label={`应用修改：${source.label}`}
                          onChange={(event) => setAccepted((old) => event.target.checked
                            ? [...old, item.id] : old.filter((id) => id !== item.id))}
                          className="accent-[#0071e3] shrink-0" />
                        <span className="font-semibold text-slate-800">{source.label}</span>
                        <span className="text-slate-500">
                          {source.original.length > item.proposed.length
                            ? `减少 ${source.original.length - item.proposed.length} 字`
                            : source.original.length < item.proposed.length
                              ? `增加 ${item.proposed.length - source.original.length} 字`
                              : '改写'}
                        </span>
                        {warnings.length > 0 && <span title={warnings.join('；')} className="text-amber-800">需核对</span>}
                      </label>
                    );
                  })}
                  {candidates.length === 0 && <p className="text-xs text-slate-600">本次没有找到通过事实保护的修改，原文保持不变。</p>}
                </div>
              </details>
              <FullResumeCompare original={resume} selected={selected} />
              <details className="rounded-xl border border-slate-200 bg-slate-50/40">
                <summary className="cursor-pointer px-4 py-3 text-[12px] font-semibold text-slate-800 select-none">
                  查看岗位依据、技术证据与招聘 JD（可选）
                </summary>
                <div className="p-3 pt-0 space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2 text-xs">
                <label className="block text-slate-800 font-semibold" htmlFor="onepage-target-role">目标岗位方向</label>
                <input id="onepage-target-role" maxLength={180} value={targetRole} onChange={(event) => setTargetRole(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs" />
                <label className="block text-slate-800 font-semibold" htmlFor="onepage-job-description">招聘岗位要求 JD（可选）</label>
                <textarea id="onepage-job-description" rows={3} maxLength={MAX_ONEPAGE_JOB_DESCRIPTION} value={jobDescription}
                  placeholder="粘贴真实招聘公告中的岗位职责与任职要求；不填写则只根据岗位方向初步判断。请去掉电话、邮箱等个人信息。"
                  onChange={(event) => setJobDescription(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs leading-relaxed" />
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-slate-500">{basis === 'specific-jd' ? '本次判断参考已提供的岗位 JD 原文' : '本次仅根据岗位方向推断，不是具体企业招聘匹配结果'}</p>
                  <button type="button" disabled={!targetRole.trim() || sourceChanged}
                    onClick={() => setRunVersion((count) => count + 1)}
                    className="px-3 py-1.5 rounded-lg bg-white border border-[#0071e3]/30 text-[#0071e3] text-xs font-semibold disabled:opacity-40 cursor-pointer">
                    按当前岗位要求重新分析
                  </button>
                </div>
                <p className="text-[11px] text-slate-500">重新分析会再次调用当前 AI 模型，可能产生费用；输入 JD 前请移除联系方式等敏感信息。</p>
                {criteriaChanged && <p role="status" className="text-amber-800">岗位条件已更改，旧候选不可应用；请重新分析后确认。</p>}
              </div>
              <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-3 text-xs space-y-1">
                <p className="font-semibold text-slate-900">已分析 {fields.length} 处描述，提出 {candidates.length} 条事实校验通过的精简候选</p>
                <p className="text-slate-700">{notes || '请逐条核对，选择真正适合投递岗位的修改。'}</p>
                <p className="text-slate-500">{rejectedCount ? `另有 ${rejectedCount} 条不符合事实校验的修改已被自动过滤。` : ''}</p>
              </div>
              {keep.length > 0 && (
                <section aria-label="建议优先保留的岗位证据" className="rounded-xl border border-slate-200 p-3 space-y-2">
                  <p className="text-[13px] font-bold text-slate-900">建议优先保留的岗位证据</p>
                  <p className="text-[11px] text-slate-500">以下是 AI 的编辑判断，原文引文已校验。保留建议不会自动修改简历。</p>
                  {keep.map((item) => (
                    <div key={item.id} className="text-xs border-t border-slate-100 pt-2 space-y-1">
                      <p className="font-semibold text-slate-700">{fieldLookup.get(item.id)?.label}</p>
                      <p className="text-slate-700">原文证据：“{item.evidenceQuote}”</p>
                      <p className="text-slate-500">建议保留：{item.reason}</p>
                    </div>
                  ))}
                </section>
              )}
              {candidates.map((item) => (
                <div key={item.id} className="text-[11px] border-t border-slate-100 pt-2.5 text-slate-600 space-y-1">
                  <p className="font-semibold text-slate-800">{fieldLookup.get(item.id)?.label} · 岗位相关性（AI 估计）：{{ high: '高', medium: '中', low: '低' }[item.relevance]}</p>
                  <p><strong>原文证据：</strong>“{item.evidenceQuote}”</p>
                  {item.jobBasis && <p><strong>对应 JD 原句：</strong>“{item.jobBasis}”</p>}
                  <p><strong>改写理由：</strong>{item.reason}</p>
                  <p><strong>需要人工核对：</strong>{item.tradeoff}</p>
                </div>
              ))}
                </div>
              </details>
            </>
          )}
          {error && state === 'ready' && <p role="alert" className="text-xs text-red-700">{error}</p>}
          <p className={state === 'ready'
            ? 'hidden'
            : 'flex gap-2 items-start text-[11px] text-slate-500'}>
            <ShieldCheck className="w-4 h-4 shrink-0" />
            {state === 'unavailable'
              ? '没有 AI 模型时不会上传简历；压缩间距必须由你确认。'
              : isLocal
                ? '使用当前已选本地模型。文本只会被送往本机配置的 AI 服务。'
                : '如选择云端模型，可编辑描述和目标岗位将发送给服务商；程序不会主动附带结构化联系方式、头像、成绩或完整简历，并会排除包含明显联系方式的自由文本，但请仍留意其他敏感内容。'}
            精简后不保证自动变为一页；还需重新检查实际 PDF。
          </p>
        </div>
        <footer className={'border-t border-slate-100 shrink-0 flex justify-end items-center gap-3 ' +
          (state === 'ready' ? 'px-4 py-2' : 'p-4')}>
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer">
            暂不修改
          </button>
          {state === 'ready' && candidates.length > 0 && (
            <button type="button" onClick={apply} disabled={!selected.length || sourceChanged || criteriaChanged}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#0071e3] text-white disabled:opacity-45 cursor-pointer">
              <Check className="w-3.5 h-3.5 inline mr-1" />
              确认精简 · 应用 {selected.length} 处
            </button>
          )}
        </footer>
      </section>
    </div>
  );
};
