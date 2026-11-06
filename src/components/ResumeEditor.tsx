import React, { useState } from 'react';
import {
  AwardItem,
  CustomSection,
  EducationItem,
  ExperienceItem,
  ProjectItem,
  ResumeDocument,
  SectionColumn,
  SectionConfig,
  SkillCategory,
} from '../types/resume';
import { AVATAR_PRESETS } from '../data/defaultResume';
import { getEffectiveColumn } from './ResumePreview';
import { AIOptimizeTarget } from './AIOptimizeModal';
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  Eye,
  EyeOff,
  GripVertical,
  Layers,
  LayoutList,
  Plus,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';

interface ResumeEditorProps {
  resume: ResumeDocument;
  onChangeResume: (updater: (prev: ResumeDocument) => ResumeDocument) => void;
  activeSectionId: string | null;
  onSelectSection: (id: string | null) => void;
  onOpenGitHubTab: () => void;
  onMoveSectionInView: (sectionId: string, direction: -1 | 1, isTwoColumn: boolean) => void;
  onToggleSectionColumn: (sectionId: string) => void;
  onRequestAIOptimize?: (target: AIOptimizeTarget) => void;
}

export const ResumeEditor: React.FC<ResumeEditorProps> = ({
  resume,
  onChangeResume,
  activeSectionId,
  onSelectSection,
  onOpenGitHubTab,
  onMoveSectionInView,
  onToggleSectionColumn,
  onRequestAIOptimize,
}) => {
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [newSectionCol, setNewSectionCol] = useState<SectionColumn>('right');
  const [polishMode, setPolishMode] = useState<'star' | 'hardware_arch' | 'quantify' | 'concise'>('star');
  // OS 26 Focused Inspector Mode ('focused' shows one clean module sheet at a time; 'all' shows all modules stacked)
  const [viewMode, setViewMode] = useState<'focused' | 'all'>('focused');

  const isTwoColumn = resume.style.template === 'pdf-classic' || resume.style.template === 'creative-split';

  // Default to 'sec-proj' or 'basics' if activeSectionId is null in focused mode
  const effectiveActiveId = activeSectionId || 'basics';

  const moveArrayItem = <T,>(arr: T[], idx: number, dir: -1 | 1): T[] => {
    const target = idx + dir;
    if (target < 0 || target >= arr.length) return arr;
    const copy = [...arr];
    const [moved] = copy.splice(idx, 1);
    copy.splice(target, 0, moved);
    return copy;
  };

  const handleDragStart = (index: number) => {
    setDraggedIdx(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === index) return;
    onChangeResume((prev) => {
      const next = [...prev.sections];
      const targetCol = getEffectiveColumn(next[index]);
      const [moved] = next.splice(draggedIdx, 1);
      next.splice(index, 0, { ...moved, column: targetCol });
      return { ...prev, sections: next };
    });
    setDraggedIdx(index);
  };

  const toggleSectionVisibility = (secId: string) => {
    onChangeResume((prev) => ({
      ...prev,
      sections: prev.sections.map((s) => (s.id === secId ? { ...s, visible: !s.visible } : s)),
    }));
  };

  const updateSectionTitle = (secId: string, title: string) => {
    onChangeResume((prev) => ({
      ...prev,
      sections: prev.sections.map((s) => (s.id === secId ? { ...s, title } : s)),
    }));
  };

  const updateSectionEnglishTitle = (secId: string, englishTitle: string) => {
    onChangeResume((prev) => ({
      ...prev,
      sections: prev.sections.map((s) => (s.id === secId ? { ...s, englishTitle } : s)),
    }));
  };

  const handleAddCustomSection = (e: React.FormEvent) => {
    e.preventDefault();
    const title = newSectionTitle.trim();
    if (!title) return;
    const customId = `custom-${Date.now()}`;
    const secId = `sec-${customId}`;

    const newCustom: CustomSection = {
      id: customId,
      title,
      items: [
        {
          id: `ci-${Date.now()}`,
          heading: '在此输入条目名称（如：发表学术论文 / 硬件开源作品）',
          subheading: '担任角色或期刊/赛事名称',
          date: '2026.05',
          bullets: ['详细描述核心研究内容、技术方案与取得的量化成果。'],
        },
      ],
    };

    const newSecConfig: SectionConfig = {
      id: secId,
      type: 'custom',
      title,
      englishTitle: 'ADDITIONAL',
      visible: true,
      column: newSectionCol,
      customSectionId: customId,
    };

    onChangeResume((prev) => ({
      ...prev,
      sections: [...prev.sections, newSecConfig],
      customSections: [...prev.customSections, newCustom],
    }));
    setNewSectionTitle('');
    onSelectSection(secId);
  };

  const handleDeleteCustomSection = (sec: SectionConfig) => {
    onChangeResume((prev) => ({
      ...prev,
      sections: prev.sections.filter((s) => s.id !== sec.id),
      customSections: prev.customSections.filter((c) => c.id !== sec.customSectionId),
    }));
    if (effectiveActiveId === sec.id) {
      onSelectSection('basics');
    }
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onChangeResume((prev) => ({
          ...prev,
          basics: { ...prev.basics, avatarUrl: reader.result as string, showAvatar: true },
        }));
      }
    };
    reader.readAsDataURL(file);
  };

  // Render Basics Module Sheet
  const renderBasicsSheet = () => (
    <div key="sheet-basics" className="os26-card os26-sheet-enter rounded-2xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-900/[0.06] flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">基本信息与证件照</h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            管理姓名、求职方向标签、联系方式及证件照裁剪位置
          </p>
        </div>
        {onRequestAIOptimize && (
          <button
            type="button"
            onClick={() =>
              onRequestAIOptimize({
                sectionId: 'basics',
                sectionType: 'basics',
                sectionTitle: '头部岗位与细分技术方向标签',
              })
            }
            className="os26-press px-3 py-1.5 text-xs font-semibold text-[#0071e3] bg-[#0071e3]/10 hover:bg-[#0071e3] hover:text-white rounded-xl flex items-center gap-1 cursor-pointer shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5" />
            AI优化方向标签
          </button>
        )}
      </div>

      <div className="p-5 space-y-5">
        {/* Avatar Section */}
        <div className="p-4 rounded-xl bg-slate-100/60 border border-slate-200/70 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={resume.basics.showAvatar}
                onChange={(e) =>
                  onChangeResume((prev) => ({
                    ...prev,
                    basics: { ...prev.basics, showAvatar: e.target.checked },
                  }))
                }
                className="rounded border-slate-300 text-[#0071e3]"
              />
              <span>在简历上显示证件照</span>
            </label>

            {isTwoColumn && resume.basics.showAvatar && (
              <div className="flex items-center gap-0.5 p-0.5 bg-slate-200/70 rounded-lg text-xs">
                <button
                  type="button"
                  onClick={() =>
                    onChangeResume((prev) => ({
                      ...prev,
                      basics: { ...prev.basics, avatarPosition: 'left' },
                    }))
                  }
                  className={`os26-press px-2.5 py-1 rounded-md text-[11px] font-medium cursor-pointer ${
                    (resume.basics.avatarPosition ?? 'left') === 'left'
                      ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                      : 'text-slate-600'
                  }`}
                >
                  左栏顶部
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onChangeResume((prev) => ({
                      ...prev,
                      basics: { ...prev.basics, avatarPosition: 'right' },
                    }))
                  }
                  className={`os26-press px-2.5 py-1 rounded-md text-[11px] font-medium cursor-pointer ${
                    resume.basics.avatarPosition === 'right'
                      ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                      : 'text-slate-600'
                  }`}
                >
                  右栏右上角
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                onChangeResume((prev) => ({
                  ...prev,
                  basics: { ...prev.basics, avatarUrl: AVATAR_PRESETS.maleEE, showAvatar: true },
                }))
              }
              className="os26-press px-2.5 py-1 text-xs font-medium bg-white border border-slate-200/90 rounded-lg hover:bg-slate-50 cursor-pointer"
            >
              男生工科形象照
            </button>
            <button
              type="button"
              onClick={() =>
                onChangeResume((prev) => ({
                  ...prev,
                  basics: { ...prev.basics, avatarUrl: AVATAR_PRESETS.femaleTech, showAvatar: true },
                }))
              }
              className="os26-press px-2.5 py-1 text-xs font-medium bg-white border border-slate-200/90 rounded-lg hover:bg-slate-50 cursor-pointer"
            >
              女生工科形象照
            </button>
            <label className="os26-press px-2.5 py-1 text-xs font-semibold text-[#0071e3] bg-[#0071e3]/10 hover:bg-[#0071e3]/15 rounded-lg cursor-pointer flex items-center gap-1">
              <Upload className="w-3 h-3" />
              上传本地照片
              <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
            </label>
          </div>

          {resume.basics.showAvatar && (
            <div className="pt-2.5 border-t border-slate-200/70 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-500">照片缩放、偏移与底框色彩</span>
                <button
                  type="button"
                  onClick={() =>
                    onChangeResume((prev) => ({
                      ...prev,
                      basics: {
                        ...prev.basics,
                        avatarZoom: 1,
                        avatarOffsetX: 0,
                        avatarOffsetY: 0,
                        avatarWidthPx: 106,
                        avatarBgColor: '#ffffff',
                      },
                    }))
                  }
                  className="text-[11px] text-[#0071e3] hover:underline cursor-pointer"
                >
                  还原默认参数
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
                <div>
                  <div className="flex justify-between text-slate-600 mb-1">
                    <span>缩放</span>
                    <span className="font-mono tabular-nums">
                      {Math.round((resume.basics.avatarZoom ?? 1) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={1.85}
                    step={0.05}
                    value={resume.basics.avatarZoom ?? 1}
                    onChange={(e) =>
                      onChangeResume((prev) => ({
                        ...prev,
                        basics: { ...prev.basics, avatarZoom: parseFloat(e.target.value) },
                      }))
                    }
                    className="w-full accent-[#0071e3] cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-slate-600 mb-1">
                    <span>垂直偏移</span>
                    <span className="font-mono tabular-nums">{resume.basics.avatarOffsetY ?? 0}px</span>
                  </div>
                  <input
                    type="range"
                    min={-30}
                    max={30}
                    step={1}
                    value={resume.basics.avatarOffsetY ?? 0}
                    onChange={(e) =>
                      onChangeResume((prev) => ({
                        ...prev,
                        basics: { ...prev.basics, avatarOffsetY: parseInt(e.target.value, 10) },
                      }))
                    }
                    className="w-full accent-[#0071e3] cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-slate-600 mb-1">
                    <span>水平偏移</span>
                    <span className="font-mono tabular-nums">{resume.basics.avatarOffsetX ?? 0}px</span>
                  </div>
                  <input
                    type="range"
                    min={-30}
                    max={30}
                    step={1}
                    value={resume.basics.avatarOffsetX ?? 0}
                    onChange={(e) =>
                      onChangeResume((prev) => ({
                        ...prev,
                        basics: { ...prev.basics, avatarOffsetX: parseInt(e.target.value, 10) },
                      }))
                    }
                    className="w-full accent-[#0071e3] cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-slate-600 mb-1">
                    <span>框体宽度</span>
                    <span className="font-mono tabular-nums">{resume.basics.avatarWidthPx ?? 106}px</span>
                  </div>
                  <input
                    type="range"
                    min={84}
                    max={128}
                    step={2}
                    value={resume.basics.avatarWidthPx ?? 106}
                    onChange={(e) =>
                      onChangeResume((prev) => ({
                        ...prev,
                        basics: { ...prev.basics, avatarWidthPx: parseInt(e.target.value, 10) },
                      }))
                    }
                    className="w-full accent-[#0071e3] cursor-pointer"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[11px] text-slate-500">底框色彩：</span>
                {[
                  { label: '纯白', color: '#ffffff' },
                  { label: '浅蓝', color: '#e0f2fe' },
                  { label: '标准蓝', color: '#bfdbfe' },
                  { label: '浅灰', color: '#e2e8f0' },
                  { label: '浅红', color: '#fee2e2' },
                ].map((bg) => (
                  <button
                    key={bg.color}
                    type="button"
                    onClick={() =>
                      onChangeResume((prev) => ({
                        ...prev,
                        basics: { ...prev.basics, avatarBgColor: bg.color },
                      }))
                    }
                    className={`os26-press px-2 py-0.5 rounded-lg text-[11px] border flex items-center gap-1 cursor-pointer ${
                      (resume.basics.avatarBgColor ?? '#ffffff') === bg.color
                        ? 'border-[#0071e3] bg-white font-semibold text-[#0071e3]'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full border border-slate-300"
                      style={{ backgroundColor: bg.color }}
                    />
                    {bg.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Form Fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">姓名</label>
            <input
              type="text"
              value={resume.basics.name}
              onChange={(e) =>
                onChangeResume((prev) => ({ ...prev, basics: { ...prev.basics, name: e.target.value } }))
              }
              className="os26-input w-full px-3 py-2 text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">求职意向主岗位</label>
            <input
              type="text"
              value={resume.basics.title}
              onChange={(e) =>
                onChangeResume((prev) => ({ ...prev, basics: { ...prev.basics, title: e.target.value } }))
              }
              className="os26-input w-full px-3 py-2 text-xs"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-medium text-slate-500 mb-1">
              岗位下方细分技术方向标签（如：MCU 固件 / 实时系统 / 智能控制）
            </label>
            <input
              type="text"
              value={resume.basics.directionTags ?? ''}
              onChange={(e) =>
                onChangeResume((prev) => ({
                  ...prev,
                  basics: { ...prev.basics, directionTags: e.target.value },
                }))
              }
              placeholder="MCU 固件 / 实时系统 / 智能控制"
              className="os26-input w-full px-3 py-2 text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">联系电话</label>
            <input
              type="text"
              value={resume.basics.phone}
              onChange={(e) =>
                onChangeResume((prev) => ({ ...prev, basics: { ...prev.basics, phone: e.target.value } }))
              }
              className="os26-input w-full px-3 py-2 text-xs font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">电子邮箱</label>
            <input
              type="text"
              value={resume.basics.email}
              onChange={(e) =>
                onChangeResume((prev) => ({ ...prev, basics: { ...prev.basics, email: e.target.value } }))
              }
              className="os26-input w-full px-3 py-2 text-xs font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">GitHub / 个人主页</label>
            <input
              type="text"
              value={resume.basics.github}
              onChange={(e) =>
                onChangeResume((prev) => ({ ...prev, basics: { ...prev.basics, github: e.target.value } }))
              }
              className="os26-input w-full px-3 py-2 text-xs font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">右上角【院校】标签</label>
            <input
              type="text"
              value={resume.basics.schoolTag ?? resume.education[0]?.school ?? ''}
              onChange={(e) =>
                onChangeResume((prev) => ({
                  ...prev,
                  basics: { ...prev.basics, schoolTag: e.target.value },
                }))
              }
              placeholder="例如：电子科技大学"
              className="os26-input w-full px-3 py-2 text-xs"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-medium text-slate-500 mb-1">
              右上角【状态】标签（如：电子信息工程 · 2027 届本科 · 随时到岗）
            </label>
            <input
              type="text"
              value={resume.basics.statusTag ?? ''}
              onChange={(e) =>
                onChangeResume((prev) => ({
                  ...prev,
                  basics: { ...prev.basics, statusTag: e.target.value },
                }))
              }
              placeholder="电子信息工程 · 2027 届本科 · 随时到岗"
              className="os26-input w-full px-3 py-2 text-xs"
            />
          </div>
        </div>
      </div>
    </div>
  );

  // Render Layout & Module Order Manager Sheet
  const renderLayoutManagerSheet = () => (
    <div key="sheet-layout" className="os26-card os26-sheet-enter rounded-2xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-900/[0.06] flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">模块排序、分栏位置与显隐管理</h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            拖拽或点击上下箭头调整模块顺序，双栏模式下可自由切换模块在左栏或右栏
          </p>
        </div>
      </div>

      <div className="p-5 space-y-3">
        <div className="divide-y divide-slate-200/70 rounded-xl border border-slate-200/80 bg-white overflow-hidden">
          {resume.sections.map((sec, idx) => {
            const col = getEffectiveColumn(sec);
            const sameColSections = isTwoColumn
              ? resume.sections.filter((s) => getEffectiveColumn(s) === col)
              : resume.sections;
            const posInCol = sameColSections.findIndex((s) => s.id === sec.id);

            return (
              <div
                key={sec.id}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDragEnd={() => setDraggedIdx(null)}
                className={`px-3.5 py-2.5 flex items-center justify-between gap-2 hover:bg-slate-50/80 transition-colors ${
                  !sec.visible ? 'opacity-50' : ''
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="cursor-grab text-slate-400 hover:text-slate-600">
                    <GripVertical className="w-4 h-4" />
                  </span>
                  <button
                    type="button"
                    onClick={() => onSelectSection(sec.id)}
                    className="text-xs font-semibold text-slate-900 hover:text-[#0071e3] truncate cursor-pointer"
                  >
                    {sec.title}
                  </button>
                  <span className="text-[11px] font-mono text-slate-400 hidden sm:inline">
                    {sec.englishTitle}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {isTwoColumn && (
                    <button
                      type="button"
                      onClick={() => onToggleSectionColumn(sec.id)}
                      className={`os26-press px-2 py-0.5 text-[11px] font-medium rounded-md flex items-center gap-1 cursor-pointer ${
                        col === 'left'
                          ? 'bg-slate-200/80 text-slate-700'
                          : 'bg-[#0071e3]/10 text-[#0071e3] font-semibold'
                      }`}
                    >
                      <ArrowLeftRight className="w-2.5 h-2.5" />
                      {col === 'left' ? '左栏' : '右栏'}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={posInCol <= 0}
                    onClick={() => onMoveSectionInView(sec.id, -1, isTwoColumn)}
                    className="os26-press p-1 text-slate-500 hover:text-slate-900 disabled:opacity-30 rounded-md hover:bg-slate-100 cursor-pointer"
                    title="上移"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={posInCol === -1 || posInCol >= sameColSections.length - 1}
                    onClick={() => onMoveSectionInView(sec.id, 1, isTwoColumn)}
                    className="os26-press p-1 text-slate-500 hover:text-slate-900 disabled:opacity-30 rounded-md hover:bg-slate-100 cursor-pointer"
                    title="下移"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleSectionVisibility(sec.id)}
                    className="os26-press p-1 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-100 cursor-pointer"
                    title={sec.visible ? '隐藏模块' : '显示模块'}
                  >
                    {sec.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  </button>
                  {sec.type === 'custom' && (
                    <button
                      type="button"
                      onClick={() => handleDeleteCustomSection(sec)}
                      className="os26-press p-1 text-red-500 hover:bg-red-50 rounded-md cursor-pointer"
                      title="删除自定义模块"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Add Custom Section Form */}
        <form
          onSubmit={handleAddCustomSection}
          className="p-3.5 rounded-xl bg-slate-100/70 border border-slate-200/80 flex flex-wrap items-center gap-2"
        >
          <input
            type="text"
            value={newSectionTitle}
            onChange={(e) => setNewSectionTitle(e.target.value)}
            placeholder="新增自定义模块（如：校园经历、发表论文、主修实验）..."
            className="os26-input flex-1 min-w-[180px] px-3 py-1.5 text-xs bg-white"
          />
          {isTwoColumn && (
            <div className="flex items-center gap-0.5 p-0.5 bg-slate-200/70 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => setNewSectionCol('left')}
                className={`px-2 py-1 rounded-md text-[11px] cursor-pointer ${
                  newSectionCol === 'left' ? 'bg-white text-slate-900 font-semibold shadow-2xs' : 'text-slate-600'
                }`}
              >
                左栏
              </button>
              <button
                type="button"
                onClick={() => setNewSectionCol('right')}
                className={`px-2 py-1 rounded-md text-[11px] cursor-pointer ${
                  newSectionCol === 'right' ? 'bg-white text-slate-900 font-semibold shadow-2xs' : 'text-slate-600'
                }`}
              >
                右栏
              </button>
            </div>
          )}
          <button
            type="submit"
            disabled={!newSectionTitle.trim()}
            className="os26-press px-3.5 py-1.5 text-xs font-semibold text-white bg-[#0071e3] hover:bg-[#0077ed] disabled:opacity-40 rounded-xl flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            添加模块
          </button>
        </form>
      </div>
    </div>
  );

  // Render an Individual Section Sheet
  const renderSectionSheet = (sec: SectionConfig) => {
    const col = getEffectiveColumn(sec);
    const sameColSections = isTwoColumn
      ? resume.sections.filter((s) => getEffectiveColumn(s) === col)
      : resume.sections;
    const posInCol = sameColSections.findIndex((s) => s.id === sec.id);

    return (
      <div
        key={sec.id}
        className={`os26-card os26-sheet-enter rounded-2xl overflow-hidden ${!sec.visible ? 'opacity-65' : ''}`}
      >
        {/* Clean OS 26 Sheet Header */}
        <div className="px-5 py-3.5 border-b border-slate-900/[0.06] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <input
              type="text"
              value={sec.title}
              onChange={(e) => updateSectionTitle(sec.id, e.target.value)}
              className="text-sm font-semibold text-slate-900 bg-transparent hover:bg-slate-100/80 focus:bg-white focus:ring-2 focus:ring-[#0071e3]/20 px-1.5 py-0.5 rounded-md focus:outline-none w-24 sm:w-28 transition-all"
              title="点击直接修改模块中文名"
            />
            <span className="text-slate-300" aria-hidden="true">·</span>
            <input
              type="text"
              value={sec.englishTitle ?? ''}
              onChange={(e) => updateSectionEnglishTitle(sec.id, e.target.value)}
              placeholder="ENGLISH TITLE"
              className="text-[11px] font-mono uppercase text-slate-400 bg-transparent hover:bg-slate-100/80 focus:bg-white focus:ring-2 focus:ring-[#0071e3]/20 px-1.5 py-0.5 rounded-md focus:outline-none w-32 transition-all"
              title="点击直接修改模块英文副标题"
            />
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {onRequestAIOptimize && sec.type === 'summary' && (
              <button
                type="button"
                onClick={() =>
                  onRequestAIOptimize({
                    sectionId: sec.id,
                    sectionType: 'summary',
                    sectionTitle: sec.title,
                  })
                }
                className="os26-press px-3 py-1 text-xs font-semibold text-white bg-[#0071e3] hover:bg-[#0077ed] rounded-xl flex items-center gap-1 cursor-pointer"
              >
                <Sparkles className="w-3 h-3" />
                AI优化简介
              </button>
            )}

            {sec.type === 'projects' && (
              <button
                type="button"
                onClick={onOpenGitHubTab}
                className="os26-press px-2.5 py-1 text-[11px] font-semibold text-[#0071e3] bg-[#0071e3]/10 hover:bg-[#0071e3]/16 rounded-lg cursor-pointer"
              >
                + GitHub导入
              </button>
            )}

            {isTwoColumn && (
              <button
                type="button"
                onClick={() => onToggleSectionColumn(sec.id)}
                title="切换模块在左栏或右栏"
                className={`os26-press px-2 py-1 text-[11px] font-medium rounded-lg flex items-center gap-1 cursor-pointer ${
                  col === 'left'
                    ? 'bg-slate-100 text-slate-700 hover:bg-slate-200/70'
                    : 'bg-[#0071e3]/10 text-[#0071e3] font-semibold'
                }`}
              >
                <ArrowLeftRight className="w-2.5 h-2.5" />
                <span>{col === 'left' ? '左栏' : '右栏'}</span>
              </button>
            )}

            <button
              type="button"
              disabled={posInCol <= 0}
              onClick={() => onMoveSectionInView(sec.id, -1, isTwoColumn)}
              title="在当前栏内上移模块"
              className="os26-press p-1.5 text-slate-500 hover:text-slate-900 disabled:opacity-30 rounded-lg hover:bg-slate-100 cursor-pointer"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={posInCol === -1 || posInCol >= sameColSections.length - 1}
              onClick={() => onMoveSectionInView(sec.id, 1, isTwoColumn)}
              title="在当前栏内下移模块"
              className="os26-press p-1.5 text-slate-500 hover:text-slate-900 disabled:opacity-30 rounded-lg hover:bg-slate-100 cursor-pointer"
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => toggleSectionVisibility(sec.id)}
              title={sec.visible ? '在简历中隐藏此模块' : '在简历中显示此模块'}
              className="os26-press p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 cursor-pointer"
            >
              {sec.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            </button>
            {sec.type === 'custom' && (
              <button
                type="button"
                onClick={() => handleDeleteCustomSection(sec)}
                title="删除自定义模块"
                className="os26-press p-1.5 text-red-500 hover:bg-red-50 rounded-lg cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Sheet Body */}
        <div className="p-5 space-y-4">
          {/* 0. SUMMARY */}
          {sec.type === 'summary' && (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] text-slate-500">
                  支持 **粗体关键词** 与 `代码标签` 语法，也可直接在右侧 A4 纸张上双击修改
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onChangeResume((prev) => ({
                      ...prev,
                      basics: {
                        ...prev.basics,
                        summary: `${prev.basics.summary} **核心优势指标**`,
                      },
                    }))
                  }
                  className="os26-press px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-slate-200/80 rounded-lg cursor-pointer"
                >
                  + 插入 **粗体词**
                </button>
              </div>
              <textarea
                rows={4}
                value={resume.basics.summary}
                onChange={(e) =>
                  onChangeResume((prev) => ({
                    ...prev,
                    basics: { ...prev.basics, summary: e.target.value },
                  }))
                }
                className="os26-input w-full p-3 text-xs leading-relaxed"
              />
            </div>
          )}

          {/* 1. EDUCATION */}
          {sec.type === 'education' && (
            <div className="space-y-4">
              {resume.education.map((edu, eduIdx) => (
                <div
                  key={edu.id}
                  className="p-4 rounded-xl bg-slate-50/70 border border-slate-200/70 space-y-3.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-900">
                      {edu.school || `教育经历 #${eduIdx + 1}`}
                    </span>
                    <div className="flex items-center gap-1">
                      {onRequestAIOptimize && (
                        <button
                          type="button"
                          onClick={() =>
                            onRequestAIOptimize({
                              sectionId: sec.id,
                              sectionType: 'education',
                              sectionTitle: `${sec.title} · ${edu.school}`,
                              itemId: edu.id,
                            })
                          }
                          className="os26-press px-2.5 py-1 text-[11px] font-semibold text-[#0071e3] bg-[#0071e3]/10 hover:bg-[#0071e3] hover:text-white rounded-lg flex items-center gap-1 cursor-pointer mr-1"
                        >
                          <Sparkles className="w-3 h-3" />
                          AI优化此项
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={eduIdx === 0}
                        onClick={() =>
                          onChangeResume((prev) => ({
                            ...prev,
                            education: moveArrayItem(prev.education, eduIdx, -1),
                          }))
                        }
                        className="os26-press p-1 text-slate-400 hover:text-slate-800 disabled:opacity-30 rounded-md hover:bg-white cursor-pointer"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={eduIdx === resume.education.length - 1}
                        onClick={() =>
                          onChangeResume((prev) => ({
                            ...prev,
                            education: moveArrayItem(prev.education, eduIdx, 1),
                          }))
                        }
                        className="os26-press p-1 text-slate-400 hover:text-slate-800 disabled:opacity-30 rounded-md hover:bg-white cursor-pointer"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      {resume.education.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            onChangeResume((prev) => ({
                              ...prev,
                              education: prev.education.filter((x) => x.id !== edu.id),
                            }))
                          }
                          className="os26-press p-1 text-slate-400 hover:text-red-600 rounded-md hover:bg-red-50 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">学校名称</label>
                      <input
                        type="text"
                        value={edu.school}
                        onChange={(e) =>
                          onChangeResume((prev) => ({
                            ...prev,
                            education: prev.education.map((x) =>
                              x.id === edu.id ? { ...x, school: e.target.value } : x
                            ),
                          }))
                        }
                        className="os26-input w-full px-3 py-1.5 text-xs bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">专业名称</label>
                      <input
                        type="text"
                        value={edu.major}
                        onChange={(e) =>
                          onChangeResume((prev) => ({
                            ...prev,
                            education: prev.education.map((x) =>
                              x.id === edu.id ? { ...x, major: e.target.value } : x
                            ),
                          }))
                        }
                        className="os26-input w-full px-3 py-1.5 text-xs bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">学位 / 培养层次</label>
                      <input
                        type="text"
                        value={edu.degree}
                        onChange={(e) =>
                          onChangeResume((prev) => ({
                            ...prev,
                            education: prev.education.map((x) =>
                              x.id === edu.id ? { ...x, degree: e.target.value } : x
                            ),
                          }))
                        }
                        className="os26-input w-full px-3 py-1.5 text-xs bg-white"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-500 mb-1">入学时间</label>
                        <input
                          type="text"
                          value={edu.startDate}
                          onChange={(e) =>
                            onChangeResume((prev) => ({
                              ...prev,
                              education: prev.education.map((x) =>
                                x.id === edu.id ? { ...x, startDate: e.target.value } : x
                              ),
                            }))
                          }
                          className="os26-input w-full px-3 py-1.5 text-xs font-mono bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-500 mb-1">毕业时间</label>
                        <input
                          type="text"
                          value={edu.endDate}
                          onChange={(e) =>
                            onChangeResume((prev) => ({
                              ...prev,
                              education: prev.education.map((x) =>
                                x.id === edu.id ? { ...x, endDate: e.target.value } : x
                              ),
                            }))
                          }
                          className="os26-input w-full px-3 py-1.5 text-xs font-mono bg-white"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">GPA 绩点与均分</label>
                      <input
                        type="text"
                        value={edu.gpa}
                        onChange={(e) =>
                          onChangeResume((prev) => ({
                            ...prev,
                            education: prev.education.map((x) =>
                              x.id === edu.id ? { ...x, gpa: e.target.value } : x
                            ),
                          }))
                        }
                        className="os26-input w-full px-3 py-1.5 text-xs font-mono bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">奖学金与荣誉</label>
                      <input
                        type="text"
                        value={edu.honors}
                        onChange={(e) =>
                          onChangeResume((prev) => ({
                            ...prev,
                            education: prev.education.map((x) =>
                              x.id === edu.id ? { ...x, honors: e.target.value } : x
                            ),
                          }))
                        }
                        className="os26-input w-full px-3 py-1.5 text-xs bg-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">核心主修课程</label>
                    <input
                      type="text"
                      value={edu.courses}
                      onChange={(e) =>
                        onChangeResume((prev) => ({
                          ...prev,
                          education: prev.education.map((x) =>
                            x.id === edu.id ? { ...x, courses: e.target.value } : x
                          ),
                        }))
                      }
                      className="os26-input w-full px-3 py-1.5 text-xs bg-white"
                    />
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={() => {
                  const newEdu: EducationItem = {
                    id: `edu-${Date.now()}`,
                    school: '某某大学',
                    degree: '本科',
                    major: '电子信息工程（本科）',
                    startDate: '2023.09',
                    endDate: '2027.06',
                    gpa: '3.85/5.00（均分 88.5）',
                    ranking: '',
                    courses: '嵌入式微控制器、数字信号处理、模拟电子技术、FPGA 系统设计',
                    honors: '每学期获校级奖学金',
                  };
                  onChangeResume((prev) => ({ ...prev, education: [...prev.education, newEdu] }));
                }}
                className="os26-press w-full py-2.5 text-xs font-semibold text-slate-700 bg-slate-100/80 hover:bg-slate-200/70 rounded-xl flex items-center justify-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> 新增一段教育背景
              </button>
            </div>
          )}

          {/* 2. PROJECTS */}
          {sec.type === 'projects' && (
            <div className="space-y-4">
              {resume.projects.map((proj, projIdx) => (
                <div
                  key={proj.id}
                  className="p-4 rounded-xl bg-slate-50/70 border border-slate-200/70 space-y-3.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-900">
                      {projIdx + 1}. {proj.name}
                    </span>
                    <div className="flex items-center gap-1">
                      {onRequestAIOptimize && (
                        <button
                          type="button"
                          onClick={() =>
                            onRequestAIOptimize({
                              sectionId: sec.id,
                              sectionType: 'projects',
                              sectionTitle: `项目经历 · ${proj.name}`,
                              itemId: proj.id,
                            })
                          }
                          className="os26-press px-2.5 py-1 text-xs font-semibold text-[#0071e3] bg-[#0071e3]/10 hover:bg-[#0071e3] hover:text-white rounded-lg flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer mr-1"
                        >
                          <Sparkles className="w-3 h-3" />
                          AI优化此项目
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={projIdx === 0}
                        onClick={() =>
                          onChangeResume((prev) => ({
                            ...prev,
                            projects: moveArrayItem(prev.projects, projIdx, -1),
                          }))
                        }
                        className="os26-press p-1 text-slate-400 hover:text-slate-800 disabled:opacity-30 rounded-md hover:bg-white cursor-pointer"
                        title="上移此项目"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={projIdx === resume.projects.length - 1}
                        onClick={() =>
                          onChangeResume((prev) => ({
                            ...prev,
                            projects: moveArrayItem(prev.projects, projIdx, 1),
                          }))
                        }
                        className="os26-press p-1 text-slate-400 hover:text-slate-800 disabled:opacity-30 rounded-md hover:bg-white cursor-pointer"
                        title="下移此项目"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onChangeResume((prev) => ({
                            ...prev,
                            projects: prev.projects.filter((x) => x.id !== proj.id),
                          }))
                        }
                        className="os26-press p-1 text-slate-400 hover:text-red-600 rounded-md hover:bg-red-50 cursor-pointer"
                        title="删除此项目"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">项目名称</label>
                      <input
                        type="text"
                        value={proj.name}
                        onChange={(e) =>
                          onChangeResume((prev) => ({
                            ...prev,
                            projects: prev.projects.map((x) =>
                              x.id === proj.id ? { ...x, name: e.target.value } : x
                            ),
                          }))
                        }
                        className="os26-input w-full px-3 py-1.5 text-xs bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">担任角色</label>
                      <input
                        type="text"
                        value={proj.role}
                        onChange={(e) =>
                          onChangeResume((prev) => ({
                            ...prev,
                            projects: prev.projects.map((x) =>
                              x.id === proj.id ? { ...x, role: e.target.value } : x
                            ),
                          }))
                        }
                        className="os26-input w-full px-3 py-1.5 text-xs bg-white"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-500 mb-1">开始时间</label>
                        <input
                          type="text"
                          value={proj.startDate}
                          onChange={(e) =>
                            onChangeResume((prev) => ({
                              ...prev,
                              projects: prev.projects.map((x) =>
                                x.id === proj.id ? { ...x, startDate: e.target.value } : x
                              ),
                            }))
                          }
                          className="os26-input w-full px-3 py-1.5 text-xs font-mono bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-500 mb-1">结束时间</label>
                        <input
                          type="text"
                          value={proj.endDate}
                          onChange={(e) =>
                            onChangeResume((prev) => ({
                              ...prev,
                              projects: prev.projects.map((x) =>
                                x.id === proj.id ? { ...x, endDate: e.target.value } : x
                              ),
                            }))
                          }
                          className="os26-input w-full px-3 py-1.5 text-xs font-mono bg-white"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">
                        核心技术栈（英文逗号分隔）
                      </label>
                      <input
                        type="text"
                        value={proj.techStack.join(', ')}
                        onChange={(e) =>
                          onChangeResume((prev) => ({
                            ...prev,
                            projects: prev.projects.map((x) =>
                              x.id === proj.id
                                ? {
                                    ...x,
                                    techStack: e.target.value
                                      .split(',')
                                      .map((s) => s.trim())
                                      .filter(Boolean),
                                  }
                                : x
                            ),
                          }))
                        }
                        className="os26-input w-full px-3 py-1.5 text-xs font-mono bg-white"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                      <label className="text-[11px] font-medium text-slate-500">
                        项目描述要点（每行一条；用 **文字** 加粗关键指标）
                      </label>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            onChangeResume((prev) => ({
                              ...prev,
                              projects: prev.projects.map((x) =>
                                x.id === proj.id
                                  ? {
                                      ...x,
                                      bullets: [
                                        ...x.bullets,
                                        '核心技术突破：采用 **DMA双缓冲** 与 **FreeRTOS多任务调度**，处理效率提升 **35%**。',
                                      ],
                                    }
                                  : x
                              ),
                            }))
                          }
                          className="os26-press px-2 py-0.5 text-[10px] font-medium text-slate-600 bg-white border border-slate-200/80 hover:bg-slate-50 rounded-md cursor-pointer"
                        >
                          + 加粗指标行
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onChangeResume((prev) => ({
                              ...prev,
                              projects: prev.projects.map((x) =>
                                x.id === proj.id
                                  ? {
                                      ...x,
                                      bullets: [
                                        ...x.bullets,
                                        '项目成果：完成实板联调与量化验证，核心指标达到设计预期。',
                                      ],
                                    }
                                  : x
                              ),
                            }))
                          }
                          className="os26-press px-2 py-0.5 text-[10px] font-medium text-[#0071e3] bg-[#0071e3]/8 hover:bg-[#0071e3]/14 rounded-md cursor-pointer"
                        >
                          + 项目成果行
                        </button>
                      </div>
                    </div>
                    <textarea
                      rows={4}
                      value={proj.bullets.join('\n')}
                      onChange={(e) =>
                        onChangeResume((prev) => ({
                          ...prev,
                          projects: prev.projects.map((x) =>
                            x.id === proj.id ? { ...x, bullets: e.target.value.split('\n') } : x
                          ),
                        }))
                      }
                      className="os26-input w-full p-3 text-xs leading-relaxed bg-white"
                    />
                  </div>
                </div>
              ))}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const newProj: ProjectItem = {
                      id: `proj-${Date.now()}`,
                      name: '新嵌入式/FPGA/控制项目名称',
                      role: '独立开发',
                      startDate: '2026.03',
                      endDate: '2026.08',
                      repoUrl: '',
                      techStack: ['STM32', 'FreeRTOS', 'ADC/DMA', 'PID'],
                      summary: '',
                      bullets: [
                        '设计并实现多任务采集与控制逻辑，通过消息队列和互斥量协调共享状态。',
                        '项目成果：完成实板满载联调测试，各项指标达到设计预期。',
                      ],
                    };
                    onChangeResume((prev) => ({ ...prev, projects: [...prev.projects, newProj] }));
                  }}
                  className="os26-press flex-1 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100/80 hover:bg-slate-200/70 rounded-xl flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> 新增项目经历
                </button>
                <button
                  type="button"
                  onClick={onOpenGitHubTab}
                  className="os26-press px-4 py-2.5 text-xs font-semibold text-[#0071e3] bg-[#0071e3]/10 hover:bg-[#0071e3]/16 rounded-xl flex items-center gap-1 cursor-pointer"
                >
                  从 GitHub 导入
                </button>
              </div>
            </div>
          )}

          {/* 3. EXPERIENCE */}
          {sec.type === 'experience' && (
            <div className="space-y-4">
              {resume.experience.map((exp, expIdx) => (
                <div
                  key={exp.id}
                  className="p-4 rounded-xl bg-slate-50/70 border border-slate-200/70 space-y-3.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-900">
                      {exp.company || `实习经历 #${expIdx + 1}`}
                    </span>
                    <div className="flex items-center gap-1">
                      {onRequestAIOptimize && (
                        <button
                          type="button"
                          onClick={() =>
                            onRequestAIOptimize({
                              sectionId: sec.id,
                              sectionType: 'experience',
                              sectionTitle: `实习经历 · ${exp.company}`,
                              itemId: exp.id,
                            })
                          }
                          className="os26-press px-2.5 py-1 text-xs font-semibold text-[#0071e3] bg-[#0071e3]/10 hover:bg-[#0071e3] hover:text-white rounded-lg flex items-center gap-1 cursor-pointer mr-1"
                        >
                          <Sparkles className="w-3 h-3" />
                          AI优化此实习
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={expIdx === 0}
                        onClick={() =>
                          onChangeResume((prev) => ({
                            ...prev,
                            experience: moveArrayItem(prev.experience, expIdx, -1),
                          }))
                        }
                        className="os26-press p-1 text-slate-400 hover:text-slate-800 disabled:opacity-30 rounded-md hover:bg-white cursor-pointer"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={expIdx === resume.experience.length - 1}
                        onClick={() =>
                          onChangeResume((prev) => ({
                            ...prev,
                            experience: moveArrayItem(prev.experience, expIdx, 1),
                          }))
                        }
                        className="os26-press p-1 text-slate-400 hover:text-slate-800 disabled:opacity-30 rounded-md hover:bg-white cursor-pointer"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onChangeResume((prev) => ({
                            ...prev,
                            experience: prev.experience.filter((x) => x.id !== exp.id),
                          }))
                        }
                        className="os26-press p-1 text-slate-400 hover:text-red-600 rounded-md hover:bg-red-50 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">公司名称</label>
                      <input
                        type="text"
                        value={exp.company}
                        onChange={(e) =>
                          onChangeResume((prev) => ({
                            ...prev,
                            experience: prev.experience.map((x) =>
                              x.id === exp.id ? { ...x, company: e.target.value } : x
                            ),
                          }))
                        }
                        className="os26-input w-full px-3 py-1.5 text-xs bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 mb-1">岗位名称</label>
                      <input
                        type="text"
                        value={exp.position}
                        onChange={(e) =>
                          onChangeResume((prev) => ({
                            ...prev,
                            experience: prev.experience.map((x) =>
                              x.id === exp.id ? { ...x, position: e.target.value } : x
                            ),
                          }))
                        }
                        className="os26-input w-full px-3 py-1.5 text-xs bg-white"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:col-span-2">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-500 mb-1">开始时间</label>
                        <input
                          type="text"
                          value={exp.startDate}
                          onChange={(e) =>
                            onChangeResume((prev) => ({
                              ...prev,
                              experience: prev.experience.map((x) =>
                                x.id === exp.id ? { ...x, startDate: e.target.value } : x
                              ),
                            }))
                          }
                          className="os26-input w-full px-3 py-1.5 text-xs font-mono bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-500 mb-1">结束时间</label>
                        <input
                          type="text"
                          value={exp.endDate}
                          onChange={(e) =>
                            onChangeResume((prev) => ({
                              ...prev,
                              experience: prev.experience.map((x) =>
                                x.id === exp.id ? { ...x, endDate: e.target.value } : x
                              ),
                            }))
                          }
                          className="os26-input w-full px-3 py-1.5 text-xs font-mono bg-white"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">
                      实习工作内容描述
                    </label>
                    <textarea
                      rows={3}
                      value={exp.bullets.join('\n')}
                      onChange={(e) =>
                        onChangeResume((prev) => ({
                          ...prev,
                          experience: prev.experience.map((x) =>
                            x.id === exp.id ? { ...x, bullets: e.target.value.split('\n') } : x
                          ),
                        }))
                      }
                      className="os26-input w-full p-3 text-xs leading-relaxed bg-white"
                    />
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={() => {
                  const newExp: ExperienceItem = {
                    id: `exp-${Date.now()}`,
                    company: '某某科技有限公司',
                    position: '嵌入式/硬件研发实习生',
                    department: '',
                    location: '郑州',
                    startDate: '2026.03',
                    endDate: '2026.06',
                    techStack: [],
                    bullets: ['负责核心驱动模块编写与板级硬件联调测试，完成工程文档归档。'],
                  };
                  onChangeResume((prev) => ({ ...prev, experience: [...prev.experience, newExp] }));
                }}
                className="os26-press w-full py-2.5 text-xs font-semibold text-slate-700 bg-slate-100/80 hover:bg-slate-200/70 rounded-xl flex items-center justify-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> 新增实习经历
              </button>
            </div>
          )}

          {/* 4. SKILLS */}
          {sec.type === 'skills' && (
            <div className="space-y-3">
              {resume.skills.map((sk, skIdx) => (
                <div
                  key={sk.id}
                  className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-200/70 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <input
                      type="text"
                      value={sk.category}
                      onChange={(e) =>
                        onChangeResume((prev) => ({
                          ...prev,
                          skills: prev.skills.map((x) =>
                            x.id === sk.id ? { ...x, category: e.target.value } : x
                          ),
                        }))
                      }
                      className="os26-input px-2.5 py-1 text-xs font-semibold text-slate-900 bg-white w-48"
                    />
                    <div className="flex items-center gap-1">
                      {onRequestAIOptimize && (
                        <button
                          type="button"
                          onClick={() =>
                            onRequestAIOptimize({
                              sectionId: sec.id,
                              sectionType: 'skills',
                              sectionTitle: `专业技能 · ${sk.category}`,
                              itemId: sk.id,
                            })
                          }
                          className="os26-press px-2.5 py-1 text-[11px] font-semibold text-[#0071e3] bg-[#0071e3]/10 hover:bg-[#0071e3] hover:text-white rounded-lg flex items-center gap-1 cursor-pointer mr-0.5"
                        >
                          <Sparkles className="w-3 h-3" />
                          AI优化此类目
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={skIdx === 0}
                        onClick={() =>
                          onChangeResume((prev) => ({
                            ...prev,
                            skills: moveArrayItem(prev.skills, skIdx, -1),
                          }))
                        }
                        className="os26-press p-1 text-slate-400 hover:text-slate-800 disabled:opacity-30 rounded-md hover:bg-white cursor-pointer"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={skIdx === resume.skills.length - 1}
                        onClick={() =>
                          onChangeResume((prev) => ({
                            ...prev,
                            skills: moveArrayItem(prev.skills, skIdx, 1),
                          }))
                        }
                        className="os26-press p-1 text-slate-400 hover:text-slate-800 disabled:opacity-30 rounded-md hover:bg-white cursor-pointer"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onChangeResume((prev) => ({
                            ...prev,
                            skills: prev.skills.filter((x) => x.id !== sk.id),
                          }))
                        }
                        className="os26-press p-1 text-slate-400 hover:text-red-600 rounded-md hover:bg-red-50 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <textarea
                    rows={2}
                    value={sk.items}
                    onChange={(e) =>
                      onChangeResume((prev) => ({
                        ...prev,
                        skills: prev.skills.map((x) => (x.id === sk.id ? { ...x, items: e.target.value } : x)),
                      }))
                    }
                    className="os26-input w-full p-2.5 text-xs leading-relaxed bg-white"
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() => {
                  const newSk: SkillCategory = {
                    id: `sk-${Date.now()}`,
                    category: '新增技能维度',
                    items: '在此填写具体掌握的芯片架构、开发语言、仪器设备或工程软件工具。',
                  };
                  onChangeResume((prev) => ({ ...prev, skills: [...prev.skills, newSk] }));
                }}
                className="os26-press w-full py-2.5 text-xs font-semibold text-slate-700 bg-slate-100/80 hover:bg-slate-200/70 rounded-xl flex items-center justify-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> 新增技能分类块
              </button>
            </div>
          )}

          {/* 5. AWARDS */}
          {sec.type === 'awards' && (
            <div className="space-y-3">
              {resume.awards.map((aw, awIdx) => (
                <div
                  key={aw.id}
                  className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-200/70 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-800 truncate">{aw.title}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {onRequestAIOptimize && (
                        <button
                          type="button"
                          onClick={() =>
                            onRequestAIOptimize({
                              sectionId: sec.id,
                              sectionType: 'awards',
                              sectionTitle: `证书与荣誉 · ${aw.title}`,
                              itemId: aw.id,
                            })
                          }
                          className="os26-press px-2.5 py-1 text-[11px] font-semibold text-[#0071e3] bg-[#0071e3]/10 hover:bg-[#0071e3] hover:text-white rounded-lg flex items-center gap-1 cursor-pointer mr-0.5"
                        >
                          <Sparkles className="w-3 h-3" />
                          AI优化此项
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={awIdx === 0}
                        onClick={() =>
                          onChangeResume((prev) => ({
                            ...prev,
                            awards: moveArrayItem(prev.awards, awIdx, -1),
                          }))
                        }
                        className="os26-press p-1 text-slate-400 hover:text-slate-800 disabled:opacity-30 rounded-md hover:bg-white cursor-pointer"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={awIdx === resume.awards.length - 1}
                        onClick={() =>
                          onChangeResume((prev) => ({
                            ...prev,
                            awards: moveArrayItem(prev.awards, awIdx, 1),
                          }))
                        }
                        className="os26-press p-1 text-slate-400 hover:text-slate-800 disabled:opacity-30 rounded-md hover:bg-white cursor-pointer"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onChangeResume((prev) => ({
                            ...prev,
                            awards: prev.awards.filter((x) => x.id !== aw.id),
                          }))
                        }
                        className="os26-press p-1 text-slate-400 hover:text-red-600 rounded-md hover:bg-red-50 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <input
                      type="text"
                      value={aw.title}
                      onChange={(e) =>
                        onChangeResume((prev) => ({
                          ...prev,
                          awards: prev.awards.map((x) =>
                            x.id === aw.id ? { ...x, title: e.target.value } : x
                          ),
                        }))
                      }
                      placeholder="证书或竞赛名称"
                      className="os26-input px-3 py-1.5 text-xs bg-white"
                    />
                    <input
                      type="text"
                      value={aw.level}
                      onChange={(e) =>
                        onChangeResume((prev) => ({
                          ...prev,
                          awards: prev.awards.map((x) =>
                            x.id === aw.id ? { ...x, level: e.target.value } : x
                          ),
                        }))
                      }
                      placeholder="括号补充说明（如：三级 / 高级工）"
                      className="os26-input px-3 py-1.5 text-xs bg-white"
                    />
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => {
                  const newAw: AwardItem = {
                    id: `aw-${Date.now()}`,
                    title: '新增证书或荣誉奖项',
                    issuer: '',
                    date: '',
                    level: '',
                    description: '',
                  };
                  onChangeResume((prev) => ({ ...prev, awards: [...prev.awards, newAw] }));
                }}
                className="os26-press w-full py-2.5 text-xs font-semibold text-slate-700 bg-slate-100/80 hover:bg-slate-200/70 rounded-xl flex items-center justify-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> 新增证书与荣誉
              </button>
            </div>
          )}

          {/* 6. CUSTOM SECTION */}
          {sec.type === 'custom' && (
            <div className="space-y-3">
              {resume.customSections
                .find((c) => c.id === sec.customSectionId)
                ?.items.map((item) => (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-200/70 space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-800 truncate">{item.heading}</span>
                      {onRequestAIOptimize && (
                        <button
                          type="button"
                          onClick={() =>
                            onRequestAIOptimize({
                              sectionId: sec.id,
                              sectionType: 'custom',
                              sectionTitle: `${sec.title} · ${item.heading}`,
                              customSectionId: sec.customSectionId,
                              itemId: item.id,
                            })
                          }
                          className="os26-press px-2.5 py-1 text-[11px] font-semibold text-[#0071e3] bg-[#0071e3]/10 hover:bg-[#0071e3] hover:text-white rounded-lg flex items-center gap-1 cursor-pointer shrink-0"
                        >
                          <Sparkles className="w-3 h-3" />
                          AI优化此项
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <input
                        type="text"
                        value={item.heading}
                        onChange={(e) =>
                          onChangeResume((prev) => ({
                            ...prev,
                            customSections: prev.customSections.map((c) =>
                              c.id === sec.customSectionId
                                ? {
                                    ...c,
                                    items: c.items.map((it) =>
                                      it.id === item.id ? { ...it, heading: e.target.value } : it
                                    ),
                                  }
                                : c
                            ),
                          }))
                        }
                        placeholder="主标题"
                        className="os26-input sm:col-span-2 px-3 py-1.5 text-xs bg-white"
                      />
                      <input
                        type="text"
                        value={item.date}
                        onChange={(e) =>
                          onChangeResume((prev) => ({
                            ...prev,
                            customSections: prev.customSections.map((c) =>
                              c.id === sec.customSectionId
                                ? {
                                    ...c,
                                    items: c.items.map((it) =>
                                      it.id === item.id ? { ...it, date: e.target.value } : it
                                    ),
                                  }
                                : c
                            ),
                          }))
                        }
                        placeholder="时间"
                        className="os26-input px-3 py-1.5 text-xs font-mono bg-white"
                      />
                    </div>
                    <input
                      type="text"
                      value={item.subheading}
                      onChange={(e) =>
                        onChangeResume((prev) => ({
                          ...prev,
                          customSections: prev.customSections.map((c) =>
                            c.id === sec.customSectionId
                              ? {
                                  ...c,
                                  items: c.items.map((it) =>
                                    it.id === item.id ? { ...it, subheading: e.target.value } : it
                                  ),
                                }
                              : c
                          ),
                        }))
                      }
                      placeholder="副标题 / 角色 / 专利号"
                      className="os26-input w-full px-3 py-1.5 text-xs bg-white"
                    />
                    <textarea
                      rows={2}
                      value={item.bullets.join('\n')}
                      onChange={(e) =>
                        onChangeResume((prev) => ({
                          ...prev,
                          customSections: prev.customSections.map((c) =>
                            c.id === sec.customSectionId
                              ? {
                                  ...c,
                                  items: c.items.map((it) =>
                                    it.id === item.id ? { ...it, bullets: e.target.value.split('\n') } : it
                                  ),
                                }
                              : c
                          ),
                        }))
                      }
                      placeholder="详细描述（每行一条）"
                      className="os26-input w-full p-2.5 text-xs bg-white"
                    />
                  </div>
                ))}

              <button
                type="button"
                onClick={() => {
                  onChangeResume((prev) => ({
                    ...prev,
                    customSections: prev.customSections.map((c) =>
                      c.id === sec.customSectionId
                        ? {
                            ...c,
                            items: [
                              ...c.items,
                              {
                                id: `ci-${Date.now()}`,
                                heading: '新增自定义条目',
                                subheading: '副标题或说明',
                                date: '2026.06',
                                bullets: ['详细成果说明'],
                              },
                            ],
                          }
                        : c
                    ),
                  }));
                }}
                className="os26-press w-full py-2.5 text-xs font-semibold text-slate-700 bg-slate-100/80 hover:bg-slate-200/70 rounded-xl flex items-center justify-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> 在此模块下新增条目
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const activeSectionObj = resume.sections.find((s) => s.id === effectiveActiveId) || null;

  return (
    <div className="space-y-3.5">
      {/* 1. OS 26 Segmented Module Dock (Eliminates Accordion Clutter) */}
      <div className="os26-card rounded-2xl p-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 overflow-x-auto py-0.5 px-0.5 flex-1">
          <button
            type="button"
            onClick={() => {
              setViewMode('focused');
              onSelectSection('basics');
            }}
            className={`os26-press px-3 py-1.5 text-xs font-medium rounded-xl whitespace-nowrap shrink-0 cursor-pointer ${
              viewMode === 'focused' && effectiveActiveId === 'basics'
                ? 'bg-[#0071e3] text-white font-semibold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
            }`}
          >
            基本信息
          </button>

          {resume.sections.map((sec) => {
            const isActive = viewMode === 'focused' && effectiveActiveId === sec.id;
            return (
              <button
                key={sec.id}
                type="button"
                onClick={() => {
                  setViewMode('focused');
                  onSelectSection(sec.id);
                }}
                className={`os26-press px-3 py-1.5 text-xs font-medium rounded-xl whitespace-nowrap shrink-0 cursor-pointer ${
                  isActive
                    ? 'bg-[#0071e3] text-white font-semibold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                } ${!sec.visible ? 'opacity-45' : ''}`}
              >
                {sec.title}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => {
              setViewMode('focused');
              onSelectSection('layout-manager');
            }}
            className={`os26-press px-3 py-1.5 text-xs font-medium rounded-xl whitespace-nowrap shrink-0 flex items-center gap-1 cursor-pointer ${
              viewMode === 'focused' && effectiveActiveId === 'layout-manager'
                ? 'bg-[#0071e3] text-white font-semibold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
            }`}
          >
            <Layers className="w-3 h-3" />
            <span>排序与分栏</span>
          </button>
        </div>

        {/* Toggle between OS 26 Focused Inspector vs All Modules Stacked */}
        <button
          type="button"
          onClick={() => setViewMode((v) => (v === 'focused' ? 'all' : 'focused'))}
          title={viewMode === 'focused' ? '切换为全部模块平铺展开' : '切换为 OS 26 单模块专注视图'}
          className={`os26-press px-2.5 py-1.5 text-[11px] font-medium rounded-xl whitespace-nowrap shrink-0 flex items-center gap-1 cursor-pointer border ${
            viewMode === 'all'
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-slate-100/80 text-slate-600 border-slate-200/70 hover:text-slate-900'
          }`}
        >
          <LayoutList className="w-3 h-3" />
          <span className="hidden sm:inline">{viewMode === 'focused' ? '全部展开' : '专注单模块'}</span>
        </button>
      </div>

      {/* 3. Active Module Content (Focused Inspector Mode vs All Modules Mode) */}
      {viewMode === 'focused' ? (
        <>
          {effectiveActiveId === 'basics' && renderBasicsSheet()}
          {effectiveActiveId === 'layout-manager' && renderLayoutManagerSheet()}
          {activeSectionObj && renderSectionSheet(activeSectionObj)}
        </>
      ) : (
        <div className="space-y-4">
          {renderBasicsSheet()}
          {resume.sections.map((sec) => renderSectionSheet(sec))}
          {renderLayoutManagerSheet()}
        </div>
      )}
    </div>
  );
};
