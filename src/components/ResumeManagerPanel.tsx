import React, { useMemo, useState } from 'react';
import { ResumeDocument, ResumeSlot } from '../types/resume';
import {
  ArrowRightLeft,
  Check,
  CopyPlus,
  Download,
  Edit3,
  FilePlus2,
  FileText,
  FileUp,
  FolderPlus,
  GitBranchPlus,
  Layers,
  Pencil,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';

interface ResumeManagerPanelProps {
  slots: ResumeSlot[];
  activeSlotId: string;
  roleLanes: string[];
  onSwitchSlot: (slotId: string, openEditor?: boolean) => void;
  onBranchSlotVersion: (sourceSlotId: string, customNote?: string) => void;
  onCreateSlotInLane: (
    roleCategory: string,
    templateSource: 'current' | 'ee-default',
    customName?: string,
    targetCompany?: string
  ) => void;
  onUpdateSlotMeta: (
    slotId: string,
    patch: Partial<Pick<ResumeSlot, 'name' | 'roleCategory' | 'versionTag' | 'targetCompany' | 'notes'>>
  ) => void;
  onDeleteSlot: (slotId: string) => void;
  onAddRoleLane: (laneName: string) => void;
  onRenameRoleLane: (oldName: string, newName: string) => void;
  onDeleteRoleLane: (laneName: string) => void;
  onExportSlotJSON: (slot: ResumeSlot) => void;
  onOpenImportModal?: () => void;
  onOpenMasterCompose?: () => void;
}

const PRESET_ROLE_LANES = [
  '嵌入式软件工程师',
  '软件工程师 / 测试与技术支持',
  '硬件工程师 / PCB设计',
  'FPGA / 数字IC开发工程师',
  '物联网 / 边缘计算工程师',
];

function formatRelativeTime(iso: string): string {
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return '刚刚';
  }
}

export const ResumeManagerPanel: React.FC<ResumeManagerPanelProps> = ({
  slots,
  activeSlotId,
  roleLanes,
  onSwitchSlot,
  onBranchSlotVersion,
  onCreateSlotInLane,
  onUpdateSlotMeta,
  onDeleteSlot,
  onAddRoleLane,
  onRenameRoleLane,
  onDeleteRoleLane,
  onExportSlotJSON,
  onOpenImportModal,
  onOpenMasterCompose,
}) => {
  const [selectedLaneFilter, setSelectedLaneFilter] = useState<string>('ALL');
  const [addingLane, setAddingLane] = useState(false);
  const [newLaneName, setNewLaneName] = useState('');

  // Lane rename state
  const [renamingLane, setRenamingLane] = useState<string | null>(null);
  const [laneRenameDraft, setLaneRenameDraft] = useState('');

  // New resume modal/inline creator per lane
  const [creatingInLane, setCreatingInLane] = useState<string | null>(null);
  const [newResumeName, setNewResumeName] = useState('');
  const [newResumeCompany, setNewResumeCompany] = useState('');
  const [newResumeSource, setNewResumeSource] = useState<'current' | 'ee-default'>('current');

  // Editing specific slot metadata inline
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editVersionTag, setEditVersionTag] = useState('');
  const [editCompany, setEditCompany] = useState('');
  const [editNotes, setEditNotes] = useState('');

  // Moving slot to another lane
  const [movingSlotId, setMovingSlotId] = useState<string | null>(null);

  // Compute all unique lanes preserving order
  const allLanes = useMemo(() => {
    const set = new Set<string>(roleLanes);
    slots.forEach((s) => {
      if (s.roleCategory) set.add(s.roleCategory);
    });
    return Array.from(set);
  }, [roleLanes, slots]);

  const visibleLanes = useMemo(() => {
    if (selectedLaneFilter === 'ALL') return allLanes;
    return allLanes.filter((l) => l === selectedLaneFilter);
  }, [allLanes, selectedLaneFilter]);

  const startEditSlot = (slot: ResumeSlot) => {
    setEditingSlotId(slot.id);
    setEditName(slot.name);
    setEditVersionTag(slot.versionTag || 'v1.0');
    setEditCompany(slot.targetCompany || '');
    setEditNotes(slot.notes || '');
  };

  const saveEditSlot = (slotId: string) => {
    onUpdateSlotMeta(slotId, {
      name: editName.trim() || '未命名简历版本',
      versionTag: editVersionTag.trim() || 'v1.0',
      targetCompany: editCompany.trim(),
      notes: editNotes.trim(),
    });
    setEditingSlotId(null);
  };

  const handleConfirmAddLane = (nameToUse?: string) => {
    const target = (nameToUse ?? newLaneName).trim();
    if (!target) return;
    onAddRoleLane(target);
    setNewLaneName('');
    setAddingLane(false);
    setSelectedLaneFilter('ALL');
  };

  const handleOpenCreateInLane = (lane: string) => {
    const laneSlots = slots.filter((s) => s.roleCategory === lane);
    const nextVer = `v1.${laneSlots.length}`;
    setCreatingInLane(lane);
    setNewResumeName(`${lane} · 修改版 ${nextVer}`);
    setNewResumeCompany('');
    setNewResumeSource('current');
  };

  const handleConfirmCreateInLane = (lane: string) => {
    onCreateSlotInLane(
      lane,
      newResumeSource,
      newResumeName.trim() || `${lane} 新版本`,
      newResumeCompany.trim()
    );
    setCreatingInLane(null);
  };

  const countResumeHighlights = (doc: ResumeDocument) => {
    const projCount = doc.projects?.length || 0;
    const expCount = doc.experience?.length || 0;
    const skillCount = doc.skills?.length || 0;
    return `${projCount}段项目 · ${expCount}段实习 · ${skillCount}类技能`;
  };

  return (
    <div className="space-y-4 pb-10 os26-sheet-enter">
      {/* ===================================================================
          OS 26 HEADER & ROLE LANE CONTROLLER
         =================================================================== */}
      <div className="os26-card p-4 space-y-3.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#0071e3]" />
              <span>多岗位简历版本管理</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {allLanes.length} 个目标岗位分栏 · 共 {slots.length} 份简历修改版本 · 支持随时派生 v1.1 / v1.2 迭代留档
            </p>
          </div>

          <div className="flex items-center gap-2">

            {onOpenMasterCompose && (
              <button type="button" onClick={onOpenMasterCompose}
                className="os26-press px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
                <Sparkles className="w-3.5 h-3.5"/>
                <span>从母版生成岗位版</span>
              </button>
            )}
            {onOpenImportModal && (
              <button
                type="button"
                onClick={onOpenImportModal}
                className="os26-press px-3 py-1.5 rounded-xl bg-[#0071e3]/10 hover:bg-[#0071e3]/15 text-[#0071e3] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <FileUp className="w-3.5 h-3.5" />
                <span>导入外部简历</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setAddingLane((v) => !v)}
              className="os26-press px-3 py-1.5 rounded-xl bg-[#0071e3] hover:bg-[#0077ed] text-white text-xs font-semibold flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              <span>新增岗位分栏</span>
            </button>
          </div>
        </div>

        {/* Add New Job Role Lane Sheet */}
        {addingLane && (
          <div className="p-3.5 rounded-2xl bg-slate-900/[0.03] border border-slate-200/80 space-y-2.5 os26-popover-enter">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">
                新建目标岗位分栏（每个岗位独立管理多份修改版简历）
              </span>
              <button
                type="button"
                onClick={() => setAddingLane(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                autoFocus
                value={newLaneName}
                onChange={(e) => setNewLaneName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleConfirmAddLane();
                  if (e.key === 'Escape') setAddingLane(false);
                }}
                placeholder="输入岗位名称，例如：嵌入式Linux开发工程师 / 硬件工程师..."
                className="os26-input flex-1 px-3 py-1.5 text-xs"
              />
              <button
                type="button"
                onClick={() => handleConfirmAddLane()}
                className="os26-press px-3.5 py-1.5 rounded-xl bg-[#0071e3] text-white text-xs font-semibold cursor-pointer"
              >
                创建岗位栏
              </button>
            </div>

            {/* Quick Role Lane Presets */}
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <span className="text-[11px] text-slate-400">快捷添加岗位栏：</span>
              {PRESET_ROLE_LANES.filter((p) => !allLanes.includes(p)).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleConfirmAddLane(preset)}
                  className="os26-press px-2.5 py-1 rounded-lg bg-white hover:bg-[#0071e3]/10 hover:text-[#0071e3] text-[11px] font-medium text-slate-600 border border-slate-200/80 cursor-pointer"
                >
                  + {preset}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Segmented Role Lane Filter Pill Bar */}
        <div className="os26-segmented p-1 flex items-center gap-1 overflow-x-auto">
          <button
            type="button"
            onClick={() => setSelectedLaneFilter('ALL')}
            className={`os26-press px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-all ${
              selectedLaneFilter === 'ALL'
                ? 'os26-segment-active'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            全部岗位分栏
          </button>
          {allLanes.map((lane) => {
            const count = slots.filter((s) => s.roleCategory === lane).length;
            const active = selectedLaneFilter === lane;
            return (
              <button
                key={lane}
                type="button"
                onClick={() => setSelectedLaneFilter(lane)}
                className={`os26-press px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-all flex items-center gap-1.5 ${
                  active ? 'os26-segment-active' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>{lane}</span>
                <span className="text-[11px] text-slate-400 font-mono">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ===================================================================
          JOB ROLE LANES (每个岗位一栏 · 栏内管理多份修改版本)
         =================================================================== */}
      <div className="space-y-4">
        {visibleLanes.map((lane) => {
          const laneSlots = slots.filter((s) => s.roleCategory === lane);
          const hasActiveSlot = laneSlots.some((s) => s.id === activeSlotId);

          return (
            <div
              key={lane}
              className={`os26-card overflow-hidden transition-all ${
                hasActiveSlot ? 'ring-1 ring-[#0071e3]/30' : ''
              }`}
            >
              {/* Role Lane Header */}
              <div className="px-4 py-3 bg-slate-900/[0.025] border-b border-slate-900/[0.06] flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      hasActiveSlot ? 'bg-[#0071e3]' : 'bg-slate-300'
                    }`}
                  />

                  {renamingLane === lane ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        autoFocus
                        value={laneRenameDraft}
                        onChange={(e) => setLaneRenameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && laneRenameDraft.trim()) {
                            onRenameRoleLane(lane, laneRenameDraft.trim());
                            setRenamingLane(null);
                          }
                          if (e.key === 'Escape') setRenamingLane(null);
                        }}
                        className="os26-input px-2.5 py-1 text-xs font-semibold bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (laneRenameDraft.trim()) {
                            onRenameRoleLane(lane, laneRenameDraft.trim());
                          }
                          setRenamingLane(null);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-[#0071e3] text-white text-xs font-semibold cursor-pointer"
                      >
                        保存
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 min-w-0">
                      <h3 className="text-sm font-bold text-slate-900 truncate">{lane}</h3>
                      <span className="text-xs text-slate-400 whitespace-nowrap">
                        · {laneSlots.length} 份修改版本
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setRenamingLane(lane);
                          setLaneRenameDraft(lane);
                        }}
                        className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
                        title="重命名该岗位分栏"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      {laneSlots.length === 0 && allLanes.length > 1 && (
                        <button
                          type="button"
                          onClick={() => onDeleteRoleLane(lane)}
                          className="p-1 text-slate-400 hover:text-red-600 rounded-lg cursor-pointer"
                          title="删除空岗位栏"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Create New Version inside this Job Role Lane */}
                <button
                  type="button"
                  onClick={() => handleOpenCreateInLane(lane)}
                  className="os26-press px-2.5 py-1 rounded-xl bg-white hover:bg-[#0071e3]/10 text-[#0071e3] border border-slate-200/90 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <FilePlus2 className="w-3.5 h-3.5" />
                  <span>在该岗位下新建简历</span>
                </button>
              </div>

              {/* Inline Sheet: Create New Resume in this Lane */}
              {creatingInLane === lane && (
                <div className="p-4 bg-[#0071e3]/[0.03] border-b border-[#0071e3]/15 space-y-3 os26-popover-enter">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">
                      在「{lane}」岗位栏下新建一份简历版本
                    </span>
                    <button
                      type="button"
                      onClick={() => setCreatingInLane(null)}
                      className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                        版本名称
                      </label>
                      <input
                        type="text"
                        value={newResumeName}
                        onChange={(e) => setNewResumeName(e.target.value)}
                        placeholder="如：大疆嵌入式校招精修版"
                        className="os26-input w-full px-3 py-1.5 text-xs bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                        目标投递企业 / 场景（选填）
                      </label>
                      <input
                        type="text"
                        value={newResumeCompany}
                        onChange={(e) => setNewResumeCompany(e.target.value)}
                        placeholder="如：大疆 / 汇川技术 / 通用校招"
                        className="os26-input w-full px-3 py-1.5 text-xs bg-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">
                      选择初始内容基底（会自动将求职意向设为「{lane}」）
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {[
                        {
                          id: 'current',
                          title: '基于当前编辑中的简历',
                          desc: '复制当前画面中的内容继续修改',
                        },
                        {
                          id: 'ee-default',
                          title: '电子信息/嵌入式标准基底',
                          desc: '含 STM32 + FreeRTOS + 硬件标准项目',
                        },
                      ].map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() =>
                            setNewResumeSource(opt.id as 'current' | 'ee-default')
                          }
                          className={`p-2.5 rounded-xl text-left border transition-all cursor-pointer ${
                            newResumeSource === opt.id
                              ? 'bg-white border-[#0071e3] ring-2 ring-[#0071e3]/15'
                              : 'bg-white/70 border-slate-200/80 hover:bg-white'
                          }`}
                        >
                          <div className="text-xs font-semibold text-slate-900">{opt.title}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">{opt.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setCreatingInLane(null)}
                      className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={() => handleConfirmCreateInLane(lane)}
                      className="os26-press px-4 py-1.5 rounded-xl bg-[#0071e3] text-white text-xs font-semibold cursor-pointer"
                    >
                      创建并切换至该版本
                    </button>
                  </div>
                </div>
              )}

              {/* Version Cards List inside this Job Role Lane */}
              <div className="p-3.5 space-y-2.5">
                {laneSlots.length === 0 ? (
                  <div className="py-6 text-center space-y-2">
                    <p className="text-xs text-slate-400">
                      「{lane}」分栏下暂无简历版本
                    </p>
                    <button
                      type="button"
                      onClick={() => handleOpenCreateInLane(lane)}
                      className="os26-press px-3 py-1.5 rounded-xl bg-slate-900/[0.05] hover:bg-slate-900/[0.09] text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <FilePlus2 className="w-3.5 h-3.5 text-[#0071e3]" />
                      <span>立即创建第一份「{lane}」简历</span>
                    </button>
                  </div>
                ) : (
                  laneSlots.map((slot) => {
                    const isActive = slot.id === activeSlotId;
                    const isEditing = editingSlotId === slot.id;
                    const isMoving = movingSlotId === slot.id;

                    return (
                      <div
                        key={slot.id}
                        className={`rounded-2xl p-3.5 transition-all border ${
                          isActive
                            ? 'bg-[#0071e3]/[0.04] border-[#0071e3]/40 ring-2 ring-[#0071e3]/15'
                            : 'bg-white/80 hover:bg-white border-slate-900/[0.07]'
                        }`}
                      >
                        {isEditing ? (
                          /* Inline Metadata & Modification Note Editor */
                          <div className="space-y-2.5">
                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                              <div>
                                <label className="block text-[10px] font-semibold text-slate-400 mb-0.5">
                                  版本号
                                </label>
                                <input
                                  type="text"
                                  value={editVersionTag}
                                  onChange={(e) => setEditVersionTag(e.target.value)}
                                  placeholder="v1.1"
                                  className="os26-input w-full px-2.5 py-1 text-xs font-mono"
                                />
                              </div>
                              <div className="sm:col-span-2">
                                <label className="block text-[10px] font-semibold text-slate-400 mb-0.5">
                                  简历版本名称
                                </label>
                                <input
                                  type="text"
                                  value={editName}
                                  onChange={(e) => setEditName(e.target.value)}
                                  placeholder="版本名称"
                                  className="os26-input w-full px-2.5 py-1 text-xs font-semibold"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-semibold text-slate-400 mb-0.5">
                                  目标企业/投递批次
                                </label>
                                <input
                                  type="text"
                                  value={editCompany}
                                  onChange={(e) => setEditCompany(e.target.value)}
                                  placeholder="如：大疆 / 通用"
                                  className="os26-input w-full px-2.5 py-1 text-xs"
                                />
                              </div>
                            </div>

                            <div>
                              <label className="block text-[10px] font-semibold text-slate-400 mb-0.5">
                                本次修改备注 / 迭代说明（方便区分不同修改版）
                              </label>
                              <input
                                type="text"
                                value={editNotes}
                                onChange={(e) => setEditNotes(e.target.value)}
                                placeholder="例如：重点突出了STM32双缓冲DMA指标，精简了校园经历以收敛至一页A4..."
                                className="os26-input w-full px-2.5 py-1.5 text-xs"
                              />
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => setEditingSlotId(null)}
                                className="px-2.5 py-1 text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
                              >
                                取消
                              </button>
                              <button
                                type="button"
                                onClick={() => saveEditSlot(slot.id)}
                                className="os26-press px-3 py-1 rounded-lg bg-[#0071e3] text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
                              >
                                <Check className="w-3 h-3" />
                                保存版本信息
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* Standard Version Display Card */
                          <div className="space-y-2.5">
                            <div className="flex items-start justify-between gap-3">
                              <div
                                onClick={() => onSwitchSlot(slot.id, false)}
                                className="min-w-0 flex-1 cursor-pointer group"
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-mono text-xs font-bold text-[#0071e3]">
                                    {slot.versionTag || 'v1.0'}
                                  </span>
                                  <h4 className="text-sm font-bold text-slate-900 group-hover:text-[#0071e3] transition-colors truncate">
                                    {slot.name}
                                  </h4>
                                  {isActive && (
                                    <span className="text-[11px] font-semibold text-[#0071e3]">
                                      · 当前正在编辑
                                    </span>
                                  )}
                                </div>

                                {/* Unboxed Metadata Line (Zero-Pill Discipline) */}
                                <p className="text-[11px] text-slate-500 mt-1">
                                  求职意向：{slot.data.basics.title || lane}
                                  {slot.targetCompany ? ` · 投递目标：${slot.targetCompany}` : ''}
                                  {' · '}
                                  {countResumeHighlights(slot.data)}
                                  {' · 更新于 '}
                                  <span className="font-mono">{formatRelativeTime(slot.updatedAt)}</span>
                                </p>

                                {/* Modification Changelog / Notes */}
                                {slot.notes ? (
                                  <p className="text-xs text-slate-600 mt-1.5 pl-2.5 border-l-2 border-[#0071e3]/40 bg-slate-900/[0.02] py-1 pr-2 rounded-r-lg">
                                    修改记录：{slot.notes}
                                  </p>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      startEditSlot(slot);
                                    }}
                                    className="text-[11px] text-slate-400 hover:text-[#0071e3] mt-1 inline-flex items-center gap-1 cursor-pointer"
                                  >
                                    <Pencil className="w-2.5 h-2.5" />
                                    <span>点击添加该版本的修改备注（如：针对某公司修改了哪些项目指标）</span>
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Move to another lane selector if active */}
                            {isMoving && (
                              <div className="p-2.5 rounded-xl bg-slate-900/[0.03] border border-slate-200/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                                <span className="text-slate-600 font-medium">
                                  将该简历移至其他岗位分栏：
                                </span>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {allLanes
                                    .filter((l) => l !== lane)
                                    .map((targetLane) => (
                                      <button
                                        key={targetLane}
                                        type="button"
                                        onClick={() => {
                                          onUpdateSlotMeta(slot.id, { roleCategory: targetLane });
                                          setMovingSlotId(null);
                                        }}
                                        className="px-2.5 py-1 rounded-lg bg-white hover:bg-[#0071e3] hover:text-white text-slate-700 border border-slate-200/80 text-xs font-medium cursor-pointer transition-colors"
                                      >
                                        → {targetLane}
                                      </button>
                                    ))}
                                  <button
                                    type="button"
                                    onClick={() => setMovingSlotId(null)}
                                    className="px-2 py-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                                  >
                                    取消
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* OS 26 Action Bar per Resume Version */}
                            <div className="pt-2 border-t border-slate-900/[0.05] flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => onSwitchSlot(slot.id, true)}
                                  className={`os26-press px-3 py-1 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
                                    isActive
                                      ? 'bg-[#0071e3] text-white'
                                      : 'bg-slate-900/[0.06] hover:bg-slate-900/[0.1] text-slate-800'
                                  }`}
                                >
                                  <Edit3 className="w-3 h-3" />
                                  <span>{isActive ? '进入内容编辑' : '载入并编辑'}</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => onBranchSlotVersion(slot.id)}
                                  className="os26-press px-2.5 py-1 rounded-xl bg-[#0071e3]/10 hover:bg-[#0071e3]/15 text-[#0071e3] text-xs font-semibold flex items-center gap-1 cursor-pointer"
                                  title="基于此版本复制生成新修改版（如 v1.0 -> v1.1），保留原版不被覆盖"
                                >
                                  <GitBranchPlus className="w-3.5 h-3.5" />
                                  <span>派生新修改版</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => startEditSlot(slot)}
                                  className="os26-press px-2.5 py-1 rounded-xl hover:bg-slate-900/[0.05] text-slate-600 text-xs font-medium flex items-center gap-1 cursor-pointer"
                                >
                                  <Pencil className="w-3 h-3" />
                                  <span>备注/重命名</span>
                                </button>
                              </div>

                              <div className="flex items-center gap-1">
                                {allLanes.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setMovingSlotId(isMoving ? null : slot.id)
                                    }
                                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-900/[0.05] rounded-lg cursor-pointer"
                                    title="移至其他岗位栏"
                                  >
                                    <ArrowRightLeft className="w-3.5 h-3.5" />
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => onExportSlotJSON(slot)}
                                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-900/[0.05] rounded-lg cursor-pointer"
                                  title="导出该版本 JSON 备份"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </button>

                                {slots.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => onDeleteSlot(slot.id)}
                                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                                    title="删除该简历版本"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
