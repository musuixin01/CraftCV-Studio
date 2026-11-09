import { aiFetch } from '../utils/aiModelClient';
import React, { useRef, useState } from 'react';
import { DEFAULT_EE_RESUME } from '../data/defaultResume';
import { ResumeDocument } from '../types/resume';
import { validateParsedResume, validateStoredResume } from '../utils/resumeGenerationGuard';
import { createImportFactLedger, detectImportConflicts, getImportReviewSections } from '../utils/resumeImportReview';
import {
  FileText,
  FileUp,
  Image as ImageIcon,
  Loader2,
  Sparkles,
  Upload,
  X,
  AlertTriangle,
  CheckCircle2,
  ArrowLeft,
} from 'lucide-react';

interface PendingAIImport {
  doc: ResumeDocument;
  sourceLabel: string;
  sourceKind: 'ai-file-extraction' | 'ai-pasted-text';
  versionLabel: string;
  originalResumeSnapshot: string;
  capturedAt: string;
}

interface ResumeImportModalProps {
  isOpen: boolean;
  currentResume: ResumeDocument;
  roleLanes: string[];
  onClose: () => void;
  onImportResume: (
    doc: ResumeDocument,
    mode: 'overwrite' | 'new-slot',
    roleCategory: string,
    versionName: string
  ) => void;
}

export const ResumeImportModal: React.FC<ResumeImportModalProps> = ({
  isOpen,
  currentResume,
  roleLanes,
  onClose,
  onImportResume,
}) => {
  const [tab, setTab] = useState<'file' | 'paste'>('file');
  const [importMode, setImportMode] = useState<'new-slot' | 'overwrite'>('new-slot');
  const [selectedLane, setSelectedLane] = useState<string>(
    roleLanes[0] || '嵌入式软件工程师'
  );
  const [pastedText, setPastedText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingDraft, setPendingDraft] = useState<PendingAIImport | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const closeImportModal = () => {
    if (isParsing) return;
    setPendingDraft(null);
    setReviewed(false);
    setErrorMsg(null);
    onClose();
  };
  const conflicts = pendingDraft && importMode === 'overwrite'
    ? detectImportConflicts(currentResume, pendingDraft.doc) : [];

  const confirmImportDraft = () => {
    if (!pendingDraft || !reviewed) return;
    // Do not allow a delayed model result to replace user edits made after parsing started.
    if (importMode === 'overwrite' && JSON.stringify(currentResume) !== pendingDraft.originalResumeSnapshot) {
      setErrorMsg('当前简历已在解析期间发生变化。为防止覆盖新编辑，请取消本次草稿并重新解析。');
      return;
    }
    if (importMode === 'overwrite' && !window.confirm(
      '已核对 AI 草稿。确定覆盖当前简历吗？原有内容可能被替换，建议事先导出 JSON 备份。'
    )) return;

    const confirmedDoc: ResumeDocument = {
      ...pendingDraft.doc,
      factLedger: createImportFactLedger(
        pendingDraft.doc,
        {kind:pendingDraft.sourceKind,label:pendingDraft.sourceLabel},
        true,
        pendingDraft.capturedAt,
      ),
    };
    onImportResume(
      confirmedDoc, importMode,
      selectedLane || confirmedDoc.basics.title || '通用岗位',
      pendingDraft.versionLabel,
    );
    closeImportModal();
  };

  if (!isOpen) return null;

  const buildResumeDocumentFromParsed = (
    parsed: any,
    sourceLabel: string
  ): ResumeDocument => {
    const nowId = Date.now();
    // Use the template for styling/section configuration only.
    // Never import another person's demonstration history when extraction is partial.
    const base = JSON.parse(JSON.stringify(DEFAULT_EE_RESUME)) as ResumeDocument;
    base.education = [];
    base.projects = [];
    base.experience = [];
    base.skills = [];
    base.awards = [];
    base.customSections = [];

    const extractedBasics = parsed.basics || {};
    base.id = `imported-${nowId}`;
    base.versionName = sourceLabel;
    base.updatedAt = new Date().toISOString();
    base.style = { ...currentResume.style };

    base.basics = {
      ...base.basics,
      name: extractedBasics.name || '',
      title: extractedBasics.title || '',
      directionTags: extractedBasics.directionTags || '',
      phone: extractedBasics.phone || '',
      email: extractedBasics.email || '',
      location: extractedBasics.location || '',
      github: extractedBasics.github || '',
      website: extractedBasics.website || '',
      schoolTag: extractedBasics.schoolTag || '',
      statusTag: extractedBasics.statusTag || '',
      politicalStatus: extractedBasics.politicalStatus || '',
      graduationYear: extractedBasics.graduationYear || '',
      summary: extractedBasics.summary || '',
      avatarUrl: '',
      showAvatar: false,
      avatarPosition: currentResume.basics.avatarPosition,
    };

    if (Array.isArray(parsed.education) && parsed.education.length > 0) {
      base.education = parsed.education.map((ed: any, idx: number) => ({
        id: `edu-imp-${nowId}-${idx}`,
        school: ed.school || '',
        degree: ed.degree || '',
        major: ed.major || '',
        startDate: ed.startDate || '',
        endDate: ed.endDate || '',
        gpa: ed.gpa || '',
        ranking: ed.ranking || '',
        courses: ed.courses || '',
        honors: ed.honors || '',
      }));
    }

    if (Array.isArray(parsed.skills) && parsed.skills.length > 0) {
      base.skills = parsed.skills.map((sk: any, idx: number) => ({
        id: `sk-imp-${nowId}-${idx}`,
        category: sk.category || '专业技能',
        items: sk.items || '',
      }));
    }

    if (Array.isArray(parsed.projects) && parsed.projects.length > 0) {
      base.projects = parsed.projects.map((pr: any, idx: number) => ({
        id: `proj-imp-${nowId}-${idx}`,
        name: pr.name || '项目经历',
        role: pr.role || '',
        startDate: pr.startDate || '',
        endDate: pr.endDate || '',
        repoUrl: pr.repoUrl || '',
        techStack: Array.isArray(pr.techStack) ? pr.techStack : [],
        summary: pr.summary || '',
        bullets: Array.isArray(pr.bullets) && pr.bullets.length > 0 ? pr.bullets : [''],
      }));
    }

    if (Array.isArray(parsed.experience)) {
      base.experience = parsed.experience.map((ex: any, idx: number) => ({
        id: `exp-imp-${nowId}-${idx}`,
        company: ex.company || '',
        position: ex.position || '',
        department: ex.department || '',
        location: ex.location || '',
        startDate: ex.startDate || '',
        endDate: ex.endDate || '',
        techStack: Array.isArray(ex.techStack) ? ex.techStack : [],
        bullets: Array.isArray(ex.bullets) && ex.bullets.length > 0 ? ex.bullets : [''],
      }));
    }

    if (Array.isArray(parsed.awards)) {
      base.awards = parsed.awards.map((aw: any, idx: number) => ({
        id: `aw-imp-${nowId}-${idx}`,
        title: aw.title || '',
        issuer: aw.issuer || '',
        date: aw.date || '',
        level: aw.level || '',
        description: aw.description || '',
      }));
    }

    return base;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setErrorMsg(null);
    setPendingDraft(null);
    setReviewed(false);
    const lowerName = file.name.toLowerCase();
    const baseLabel = file.name.replace(/\.[^.]+$/, '');

    // 1. Direct CraftCV JSON backup file
    if (lowerName.endsWith('.json')) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result));
          const issues = validateStoredResume(parsed);
          if (issues.length === 0) {
            if (importMode === 'overwrite' && !window.confirm(
              '确定用该 JSON 备份替换当前简历吗？请确认已保存目前的编辑内容。'
            )) return;
            const lane = parsed.basics.title || selectedLane;
            onImportResume({ ...parsed, customSections: parsed.customSections ?? [] }, importMode, lane, `${baseLabel} 导入版`);
            onClose();
          } else {
            setErrorMsg('该 JSON 文件不是有效的简历数据格式');
          }
        } catch {
          setErrorMsg('解析 JSON 文件失败，请检查文件格式');
        }
      };
      reader.readAsText(file);
      return;
    }

    // 2. Markdown or TXT plain text file
    if (lowerName.endsWith('.md') || lowerName.endsWith('.txt') || lowerName.endsWith('.markdown')) {
      const reader = new FileReader();
      reader.onload = async () => {
        const textContent = String(reader.result || '');
        await runAIParse({ rawText: textContent, fileName: file.name }, baseLabel);
      };
      reader.readAsText(file);
      return;
    }

    // 3. PDF or Image file (Multimodal Gemini OCR & Structured Extraction)
    if (
      lowerName.endsWith('.pdf') ||
      lowerName.endsWith('.png') ||
      lowerName.endsWith('.jpg') ||
      lowerName.endsWith('.jpeg') ||
      lowerName.endsWith('.webp')
    ) {
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = String(reader.result || '');
        const commaIdx = dataUrl.indexOf(',');
        const base64Data = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
        const mimeType =
          file.type ||
          (lowerName.endsWith('.pdf')
            ? 'application/pdf'
            : lowerName.endsWith('.png')
              ? 'image/png'
              : 'image/jpeg');

        await runAIParse({ base64Data, mimeType, fileName: file.name }, baseLabel);
      };
      reader.readAsDataURL(file);
      return;
    }

    setErrorMsg('支持上传 .pdf、.png、.jpg、.md、.txt 或 .json 格式的简历文件');
  };

  const runAIParse = async (
    payload: { base64Data?: string; mimeType?: string; rawText?: string; fileName?: string },
    versionLabel: string
  ) => {
    setIsParsing(true);
    setPendingDraft(null);
    setReviewed(false);
    setErrorMsg(null);
    const originalResumeSnapshot = JSON.stringify(currentResume);
    setStatusMessage('AI 正在提取原始简历信息，结果不会自动写入当前版本...');

    try {
      const res = await aiFetch('/api/ai/parse-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '解析简历失败');
      }

      // A successful network response with no usable extraction is not an import.
      const extracted = Boolean(
        data?.basics?.name?.trim?.() ||
        data?.basics?.summary?.trim?.() ||
        ['education', 'projects', 'experience', 'skills', 'awards'].some(
          (key) => Array.isArray(data?.[key]) && data[key].length > 0
        )
      );
      if (!extracted) {
        throw new Error('没有识别出可用的简历内容，尚未创建新简历。请检查文件或改为粘贴文本。');
      }

      const structureIssues = validateParsedResume(data);
      if (structureIssues.length) {
        throw new Error('AI 提取字段无效，原简历已保留：' + structureIssues.slice(0, 3).join('；'));
      }
      const doc = buildResumeDocumentFromParsed(data, versionLabel);
      setPendingDraft({
        doc,
        sourceLabel:payload.fileName || versionLabel,
        sourceKind:payload.rawText && payload.fileName === '粘贴文本简历'
          ? 'ai-pasted-text' : 'ai-file-extraction',
        versionLabel:`${doc.basics.name || versionLabel}_导入版`,
        originalResumeSnapshot,
        capturedAt:new Date().toISOString(),
      });
    } catch (err: any) {
      setErrorMsg(err?.message || 'AI 解析简历遇到问题，请重试');
    } finally {
      setIsParsing(false);
      setStatusMessage(null);
    }
  };

  const handlePasteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pastedText.trim()) return;
    await runAIParse(
      { rawText: pastedText.trim(), fileName: '粘贴文本简历' },
      '文本导入简历'
    );
  };

  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md">
      <div className="os26-floating-dock os26-modal-enter w-full max-w-2xl max-h-[92vh] rounded-3xl overflow-hidden shadow-2xl flex flex-col">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-900/[0.06] flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <FileUp className="w-4 h-4 text-[#0071e3]" />
              <span>智能导入外部简历</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              支持上传 PDF、图片或文本；AI 先生成待核对草稿，确认前不会修改简历
            </p>
          </div>
          <button
            type="button"
            onClick={closeImportModal}
            disabled={isParsing}
            className="p-1.5 text-slate-400 hover:text-slate-800 rounded-xl hover:bg-slate-900/[0.05] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 overflow-y-auto min-h-0">
          {pendingDraft ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="shrink-0 w-9 h-9 rounded-xl bg-[#0071e3]/10 flex items-center justify-center text-[#0071e3]">
                  <CheckCircle2 className="w-5 h-5"/>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">AI 解析草稿已就绪 · 等待人工核对</h3>
                  <p className="text-xs text-slate-500 mt-1 break-words">
                    来源：{pendingDraft.sourceLabel}。以下仅为模型识别结果，尚未证明学历、成绩、项目职责或成果真实。
                  </p>
                </div>
              </div>

              <div className="flex gap-2 flex-wrap text-xs">
                <button type="button" onClick={() => setImportMode('new-slot')}
                  className={`rounded-xl px-3 py-2 border ${importMode === 'new-slot' ? 'border-[#0071e3] text-[#0071e3] bg-blue-50' : 'border-slate-200 text-slate-600'}`}>
                  保存为新版本（推荐）
                </button>
                <button type="button" onClick={() => setImportMode('overwrite')}
                  className={`rounded-xl px-3 py-2 border ${importMode === 'overwrite' ? 'border-red-500 text-red-700 bg-red-50' : 'border-slate-200 text-slate-600'}`}>
                  覆盖当前简历
                </button>
              </div>

              {importMode === 'new-slot' && (
                <label className="text-xs text-slate-600 flex items-center gap-2">
                  归入岗位
                  <select value={selectedLane} onChange={(e)=>setSelectedLane(e.target.value)}
                    className="os26-input flex-1 px-3 py-1.5 text-xs bg-white">
                    {roleLanes.map((lane)=><option key={lane} value={lane}>{lane}</option>)}
                  </select>
                </label>
              )}
              {importMode === 'overwrite' && (
                <div className="rounded-xl bg-amber-50/90 border border-amber-200 p-3 text-xs text-amber-900">
                  <div className="flex gap-2 items-center font-semibold mb-1">
                    <AlertTriangle className="w-4 h-4"/> 覆盖操作需再次确认
                  </div>
                  {conflicts.length ? (
                    <>
                      <p>检测到 {conflicts.length} 处与当前版本不同的同名字段（差异不代表哪一方正确）：</p>
                      <div className="mt-2 space-y-2 max-h-40 overflow-y-auto">
                        {conflicts.map((issue,i)=>(
                          <div key={issue.label+i} className="border-t border-amber-200/70 pt-1 break-words">
                            <div className="font-semibold">{issue.label}</div>
                            <div>现有：{issue.original}</div>
                            <div>AI 草稿：{issue.incoming}</div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : <p>未发现重点字段差异；这不等于所有事实已经核验。</p>}
                </div>
              )}

              <div className="space-y-3 max-h-[38vh] overflow-y-auto pr-1" role="region" aria-label="AI 草稿逐项核对">
                {getImportReviewSections(pendingDraft.doc).map((section)=>(
                  <section key={section.title}>
                    <h4 className="text-xs font-semibold text-slate-800 mb-2">{section.title}</h4>
                    <dl className="rounded-xl border border-slate-200 bg-white/60 divide-y divide-slate-100">
                      {section.facts.map((fact)=>(
                        <div key={fact.path} className="grid grid-cols-[100px_minmax(0,1fr)] gap-3 px-3 py-2 text-xs">
                          <dt className="text-slate-500">{fact.label}</dt>
                          <dd className="text-slate-800 whitespace-pre-wrap break-words select-text">{fact.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                ))}
              </div>

              <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer select-none">
                <input type="checkbox" checked={reviewed} onChange={(event)=>setReviewed(event.target.checked)}
                  className="mt-0.5 accent-[#0071e3]" />
                <span>我已核对以上识别内容，并理解“确认草稿”不是学历、成绩、技术成果或本人贡献的第三方认证。导入后仍可修改，来源状态保留为 AI 建议。</span>
              </label>
              {errorMsg && <div role="alert" className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">{errorMsg}</div>}
              <div className="flex items-center justify-between gap-2">
                <button type="button" onClick={()=>{setPendingDraft(null);setReviewed(false);setErrorMsg(null);}}
                  className="flex gap-1 items-center text-xs font-semibold text-slate-600 px-3 py-2 rounded-xl hover:bg-white/80">
                  <ArrowLeft className="w-3.5 h-3.5"/> 返回重新识别
                </button>
                <button type="button" onClick={confirmImportDraft} disabled={!reviewed}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#0071e3] disabled:opacity-40 disabled:cursor-not-allowed">
                  {importMode === 'overwrite' ? '核对完成 · 确认覆盖' : '核对完成 · 新建简历'}
                </button>
              </div>
            </div>
          ) : (
          <>
          {/* 1. Import Destination Strategy */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-700">
              导入后保存方式
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setImportMode('new-slot')}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  importMode === 'new-slot'
                    ? 'bg-[#0071e3]/[0.05] border-[#0071e3] ring-1 ring-[#0071e3]/20'
                    : 'bg-white/70 border-slate-200/80 hover:bg-white'
                }`}
              >
                <div className="text-xs font-semibold text-slate-900">
                  存为岗位分栏下的新简历版本
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  保留当前简历不被覆盖，自动在岗位栏新增一份
                </div>
              </button>

              <button
                type="button"
                onClick={() => setImportMode('overwrite')}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  importMode === 'overwrite'
                    ? 'bg-[#0071e3]/[0.05] border-[#0071e3] ring-1 ring-[#0071e3]/20'
                    : 'bg-white/70 border-slate-200/80 hover:bg-white'
                }`}
              >
                <div className="text-xs font-semibold text-slate-900">
                  直接覆盖当前正在编辑的简历
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  替换当前画面内容，支持随时 ⌘Z 撤销
                </div>
              </button>
            </div>

            {importMode === 'new-slot' && (
              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs text-slate-600 shrink-0">归入岗位分栏：</span>
                <select
                  value={selectedLane}
                  onChange={(e) => setSelectedLane(e.target.value)}
                  className="os26-input flex-1 px-3 py-1.5 text-xs bg-white"
                >
                  {roleLanes.map((lane) => (
                    <option key={lane} value={lane}>
                      {lane}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <p className="rounded-xl bg-blue-50/70 border border-blue-100 px-3 py-2 text-[11px] text-slate-700 leading-relaxed">
            AI 解析会将本次选择的文件或粘贴文字发送到顶部所选模型。云端服务商可能在本机以外处理资料；
            请确认您有权提供这些内容。仅需本地处理时，请先选用支持相应格式的本地模型。
          </p>

          {/* 2. Segmented Tab Switcher: Upload File vs Paste Text */}
          <div className="p-1 bg-slate-900/[0.05] rounded-xl grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => setTab('file')}
              className={`os26-press py-1.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer ${
                tab === 'file'
                  ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>上传文件 · PDF / 图片 / JSON</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('paste')}
              className={`os26-press py-1.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer ${
                tab === 'paste'
                  ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>粘贴旧简历文字 · Word / 网页</span>
            </button>
          </div>

          {/* Tab Content */}
          {tab === 'file' ? (
            <div className="space-y-3">
              <div
                onClick={() => !isParsing && fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-7 text-center transition-all ${
                  isParsing
                    ? 'border-[#0071e3]/40 bg-[#0071e3]/[0.03] cursor-wait'
                    : 'border-slate-300/90 hover:border-[#0071e3] bg-white/60 hover:bg-white cursor-pointer'
                }`}
              >
                {isParsing ? (
                  <div className="space-y-2.5 py-2">
                    <Loader2 className="w-7 h-7 text-[#0071e3] animate-spin mx-auto" />
                    <div className="text-xs font-semibold text-slate-800">
                      {statusMessage || '正在智能解析简历文件...'}
                    </div>
                    <p className="text-[11px] text-slate-500">
                      正在提取基本信息、教育经历、专业技能、项目与实习经历
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="w-10 h-10 rounded-2xl bg-[#0071e3]/10 text-[#0071e3] flex items-center justify-center mx-auto">
                      <FileUp className="w-5 h-5" />
                    </div>
                    <div className="text-sm font-bold text-slate-900">
                      点击选择简历文件上传
                    </div>
                    <p className="text-xs text-slate-500">
                      支持 <span className="font-semibold text-slate-700">PDF 简历 (.pdf)</span>、
                      <span className="font-semibold text-slate-700">简历长图/截图 (.png/.jpg)</span>、
                      <span className="font-semibold text-slate-700">Markdown/文本 (.md/.txt)</span> 或{' '}
                      <span className="font-semibold text-slate-700">CraftCV 备份 (.json)</span>
                    </p>
                  </div>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.md,.txt,.markdown,.json,application/pdf,image/*,application/json"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          ) : (
            <form onSubmit={handlePasteSubmit} className="space-y-3">
              <textarea
                rows={7}
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                disabled={isParsing}
                placeholder="在此直接粘贴您的旧简历文字（例如从 Word、PDF、飞书文档或招聘网站复制的文字内容），AI 会自动识别并拆分为基本信息、教育背景、专业技能、项目经历与实习经历..."
                className="os26-input w-full p-3 text-xs leading-relaxed bg-white"
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isParsing || !pastedText.trim()}
                  className="os26-press px-4 py-2 rounded-xl bg-[#0071e3] hover:bg-[#0077ed] disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  {isParsing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>正在智能解析...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>AI 解析文本并生成草稿</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {errorMsg && (
            <div role="alert" className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
              {errorMsg}
            </div>
          )}
          </>
          )}
        </div>
      </div>
    </div>
  );
};
