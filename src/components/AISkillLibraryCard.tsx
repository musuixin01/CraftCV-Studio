import React, { useEffect, useState } from 'react';
import {
  AISkill,

  loadAISkills,
  loadAutoSkillMode,
  loadSelectedSkillIds,
  recommendSkillsForTarget,
  saveAISkills,
  saveAutoSkillMode,
  saveSelectedSkillIds,
} from '../data/defaultAISkills';
import { ResumeDocument } from '../types/resume';
import { AIOptimizeTarget } from './AIOptimizeModal';
import {
  BookOpen,
  Bot,
  Check,
  ChevronDown,
  ChevronUp,
  FileUp,
  Plus,

  Sparkles,
  Trash2,
} from 'lucide-react';

interface AISkillLibraryCardProps {
  resume: ResumeDocument;
  onRequestAIOptimize?: (target: AIOptimizeTarget) => void;
}

export const AISkillLibraryCard: React.FC<AISkillLibraryCardProps> = ({
  resume,
  onRequestAIOptimize,
}) => {
  const [autoSkillMode, setAutoSkillMode] = useState<boolean>(() => loadAutoSkillMode());
  const [skills, setSkills] = useState<AISkill[]>(() => loadAISkills());
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>(() => loadSelectedSkillIds());
  const [inspectingSkillId, setInspectingSkillId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillCategory, setNewSkillCategory] = useState('自定义技能');
  const [newSkillDesc, setNewSkillDesc] = useState('');
  const [newSkillMarkdown, setNewSkillMarkdown] = useState(
    `# 技能名称：自定义简历写作技能\n\n## 1. 写作重点\n- 结合岗位需求，突出真实承担的职责、方法与实际交付价值。\n\n## 2. 事实边界\n- 只润色已有经历，不编造任职、能力、数字或测试结果。`
  );

  useEffect(() => {
    const syncFromStorage = () => {
      setSkills(loadAISkills());
      setSelectedSkillIds(loadSelectedSkillIds());
      setAutoSkillMode(loadAutoSkillMode());
    };
    window.addEventListener('storage', syncFromStorage);
    window.addEventListener('craftcv-skills-updated', syncFromStorage);
    return () => {
      window.removeEventListener('storage', syncFromStorage);
      window.removeEventListener('craftcv-skills-updated', syncFromStorage);
    };
  }, []);

  const notifySkillsChanged = () => {
    window.dispatchEvent(new Event('craftcv-skills-updated'));
  };

  const handleSetAutoMode = (next: boolean) => {
    setAutoSkillMode(next);
    saveAutoSkillMode(next);
    notifySkillsChanged();
  };

  const toggleSkill = (id: string) => {
    if (autoSkillMode) {
      setAutoSkillMode(false);
      saveAutoSkillMode(false);
    }
    const next = selectedSkillIds.includes(id)
      ? selectedSkillIds.filter((x) => x !== id)
      : [...selectedSkillIds, id];
    setSelectedSkillIds(next);
    saveSelectedSkillIds(next);
    notifySkillsChanged();
  };

  const handleAddSkill = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newSkillName.trim();
    const md = newSkillMarkdown.trim();
    if (!name || !md) return;

    const created: AISkill = {
      id: `skill-custom-${Date.now()}`,
      name,
      category: newSkillCategory.trim() || '自定义技能',
      description: newSkillDesc.trim() || '用户自定义 AI 技能规范',
      skillMarkdown: md,
      isBuiltIn: false,
    };

    const nextSkills = [...skills, created];
    const nextSelected = [...selectedSkillIds, created.id];
    setSkills(nextSkills);
    saveAISkills(nextSkills);
    setSelectedSkillIds(nextSelected);
    saveSelectedSkillIds(nextSelected);
    notifySkillsChanged();

    setNewSkillName('');
    setNewSkillDesc('');
    setShowAddForm(false);
    setInspectingSkillId(created.id);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const baseName = file.name.replace(/\.(md|txt|markdown)$/i, '');
        const imported: AISkill = {
          id: `skill-import-${Date.now()}`,
          name: baseName || '导入的技能规范',
          category: '导入技能',
          description: `从文件 ${file.name} 导入的技能规范`,
          skillMarkdown: reader.result,
          isBuiltIn: false,
        };
        const nextSkills = [...skills, imported];
        const nextSelected = [...selectedSkillIds, imported.id];
        setSkills(nextSkills);
        saveAISkills(nextSkills);
        setSelectedSkillIds(nextSelected);
        saveSelectedSkillIds(nextSelected);
        setInspectingSkillId(imported.id);
        notifySkillsChanged();
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDeleteSkill = (id: string) => {
    const nextSkills = skills.filter((s) => s.id !== id);
    const nextSelected = selectedSkillIds.filter((x) => x !== id);
    setSkills(nextSkills);
    saveAISkills(nextSkills);
    setSelectedSkillIds(nextSelected);
    saveSelectedSkillIds(nextSelected);
    if (inspectingSkillId === id) setInspectingSkillId(null);
    notifySkillsChanged();
  };


  const activeSkills = skills.filter((s) => selectedSkillIds.includes(s.id));

  const quickTargets: AIOptimizeTarget[] = [
    {
      sectionId: 'sec-summary',
      sectionType: 'summary',
      sectionTitle: '个人简介',
    },
    ...resume.skills.map((sk) => ({
      sectionId: 'sec-skills',
      sectionType: 'skills' as const,
      sectionTitle: `专业技能 · ${sk.category}`,
      itemId: sk.id,
    })),
    ...resume.projects.map((proj) => ({
      sectionId: 'sec-proj',
      sectionType: 'projects' as const,
      sectionTitle: `项目经历 · ${proj.name}`,
      itemId: proj.id,
    })),
    ...resume.experience.map((exp) => ({
      sectionId: 'sec-exp',
      sectionType: 'experience' as const,
      sectionTitle: `实习经历 · ${exp.company}`,
      itemId: exp.id,
    })),
    ...resume.education.map((edu) => ({
      sectionId: 'sec-edu',
      sectionType: 'education' as const,
      sectionTitle: `教育背景 · ${edu.school}`,
      itemId: edu.id,
    })),
    ...resume.awards.map((aw) => ({
      sectionId: 'sec-awards',
      sectionType: 'awards' as const,
      sectionTitle: `证书与荣誉 · ${aw.title}`,
      itemId: aw.id,
    })),
  ];

  return (
    <div id="ai-skill-library-card" className="space-y-4 pb-10 os26-sheet-enter">
      {/* ===================================================================
          1. OS 26 AI SKILL ROUTING HEADER & MODE SWITCHER
         =================================================================== */}
      <div className="os26-card rounded-2xl p-4 space-y-3.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-[#0071e3]" />
              <span>AI 技能库与智能路由中心</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              当前有 {skills.length} 项自定义 SKILL.md 技能 ·{' '}
              {autoSkillMode
                ? '当前由 AI 根据优化类目智能挑选最匹配的技能阅读'
                : `当前手动指定阅读 ${activeSkills.length} 项技能`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label className="os26-press px-3 py-1.5 text-xs font-semibold text-[#0071e3] bg-[#0071e3]/10 hover:bg-[#0071e3]/15 rounded-xl flex items-center gap-1.5 cursor-pointer">
              <FileUp className="w-3.5 h-3.5" />
              <span>导入 .md 技能</span>
              <input
                type="file"
                accept=".md,.txt,.markdown"
                onChange={handleImportFile}
                className="hidden"
              />
            </label>

            <button
              type="button"
              onClick={() => {
                setShowAddForm((v) => !v);
                setInspectingSkillId(null);
              }}
              className="os26-press px-3 py-1.5 text-xs font-semibold text-white bg-[#0071e3] hover:bg-[#0077ed] rounded-xl flex items-center gap-1 shadow-2xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>新增自定义技能</span>
            </button>
          </div>
        </div>

        {/* OS 26 Segmented Routing Mode Switcher */}
        <div className="p-1 bg-slate-900/[0.04] rounded-xl grid grid-cols-1 sm:grid-cols-2 gap-1">
          <button
            type="button"
            onClick={() => handleSetAutoMode(true)}
            className={`os26-press px-3.5 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-2 cursor-pointer transition-all ${
              autoSkillMode
                ? 'bg-white text-[#0071e3] font-semibold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            <span>AI 智能按类目自动选技能</span>
          </button>

          <button
            type="button"
            onClick={() => handleSetAutoMode(false)}
            className={`os26-press px-3.5 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-2 cursor-pointer transition-all ${
              !autoSkillMode
                ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Check className="w-3.5 h-3.5" />
            <span>手动指定要阅读的技能 · 已选 {activeSkills.length} 项</span>
          </button>
        </div>

        {/* Add New Custom Skill Form */}
        {showAddForm && (
          <form
            onSubmit={handleAddSkill}
            className="os26-popover-enter p-4 rounded-2xl bg-slate-900/[0.025] border border-slate-200/90 space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900">
                新增自定义 AI 技能规范 · SKILL.md
              </span>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                取消
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <input
                type="text"
                required
                value={newSkillName}
                onChange={(e) => setNewSkillName(e.target.value)}
                placeholder="技能名称（如：华为硬件岗规范 / Linux驱动规范）"
                className="os26-input sm:col-span-2 px-3 py-1.5 text-xs bg-white"
              />
              <input
                type="text"
                value={newSkillCategory}
                onChange={(e) => setNewSkillCategory(e.target.value)}
                placeholder="分类标签"
                className="os26-input px-3 py-1.5 text-xs bg-white"
              />
            </div>
            <input
              type="text"
              value={newSkillDesc}
              onChange={(e) => setNewSkillDesc(e.target.value)}
              placeholder="简短描述该技能的适用模块与作用，方便 AI 自动路由匹配..."
              className="os26-input w-full px-3 py-1.5 text-xs bg-white"
            />
            <textarea
              rows={5}
              required
              value={newSkillMarkdown}
              onChange={(e) => setNewSkillMarkdown(e.target.value)}
              placeholder="在此输入技能规则正文 (SKILL.md)..."
              className="os26-input w-full p-2.5 text-xs font-mono bg-white"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                className="os26-press px-4 py-1.5 text-xs font-semibold text-white bg-[#0071e3] hover:bg-[#0077ed] rounded-xl flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                保存至技能库
              </button>
            </div>
          </form>
        )}
      </div>

      {/* ===================================================================
          2. SKILL CARDS LIST (SKILL.md 规范列表与实时编辑器)
         =================================================================== */}
      <div className="os26-card rounded-2xl overflow-hidden">
        <div className="px-4 py-3 bg-slate-900/[0.025] border-b border-slate-900/[0.06] flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-slate-800">
            我的自定义技能包 · 点击卡片选择或编辑 SKILL.md 规则          </span>
        </div>

        <div className="p-3.5 space-y-2.5">
          {skills.length === 0 && (
            <div className="py-7 text-center text-xs text-slate-500">
              暂无自定义技能包。可在上方新建或导入；即使不创建，AI 也会按统一简历写作规范润色。
            </div>
          )}
          {skills.map((sk) => {
            const isSelected = selectedSkillIds.includes(sk.id);
            const isInspecting = inspectingSkillId === sk.id;

            return (
              <div
                key={sk.id}
                className={`rounded-2xl border transition-all ${
                  !autoSkillMode && isSelected
                    ? 'bg-[#0071e3]/[0.04] border-[#0071e3]/40 ring-1 ring-[#0071e3]/15'
                    : 'bg-white/85 hover:bg-white border-slate-900/[0.07]'
                }`}
              >
                <div className="p-3.5 flex items-start justify-between gap-3">
                  <div
                    onClick={() => toggleSkill(sk.id)}
                    className="flex items-start gap-2.5 min-w-0 flex-1 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={autoSkillMode ? true : isSelected}
                      onChange={() => {}}
                      className="mt-0.5 rounded border-slate-300 text-[#0071e3] pointer-events-none"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-xs font-bold text-slate-900">{sk.name}</h3>
                        <span className="text-[11px] text-slate-400">
                          · {sk.category}
                          {autoSkillMode ? ' · AI 自动按需调用' : isSelected ? ' · 已启用' : ''}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                        {sk.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {!sk.isBuiltIn && (
                      <button
                        type="button"
                        onClick={() => handleDeleteSkill(sk.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                        title="删除此自定义技能"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setInspectingSkillId(isInspecting ? null : sk.id)}
                      className="os26-press px-2.5 py-1 rounded-xl bg-slate-900/[0.05] hover:bg-slate-900/[0.09] text-slate-700 text-xs font-medium flex items-center gap-1 cursor-pointer"
                    >
                      <span>{isInspecting ? '收起规则' : 'SKILL.md 规则'}</span>
                      {isInspecting ? (
                        <ChevronUp className="w-3 h-3" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Expandable SKILL.md Markdown Editor */}
                {isInspecting && (
                  <div className="px-3.5 pb-3.5 pt-2 border-t border-slate-900/[0.05] space-y-2 os26-sheet-enter">
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>可直接修改下方 SKILL.md 提示词规范，AI 优化时将实时读取最新内容：</span>
                      <span className="font-mono text-[10px] text-slate-400">SKILL.md</span>
                    </div>
                    <textarea
                      rows={7}
                      value={sk.skillMarkdown}
                      onChange={(e) => {
                        const updated = skills.map((s) =>
                          s.id === sk.id ? { ...s, skillMarkdown: e.target.value } : s
                        );
                        setSkills(updated);
                        saveAISkills(updated);
                        notifySkillsChanged();
                      }}
                      className="os26-input w-full p-3 text-xs font-mono leading-relaxed bg-white"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ===================================================================
          3. QUICK ITEM AI OPTIMIZE LAUNCHER WITH AUTO-ROUTING PREVIEW
         =================================================================== */}
      {onRequestAIOptimize && (
        <div className="os26-card rounded-2xl p-4 space-y-3">
          <div>
            <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#0071e3]" />
              <span>直接点选简历类目发起 AI 技能优化</span>
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              点击任意条目即可打开 AI 优化器，系统会自动展示为该条目匹配到的专业技能规范
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {quickTargets.map((t, i) => {
              const { matchedIds } = recommendSkillsForTarget(
                skills,
                t.sectionType,
                t.sectionTitle,
                {},
                resume.basics.title
              );
              const matchedNames = skills
                .filter((s) => matchedIds.includes(s.id))
                .map((s) => s.name.split(/[（(]/)[0])
                .join(' · ');

              return (
                <button
                  key={`${t.sectionType}-${t.itemId || i}`}
                  type="button"
                  onClick={() => onRequestAIOptimize(t)}
                  className="os26-press p-2.5 rounded-xl bg-white/80 hover:bg-white border border-slate-200/80 hover:border-[#0071e3]/40 text-left transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-900 group-hover:text-[#0071e3] truncate">
                      {t.sectionTitle}
                    </span>
                    <Sparkles className="w-3 h-3 text-[#0071e3] shrink-0" />
                  </div>
                  {matchedNames && (
                    <div className="text-[10px] text-slate-400 mt-1 truncate">
                      自动路由：{matchedNames}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
