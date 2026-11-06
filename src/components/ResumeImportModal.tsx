import React, { useRef, useState } from 'react';
import { DEFAULT_EE_RESUME } from '../data/defaultResume';
import { ResumeDocument } from '../types/resume';
import {
  FileText,
  FileUp,
  Image as ImageIcon,
  Loader2,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';

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

  if (!isOpen) return null;

  const buildResumeDocumentFromParsed = (
    parsed: any,
    sourceLabel: string
  ): ResumeDocument => {
    const nowId = Date.now();
    const base = JSON.parse(JSON.stringify(DEFAULT_EE_RESUME)) as ResumeDocument;

    const extractedBasics = parsed.basics || {};
    base.id = `imported-${nowId}`;
    base.versionName = sourceLabel;
    base.updatedAt = new Date().toISOString();
    base.style = { ...currentResume.style };

    base.basics = {
      ...base.basics,
      name: extractedBasics.name || base.basics.name,
      title: extractedBasics.title || selectedLane || base.basics.title,
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
      avatarUrl: currentResume.basics.avatarUrl,
      showAvatar: currentResume.basics.showAvatar,
      avatarPosition: currentResume.basics.avatarPosition,
    };

    if (Array.isArray(parsed.education) && parsed.education.length > 0) {
      base.education = parsed.education.map((ed: any, idx: number) => ({
        id: `edu-imp-${nowId}-${idx}`,
        school: ed.school || '',
        degree: ed.degree || '本科',
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
        role: pr.role || '核心开发者',
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
    const lowerName = file.name.toLowerCase();
    const baseLabel = file.name.replace(/\.[^.]+$/, '');

    // 1. Direct CraftCV JSON backup file
    if (lowerName.endsWith('.json')) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result));
          if (parsed && parsed.basics && Array.isArray(parsed.sections)) {
            const lane = parsed.basics.title || selectedLane;
            onImportResume(parsed, importMode, lane, `${baseLabel} 导入版`);
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
    setErrorMsg(null);
    setStatusMessage('AI 正在深度识别简历排版与经历结构，请稍候...');

    try {
      const res = await fetch('/api/ai/parse-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '解析简历失败');
      }

      const doc = buildResumeDocumentFromParsed(data, versionLabel);
      const targetLane =
        selectedLane || doc.basics.title || '嵌入式软件工程师';
      onImportResume(
        doc,
        importMode,
        targetLane,
        `${doc.basics.name || versionLabel}_导入版`
      );
      onClose();
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
      <div className="os26-floating-dock os26-modal-enter w-full max-w-xl rounded-3xl overflow-hidden shadow-2xl">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-900/[0.06] flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <FileUp className="w-4 h-4 text-[#0071e3]" />
              <span>智能导入外部简历</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              支持上传 PDF 简历、图片截图、Markdown/TXT 或直接粘贴旧简历文字，AI 自动提取结构化内容
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isParsing}
            className="p-1.5 text-slate-400 hover:text-slate-800 rounded-xl hover:bg-slate-900/[0.05] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4">
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
                      <span>AI 解析文本并导入</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
              {errorMsg}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
