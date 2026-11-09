import { aiFetch } from '../utils/aiModelClient';
import React, { useEffect, useRef, useState } from 'react';
import { validateOptimizedItem } from '../utils/resumeGenerationGuard';
import { loadRetrievedMasterFacts } from '../utils/masterFactRetrieval';
import { loadRetrievedMasterContent } from '../utils/masterContentDraft';
import {loadMasterAIReferences} from '../utils/masterSourceRetrieval';
import {
  AwardItem,
  CustomSectionItem,
  EducationItem,
  ExperienceItem,
  ProjectItem,
  ResumeDocument,
  SectionType,
  SkillCategory,
} from '../types/resume';
import {
  AISkill,
  DEFAULT_AI_SKILLS,
  loadAISkills,
  loadAutoSkillMode,
  loadSelectedSkillIds,
  recommendSkillsForTarget,
  saveAISkills,
  saveAutoSkillMode,
  saveSelectedSkillIds,
} from '../data/defaultAISkills';
import {
  BookOpen,
  Bot,
  Check,
  ChevronDown,
  ChevronUp,
  FileUp,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';

export interface AIOptimizeTarget {
  sectionId: string;
  sectionType: SectionType | 'basics';
  sectionTitle: string;
  itemId?: string;
  customSectionId?: string;
}

interface AIOptimizeModalProps {
  target: AIOptimizeTarget | null;
  resume: ResumeDocument;
  onClose: () => void;
  onApplyOptimizedSection: (updater: (prev: ResumeDocument) => ResumeDocument, toastText: string) => void;
}

type OptimizeMode = 'star' | 'hardware_arch' | 'concise' | 'quantify';

function formatBoldPreview(text: string): React.ReactNode {
  if (!text) return null;
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={idx} className="font-bold text-slate-950 bg-amber-100/80 px-0.5 rounded-xs">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code key={idx} className="px-1 py-0.5 bg-slate-100 text-slate-800 rounded font-mono text-[11px]">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

export const AIOptimizeModal: React.FC<AIOptimizeModalProps> = ({
  target,
  resume,
  onClose,
  onApplyOptimizedSection,
}) => {
  const [mode, setMode] = useState<OptimizeMode>('star');
  const [customPrompt, setCustomPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<'reading_skills' | 'optimizing'>('reading_skills');
  const [error, setError] = useState<string | null>(null);
  const requestSeqRef = useRef(0);

  // AI Skills State (persisted in localStorage)
  const [isSkillBoxExpanded, setIsSkillBoxExpanded] = useState(false);
  const [autoSkillMode, setAutoSkillMode] = useState<boolean>(() => loadAutoSkillMode());
  const [autoMatchReason, setAutoMatchReason] = useState<string>('');
  const [skills, setSkills] = useState<AISkill[]>(() => loadAISkills());
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>(() => loadSelectedSkillIds());
  const [inspectingSkillId, setInspectingSkillId] = useState<string | null>(null);
  const [showAddSkillForm, setShowAddSkillForm] = useState(false);
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillCategory, setNewSkillCategory] = useState('自定义技能');
  const [newSkillDesc, setNewSkillDesc] = useState('');
  const [newSkillMarkdown, setNewSkillMarkdown] = useState(
    `# 技能名称：自定义专业简历优化规范\n\n## 1. 岗位价值表达\n- 突出目标岗位相关的真实职责、方法、成果或业务贡献；不预设行业和年资。\n\n## 2. 表述与量化准则\n- 无数字也可有力描述成果；仅在原材料已有时使用具体数字，不编造经历、身份或指标。`
  );

  const [result, setResult] = useState<{
    autoMatchedSkillIds?: string[];
    autoMatchReasoning?: string;
    skillApplicationLog: string[];
    improvementNotes: string;
    highlights: string[];
    optimizedData: any;
    sourceSnapshot: string;
  } | null>(null);

  const extractPayload = (t: AIOptimizeTarget) => {
    switch (t.sectionType) {
      case 'basics':
        return {
          title: resume.basics.title,
          directionTags: resume.basics.directionTags || '',
          statusTag: resume.basics.statusTag || '',
        };
      case 'summary':
        return { summary: resume.basics.summary };
      case 'education':
        return resume.education.find((x) => x.id === t.itemId) || resume.education[0] || {};
      case 'skills':
        return resume.skills.find((x) => x.id === t.itemId) || resume.skills[0] || {};
      case 'projects':
        return resume.projects.find((x) => x.id === t.itemId) || resume.projects[0] || {};
      case 'experience':
        return resume.experience.find((x) => x.id === t.itemId) || resume.experience[0] || {};
      case 'awards':
        return resume.awards.find((x) => x.id === t.itemId) || resume.awards[0] || {};
      case 'custom': {
        const sec = resume.customSections.find((c) => c.id === t.customSectionId);
        return sec?.items.find((x) => x.id === t.itemId) || sec?.items[0] || {};
      }
      default:
        return {};
    }
  };

  const runOptimization = async (
    activeTarget: AIOptimizeTarget,
    activeMode: OptimizeMode,
    extraPrompt: string,
    activeSkillIds: string[] = selectedSkillIds,
    allSkills: AISkill[] = skills,
    useAutoSelect: boolean = autoSkillMode
  ) => {
    const requestSeq = ++requestSeqRef.current;
    setLoading(true);
    setLoadingPhase('reading_skills');
    setError(null);
    setResult(null);

    const phaseTimer = window.setTimeout(() => {
      setLoadingPhase('optimizing');
    }, 650);

    try {
      const payload = extractPayload(activeTarget);
      const sourceSnapshot = JSON.stringify(payload);
      const masterFacts = await loadRetrievedMasterFacts(resume, [resume.basics.title, activeTarget.sectionTitle, sourceSnapshot].join(' '), activeTarget.sectionType).catch(() => []);
      const contentTitle = activeTarget.sectionType==='projects'
        ? (payload as ProjectItem)?.name
        : activeTarget.sectionType==='experience'
          ? (payload as ExperienceItem)?.company : undefined;
      const masterContent = await loadRetrievedMasterContent(
        [resume.basics.title, activeTarget.sectionTitle, sourceSnapshot].join(' '),
        activeTarget.sectionType,contentTitle,2,
      ).catch(()=>[]);
      // Saved extractions are the source of truth. No original file is reopened for them.
      const {masterStructured,masterRaw}=await loadMasterAIReferences(
        [resume.basics.title,activeTarget.sectionTitle,sourceSnapshot].join(' ')
      ).catch(()=>({masterStructured:[],masterRaw:[]}));


      let effectiveSkillIds = activeSkillIds;
      let localReason = autoMatchReason;

      if (useAutoSelect) {
        const rec = recommendSkillsForTarget(
          allSkills,
          activeTarget.sectionType,
          activeTarget.sectionTitle,
          payload,
          resume.basics.title
        );
        effectiveSkillIds = rec.matchedIds;
        localReason = rec.reason;
        setSelectedSkillIds(rec.matchedIds);
        setAutoMatchReason(rec.reason);
      }

      const activeSkillsPayload = allSkills.filter((s) => effectiveSkillIds.includes(s.id));

      const res = await aiFetch('/api/ai/optimize-section', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sectionType: activeTarget.sectionType,
          sectionTitle: activeTarget.sectionTitle,
          targetRole: resume.basics.title,
          mode: activeMode,
          customPrompt: extraPrompt.trim(),
          payload,
          masterFacts,
          masterContent,
          masterStructured,
          masterRaw,
          selectedSkills: activeSkillsPayload,
          autoSelectSkills: useAutoSelect,
          availableSkills: allSkills,
        }),
      });
      const data = await res.json();
      if (requestSeq !== requestSeqRef.current) return;
      if (!res.ok) {
        throw new Error([data.error, ...(Array.isArray(data.issues) ? data.issues : [])].filter(Boolean).join('；') || 'AI 单项优化服务响应异常');
      }

      const validationIssues = validateOptimizedItem(activeTarget.sectionType, payload, data.optimizedData);
      if (validationIssues.length) throw new Error('AI 优化结果不符合事实/结构规范：' + validationIssues.join('；'));

      // If AI backend returned refined autoMatchedSkillIds, sync them to UI
      if (useAutoSelect && Array.isArray(data.autoMatchedSkillIds) && data.autoMatchedSkillIds.length > 0) {
        const validIds = data.autoMatchedSkillIds.filter((id: string) =>
          allSkills.some((s) => s.id === id)
        );
        if (validIds.length > 0) {
          setSelectedSkillIds(validIds);
        }
      }
      if (useAutoSelect && data.autoMatchReasoning) {
        setAutoMatchReason(data.autoMatchReasoning);
      }

      setResult({
        autoMatchedSkillIds: Array.isArray(data.autoMatchedSkillIds) ? data.autoMatchedSkillIds : effectiveSkillIds,
        autoMatchReasoning: data.autoMatchReasoning || localReason,
        skillApplicationLog: Array.isArray(data.skillApplicationLog) ? data.skillApplicationLog : [],
        improvementNotes: data.improvementNotes || '已结合所选技能完成该单项类目专业润色',
        highlights: Array.isArray(data.highlights) ? data.highlights : [],
        optimizedData: data.optimizedData,
        sourceSnapshot,
      });
    } catch (err: any) {
      if (requestSeq === requestSeqRef.current) setError(err?.message || 'AI 优化失败，请稍后重试');
    } finally {
      window.clearTimeout(phaseTimer);
      if (requestSeq === requestSeqRef.current) setLoading(false);
    }
  };

  // Reload latest skills & autoSkillMode from storage when modal opens and run optimization
  useEffect(() => {
    if (target) {
      const latestSkills = loadAISkills();
      const latestAutoMode = loadAutoSkillMode();
      setSkills(latestSkills);
      setAutoSkillMode(latestAutoMode);

      let initialSkillIds = loadSelectedSkillIds();
      if (latestAutoMode) {
        const rec = recommendSkillsForTarget(
          latestSkills,
          target.sectionType,
          target.sectionTitle,
          extractPayload(target),
          resume.basics.title
        );
        initialSkillIds = rec.matchedIds;
        setAutoMatchReason(rec.reason);
      } else {
        setAutoMatchReason('');
      }

      setSelectedSkillIds(initialSkillIds);
      setResult(null);
      setError(null);
      runOptimization(target, mode, customPrompt, initialSkillIds, latestSkills, latestAutoMode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  if (!target) return null;

  const notifySkillsChanged = () => {
    window.dispatchEvent(new Event('craftcv-skills-updated'));
  };

  const originalItem = extractPayload(target) as any;
  const activeSkills = skills.filter((s) => selectedSkillIds.includes(s.id));
  const inspectingSkill = skills.find((s) => s.id === inspectingSkillId) || null;

  const handleToggleAutoSkillMode = () => {
    const nextAuto = !autoSkillMode;
    setAutoSkillMode(nextAuto);
    saveAutoSkillMode(nextAuto);
    notifySkillsChanged();

    if (nextAuto) {
      const rec = recommendSkillsForTarget(
        skills,
        target.sectionType,
        target.sectionTitle,
        originalItem,
        resume.basics.title
      );
      setSelectedSkillIds(rec.matchedIds);
      setAutoMatchReason(rec.reason);
      runOptimization(target, mode, customPrompt, rec.matchedIds, skills, true);
    } else {
      setAutoMatchReason('');
    }
  };

  const toggleSkillSelection = (skillId: string) => {
    // Switching a skill manually turns off autoSkillMode so user's manual choice is respected
    if (autoSkillMode) {
      setAutoSkillMode(false);
      saveAutoSkillMode(false);
      setAutoMatchReason('');
    }
    const nextIds = selectedSkillIds.includes(skillId)
      ? selectedSkillIds.filter((id) => id !== skillId)
      : [...selectedSkillIds, skillId];
    setSelectedSkillIds(nextIds);
    saveSelectedSkillIds(nextIds);
    notifySkillsChanged();
  };

  const handleCreateCustomSkill = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newSkillName.trim();
    const trimmedMd = newSkillMarkdown.trim();
    if (!trimmedName || !trimmedMd) return;

    const newSkill: AISkill = {
      id: `skill-custom-${Date.now()}`,
      name: trimmedName,
      category: newSkillCategory.trim() || '自定义技能',
      description: newSkillDesc.trim() || '用户自定义 AI 简历优化技能规范',
      skillMarkdown: trimmedMd,
      isBuiltIn: false,
    };

    const nextSkills = [...skills, newSkill];
    const nextSelected = [...selectedSkillIds, newSkill.id];
    setSkills(nextSkills);
    saveAISkills(nextSkills);
    setSelectedSkillIds(nextSelected);
    saveSelectedSkillIds(nextSelected);
    notifySkillsChanged();

    setNewSkillName('');
    setNewSkillDesc('');
    setShowAddSkillForm(false);
    // Immediately re-run optimization with the newly created skill
    runOptimization(target, mode, customPrompt, nextSelected, nextSkills);
  };

  const handleImportSkillFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const content = reader.result;
        const baseName = file.name.replace(/\.(md|txt|markdown)$/i, '');
        const importedSkill: AISkill = {
          id: `skill-import-${Date.now()}`,
          name: baseName || '导入的技能规范',
          category: '导入技能',
          description: `从文件 ${file.name} 导入的技能规范`,
          skillMarkdown: content,
          isBuiltIn: false,
        };
        const nextSkills = [...skills, importedSkill];
        const nextSelected = [...selectedSkillIds, importedSkill.id];
        setSkills(nextSkills);
        saveAISkills(nextSkills);
        setSelectedSkillIds(nextSelected);
        saveSelectedSkillIds(nextSelected);
        setInspectingSkillId(importedSkill.id);
        notifySkillsChanged();
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDeleteCustomSkill = (skillId: string) => {
    const nextSkills = skills.filter((s) => s.id !== skillId);
    const nextSelected = selectedSkillIds.filter((id) => id !== skillId);
    setSkills(nextSkills);
    saveAISkills(nextSkills);
    setSelectedSkillIds(nextSelected);
    saveSelectedSkillIds(nextSelected);
    if (inspectingSkillId === skillId) setInspectingSkillId(null);
    notifySkillsChanged();
  };

  const handleResetBuiltInSkills = () => {
    const customOnes = skills.filter((s) => !s.isBuiltIn);
    const merged = [...DEFAULT_AI_SKILLS, ...customOnes];
    setSkills(merged);
    saveAISkills(merged);
    notifySkillsChanged();
  };

  const handleApply = () => {
    if (!result || !result.optimizedData || !target) return;
    if (result.sourceSnapshot !== JSON.stringify(extractPayload(target))) {
      setError('该条目已被修改，AI 候选结果过期。请重新生成后再应用，避免覆盖最新内容。');
      return;
    }
    const opt = result.optimizedData;
    const issues = validateOptimizedItem(target.sectionType, extractPayload(target), opt);
    if (issues.length) {
      setError('AI 候选变更未通过事实校验：' + issues.join('；'));
      return;
    }
    if (result.sourceSnapshot === JSON.stringify(opt)) {
      setError('AI 未产生实际改动，无需覆盖当前条目。');
      return;
    }
    if (!window.confirm('请再次核对该 AI 改写没有夸大您的实际贡献、测试结果或技能。确定将预览内容应用到当前条目吗？')) return;

    onApplyOptimizedSection((prev) => {
      switch (target.sectionType) {
        case 'basics':
          return {
            ...prev,
            basics: {
              ...prev.basics,
              title: opt.title || prev.basics.title,
              directionTags: opt.directionTags ?? prev.basics.directionTags,
              statusTag: opt.statusTag ?? prev.basics.statusTag,
            },
          };
        case 'summary':
          return {
            ...prev,
            basics: {
              ...prev.basics,
              summary: typeof opt === 'string' ? opt : opt.summary || prev.basics.summary,
            },
          };
        case 'education': {
          const targetId = target.itemId || prev.education[0]?.id;
          return {
            ...prev,
            education: prev.education.map((x) =>
              x.id === targetId ? ({ ...x, ...(opt as EducationItem), id: x.id } as EducationItem) : x
            ),
          };
        }
        case 'skills': {
          const targetId = target.itemId || prev.skills[0]?.id;
          return {
            ...prev,
            skills: prev.skills.map((x) =>
              x.id === targetId ? ({ ...x, ...(opt as SkillCategory), id: x.id } as SkillCategory) : x
            ),
          };
        }
        case 'projects': {
          const targetId = target.itemId || prev.projects[0]?.id;
          return {
            ...prev,
            projects: prev.projects.map((x) =>
              x.id === targetId ? ({ ...x, ...(opt as ProjectItem), id: x.id } as ProjectItem) : x
            ),
          };
        }
        case 'experience': {
          const targetId = target.itemId || prev.experience[0]?.id;
          return {
            ...prev,
            experience: prev.experience.map((x) =>
              x.id === targetId ? ({ ...x, ...(opt as ExperienceItem), id: x.id } as ExperienceItem) : x
            ),
          };
        }
        case 'awards': {
          const targetId = target.itemId || prev.awards[0]?.id;
          return {
            ...prev,
            awards: prev.awards.map((x) =>
              x.id === targetId ? ({ ...x, ...(opt as AwardItem), id: x.id } as AwardItem) : x
            ),
          };
        }
        case 'custom':
          return {
            ...prev,
            customSections: prev.customSections.map((c) => {
              if (c.id !== target.customSectionId) return c;
              const targetId = target.itemId || c.items[0]?.id;
              return {
                ...c,
                items: c.items.map((it) =>
                  it.id === targetId ? ({ ...it, ...(opt as CustomSectionItem), id: it.id } as CustomSectionItem) : it
                ),
              };
            }),
          };
        default:
          return prev;
      }
    }, `已结合 ${activeSkills.length} 项技能将优化结果应用至「${target.sectionTitle}」 (可按 Ctrl+Z 撤销)`);

    onClose();
  };

  // Render preview of the single optimized item depending on sectionType
  const renderOptimizedPreview = () => {
    if (!result?.optimizedData) return null;
    const opt = Array.isArray(result.optimizedData) ? result.optimizedData[0] : result.optimizedData;
    if (!opt) return null;

    if (target.sectionType === 'summary') {
      const text = typeof opt === 'string' ? opt : opt.summary || '';
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="p-3 bg-slate-100/80 border border-slate-200 rounded-md text-xs space-y-1">
            <div className="text-[11px] font-bold text-slate-500">优化前原文：</div>
            <div className="text-slate-600 leading-relaxed">{originalItem?.summary || '（空）'}</div>
          </div>
          <div className="p-3 bg-white border-2 border-blue-500/40 rounded-md text-xs space-y-1 shadow-xs">
            <div className="text-[11px] font-bold text-blue-700">✨ AI 阅读技能并优化后：</div>
            <div className="text-slate-900 leading-relaxed">{formatBoldPreview(text)}</div>
          </div>
        </div>
      );
    }

    if (target.sectionType === 'basics') {
      return (
        <div className="p-3.5 bg-white border-2 border-blue-500/40 rounded-md space-y-2 text-xs">
          <div>
            <span className="text-slate-500">主岗位意向：</span>
            <strong className="text-slate-900">{opt.title}</strong>
          </div>
          <div>
            <span className="text-slate-500">细分技术方向标签：</span>
            <strong className="text-blue-700">{opt.directionTags}</strong>
          </div>
          {opt.statusTag && (
            <div>
              <span className="text-slate-500">右上角状态栏：</span>
              <span className="text-slate-800">{opt.statusTag}</span>
            </div>
          )}
        </div>
      );
    }

    if (target.sectionType === 'skills') {
      const sk = opt as SkillCategory;
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="p-3 bg-slate-100/80 border border-slate-200 rounded-md text-xs space-y-1.5">
            <div className="text-[11px] font-bold text-slate-500">优化前该技能类目：</div>
            <div className="inline-block px-2 py-0.5 bg-slate-200 text-slate-700 font-bold rounded-xs">
              {originalItem?.category}
            </div>
            <p className="text-slate-600 leading-relaxed">{originalItem?.items}</p>
          </div>
          <div className="p-3 bg-white border-2 border-blue-500/40 rounded-md text-xs space-y-1.5 shadow-xs">
            <div className="text-[11px] font-bold text-blue-700">✨ AI 阅读技能并优化后：</div>
            <div className="inline-block px-2 py-0.5 bg-slate-200 text-slate-900 font-bold rounded-xs">
              {sk.category}
            </div>
            <p className="text-slate-800 leading-relaxed">{formatBoldPreview(sk.items)}</p>
          </div>
        </div>
      );
    }

    if (target.sectionType === 'projects') {
      const proj = opt as ProjectItem;
      return (
        <div className="space-y-3">
          <div className="p-3 bg-slate-100/80 border border-slate-200 rounded-md text-xs space-y-1">
            <div className="text-[11px] font-bold text-slate-500">
              优化前「{originalItem?.name}」要点：
            </div>
            <ul className="list-disc pl-4 space-y-0.5 text-slate-600">
              {(originalItem?.bullets || []).map((b: string, i: number) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          </div>
          <div className="p-3.5 bg-white border-2 border-blue-500/40 rounded-md text-xs space-y-1.5 shadow-xs">
            <div className="text-[11px] font-bold text-blue-700">✨ AI 阅读技能并优化后：</div>
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-slate-900 text-sm">{proj.name}</span>
              <span className="text-blue-700 font-medium">{proj.role}</span>
            </div>
            {Array.isArray(proj.techStack) && proj.techStack.length > 0 && (
              <div className="text-[11px] font-mono text-slate-500">
                技术栈：{proj.techStack.join(' / ')}
              </div>
            )}
            <ul className="list-disc pl-4 space-y-1 text-slate-800 leading-relaxed">
              {(proj.bullets || []).map((b, bIdx) => (
                <li key={bIdx}>{formatBoldPreview(b)}</li>
              ))}
            </ul>
          </div>
        </div>
      );
    }

    if (target.sectionType === 'experience') {
      const exp = opt as ExperienceItem;
      return (
        <div className="space-y-3">
          <div className="p-3 bg-slate-100/80 border border-slate-200 rounded-md text-xs space-y-1">
            <div className="text-[11px] font-bold text-slate-500">
              优化前「{originalItem?.company}」描述：
            </div>
            <ul className="list-disc pl-4 space-y-0.5 text-slate-600">
              {(originalItem?.bullets || []).map((b: string, i: number) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          </div>
          <div className="p-3.5 bg-white border-2 border-blue-500/40 rounded-md text-xs space-y-1.5 shadow-xs">
            <div className="text-[11px] font-bold text-blue-700">✨ AI 阅读技能并优化后：</div>
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-slate-900">{exp.company}</span>
              <span className="text-slate-600">{exp.position}</span>
            </div>
            <ul className="list-disc pl-4 space-y-1 text-slate-800 leading-relaxed">
              {(exp.bullets || []).map((b, bIdx) => (
                <li key={bIdx}>{formatBoldPreview(b)}</li>
              ))}
            </ul>
          </div>
        </div>
      );
    }

    if (target.sectionType === 'education') {
      const edu = opt as EducationItem;
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="p-3 bg-slate-100/80 border border-slate-200 rounded-md text-xs space-y-1">
            <div className="text-[11px] font-bold text-slate-500">优化前该条教育经历：</div>
            <div className="font-bold text-slate-700">
              {originalItem?.school} · {originalItem?.major}
            </div>
            {originalItem?.gpa && <div className="text-slate-600">· GPA：{originalItem.gpa}</div>}
            {originalItem?.honors && <div className="text-slate-600">· 荣誉：{originalItem.honors}</div>}
            {originalItem?.courses && <div className="text-slate-600">· 课程：{originalItem.courses}</div>}
          </div>
          <div className="p-3 bg-white border-2 border-blue-500/40 rounded-md text-xs space-y-1 shadow-xs">
            <div className="text-[11px] font-bold text-blue-700">✨ AI 阅读技能并优化后：</div>
            <div className="font-bold text-slate-900">
              {edu.school} · {edu.major}
            </div>
            {edu.gpa && <div className="text-slate-600">· GPA：{edu.gpa}</div>}
            {edu.honors && <div className="text-slate-700">· 荣誉：{formatBoldPreview(edu.honors)}</div>}
            {edu.courses && <div className="text-slate-700">· 核心课程：{formatBoldPreview(edu.courses)}</div>}
          </div>
        </div>
      );
    }

    if (target.sectionType === 'awards') {
      const aw = opt as AwardItem;
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="p-3 bg-slate-100/80 border border-slate-200 rounded-md text-xs space-y-1">
            <div className="text-[11px] font-bold text-slate-500">优化前该项荣誉：</div>
            <div className="text-slate-700">
              · {originalItem?.title} {originalItem?.level ? `（${originalItem.level}）` : ''}
            </div>
          </div>
          <div className="p-3 bg-white border-2 border-blue-500/40 rounded-md text-xs space-y-1 shadow-xs">
            <div className="text-[11px] font-bold text-blue-700">✨ AI 阅读技能并优化后：</div>
            <div className="text-slate-900">
              · {formatBoldPreview(aw.title)} {aw.level ? `（${aw.level}）` : ''}
            </div>
            {aw.description && <div className="text-slate-600">{formatBoldPreview(aw.description)}</div>}
          </div>
        </div>
      );
    }

    if (target.sectionType === 'custom') {
      const item = opt as CustomSectionItem;
      return (
        <div className="p-3.5 bg-white border-2 border-blue-500/40 rounded-md text-xs space-y-1.5 shadow-xs">
          <div className="font-bold text-slate-900">{item.heading}</div>
          {item.subheading && <div className="text-slate-600">{item.subheading}</div>}
          <ul className="list-disc pl-4 space-y-1 text-slate-800">
            {(item.bullets || []).map((b, i) => (
              <li key={i}>{formatBoldPreview(b)}</li>
            ))}
          </ul>
        </div>
      );
    }

    return (
      <pre className="p-3 bg-white border border-slate-200 rounded-md text-xs whitespace-pre-wrap text-slate-700">
        {JSON.stringify(opt, null, 2)}
      </pre>
    );
  };

  return (
    <div
      onClick={onClose}
      className="no-print fixed inset-0 z-50 bg-slate-900/35 backdrop-blur-md flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="os26-modal-enter bg-white/95 backdrop-blur-2xl border border-white/80 ring-1 ring-slate-900/8 rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* OS 26 Frosted Sheet Header */}
        <div className="px-6 py-4 bg-white/80 backdrop-blur-xl border-b border-slate-900/[0.06] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-xl bg-[#0071e3]/12 text-[#0071e3] flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold tracking-tight text-slate-900 truncate">
              AI 技能驱动优化 · {target.sectionTitle}
            </h3>
            <span className="text-slate-300" aria-hidden="true">·</span>
            <span className="text-xs text-slate-500 shrink-0">
              {autoSkillMode ? `AI自动匹配 ${activeSkills.length} 项技能` : `手动挂载 ${activeSkills.length} 项技能`}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="os26-press w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200/80 text-slate-500 hover:text-slate-900 flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Top Control Panel: Collapsible Skill Selector + Strategy + Custom Prompt */}
        <div className="px-6 py-3.5 bg-slate-50/70 border-b border-slate-900/[0.06] space-y-2.5 max-h-[45vh] overflow-y-auto">
          {/* 1. Collapsible AI Skill Pack Selector & Manager */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
            <div
              onClick={() => setIsSkillBoxExpanded((v) => !v)}
              className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 cursor-pointer hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <BookOpen className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span className="text-xs font-bold text-slate-900 whitespace-nowrap">
                  AI 技能包 (SKILL.md)
                </span>
                <span className="px-1.5 py-0.5 text-[10px] font-mono bg-blue-50 text-blue-700 border border-blue-200 rounded whitespace-nowrap shrink-0">
                  {autoSkillMode ? `🤖 AI自动选中 ${activeSkills.length} 项` : `手动已选 ${activeSkills.length}/${skills.length} 项`}
                </span>
                {!isSkillBoxExpanded && activeSkills.length > 0 && (
                  <span className="text-[11px] text-slate-500 truncate">
                    · {activeSkills.map((s) => s.name).join('、')}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleToggleAutoSkillMode}
                  title={
                    autoSkillMode
                      ? '当前：AI 根据当前优化类目内容自动挑选最匹配的技能。点击可切换为手动勾选模式'
                      : '当前：手动勾选技能模式。点击可开启 AI 自动为当前类目挑选最合适的技能'
                  }
                  className={`px-2 py-0.5 text-[11px] font-semibold rounded border flex items-center gap-1 transition-colors cursor-pointer ${
                    autoSkillMode
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                      : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                  }`}
                >
                  <Bot className="w-3 h-3" />
                  <span>{autoSkillMode ? 'AI自动选技能: 开启' : '切换为AI自动选技能'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsSkillBoxExpanded(true);
                    setShowAddSkillForm(true);
                    setInspectingSkillId(null);
                  }}
                  className="px-2 py-0.5 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  新增技能
                </button>
                <button
                  type="button"
                  onClick={() => setIsSkillBoxExpanded((v) => !v)}
                  className="px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded flex items-center gap-0.5 cursor-pointer"
                >
                  <span>{isSkillBoxExpanded ? '收起技能' : '展开选择'}</span>
                  {isSkillBoxExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              </div>
            </div>

            {isSkillBoxExpanded && (
              <div className="p-3 pt-2 border-t border-slate-100 space-y-2.5 bg-slate-50/40">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-600">
                    {autoSkillMode ? (
                      <span className="text-emerald-800 font-medium">
                        🤖 已开启 AI 自动选技能：{autoMatchReason || 'AI 已根据当前类目自动匹配最佳技能'}（直接点击下方标签可转为手动微调）
                      </span>
                    ) : (
                      '✋ 当前为手动模式：勾选技能后点击「按已选技能重新阅读并优化」，或点击上方按钮恢复 AI 自动匹配：'
                    )}
                  </span>
                  <label className="px-2 py-0.5 text-[11px] font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded flex items-center gap-1 cursor-pointer">
                    <FileUp className="w-3 h-3" />
                    导入 .md 技能
                    <input
                      type="file"
                      accept=".md,.txt,.markdown"
                      onChange={handleImportSkillFile}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* Selectable Skill Chips */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {skills.map((sk) => {
                    const isSelected = selectedSkillIds.includes(sk.id);
                    const isInspecting = inspectingSkillId === sk.id;
                    return (
                      <div
                        key={sk.id}
                        className={`inline-flex items-center rounded-md border text-xs transition-all ${
                          isSelected
                            ? 'bg-blue-50/90 border-blue-500 text-blue-950 font-semibold shadow-2xs'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleSkillSelection(sk.id)}
                          className="px-2.5 py-1 flex items-center gap-1.5 cursor-pointer"
                          title={sk.description}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="rounded border-slate-300 text-blue-600 pointer-events-none"
                          />
                          <span>{sk.name}</span>
                          {autoSkillMode && isSelected && (
                            <span className="px-1 py-0 text-[9px] bg-emerald-100 text-emerald-800 rounded">
                              AI匹配
                            </span>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setInspectingSkillId(isInspecting ? null : sk.id);
                            setShowAddSkillForm(false);
                          }}
                          title="点击查看或修改该技能的 SKILL.md 详细规则"
                          className={`px-1.5 py-1 border-l text-[10px] flex items-center gap-0.5 cursor-pointer ${
                            isSelected
                              ? 'border-blue-200 text-blue-700 hover:bg-blue-100'
                              : 'border-slate-200 text-slate-500 hover:bg-slate-200/60'
                          }`}
                        >
                          <span>{isInspecting ? '收起' : '规则'}</span>
                          {isInspecting ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Inspect / Edit Active Skill Markdown Drawer */}
                {inspectingSkill && (
                  <div className="p-3 rounded-md bg-slate-900 text-slate-100 space-y-2 border border-slate-700">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>技能文档预览与编辑：{inspectingSkill.name} (SKILL.md)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {!inspectingSkill.isBuiltIn && (
                          <button
                            type="button"
                            onClick={() => handleDeleteCustomSkill(inspectingSkill.id)}
                            className="px-2 py-0.5 text-[11px] text-red-300 hover:text-red-200 bg-red-950/60 rounded flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                            删除此自定义技能
                          </button>
                        )}
                        {inspectingSkill.isBuiltIn && (
                          <button
                            type="button"
                            onClick={handleResetBuiltInSkills}
                            className="text-[11px] text-slate-400 hover:text-white cursor-pointer"
                          >
                            恢复默认规则
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setInspectingSkillId(null)}
                          className="text-[11px] text-slate-400 hover:text-white cursor-pointer"
                        >
                          关闭
                        </button>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-300">{inspectingSkill.description}</p>
                    <textarea
                      rows={5}
                      value={inspectingSkill.skillMarkdown}
                      onChange={(e) => {
                        const updated = skills.map((s) =>
                          s.id === inspectingSkill.id ? { ...s, skillMarkdown: e.target.value } : s
                        );
                        setSkills(updated);
                        saveAISkills(updated);
                      }}
                      className="w-full p-2 text-xs font-mono leading-relaxed bg-slate-950 text-emerald-300 border border-slate-700 rounded focus:outline-none focus:border-blue-400"
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => {
                          const nextSelected = selectedSkillIds.includes(inspectingSkill.id)
                            ? selectedSkillIds
                            : [...selectedSkillIds, inspectingSkill.id];
                          setSelectedSkillIds(nextSelected);
                          saveSelectedSkillIds(nextSelected);
                          setInspectingSkillId(null);
                          runOptimization(
                            target,
                            mode,
                            customPrompt,
                            nextSelected,
                            skills,
                            false
                          );
                        }}
                        className="px-3 py-1 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded cursor-pointer"
                      >
                        保存规则并让 AI 重新阅读优化
                      </button>
                    </div>
                  </div>
                )}

                {/* Add New Custom Skill Form */}
                {showAddSkillForm && (
                  <form
                    onSubmit={handleCreateCustomSkill}
                    className="p-3 rounded-md bg-blue-50/70 border border-blue-200 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-blue-950">
                        创建新的 AI 技能包（保存后 AI 将先阅读该技能再执行优化）
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowAddSkillForm(false)}
                        className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
                      >
                        取消
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input
                        type="text"
                        required
                        value={newSkillName}
                        onChange={(e) => setNewSkillName(e.target.value)}
                        placeholder="技能名称（如：华为无线硬件岗规范 / Linux驱动规范）"
                        className="sm:col-span-2 px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                      />
                      <input
                        type="text"
                        value={newSkillCategory}
                        onChange={(e) => setNewSkillCategory(e.target.value)}
                        placeholder="分类（如：大厂专项）"
                        className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                      />
                    </div>
                    <input
                      type="text"
                      value={newSkillDesc}
                      onChange={(e) => setNewSkillDesc(e.target.value)}
                      placeholder="简短描述该技能的核心作用..."
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded"
                    />
                    <textarea
                      rows={4}
                      required
                      value={newSkillMarkdown}
                      onChange={(e) => setNewSkillMarkdown(e.target.value)}
                      className="w-full p-2 text-xs font-mono bg-white border border-slate-300 rounded"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="submit"
                        className="px-3 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        保存技能并立即用于本次优化
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>

          {/* 2. Optimization Strategy & Custom Prompt Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-700">第二步：选择基础润色侧重点：</span>
            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/80 rounded-md">
              {[
                { id: 'star', label: 'STAR 价值表达' },
                { id: 'hardware_arch', label: '强化领域专业度' },
                { id: 'quantify', label: '突出已有成果指标' },
                { id: 'concise', label: '精炼与篇幅优化' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    const nextMode = m.id as OptimizeMode;
                    setMode(nextMode);
                    runOptimization(target, nextMode, customPrompt, selectedSkillIds, skills, autoSkillMode);
                  }}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
                    mode === m.id
                      ? 'bg-white text-blue-700 font-semibold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Optional Custom Prompt Input + Trigger Button */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !loading) {
                  runOptimization(target, mode, customPrompt, selectedSkillIds, skills, autoSkillMode);
                }
              }}
              placeholder="可选：例如突出项目职责、技术难点、交付价值或跨岗位可迁移能力，不添加未做过的事实..."
              className="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:border-blue-600"
            />
            <button
              type="button"
              disabled={loading}
              onClick={() => runOptimization(target, mode, customPrompt, selectedSkillIds, skills, autoSkillMode)}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-md flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer shadow-2xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              {autoSkillMode ? 'AI智能选技能并重新优化' : '按已选技能重新阅读并优化'}
            </button>
          </div>
        </div>

        {/* Modal Body: 2-Step Skill Reading Progress / Error / AI Result Preview */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50/40">
          {loading && (
            <div className="py-10 flex flex-col items-center justify-center gap-3 text-slate-700">
              <Loader2 className="w-7 h-7 animate-spin text-blue-600" />
              <div className="max-w-md w-full bg-white border border-slate-200 rounded-lg p-3.5 space-y-2 shadow-2xs">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      loadingPhase === 'reading_skills' ? 'bg-amber-500 animate-ping' : 'bg-emerald-500'
                    }`}
                  />
                  <span>
                    {autoSkillMode
                      ? `步骤 1：AI 已自动匹配并正在阅读最适合该类目的 ${activeSkills.length} 项技能 (SKILL.md)`
                      : `步骤 1：AI 正在阅读已勾选的 ${activeSkills.length} 项技能文档 (SKILL.md)`}
                  </span>
                </div>
                {autoSkillMode && autoMatchReason && (
                  <div className="pl-4 text-[11px] text-emerald-700 font-medium">
                    🤖 自动匹配依据：{autoMatchReason}
                  </div>
                )}
                {activeSkills.length > 0 && (
                  <div className="flex flex-wrap gap-1 pl-4">
                    {activeSkills.map((s) => (
                      <span
                        key={s.id}
                        className="px-2 py-0.5 text-[10px] font-medium bg-blue-50 text-blue-800 border border-blue-200 rounded"
                      >
                        📖 {s.name}
                      </span>
                    ))}
                  </div>
                )}
                <div
                  className={`flex items-center gap-2 text-xs font-bold pt-1 border-t border-slate-100 ${
                    loadingPhase === 'optimizing' ? 'text-blue-700' : 'text-slate-400'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      loadingPhase === 'optimizing' ? 'bg-blue-600 animate-ping' : 'bg-slate-300'
                    }`}
                  />
                  <span>
                    步骤 2：遵循技能准则重构「{target.sectionTitle}」并生成对比方案...
                  </span>
                </div>
              </div>
            </div>
          )}

          {error && !loading && (
            <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 space-y-2">
              <div className="font-semibold">AI 优化请求遇到问题：{error}</div>
              <button
                type="button"
                onClick={() => runOptimization(target, mode, customPrompt, selectedSkillIds, skills, autoSkillMode)}
                className="px-3 py-1 bg-red-600 text-white rounded font-medium cursor-pointer"
              >
                点击重试
              </button>
            </div>
          )}

          {result && !loading && (
            <div className="space-y-4">
              {/* Step 1 Report: How AI Auto-Selected, Read, and Applied Skills */}
              {(result.skillApplicationLog.length > 0 || result.autoMatchReasoning) && (
                <div className="p-3.5 rounded-lg bg-emerald-50/90 border border-emerald-200 space-y-1.5">
                  <div className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                    <span>
                      {autoSkillMode
                        ? '🤖 AI 自动选技能与规则执行报告（已自动挑选最匹配的技能并阅读落实）：'
                        : '📖 AI 技能阅读与规则执行报告（已先阅读所选技能并落实以下改造）：'}
                    </span>
                  </div>
                  {(result.autoMatchReasoning || autoMatchReason) && autoSkillMode && (
                    <div className="text-[11px] font-medium text-emerald-800 bg-white/80 px-2.5 py-1 rounded border border-emerald-200/80">
                      🎯 <strong>AI 自动选技能依据：</strong>
                      {result.autoMatchReasoning || autoMatchReason}
                    </div>
                  )}
                  <ul className="list-disc pl-4 text-[11px] text-emerald-900 space-y-0.5">
                    {result.skillApplicationLog.map((log, i) => (
                      <li key={i}>{log}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Step 2 Summary: Improvement Notes */}
              <div className="p-3.5 rounded-lg bg-blue-50/90 border border-blue-200 space-y-1.5">
                <div className="text-xs font-bold text-blue-950 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>AI 优化亮点说明：{result.improvementNotes}</span>
                </div>
                {result.highlights.length > 0 && (
                  <ul className="list-disc pl-4 text-[11px] text-blue-900 space-y-0.5">
                    {result.highlights.map((h, i) => (
                      <li key={i}>{h}</li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Optimized Content Preview */}
              <div className="space-y-1.5">
                <div className="text-xs font-bold text-slate-800 flex items-center justify-between">
                  <span>优化前后对比预览（仅替换当前所选类目，不影响同模块其他条目）：</span>
                </div>
                {renderOptimizedPreview()}
              </div>
            </div>
          )}
        </div>

        {/* OS 26 Sheet Footer */}
        <div className="px-6 py-3.5 bg-white/90 backdrop-blur-xl border-t border-slate-900/[0.06] flex items-center justify-between gap-3">
          <span className="text-[11px] text-slate-500">
            仅替换「{target.sectionTitle}」，应用后可按 ⌘Z / Ctrl+Z 撤销
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="os26-press px-4 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 rounded-xl cursor-pointer"
            >
              取消
            </button>
            <button
              type="button"
              disabled={loading || !result}
              onClick={handleApply}
              className="os26-press px-4 py-1.5 text-xs font-semibold text-white bg-[#0071e3] hover:bg-[#0077ed] disabled:opacity-40 rounded-xl flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              应用至「{target.sectionTitle}」
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
