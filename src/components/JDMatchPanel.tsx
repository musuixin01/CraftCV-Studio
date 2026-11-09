import { aiFetch } from '../utils/aiModelClient';

import React, { useMemo, useState } from 'react';
import { JDMatchResult, ResumeDocument } from '../types/resume';
import { PRESET_JDS } from '../data/defaultResume';
import { Sparkles, Check, Loader2, AlertCircle, ArrowUpRight, FileText } from 'lucide-react';
import { validateTailoredSummary } from '../utils/resumeGenerationGuard';


import { loadRetrievedMasterFacts, type RetrievedMasterFact } from '../utils/masterFactRetrieval';
import { loadRetrievedMasterContent, type CuratedMasterExcerpt } from '../utils/masterContentDraft';
import {type MasterRawExcerpt} from '../utils/masterRawRetrieval';
import {loadMasterAIReferences,type MasterStructuredExcerpt} from '../utils/masterSourceRetrieval';

import { analyzeJobEvidence, reviewResumeSubmission, type SubmissionReview } from '../utils/jobSubmissionReview';
import type { ExportQualityReport } from '../utils/exportQualityPreflight';
interface JDMatchPanelProps {
  resume: ResumeDocument;
  onApplySummary: (newSummary: string) => void;
  onAppendSkillKeyword: (keyword: string) => void;
  onGetAtsPreflight: () => ExportQualityReport;
  onEditSection: (section: 'education' | 'awards' | 'projects') => void;
}

export const JDMatchPanel: React.FC<JDMatchPanelProps> = ({
  resume,
  onApplySummary,
  onAppendSkillKeyword,
  onGetAtsPreflight,
  onEditSection,
}) => {
  const [jdText, setJdText] = useState(PRESET_JDS[0].content);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<JDMatchResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [masterReferences, setMasterReferences] = useState(0);
  const [usedMasterFacts, setUsedMasterFacts] = useState<RetrievedMasterFact[]>([]);
  const [usedMasterContent,setUsedMasterContent] = useState<CuratedMasterExcerpt[]>([]);
  const [usedMasterRaw,setUsedMasterRaw] = useState<MasterRawExcerpt[]>([]);
  const [usedMasterStructured,setUsedMasterStructured]=useState<MasterStructuredExcerpt[]>([]);
  const [masterNotice, setMasterNotice] = useState('');
  const [submissionReport, setSubmissionReport] = useState<{
    review: SubmissionReview; sourceResume: string; jd: string;
  } | null>(null);
  const jdEvidence = useMemo(() => analyzeJobEvidence(resume,jdText),[resume,jdText]);
  const reportIsStale = Boolean(submissionReport && (
    submissionReport.sourceResume !== JSON.stringify(resume) || submissionReport.jd !== jdText
  ));
  const runSubmissionReview = () => {
    const report=reviewResumeSubmission(resume,jdText,onGetAtsPreflight());
    setSubmissionReport({review:report,sourceResume:JSON.stringify(resume),jd:jdText});
  };

  const [appliedSummary, setAppliedSummary] = useState(false);
  const [addedKeywords, setAddedKeywords] = useState<string[]>([]);
  // Results are bound to the specific resume and JD used for diagnosis.
  // Otherwise a delayed model response could be applied to a newer revision.
  const [diagnosedContext, setDiagnosedContext] = useState<{
    resumeJson: string; jd: string;
  } | null>(null);
  const stale = Boolean(result && (!diagnosedContext ||
    diagnosedContext.resumeJson !== JSON.stringify(resume) ||
    diagnosedContext.jd !== jdText));


  const handleRunDiagnosis = async () => {
    if (!jdText.trim()) return;
    setLoading(true);
    setErrorMsg(null);
    setAppliedSummary(false);
    setAddedKeywords([]);
    setResult(null);
    setDiagnosedContext(null);
    setMasterReferences(0);
    setUsedMasterFacts([]);
    setUsedMasterContent([]);
    setUsedMasterRaw([]);
    setUsedMasterStructured([]);
    setMasterNotice('');
    const sourceResume = JSON.stringify(resume);
    const sourceJD = jdText;

    try {

      const masterFacts = await loadRetrievedMasterFacts(resume, jdText + ' ' + resume.basics.title)
        .catch(() => { setMasterNotice('本次未能读取本机母版，继续仅使用当前简历和 JD。'); return []; });
      setMasterReferences(masterFacts.length);
      setUsedMasterFacts(masterFacts);
      const masterContent=await loadRetrievedMasterContent(jdText+' '+resume.basics.title,undefined,undefined,3)
        .catch(()=>{setMasterNotice('母版项目／经历摘要暂不可用，本次仅使用已有简历和证书候选。');return [];});
      setUsedMasterContent(masterContent);
      const {masterStructured,masterRaw}=await loadMasterAIReferences(
        jdText+' '+resume.basics.title
      ).catch(()=>({masterStructured:[],masterRaw:[]}));
      setUsedMasterRaw(masterRaw);
      setUsedMasterStructured(masterStructured);

      const res = await aiFetch('/api/ai/jd-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resumeData: resume,
          jobDescription: jdText,
          masterFacts,
          masterContent,
          masterStructured,
          masterRaw,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '岗位匹配诊断请求失败');
      }
      setDiagnosedContext({ resumeJson: sourceResume, jd: sourceJD });
      setResult(data);
    } catch (err: any) {
      setErrorMsg(err?.message || 'AI 诊断服务暂不可用，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="os26-card rounded-2xl p-5 space-y-4">
        <div className="space-y-1">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#0071e3]" />
            目标岗位 JD 匹配度诊断与定向定制
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            粘贴您心仪企业的校招/社招岗位要求（或点击下方电子信息工程典型岗位一键填入），AI 将自动比对您的教育、GitHub 项目与专业技能，找出缺失技术关键词并生成定制版个人总结。
          </p>
        </div>

        {/* Preset JD Quick Selectors */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-slate-500">典型岗位模板：</span>
          {PRESET_JDS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => setJdText(preset.content)}
              className="os26-press px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100/90 hover:bg-slate-200/80 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              {preset.title}
            </button>
          ))}
        </div>

        <textarea
          value={jdText}
          onChange={(e) => setJdText(e.target.value)}
          rows={6}
          placeholder="在此粘贴目标招聘岗位的岗位职责与任职要求 (JD)..."
          className="os26-input w-full p-3 text-xs leading-relaxed bg-white"
        />

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-slate-500">
            将结合当前简历中的 {resume.projects.length} 段项目经历与 {resume.skills.length} 类专业技能进行综合评估
          </span>
          <button
            type="button"
            onClick={handleRunDiagnosis}
            disabled={loading || !jdText.trim()}
            className="os26-press px-4 py-2 text-xs font-semibold text-white bg-[#0071e3] hover:bg-[#0077ed] disabled:opacity-50 rounded-xl flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                正在深度比对简历与 JD...
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                开始 AI 岗位匹配诊断
              </>
            )}
          </button>
        </div>

        <p className="text-[11px] leading-relaxed text-slate-500">只有主动点击诊断，才会读取相关母版资料：已提取并保存的 Word/PDF 直接使用内容库字段，不再重新解析原文件；仅对未提取文件按需读取文字。最多发送 2 份结构化摘要及 2 份未提取原文摘录给选定 AI 模型，云端模型可能在设备外处理这些文字。不会上传原始文件或整份母版；未经核实的事实不会自动加入简历。{masterReferences>0?'本次引用 '+masterReferences+' 条来源候选。':''}</p>
        {usedMasterFacts.length>0&&<details className="rounded-xl border border-slate-200 bg-white/75 px-3 py-2 text-xs text-slate-700">
          <summary className="cursor-pointer font-medium">查看本次提供给 AI 的 {usedMasterFacts.length} 条母版候选及来源</summary>
          <div className="mt-2 space-y-1.5">
            {usedMasterFacts.map((item,index)=><div key={item.sourceId+'-'+index} className="flex flex-wrap gap-1.5 border-t border-slate-100 pt-1.5">
              <span className="font-medium">{item.label}</span>
              <span>{item.value}</span>
              <span className="text-slate-500">来源：{item.sourceId}</span>
            </div>)}
          </div>
          <p className="mt-2 text-slate-500">这些是供模型参考的未核实候选，不表示已被采用或证书已认证。</p>
        </details>}

        {usedMasterContent.length>0&&<details className="rounded-xl border border-slate-200 bg-white/75 px-3 py-2 text-xs text-slate-700">
          <summary className="cursor-pointer font-medium">查看发送给 AI 的 {usedMasterContent.length} 条母版项目／经历摘要</summary>
          <div className="space-y-1 mt-2">
            {usedMasterContent.map((entry)=><p key={entry.id} className="border-t border-slate-100 pt-1.5">
              <strong>{entry.title}</strong> · {entry.outline}
            </p>)}
          </div>
          <p className="mt-2 text-slate-500">母版收录是本人确认，并非官方认证；不会因为 JD 提到新技能就补写未经提供的能力。</p>
        </details>}


        {usedMasterStructured.length>0&&<details className="rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-xs text-slate-700">
          <summary className="font-semibold cursor-pointer">本次使用 {usedMasterStructured.length} 份已提取内容库字段（不再读取原文件）</summary>
          <div className="space-y-2 mt-2">{usedMasterStructured.map((entry)=><div key={entry.id} className="border-t border-slate-100 pt-2">
            <p className="font-semibold">{entry.name}</p>
            <p className="text-slate-500 mt-1">使用最新编辑的结构化摘要 {entry.excerpt.length} 字。</p>
          </div>)}</div>
        </details>}
        {usedMasterRaw.length>0&&<details className="rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-xs text-slate-700">
          <summary className="font-semibold cursor-pointer">本次 AI 读取了 {usedMasterRaw.length} 份尚未提取的母版 Word/PDF 原文摘录</summary>
          <div className="space-y-2 mt-2">{usedMasterRaw.map((entry)=><div key={entry.id} className="border-t border-slate-100 pt-2">
            <p className="font-semibold">{entry.name}</p>
            <p className="text-slate-500 mt-1">截取 {entry.excerpt.length} 字，用于理解，不会自动写回。</p>
          </div>)}</div>
        </details>}
        {masterNotice && <p role="status" className="text-xs text-amber-800">{masterNotice}</p>}
        {errorMsg && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* Deterministic, offline selection from records already present in THIS resume version. */}
      <section aria-label="岗位化资料建议" className="rounded-2xl border border-slate-200/80 bg-white/75 px-4 py-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900"></h3>
            <h3 className="text-sm font-bold text-slate-900">与岗位相关的现有资料</h3>
            <p className="text-[11px] text-slate-500 mt-1"></p>
            <p className="text-[11px] text-slate-500 mt-1">本地规则寻找相关项目、课程成绩、证书。不调用模型，不自动更改其他版本；已出现的资料也需要核实是否属于本人。</p>
          </div>
          <span className="text-[11px] text-slate-500 shrink-0">{jdEvidence.suggestions.length} 条参考</span>
        </div>
        {jdEvidence.matches.inspected.length===0
          ? <p className="text-xs text-slate-600">当前 JD 未识别到受支持的具体技术术语。请填写更完整的岗位职责；无法仅凭岗位名称判断匹配。</p>
          : <>
            <p className="text-[11px] text-slate-600">已找到的 JD 术语：{jdEvidence.matches.matched.join('、')||'暂无'}。
              {jdEvidence.matches.notLocated.length>0 && ' 未在当前资料中找到：'+jdEvidence.matches.notLocated.join('、')+'（不代表不会）。'}
            </p>
            <div className="space-y-2">
              {jdEvidence.suggestions.length===0
                ? <p className="text-xs text-slate-600">尚无可依据当前简历推荐的对应材料。可以先在母版资料中采用有来源的课程或证书，再重新查看。</p>
                : jdEvidence.suggestions.slice(0,7).map((item)=>(
                  <div key={item.id} className="border-t border-slate-200 pt-2.5 flex items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                      <p className="text-xs font-semibold text-slate-800">{item.title}
                        {!item.shownInResume && <span className="ml-2 font-normal text-amber-700">当前打印内容未直接展示</span>}
                      </p>
                      <p className="text-[11px] text-slate-600">{item.description}</p>
                      <p className="text-[11px] text-slate-500">相关术语：{item.related.join('、')} · 来源：{item.evidenceLabel}</p>
                    </div>
                    <button type="button" onClick={()=>onEditSection(item.section)}
                      title="仅打开编辑位置，不自动增加或修改事实"
                      className="shrink-0 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-[#0071e3] hover:bg-blue-50">
                      去编辑
                    </button>
                  </div>
                ))}
            </div>
          </>}
        <p className="text-[11px] text-slate-500">仅展示当前版本确实存在的资料，课程成绩默认不写入 A4；代码仓库或课程分数不能自动证明个人项目贡献。</p>
      </section>

      <section aria-label="投递前质量审查" className="rounded-2xl border border-slate-200/80 bg-white/75 px-4 py-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">投递前质量审查 · RGS</h3>
            <p className="text-[11px] text-slate-500 mt-1">检查结构、来源、量化指标、岗位术语及真实 A4/ATS 浏览器排版。无须调用 AI。</p>
          </div>
          <button type="button" onClick={runSubmissionReview}
            className="shrink-0 rounded-lg bg-slate-900 text-white text-xs font-semibold px-3 py-2 hover:bg-slate-800">
            {submissionReport?'重新检查':'开始投递检查'}
          </button>
        </div>
        {!submissionReport
          ? <p className="text-xs text-slate-600">检查后展示优先处理的前五项问题及全部详细结果。最终 PDF 的字体、文字复制与实际页数仍需导出后验收。</p>
          : <div className="space-y-2">
            {reportIsStale && <p role="status" className="text-xs text-amber-800">简历或 JD 已变化，本次审查结果已过期，请重新检查。</p>}
            <div className="flex flex-wrap gap-2 text-[11px] items-center">
              <span className="rounded-lg bg-slate-100 px-2.5 py-1.5 font-semibold text-slate-800">
                {submissionReport.review.status==='BLOCKED'?'数据结构需要修正':
                  submissionReport.review.status==='NEEDS_LAYOUT'?'排版需要调整':'需要完成投递前核实'}
              </span>
              <span className="text-slate-600">
                {submissionReport.review.estimatedPages===null?'ATS 页数尚无法测量':'ATS 浏览器预估 '+submissionReport.review.estimatedPages+' 页'}
              </span>
              <span className="text-slate-600">规则提示 {submissionReport.review.issues.length} 项</span>
            </div>
            <div className="space-y-2">
              {submissionReport.review.topIssues.map((issue)=>(
                <div key={issue.id} className="border-t border-slate-200 pt-2">
                  <div className="flex gap-2 items-center text-xs">
                    <span className={'text-[10px] font-semibold '+(
                      issue.severity==='block'?'text-red-700':
                      issue.severity==='layout'?'text-amber-800':'text-slate-500')}>{issue.rule}</span>
                    <strong className="text-slate-800">{issue.title}</strong>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-1">{issue.detail}</p>
                  <p className="text-[11px] text-slate-600 mt-1">建议：{issue.action}</p>
                </div>
              ))}
            </div>
            {submissionReport.review.issues.length>5 && <details className="text-xs text-slate-600">
              <summary className="cursor-pointer font-semibold text-[#0071e3]">查看其余 {submissionReport.review.issues.length-5} 项</summary>
              <div className="space-y-2 pt-2">
                {submissionReport.review.issues.slice(5).map((issue)=>(
                  <p key={issue.id} className="border-t border-slate-200 pt-2">
                    <strong>{issue.rule} · {issue.title}</strong>：{issue.detail} 建议：{issue.action}
                  </p>
                ))}
              </div>
            </details>}
            <p className="text-[11px] leading-relaxed text-slate-500">
              当前是确定性规则与浏览器排版预检，不是招聘方 ATS 得分、面试机会预测或实际 PDF 文件验收。导出 PDF 后仍须复核文字层、字体、分页和阅读顺序。            </p>
          </div>}
      </section>

      {/* Results View */}
      {result && (
        <div className="os26-card rounded-2xl divide-y divide-slate-200/70 overflow-hidden">
          {stale && (
            <div className="px-5 py-3 bg-amber-50 text-amber-900 text-xs" role="status">
              简历内容或岗位描述已经变化，本次匹配结果已过期。请重新诊断后再应用建议。
            </div>
          )}
          {result.summaryReviewNotice && (
            <div className="px-5 py-3 bg-amber-50 text-amber-800 text-xs" role="status">
              {result.summaryReviewNotice}
            </div>
          )}
          {/* Score & Executive Summary */}
          <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1 flex-1">
              <div className="text-xs font-semibold text-slate-500">综合岗位契合度评估</div>
              <p className="text-xs text-slate-700 leading-relaxed">{result.executiveSummary}</p>
            </div>
            <div className="shrink-0 text-right border border-slate-200 rounded-lg px-4 py-2.5 bg-slate-50">
              <div className="text-[11px] text-slate-500">系统内部参考匹配指标（非 ATS 评分）</div>
              <div
                className={`text-2xl font-bold font-mono tabular-nums ${
                  result.matchScore >= 80
                    ? 'text-emerald-700'
                    : result.matchScore >= 65
                      ? 'text-amber-700'
                      : 'text-red-700'
                }`}
              >
                {result.matchScore}%
              </div>
            </div>
          </div>

          {/* Keywords Analysis */}
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <div className="text-xs font-bold text-emerald-800">
                已命中的核心技术关键词 ({result.matchedKeywords.length})
              </div>
              <p className="text-xs font-mono text-slate-700 leading-relaxed">
                {result.matchedKeywords.join(' · ') || '暂无'}
              </p>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-bold text-amber-800">
                JD 中尚缺证据的关键词（仅在本人确认确实掌握后添加）
              </div>
              <div className="flex flex-wrap gap-1.5">
                {result.missingKeywords.map((kw) => {
                  const isAdded = addedKeywords.includes(kw);
                  return (
                    <button
                      key={kw}
                      type="button"
                      disabled={stale || isAdded}
                      title={stale ? '简历或 JD 已变化，请重新诊断' : '仅确认您确实掌握的技能'}
                      onClick={() => {
                        if (stale || isAdded) return;
                        if (!window.confirm('请确认您确实掌握或使用过「' + kw + '」，且愿意将其作为本人声明写入技能栏。仅因为 JD 提到它并不能证明您会这项技能。确认加入吗？')) return;
                        onAppendSkillKeyword(kw);
                        setAddedKeywords((prev) => [...prev, kw]);
                      }}
                      className={`px-2.5 py-1 text-xs font-mono rounded border transition-colors cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0 ${
                        isAdded
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : 'bg-amber-50/70 border-amber-200 text-amber-900 hover:bg-amber-100'
                      }`}
                    >
                      {isAdded ? <Check className="w-3 h-3" /> : '+'}
                      {kw}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Tailored Summary */}
          {result.tailoredSummary && (
            <div className="p-5 space-y-2.5 bg-slate-50/60">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-blue-600" />
                  为您定制的针对性「个人优势总结」
                </span>
                <button
                  type="button"
                  disabled={stale}
                  onClick={() => {
                    if (stale) return;
                    const issues = validateTailoredSummary(resume, result.tailoredSummary);
                    if (issues.length) {
                      setErrorMsg('个人总结存在未核实的新增内容：' + issues.join('；'));
                      return;
                    }
                    if (!window.confirm('请核对 AI 个人总结是否准确反映您的真实经历和能力；确认后替换当前总结。原稿可通过撤销恢复。')) return;
                    onApplySummary(result.tailoredSummary);
                    setAppliedSummary(true);
                  }}
                  className="px-3 py-1 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded transition-colors flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {appliedSummary ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      已替换至简历
                    </>
                  ) : (
                    <>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      一键替换到简历顶部
                    </>
                  )}
                </button>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed bg-white p-3 rounded border border-slate-200">
                {result.tailoredSummary}
              </p>
            </div>
          )}

          {/* Actionable Suggestions */}
          {result.actionableSuggestions?.length > 0 && (
            <div className="p-5 space-y-3">
              <div className="text-xs font-bold text-slate-900">具体模块优化建议</div>
              <div className="space-y-2.5">
                {result.actionableSuggestions.map((item, idx) => (
                  <div key={idx} className="p-3 rounded border border-slate-200 bg-white space-y-1">
                    <div className="text-xs font-semibold text-slate-900">
                      {idx + 1}. 针对【{item.targetSection}】：<span className="text-slate-600 font-normal">{item.issue}</span>
                    </div>
                    <div className="text-xs text-blue-800 bg-blue-50/60 px-2.5 py-1.5 rounded">
                      <span className="font-semibold">推荐改写话术：</span>
                      {item.recommendedText}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
