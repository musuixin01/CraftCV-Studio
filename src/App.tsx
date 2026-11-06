import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_EE_RESUME, UPLOADED_PDF_EXACT_RESUME } from './data/defaultResume';
import {
  ProjectItem,
  ResumeDocument,
  ResumeSlot,
  SectionColumn,
  SectionConfig,
  TemplateId,
} from './types/resume';
import { PageMetrics, ResumePreview, getEffectiveColumn } from './components/ResumePreview';
import { ResumeEditor } from './components/ResumeEditor';
import { GitHubImportPanel } from './components/GitHubImportPanel';
import { JDMatchPanel } from './components/JDMatchPanel';
import { TemplateStylePanel } from './components/TemplateStylePanel';
import { ResumeManagerPanel } from './components/ResumeManagerPanel';
import { AISkillLibraryCard } from './components/AISkillLibraryCard';
import { ResumeImportModal } from './components/ResumeImportModal';
import { AIOptimizeModal, AIOptimizeTarget } from './components/AIOptimizeModal';
import { domToCanvas } from 'modern-screenshot';
import { jsPDF } from 'jspdf';
import {
  CheckCircle2,
  ChevronDown,
  Download,
  FileText,
  FileUp,
  FolderKanban,
  GitBranchPlus,
  Layers,
  Loader2,
  Minimize2,
  Pencil,
  Printer,
  Redo2,
  RotateCcw,
  Trash2,
  Undo2,
  Upload,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

type WorkspaceTab = 'resumes' | 'editor' | 'ai-skills' | 'github' | 'jd-match' | 'style';

const STORAGE_KEY = 'craftcv_ee_resume_v4_movable';
const SLOTS_STORAGE_KEY = 'craftcv_resume_slots_v2_lanes';
const LEGACY_SLOTS_STORAGE_KEY = 'craftcv_resume_slots_v1';
const LANES_STORAGE_KEY = 'craftcv_role_lanes_v1';
const MAX_HISTORY_STEPS = 50;
const COALESCE_WINDOW_MS = 450;

interface HistoryState {
  past: ResumeDocument[];
  present: ResumeDocument;
  future: ResumeDocument[];
}

function ensureSummarySection(sections: SectionConfig[]): SectionConfig[] {
  const hasSummary = sections.some((s) => s.type === 'summary');
  const normalized: SectionConfig[] = sections.map((s) => ({
    ...s,
    column: getEffectiveColumn(s),
  }));
  if (!hasSummary) {
    const firstRightIdx = normalized.findIndex((s) => s.column === 'right');
    const summarySec: SectionConfig = {
      id: 'sec-summary',
      type: 'summary',
      title: '个人简介',
      englishTitle: 'ABOUT ME',
      visible: true,
      column: 'right',
    };
    if (firstRightIdx >= 0) {
      normalized.splice(firstRightIdx, 0, summarySec);
    } else {
      normalized.push(summarySec);
    }
  }
  return normalized;
}

function inferRoleLaneFromTitle(title?: string, fallbackName?: string): string {
  const raw = (title || '').trim();
  if (raw.includes('嵌入式') || raw.includes('STM32') || raw.includes('单片机')) {
    return '嵌入式软件工程师';
  }
  if (raw.includes('测试') || raw.includes('技术支持') || raw.includes('软件工程师')) {
    return '软件工程师 / 测试与技术支持';
  }
  if (raw.includes('硬件') || raw.includes('PCB')) {
    return '硬件工程师 / PCB设计';
  }
  if (raw.includes('FPGA') || raw.includes('IC')) {
    return 'FPGA / 数字IC开发工程师';
  }
  if (fallbackName?.includes('PDF')) {
    return '软件工程师 / 测试与技术支持';
  }
  return raw || '嵌入式软件工程师';
}

function incrementVersionTag(tag?: string, siblingCount = 1): string {
  if (!tag) return `v1.${siblingCount}`;
  const match = tag.match(/^v?(\d+)\.(\d+)$/i);
  if (match) {
    const major = Number(match[1]);
    const minor = Number(match[2]) + 1;
    return `v${major}.${minor}`;
  }
  return `v1.${siblingCount}`;
}

function loadInitialResume(): ResumeDocument {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.basics && Array.isArray(parsed.sections)) {
        return {
          ...parsed,
          sections: ensureSummarySection(parsed.sections),
          style: {
            ...parsed.style,
            template: parsed.style?.template || 'pdf-classic',
          },
        };
      }
    }
  } catch {
    // ignore localStorage read errors
  }
  return DEFAULT_EE_RESUME;
}

function normalizeSlotList(rawSlots: Partial<ResumeSlot>[]): ResumeSlot[] {
  return rawSlots
    .filter((s): s is ResumeSlot => Boolean(s && s.id && s.data && s.data.basics))
    .map((s, idx) => ({
      id: s.id,
      name: s.name || `简历版本 ${idx + 1}`,
      roleCategory:
        s.roleCategory || inferRoleLaneFromTitle(s.data?.basics?.title, s.name),
      versionTag: s.versionTag || 'v1.0',
      targetCompany: s.targetCompany || '通用投递',
      notes: s.notes || '',
      updatedAt: s.updatedAt || new Date().toISOString(),
      data: {
        ...s.data,
        sections: ensureSummarySection(s.data.sections || []),
      },
    }));
}

function loadInitialSlots(initialResume: ResumeDocument): ResumeSlot[] {
  try {
    const savedV2 = localStorage.getItem(SLOTS_STORAGE_KEY);
    if (savedV2) {
      const parsed = JSON.parse(savedV2);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return normalizeSlotList(parsed);
      }
    }
    const savedLegacy = localStorage.getItem(LEGACY_SLOTS_STORAGE_KEY);
    if (savedLegacy) {
      const parsed = JSON.parse(savedLegacy);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return normalizeSlotList(parsed);
      }
    }
  } catch {
    // ignore
  }

  // Create rich multi-role, multi-version defaults so user immediately sees role lanes
  const eeRefinedCopy: ResumeDocument = JSON.parse(JSON.stringify(initialResume));
  eeRefinedCopy.id = 'ee-resume-v1-1';
  eeRefinedCopy.versionName = '嵌入式软件工程师_强化RTOS与DMA版';

  return [
    {
      id: 'slot-default-ee',
      name: '嵌入式通用校招基础版',
      roleCategory: '嵌入式软件工程师',
      versionTag: 'v1.0',
      targetCompany: '通用校招 / 初稿',
      notes: '基础版：涵盖STM32H7多通道采集网关、FreeRTOS车载CAN节点与四层PCB硬件经验',
      updatedAt: new Date(Date.now() - 3600 * 1000 * 5).toISOString(),
      data: initialResume,
    },
    {
      id: 'slot-ee-v1-1',
      name: '嵌入式大疆/汇川精修版',
      roleCategory: '嵌入式软件工程师',
      versionTag: 'v1.1',
      targetCompany: '大疆 / 汇川技术',
      notes: '在 v1.0 基础上重点强化了 DMA 双缓冲零丢包率与 CAN 总线波特率量化指标',
      updatedAt: new Date(Date.now() - 3600 * 1000 * 1).toISOString(),
      data: eeRefinedCopy,
    },
    {
      id: 'slot-pdf-exact',
      name: '信宏恩_PDF原版定向简历',
      roleCategory: '软件工程师 / 测试与技术支持',
      versionTag: 'v1.0',
      targetCompany: '库课科技 / 软件与测试岗',
      notes: '1:1 还原上传的 PDF 原版排版与全部项目、实习及荣誉内容',
      updatedAt: new Date().toISOString(),
      data: {
        ...UPLOADED_PDF_EXACT_RESUME,
        sections: ensureSummarySection(UPLOADED_PDF_EXACT_RESUME.sections),
      },
    },
  ];
}

function loadInitialRoleLanes(slots: ResumeSlot[]): string[] {
  try {
    const saved = localStorage.getItem(LANES_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const merged = new Set<string>(parsed);
        slots.forEach((s) => {
          if (s.roleCategory) merged.add(s.roleCategory);
        });
        return Array.from(merged);
      }
    }
  } catch {
    // ignore
  }
  const defaults = new Set<string>([
    '嵌入式软件工程师',
    '软件工程师 / 测试与技术支持',
    '硬件工程师 / PCB设计',
  ]);
  slots.forEach((s) => {
    if (s.roleCategory) defaults.add(s.roleCategory);
  });
  return Array.from(defaults);
}

export default function App() {
  const [history, setHistory] = useState<HistoryState>(() => ({
    past: [],
    present: loadInitialResume(),
    future: [],
  }));

  const resume = history.present;
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  // Multi-role, Multi-version Targeted Resume Slots
  const [slots, setSlots] = useState<ResumeSlot[]>(() => loadInitialSlots(resume));
  const [roleLanes, setRoleLanes] = useState<string[]>(() =>
    loadInitialRoleLanes(loadInitialSlots(resume))
  );
  const [activeSlotId, setActiveSlotId] = useState<string>(() => {
    const initial = loadInitialSlots(resume);
    return initial[0]?.id || 'slot-default-ee';
  });
  const [showDocPopover, setShowDocPopover] = useState(false);
  const [renamingSlot, setRenamingSlot] = useState(false);
  const [slotNameDraft, setSlotNameDraft] = useState('');

  // Real-time A4 Page Metrics
  const [pageMetrics, setPageMetrics] = useState<PageMetrics>({
    heightPx: 1122,
    isOverflowing: false,
    fillPercent: 100,
  });

  const lastCoalescedTimeRef = useRef<number>(0);

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('editor');
  const [activeSectionId, setActiveSectionId] = useState<string | null>('sec-proj');
  const [zoom, setZoom] = useState<number>(0.82);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [aiOptimizeTarget, setAiOptimizeTarget] = useState<AIOptimizeTarget | null>(null);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const docPopoverRef = useRef<HTMLDivElement | null>(null);
  const pdfCaptureRef = useRef<HTMLDivElement | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 3000);
  }, []);

  // Close OS 26 Document Popover when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (docPopoverRef.current && !docPopoverRef.current.contains(e.target as Node)) {
        setShowDocPopover(false);
        setConfirmReset(false);
      }
    };
    if (showDocPopover) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showDocPopover]);

  // Persist role lanes
  useEffect(() => {
    try {
      localStorage.setItem(LANES_STORAGE_KEY, JSON.stringify(roleLanes));
    } catch {
      // ignore
    }
  }, [roleLanes]);

  const commitResumeChange = useCallback(
    (
      updater: ResumeDocument | ((prev: ResumeDocument) => ResumeDocument),
      coalesce = false
    ) => {
      const now = Date.now();
      setHistory((curr) => {
        const nextPresent =
          typeof updater === 'function' ? updater(curr.present) : updater;

        if (nextPresent === curr.present) {
          return curr;
        }

        const isStructuralSectionChange =
          JSON.stringify(curr.present.sections) !== JSON.stringify(nextPresent.sections) ||
          curr.present.basics.avatarPosition !== nextPresent.basics.avatarPosition ||
          curr.present.style.template !== nextPresent.style.template;

        const shouldCoalesce =
          coalesce &&
          !isStructuralSectionChange &&
          curr.past.length > 0 &&
          now - lastCoalescedTimeRef.current < COALESCE_WINDOW_MS;

        if (shouldCoalesce) {
          lastCoalescedTimeRef.current = now;
          return {
            past: curr.past,
            present: nextPresent,
            future: [],
          };
        }

        lastCoalescedTimeRef.current = coalesce ? now : 0;
        const nextPast = [...curr.past, curr.present].slice(-MAX_HISTORY_STEPS);
        return {
          past: nextPast,
          present: nextPresent,
          future: [],
        };
      });
    },
    []
  );

  const handleEditorChange: React.Dispatch<React.SetStateAction<ResumeDocument>> = useCallback(
    (updater) => {
      commitResumeChange(updater, true);
    },
    [commitResumeChange]
  );

  const handleInlinePreviewChange = useCallback(
    (updater: (prev: ResumeDocument) => ResumeDocument) => {
      commitResumeChange(updater, false);
    },
    [commitResumeChange]
  );

  const handleAutoFitOnePage = useCallback(() => {
    commitResumeChange(
      (prev) => ({
        ...prev,
        style: {
          ...prev.style,
          fontSize: 'sm',
          lineHeight: 'tight',
          pageMargin: 'compact',
          sectionSpacing: 12,
        },
      }),
      false
    );
    showToast('已自动压缩字号、行距与页边距，收敛至单页 A4');
  }, [commitResumeChange, showToast]);

  const handleUndo = useCallback(() => {
    lastCoalescedTimeRef.current = 0;
    setHistory((curr) => {
      if (curr.past.length === 0) return curr;
      const previous = curr.past[curr.past.length - 1];
      const newPast = curr.past.slice(0, -1);
      return {
        past: newPast,
        present: previous,
        future: [curr.present, ...curr.future].slice(0, MAX_HISTORY_STEPS),
      };
    });
    showToast('已撤销上一步操作 (⌘Z)');
  }, [showToast]);

  const handleRedo = useCallback(() => {
    lastCoalescedTimeRef.current = 0;
    setHistory((curr) => {
      if (curr.future.length === 0) return curr;
      const next = curr.future[0];
      const newFuture = curr.future.slice(1);
      return {
        past: [...curr.past, curr.present].slice(-MAX_HISTORY_STEPS),
        present: next,
        future: newFuture,
      };
    });
    showToast('已重做操作 (⌘Y)');
  }, [showToast]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;
      if (!isMod) return;

      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        if (canUndo) {
          e.preventDefault();
          handleUndo();
        }
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        if (canRedo) {
          e.preventDefault();
          handleRedo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canUndo, canRedo, handleUndo, handleRedo]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(resume));
    } catch {
      // ignore storage quota errors
    }
    setSlots((prevSlots) => {
      const updated = prevSlots.map((sl) =>
        sl.id === activeSlotId
          ? { ...sl, updatedAt: new Date().toISOString(), data: resume }
          : sl
      );
      try {
        localStorage.setItem(SLOTS_STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    });
  }, [resume, activeSlotId]);

  const handleSwitchSlot = (slotId: string, openEditor = false) => {
    const target = slots.find((s) => s.id === slotId);
    if (!target) return;
    setActiveSlotId(slotId);
    setRenamingSlot(false);
    commitResumeChange(
      {
        ...target.data,
        sections: ensureSummarySection(target.data.sections),
      },
      false
    );
    if (openEditor) {
      setActiveTab('editor');
    }
    showToast(`已切换至「[${target.roleCategory}] ${target.versionTag || 'v1.0'} ${target.name}」`);
  };

  // Branch / duplicate a resume inside the same Job Role Lane (v1.0 -> v1.1 -> v1.2)
  const handleBranchSlotVersion = (sourceSlotId?: string, customNote?: string) => {
    const source =
      slots.find((s) => s.id === (sourceSlotId || activeSlotId)) || slots[0];
    if (!source) return;

    const lane = source.roleCategory || inferRoleLaneFromTitle(resume.basics.title);
    const sameLaneSlots = slots.filter((s) => s.roleCategory === lane);
    const nextVersionTag = incrementVersionTag(source.versionTag, sameLaneSlots.length);
    const baseName = source.name.replace(/\s*\(v\d+\.\d+\)$/i, '').replace(/·\s*修改版.*$/, '').trim();
    const newId = `slot-${Date.now()}`;

    const clonedData: ResumeDocument = JSON.parse(
      JSON.stringify(source.id === activeSlotId ? resume : source.data)
    );
    clonedData.id = newId;

    const newSlot: ResumeSlot = {
      id: newId,
      name: `${baseName} · 修改版`,
      roleCategory: lane,
      versionTag: nextVersionTag,
      targetCompany: source.targetCompany || '通用投递',
      notes:
        customNote ||
        `基于 ${source.versionTag || 'v1.0'}「${source.name}」派生的修改版本`,
      updatedAt: new Date().toISOString(),
      data: clonedData,
    };

    const nextSlots = [...slots, newSlot];
    setSlots(nextSlots);
    setActiveSlotId(newId);
    commitResumeChange(clonedData, false);
    try {
      localStorage.setItem(SLOTS_STORAGE_KEY, JSON.stringify(nextSlots));
    } catch {
      // ignore
    }
    showToast(`已在「${lane}」栏下派生新修改版 ${nextVersionTag}`);
  };

  const handleCreateSlotInLane = (
    roleCategory: string,
    templateSource: 'current' | 'ee-default' | 'pdf-exact',
    customName?: string,
    targetCompany?: string
  ) => {
    const sameLaneSlots = slots.filter((s) => s.roleCategory === roleCategory);
    const nextVer = sameLaneSlots.length === 0 ? 'v1.0' : `v1.${sameLaneSlots.length}`;
    const newId = `slot-${Date.now()}`;

    let baseDoc: ResumeDocument;
    if (templateSource === 'pdf-exact') {
      baseDoc = JSON.parse(JSON.stringify(UPLOADED_PDF_EXACT_RESUME));
    } else if (templateSource === 'ee-default') {
      baseDoc = JSON.parse(JSON.stringify(DEFAULT_EE_RESUME));
    } else {
      baseDoc = JSON.parse(JSON.stringify(resume));
    }

    baseDoc.id = newId;
    baseDoc.basics.title = roleCategory;
    baseDoc.sections = ensureSummarySection(baseDoc.sections);

    const newSlot: ResumeSlot = {
      id: newId,
      name: customName || `${roleCategory} 定向简历`,
      roleCategory,
      versionTag: nextVer,
      targetCompany: targetCompany || '通用投递',
      notes: `新建于「${roleCategory}」岗位分栏`,
      updatedAt: new Date().toISOString(),
      data: baseDoc,
    };

    if (!roleLanes.includes(roleCategory)) {
      setRoleLanes((prev) => [...prev, roleCategory]);
    }

    const nextSlots = [...slots, newSlot];
    setSlots(nextSlots);
    setActiveSlotId(newId);
    commitResumeChange(baseDoc, false);
    try {
      localStorage.setItem(SLOTS_STORAGE_KEY, JSON.stringify(nextSlots));
    } catch {
      // ignore
    }
    showToast(`已在「${roleCategory}」栏下创建 ${nextVer}「${newSlot.name}」`);
  };

  const handleUpdateSlotMeta = (
    slotId: string,
    patch: Partial<
      Pick<ResumeSlot, 'name' | 'roleCategory' | 'versionTag' | 'targetCompany' | 'notes'>
    >
  ) => {
    setSlots((prev) => {
      const updated = prev.map((s) =>
        s.id === slotId ? { ...s, ...patch, updatedAt: new Date().toISOString() } : s
      );
      try {
        localStorage.setItem(SLOTS_STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    });
    showToast('已更新该简历版本信息与备注');
  };

  const handleDeleteSlotById = (slotId: string) => {
    if (slots.length <= 1) return;
    const remaining = slots.filter((s) => s.id !== slotId);
    setSlots(remaining);
    if (slotId === activeSlotId) {
      const nextActive = remaining[0];
      setActiveSlotId(nextActive.id);
      commitResumeChange(nextActive.data, false);
    }
    try {
      localStorage.setItem(SLOTS_STORAGE_KEY, JSON.stringify(remaining));
    } catch {
      // ignore
    }
    showToast('已删除该简历版本');
  };

  const handleAddRoleLane = (laneName: string) => {
    if (roleLanes.includes(laneName)) {
      showToast(`岗位分栏「${laneName}」已存在`);
      return;
    }
    setRoleLanes((prev) => [...prev, laneName]);
    showToast(`已新增岗位分栏「${laneName}」`);
  };

  const handleRenameRoleLane = (oldName: string, newName: string) => {
    if (!newName || oldName === newName) return;
    setRoleLanes((prev) => prev.map((l) => (l === oldName ? newName : l)));
    setSlots((prev) => {
      const updated = prev.map((s) =>
        s.roleCategory === oldName ? { ...s, roleCategory: newName } : s
      );
      try {
        localStorage.setItem(SLOTS_STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    });
    showToast(`已将岗位栏重命名为「${newName}」`);
  };

  const handleDeleteRoleLane = (laneName: string) => {
    setRoleLanes((prev) => prev.filter((l) => l !== laneName));
    showToast(`已移除空岗位分栏「${laneName}」`);
  };

  const handleSaveSlotRename = () => {
    const trimmed = slotNameDraft.trim();
    if (!trimmed) {
      setRenamingSlot(false);
      return;
    }
    handleUpdateSlotMeta(activeSlotId, { name: trimmed });
    setRenamingSlot(false);
  };

  const handleMoveSectionInView = (sectionId: string, direction: -1 | 1, isTwoColumn: boolean) => {
    commitResumeChange((prev) => {
      const sections = ensureSummarySection(prev.sections);
      const currentIdx = sections.findIndex((s) => s.id === sectionId);
      if (currentIdx === -1) return prev;

      if (!isTwoColumn) {
        const targetIdx = currentIdx + direction;
        if (targetIdx < 0 || targetIdx >= sections.length) return prev;
        const next = [...sections];
        const [moved] = next.splice(currentIdx, 1);
        next.splice(targetIdx, 0, moved);
        return { ...prev, sections: next };
      }

      const currentCol = getEffectiveColumn(sections[currentIdx]);
      const sameColIndices = sections
        .map((s, i) => ({ col: getEffectiveColumn(s), idx: i }))
        .filter((x) => x.col === currentCol)
        .map((x) => x.idx);

      const posInSameCol = sameColIndices.indexOf(currentIdx);
      const targetPosInSameCol = posInSameCol + direction;
      if (targetPosInSameCol < 0 || targetPosInSameCol >= sameColIndices.length) return prev;

      const swapGlobalIdx = sameColIndices[targetPosInSameCol];
      const next = [...sections];
      const temp = next[currentIdx];
      next[currentIdx] = next[swapGlobalIdx];
      next[swapGlobalIdx] = temp;
      return { ...prev, sections: next };
    }, false);
  };

  const handleToggleSectionColumn = (sectionId: string) => {
    commitResumeChange((prev) => {
      const sections = ensureSummarySection(prev.sections);
      const sec = sections.find((s) => s.id === sectionId);
      if (!sec) return prev;
      const nextCol: SectionColumn = getEffectiveColumn(sec) === 'left' ? 'right' : 'left';
      return {
        ...prev,
        sections: sections.map((s) => (s.id === sectionId ? { ...s, column: nextCol } : s)),
      };
    }, false);
    showToast('已切换该模块所在左/右分栏位置');
  };

  const handleReorderSectionsDirect = (
    draggedSecId: string,
    targetSecId: string,
    targetColumn?: SectionColumn
  ) => {
    commitResumeChange((prev) => {
      const sections = ensureSummarySection(prev.sections);
      const fromIdx = sections.findIndex((s) => s.id === draggedSecId);
      const toIdx = sections.findIndex((s) => s.id === targetSecId);
      if (fromIdx === -1 || toIdx === -1) return prev;

      const next = [...sections];
      const [moved] = next.splice(fromIdx, 1);
      const updatedMoved: SectionConfig = {
        ...moved,
        column: targetColumn ?? getEffectiveColumn(sections[toIdx]),
      };
      next.splice(toIdx, 0, updatedMoved);
      return { ...prev, sections: next };
    }, false);
  };

  const handleToggleAvatarColumn = () => {
    commitResumeChange(
      (prev) => ({
        ...prev,
        basics: {
          ...prev.basics,
          avatarPosition: (prev.basics.avatarPosition ?? 'left') === 'left' ? 'right' : 'left',
        },
      }),
      false
    );
    showToast('已切换证件照所在栏位');
  };

  const handleExportPDF = async () => {
    if (isExportingPDF) return;
    const captureNode = pdfCaptureRef.current;
    if (!captureNode) {
      window.print();
      return;
    }

    setIsExportingPDF(true);
    showToast('正在渲染 300 DPI 高清 A4 PDF 文件，请稍候...');

    try {
      // Wait a tick so any pending React state or font layout settles
      await new Promise((r) => setTimeout(r, 80));

      const canvas = await domToCanvas(captureNode, {
        scale: 3,
        backgroundColor: '#ffffff',
        filter: (node) => {
          if (node instanceof HTMLElement && node.classList.contains('no-print')) {
            return false;
          }
          return true;
        },
      });

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true,
      });

      const pageWidthMm = 210;
      const pageHeightMm = 297;
      const imgWidthMm = pageWidthMm;
      const imgHeightMm = (canvas.height * imgWidthMm) / canvas.width;
      const imgData = canvas.toDataURL('image/jpeg', 0.96);

      // If within single-page A4 height (+3mm tolerance), fit cleanly onto 1 page
      if (imgHeightMm <= pageHeightMm + 3) {
        pdf.addImage(
          imgData,
          'JPEG',
          0,
          0,
          imgWidthMm,
          Math.min(imgHeightMm, pageHeightMm),
          undefined,
          'FAST'
        );
      } else {
        // Multi-page slicing for resumes exceeding 1 A4 page
        let heightLeft = imgHeightMm;
        let position = 0;

        pdf.addImage(imgData, 'JPEG', 0, position, imgWidthMm, imgHeightMm, undefined, 'FAST');
        heightLeft -= pageHeightMm;

        while (heightLeft > 2) {
          position = heightLeft - imgHeightMm;
          pdf.addPage();
          pdf.addImage(imgData, 'JPEG', 0, position, imgWidthMm, imgHeightMm, undefined, 'FAST');
          heightLeft -= pageHeightMm;
        }
      }

      const verSuffix = currentSlot?.versionTag ? `_${currentSlot.versionTag}` : '';
      const rawFileName = `${resume.basics.name || '简历'}_${(
        resume.basics.title ||
        currentSlot?.roleCategory ||
        '求职简历'
      ).replace(/[\/\\?%*:|"<>]/g, '-')}${verSuffix}`;

      pdf.save(`${rawFileName}.pdf`);
      showToast(`已成功下载高清 PDF：${rawFileName}.pdf`);
    } catch (err) {
      console.error('PDF export error:', err);
      showToast('PDF 导出遇到问题，正在尝试调起系统打印...');
      window.print();
    } finally {
      setIsExportingPDF(false);
    }
  };

  const handleExportSlotJSON = (slotToExport?: ResumeSlot) => {
    const targetDoc = slotToExport ? slotToExport.data : resume;
    const fileLabel = slotToExport
      ? `${targetDoc.basics.name || 'resume'}_${slotToExport.roleCategory}_${slotToExport.versionTag || 'v1.0'}`
      : `${resume.basics.name || 'resume'}_CraftCV备份`;
    const blob = new Blob([JSON.stringify(targetDoc, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileLabel.replace(/[\/\\?%*:|"<>]/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('已导出简历 JSON 备份文件');
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (parsed && parsed.basics && Array.isArray(parsed.sections)) {
          commitResumeChange(
            {
              ...parsed,
              sections: ensureSummarySection(parsed.sections),
            },
            false
          );
          showToast('成功导入简历 JSON 数据');
        } else {
          showToast('JSON 文件格式不兼容，请检查文件');
        }
      } catch {
        showToast('解析 JSON 文件失败');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleImportParsedResume = (
    doc: ResumeDocument,
    mode: 'overwrite' | 'new-slot',
    roleCategory: string,
    versionName: string
  ) => {
    const normalizedDoc: ResumeDocument = {
      ...doc,
      sections: ensureSummarySection(doc.sections || DEFAULT_EE_RESUME.sections),
    };

    if (mode === 'overwrite') {
      commitResumeChange(normalizedDoc, false);
      showToast(`已成功导入并替换当前简历：「${versionName}」`);
      return;
    }

    const targetLane = roleCategory.trim() || inferRoleLaneFromTitle(normalizedDoc.basics.title);
    if (!roleLanes.includes(targetLane)) {
      setRoleLanes((prev) => [...prev, targetLane]);
    }

    const sameLaneSlots = slots.filter((s) => s.roleCategory === targetLane);
    const nextVer = sameLaneSlots.length === 0 ? 'v1.0' : `v1.${sameLaneSlots.length}`;
    const newId = `slot-${Date.now()}`;

    const newSlot: ResumeSlot = {
      id: newId,
      name: versionName,
      roleCategory: targetLane,
      versionTag: nextVer,
      targetCompany: '外部导入',
      notes: `从外部简历文件智能解析导入 (${nextVer})`,
      updatedAt: new Date().toISOString(),
      data: normalizedDoc,
    };

    const nextSlots = [...slots, newSlot];
    setSlots(nextSlots);
    setActiveSlotId(newId);
    commitResumeChange(normalizedDoc, false);
    try {
      localStorage.setItem(SLOTS_STORAGE_KEY, JSON.stringify(nextSlots));
    } catch {
      // ignore
    }
    showToast(`已导入新简历「${versionName}」至「${targetLane}」岗位栏`);
  };

  const handleImportGitHubProject = (newProj: ProjectItem) => {
    commitResumeChange(
      (prev) => ({
        ...prev,
        projects: [newProj, ...prev.projects],
      }),
      false
    );
    showToast(`已将「${newProj.name}」导入至项目经历模块`);
  };

  const handleApplyTailoredSummary = (newSummary: string) => {
    commitResumeChange(
      (prev) => ({
        ...prev,
        basics: {
          ...prev.basics,
          summary: newSummary,
        },
      }),
      false
    );
    showToast('已应用 AI 定制的个人核心优势总结');
  };

  const handleAppendSkillKeyword = (keyword: string) => {
    commitResumeChange((prev) => {
      if (prev.skills.length === 0) {
        return {
          ...prev,
          skills: [{ id: `sk-${Date.now()}`, category: '核心专业技能', items: keyword }],
        };
      }
      const updated = prev.skills.map((sk, idx) =>
        idx === 0 && !sk.items.includes(keyword)
          ? { ...sk, items: `${sk.items.replace(/[。；;.]$/, '')}、${keyword}。` }
          : sk
      );
      return { ...prev, skills: updated };
    }, false);
    showToast(`已将关键词「${keyword}」补充至专业技能栏`);
  };

  const handleSelectSectionFromPreview = (sectionId: string) => {
    setActiveTab('editor');
    setActiveSectionId(sectionId);
  };

  const currentSlot = slots.find((s) => s.id === activeSlotId) || slots[0];

  // Group slots by roleCategory for the quick popover
  const groupedSlotsByLane = React.useMemo(() => {
    const map = new Map<string, ResumeSlot[]>();
    roleLanes.forEach((lane) => map.set(lane, []));
    slots.forEach((sl) => {
      const lane = sl.roleCategory || '默认岗位';
      const existing = map.get(lane) || [];
      existing.push(sl);
      map.set(lane, existing);
    });
    return Array.from(map.entries()).filter(([, list]) => list.length > 0);
  }, [roleLanes, slots]);

  return (
    <div className="min-h-screen flex flex-col os26-canvas-bg text-slate-900">
      {/* =====================================================================
          STRICT 3-ZONE TOP BAR CONTRACT (Apple OS 26 Translucent Glass Bar)
         ===================================================================== */}
      <header className="no-print sticky top-0 z-30 os26-glass-bar border-b flex items-center justify-between gap-8 px-6 py-3">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('editor');
          }}
          className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 font-display"
        >
          CraftCV Studio
        </a>

        {/* Zone 2: Concise single-line text navigation links */}
        <nav className="flex items-center gap-6 text-sm font-medium text-slate-600 overflow-x-auto">
          {[
            { id: 'editor', label: '内容编辑' },
            { id: 'ai-skills', label: 'AI技能库' },
            { id: 'github', label: 'GitHub导入' },
            { id: 'jd-match', label: 'AI岗位匹配' },
            { id: 'style', label: '模板与版式' },
            { id: 'resumes', label: '简历管理' },
          ].map((nav) => {
            const active = activeTab === nav.id;
            return (
              <a
                key={nav.id}
                href={`#${nav.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  setActiveTab(nav.id as WorkspaceTab);
                }}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                  active
                    ? 'text-[#0071e3] font-semibold border-[#0071e3]'
                    : 'text-slate-600 hover:text-slate-900 border-transparent hover:border-slate-300'
                }`}
              >
                {nav.label}
              </a>
            );
          })}
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleExportPDF}
            disabled={isExportingPDF}
            className="os26-press px-4 py-1.5 text-xs font-semibold text-white bg-[#0071e3] hover:bg-[#0077ed] disabled:opacity-65 rounded-xl shadow-xs whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer"
          >
            {isExportingPDF ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>正在生成 PDF...</span>
              </>
            ) : (
              <>
                <Printer className="w-3.5 h-3.5" />
                <span>导出高清 PDF</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* OS 26 Floating Glass Toast Notification */}
      {toastMsg && (
        <div className="no-print os26-popover-enter fixed bottom-6 right-6 z-50 bg-slate-900/90 backdrop-blur-xl text-white px-4 py-2.5 rounded-2xl shadow-xl ring-1 ring-white/15 text-xs font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* =====================================================================
          OS 26 SPATIAL SPLIT WORKSPACE (Left Inspector + Right A4 Studio Desk)
         ===================================================================== */}
      <div className="no-print flex-1 grid grid-cols-1 lg:grid-cols-12 max-w-[1640px] w-full mx-auto">
        {/* Left Pane: Clean OS 26 Inspector & Module Editor */}
        <div className="lg:col-span-6 xl:col-span-5 border-r border-slate-900/[0.06] bg-white/45 backdrop-blur-md flex flex-col h-[calc(100vh-53px)]">
          {/* Unified OS 26 Document, Role-Lane Version & History Bar */}
          <div className="px-4 py-2.5 os26-glass-bar border-b flex items-center justify-between gap-2 relative z-20">
            {/* Left: OS 26 Role-Lane Version Switcher + 1-Click Branch New Version */}
            <div ref={docPopoverRef} className="relative flex items-center gap-1.5 min-w-0">
              <button
                type="button"
                onClick={() => setShowDocPopover((v) => !v)}
                className="os26-press px-2.5 py-1.5 rounded-xl bg-slate-900/[0.04] hover:bg-slate-900/[0.07] text-xs font-semibold text-slate-800 flex items-center gap-1.5 max-w-[235px] sm:max-w-[270px] cursor-pointer"
                title="点击按岗位分栏切换简历版本"
              >
                <FolderKanban className="w-3.5 h-3.5 text-[#0071e3] shrink-0" />
                <span className="font-mono text-[11px] font-bold text-[#0071e3] shrink-0">
                  {currentSlot?.versionTag || 'v1.0'}
                </span>
                <span className="truncate">
                  {currentSlot?.roleCategory} · {currentSlot?.name || '当前简历'}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </button>

              {/* 1-Click Save as New Modification Iteration (+v1.x) under same Role Lane */}
              <button
                type="button"
                onClick={() => handleBranchSlotVersion()}
                className="os26-press px-2.5 py-1.5 rounded-xl bg-[#0071e3]/10 hover:bg-[#0071e3]/15 text-[#0071e3] text-xs font-semibold flex items-center gap-1 shrink-0 cursor-pointer"
                title="在当前岗位栏下另存为一份新的修改版本（如 v1.1 -> v1.2），保留原版不被覆盖"
              >
                <GitBranchPlus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">存为新修改版</span>
              </button>

              {/* 1-Click Open Universal Resume Import Modal (PDF / Image / Text / JSON) */}
              <button
                type="button"
                onClick={() => setShowImportModal(true)}
                className="os26-press px-2.5 py-1.5 rounded-xl bg-slate-900/[0.04] hover:bg-slate-900/[0.08] text-slate-700 text-xs font-semibold flex items-center gap-1 shrink-0 cursor-pointer"
                title="导入外部简历（支持 PDF、图片截图、Markdown/文本或 JSON）"
              >
                <FileUp className="w-3.5 h-3.5 text-[#0071e3]" />
                <span>导入简历</span>
              </button>

              {/* OS 26 Floating Document & Role-Lane Version Popover Sheet */}
              {showDocPopover && (
                <div className="os26-floating-dock os26-popover-enter absolute left-0 top-full mt-2 w-88 rounded-2xl p-3 space-y-3 z-40">
                  {/* Header: Open Full Multi-Role Manager */}
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[11px] font-semibold text-slate-400">
                      按岗位分栏切换简历
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('resumes');
                        setShowDocPopover(false);
                      }}
                      className="text-[11px] font-semibold text-[#0071e3] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Layers className="w-3 h-3" />
                      打开多岗位简历管理栏 →
                    </button>
                  </div>

                  {/* Role-Lane Grouped Versions */}
                  <div className="space-y-2.5 max-h-60 overflow-y-auto pr-0.5">
                    {groupedSlotsByLane.map(([lane, laneSlots]) => (
                      <div key={lane} className="space-y-1">
                        <div className="px-2 flex items-center justify-between text-[11px] font-bold text-slate-500">
                          <span className="truncate">{lane}</span>
                          <span className="font-mono text-[10px] text-slate-400">
                            {laneSlots.length}份
                          </span>
                        </div>
                        {laneSlots.map((sl) => {
                          const isActive = sl.id === activeSlotId;
                          return (
                            <div
                              key={sl.id}
                              className={`px-2.5 py-1.5 rounded-xl flex items-center justify-between gap-2 text-xs transition-colors ${
                                isActive
                                  ? 'bg-[#0071e3]/10 text-[#0071e3] font-semibold'
                                  : 'text-slate-700 hover:bg-slate-100/80'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  handleSwitchSlot(sl.id);
                                  setShowDocPopover(false);
                                }}
                                className="flex-1 text-left truncate flex items-center gap-1.5 cursor-pointer"
                              >
                                <span className="font-mono text-[11px] font-bold text-[#0071e3] shrink-0">
                                  {sl.versionTag || 'v1.0'}
                                </span>
                                <span className="truncate">{sl.name}</span>
                              </button>
                              {isActive && (
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSlotNameDraft(sl.name);
                                      setRenamingSlot(true);
                                    }}
                                    className="p-1 text-slate-500 hover:text-slate-900 rounded cursor-pointer"
                                    title="重命名当前版本"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                  {slots.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteSlotById(sl.id)}
                                      className="p-1 text-slate-400 hover:text-red-600 rounded cursor-pointer"
                                      title="删除当前版本"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>

                  {renamingSlot && (
                    <div className="pt-1 flex items-center gap-1.5">
                      <input
                        type="text"
                        autoFocus
                        value={slotNameDraft}
                        onChange={(e) => setSlotNameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveSlotRename();
                          if (e.key === 'Escape') setRenamingSlot(false);
                        }}
                        className="os26-input flex-1 px-2.5 py-1 text-xs bg-white"
                      />
                      <button
                        type="button"
                        onClick={handleSaveSlotRename}
                        className="px-2.5 py-1 text-xs font-semibold bg-[#0071e3] text-white rounded-lg cursor-pointer"
                      >
                        保存
                      </button>
                    </div>
                  )}

                  {/* Section 2: Quick Preset & JSON Backup Actions */}
                  <div className="pt-2 border-t border-slate-200/70 space-y-1">
                    <button
                      type="button"
                      onClick={() => {
                        commitResumeChange(
                          {
                            ...UPLOADED_PDF_EXACT_RESUME,
                            sections: ensureSummarySection(UPLOADED_PDF_EXACT_RESUME.sections),
                          },
                          false
                        );
                        setShowDocPopover(false);
                        showToast('已载入您上传的 PDF 原版文字与 1:1 排版');
                      }}
                      className="w-full px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100/80 rounded-xl flex items-center gap-2 cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5 text-[#0071e3]" />
                      <span>一键填入上传的 PDF 原版简历</span>
                    </button>

                    <div className="grid grid-cols-2 gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          handleExportSlotJSON();
                          setShowDocPopover(false);
                        }}
                        className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100/80 hover:bg-slate-200/70 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        导出 JSON
                      </button>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100/80 hover:bg-slate-200/70 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        导入 JSON
                      </button>
                    </div>

                    <div className="pt-1">
                      {!confirmReset ? (
                        <button
                          type="button"
                          onClick={() => setConfirmReset(true)}
                          className="w-full px-2.5 py-1.5 text-xs text-slate-500 hover:text-red-600 hover:bg-red-50/60 rounded-xl flex items-center gap-2 cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>恢复电子信息工程默认示例</span>
                        </button>
                      ) : (
                        <div className="flex items-center justify-between gap-2 p-1.5 bg-red-50 rounded-xl">
                          <span className="text-[11px] text-red-700 font-medium pl-1">确认恢复默认？</span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                commitResumeChange(DEFAULT_EE_RESUME, false);
                                setConfirmReset(false);
                                setShowDocPopover(false);
                                showToast('已恢复默认示例简历');
                              }}
                              className="px-2 py-0.5 text-[11px] font-semibold text-white bg-red-600 rounded-lg cursor-pointer"
                            >
                              确认
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmReset(false)}
                              className="px-2 py-0.5 text-[11px] text-slate-600 cursor-pointer"
                            >
                              取消
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleImportJSON}
                className="hidden"
              />
            </div>

            {/* Right: Tactile Undo / Redo Capsule */}
            <div className="flex items-center gap-1 bg-slate-900/[0.04] p-0.5 rounded-xl shrink-0">
              <button
                type="button"
                onClick={handleUndo}
                disabled={!canUndo}
                title={`撤销 (⌘Z)${canUndo ? ` · 可撤销 ${history.past.length} 步` : ''}`}
                className="os26-press px-2.5 py-1 text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-white rounded-lg disabled:opacity-35 disabled:pointer-events-none flex items-center gap-1 cursor-pointer"
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span>撤销</span>
              </button>
              <button
                type="button"
                onClick={handleRedo}
                disabled={!canRedo}
                title="重做 (⌘Y)"
                className="os26-press px-2.5 py-1 text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-white rounded-lg disabled:opacity-35 disabled:pointer-events-none flex items-center gap-1 cursor-pointer"
              >
                <Redo2 className="w-3.5 h-3.5" />
                <span>重做</span>
              </button>
            </div>
          </div>

          {/* Scrollable Left Inspector Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5">
            {activeTab === 'resumes' && (
              <ResumeManagerPanel
                slots={slots}
                activeSlotId={activeSlotId}
                roleLanes={roleLanes}
                onSwitchSlot={handleSwitchSlot}
                onBranchSlotVersion={handleBranchSlotVersion}
                onCreateSlotInLane={handleCreateSlotInLane}
                onUpdateSlotMeta={handleUpdateSlotMeta}
                onDeleteSlot={handleDeleteSlotById}
                onAddRoleLane={handleAddRoleLane}
                onRenameRoleLane={handleRenameRoleLane}
                onDeleteRoleLane={handleDeleteRoleLane}
                onExportSlotJSON={handleExportSlotJSON}
                onOpenImportModal={() => setShowImportModal(true)}
              />
            )}

            {activeTab === 'editor' && (
              <ResumeEditor
                resume={resume}
                onChangeResume={handleEditorChange}
                activeSectionId={activeSectionId}
                onSelectSection={setActiveSectionId}
                onOpenGitHubTab={() => setActiveTab('github')}
                onMoveSectionInView={handleMoveSectionInView}
                onToggleSectionColumn={handleToggleSectionColumn}
                onRequestAIOptimize={setAiOptimizeTarget}
              />
            )}

            {activeTab === 'ai-skills' && (
              <AISkillLibraryCard
                resume={resume}
                onRequestAIOptimize={setAiOptimizeTarget}
              />
            )}

            {activeTab === 'github' && (
              <div className="os26-sheet-enter">
                <GitHubImportPanel
                  targetRole={resume.basics.title}
                  onImportProject={handleImportGitHubProject}
                />
              </div>
            )}

            {activeTab === 'jd-match' && (
              <div className="os26-sheet-enter">
                <JDMatchPanel
                  resume={resume}
                  onApplySummary={handleApplyTailoredSummary}
                  onAppendSkillKeyword={handleAppendSkillKeyword}
                />
              </div>
            )}

            {activeTab === 'style' && (
              <div className="os26-sheet-enter">
                <TemplateStylePanel
                  style={resume.style}
                  onChangeStyle={(updater) =>
                    commitResumeChange(
                      (prev) => ({
                        ...prev,
                        style: updater(prev.style),
                      }),
                      false
                    )
                  }
                />
              </div>
            )}
          </div>
        </div>

        {/* Right Pane: Real-time A4 Paper Studio Desk with Floating OS 26 Glass Dock */}
        <div className="lg:col-span-6 xl:col-span-7 flex flex-col h-[calc(100vh-53px)] relative">
          {/* OS 26 Floating Glass Canvas Dock */}
          <div className="pt-3 px-4 flex justify-center z-20 shrink-0">
            <div className="os26-floating-dock rounded-2xl px-3 py-1.5 flex flex-wrap items-center justify-between gap-3 max-w-full">
              {/* Segmented Template Switcher */}
              <div className="flex items-center gap-0.5 p-0.5 bg-slate-900/[0.05] rounded-xl">
                {[
                  { id: 'pdf-classic', label: 'PDF同款双栏' },
                  { id: 'modern', label: '现代极简' },
                  { id: 'classic-ats', label: '经典ATS' },
                  { id: 'creative-split', label: '创意分栏' },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() =>
                      commitResumeChange(
                        (prev) => ({
                          ...prev,
                          style: { ...prev.style, template: t.id as TemplateId },
                        }),
                        false
                      )
                    }
                    className={`os26-press px-2.5 py-1 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 cursor-pointer ${
                      resume.style.template === t.id
                        ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <span className="text-slate-300 hidden sm:inline" aria-hidden="true">|</span>

              {/* Real-time Page Fill Status (Unboxed Typography unless Action Button) */}
              <div className="flex items-center gap-2 text-xs">
                {pageMetrics.isOverflowing ? (
                  <>
                    <span className="font-mono tabular-nums font-semibold text-red-600 whitespace-nowrap">
                      超出1页 ({pageMetrics.fillPercent}%)
                    </span>
                    <button
                      type="button"
                      onClick={handleAutoFitOnePage}
                      className="os26-press px-2.5 py-1 text-[11px] font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Minimize2 className="w-3 h-3" />
                      一键收敛一页
                    </button>
                  </>
                ) : (
                  <span className="font-mono tabular-nums text-slate-600 whitespace-nowrap">
                    单页 A4 · {pageMetrics.fillPercent}% 页高
                  </span>
                )}
              </div>

              <span className="text-slate-300 hidden sm:inline" aria-hidden="true">|</span>

              {/* Zoom Controls */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(0.55, Number((z - 0.08).toFixed(2))))}
                  className="os26-press p-1 text-slate-600 hover:text-slate-900 hover:bg-slate-900/[0.05] rounded-lg cursor-pointer"
                  title="缩小预览"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoom(0.82)}
                  title="点击重置缩放至 82%"
                  className="text-xs font-mono tabular-nums font-semibold text-slate-700 hover:text-[#0071e3] w-11 text-center cursor-pointer"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(1.15, Number((z + 0.08).toFixed(2))))}
                  className="os26-press p-1 text-slate-600 hover:text-slate-900 hover:bg-slate-900/[0.05] rounded-lg cursor-pointer"
                  title="放大预览"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Scrollable A4 Viewport */}
          <div className="flex-1 overflow-auto px-6 pt-4 pb-10 flex justify-center items-start">
            <div
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: 'top center',
              }}
              className="transition-transform duration-200 ease-out pb-12"
            >
              <ResumePreview
                resume={resume}
                onSelectSection={handleSelectSectionFromPreview}
                onMoveSectionInView={handleMoveSectionInView}
                onToggleSectionColumn={handleToggleSectionColumn}
                onReorderSectionsDirect={handleReorderSectionsDirect}
                onToggleAvatarColumn={handleToggleAvatarColumn}
                onInlineUpdateResume={handleInlinePreviewChange}
                onAutoFitOnePage={handleAutoFitOnePage}
                onPageMetricsChange={setPageMetrics}
                onRequestAIOptimize={setAiOptimizeTarget}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Universal Module AI Optimization Modal */}
      <AIOptimizeModal
        target={aiOptimizeTarget}
        resume={resume}
        onClose={() => setAiOptimizeTarget(null)}
        onApplyOptimizedSection={(updater, toastText) => {
          commitResumeChange(updater, false);
          showToast(toastText);
        }}
      />

      {/* Universal Multimodal Resume Import Modal */}
      <ResumeImportModal
        isOpen={showImportModal}
        currentResume={resume}
        roleLanes={roleLanes}
        onClose={() => setShowImportModal(false)}
        onImportResume={handleImportParsedResume}
      />

      {/* =====================================================================
          OFFSCREEN 1:1 A4 CAPTURE ROOT & PRINT-ONLY ROOT
          Used by domToCanvas + jsPDF for direct 300-DPI PDF file download
         ===================================================================== */}
      <div
        aria-hidden="true"
        className="fixed -left-[9999px] top-0 pointer-events-none z-[-1] print-only-root pdf-capture-surface"
      >
        <div ref={pdfCaptureRef} className="w-[210mm] bg-white">
          <ResumePreview
            resume={{
              ...resume,
              style: {
                ...resume.style,
                showPageBreakGuide: false,
              },
            }}
          />
        </div>
      </div>
    </div>
  );
}
