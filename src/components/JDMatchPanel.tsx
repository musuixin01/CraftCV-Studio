import React, { useState } from 'react';
import { JDMatchResult, ResumeDocument } from '../types/resume';
import { PRESET_JDS } from '../data/defaultResume';
import { Sparkles, Check, Loader2, AlertCircle, ArrowUpRight, FileText } from 'lucide-react';

interface JDMatchPanelProps {
  resume: ResumeDocument;
  onApplySummary: (newSummary: string) => void;
  onAppendSkillKeyword: (keyword: string) => void;
}

export const JDMatchPanel: React.FC<JDMatchPanelProps> = ({
  resume,
  onApplySummary,
  onAppendSkillKeyword,
}) => {
  const [jdText, setJdText] = useState(PRESET_JDS[0].content);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<JDMatchResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [appliedSummary, setAppliedSummary] = useState(false);
  const [addedKeywords, setAddedKeywords] = useState<string[]>([]);

  const handleRunDiagnosis = async () => {
    if (!jdText.trim()) return;
    setLoading(true);
    setErrorMsg(null);
    setAppliedSummary(false);

    try {
      const res = await fetch('/api/ai/jd-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resumeData: resume,
          jobDescription: jdText,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '岗位匹配诊断请求失败');
      }
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

        {errorMsg && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* Results View */}
      {result && (
        <div className="os26-card rounded-2xl divide-y divide-slate-200/70 overflow-hidden">
          {/* Score & Executive Summary */}
          <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1 flex-1">
              <div className="text-xs font-semibold text-slate-500">综合岗位契合度评估</div>
              <p className="text-xs text-slate-700 leading-relaxed">{result.executiveSummary}</p>
            </div>
            <div className="shrink-0 text-right border border-slate-200 rounded-lg px-4 py-2.5 bg-slate-50">
              <div className="text-[11px] text-slate-500">人岗匹配指数</div>
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
                建议补充或强化的 JD 关键词（点击可一键加入技能栏）
              </div>
              <div className="flex flex-wrap gap-1.5">
                {result.missingKeywords.map((kw) => {
                  const isAdded = addedKeywords.includes(kw);
                  return (
                    <button
                      key={kw}
                      type="button"
                      onClick={() => {
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
                  onClick={() => {
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
