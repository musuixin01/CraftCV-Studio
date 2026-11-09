import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { ResumeDocument, SectionColumn, SectionConfig, SectionType } from '../types/resume';
import { AIOptimizeTarget } from './AIOptimizeModal';
import { TEMPLATE_CATALOG } from '../data/templateCatalog';
import { sectionGapPx } from '../utils/sectionSpacing';
import { isLongAtsProject } from '../utils/atsPagination';
import { internalSpacingCssProps } from '../utils/internalSpacing';
import { ArrowDown, ArrowLeftRight, ArrowUp, GripVertical, Minimize2, Sparkles, User } from 'lucide-react';
import { buildOriginalReviewParts, type PairedTextDiff } from '../utils/textDiff';

/** Read-only side-by-side comparison; not part of exported PDF/ATS rendering. */
export const ResumeDiffContext = createContext<{
  side: 'before' | 'after';
  byText: ReadonlyMap<string, PairedTextDiff>;
} | null>(null);

export interface PageMetrics {
  heightPx: number;
  isOverflowing: boolean;
  fillPercent: number;
}

interface ResumePreviewProps {
  resume: ResumeDocument;
  /** Unique DOM ID when rendering multiple read-only A4 documents together. */
  previewId?: string;
  onSelectSection?: (sectionId: string) => void;
  onMoveSectionInView?: (sectionId: string, direction: -1 | 1, isTwoColumn: boolean) => void;
  onToggleSectionColumn?: (sectionId: string) => void;
  onReorderSectionsDirect?: (draggedSecId: string, targetSecId: string, targetColumn?: SectionColumn) => void;
  onToggleAvatarColumn?: () => void;
  onInlineUpdateResume?: (updater: (prev: ResumeDocument) => ResumeDocument) => void;
  onAutoFitOnePage?: () => void;
  onPageMetricsChange?: (metrics: PageMetrics, measuredResume: ResumeDocument) => void;
  onRequestAIOptimize?: (target: AIOptimizeTarget) => void;
}

const DEFAULT_EN_TITLES: Record<SectionType, string> = {
  summary: 'ABOUT ME',
  education: 'EDUCATION',
  projects: 'PROJECT EXPERIENCE',
  experience: 'INTERNSHIP EXPERIENCE',
  skills: 'EXPERTISE',
  awards: 'ACHIEVEMENT',
  custom: 'ADDITIONAL',
};

// 297mm at 96 DPI is ~1122.5px. Allow a 4px tolerance for borders.
const A4_SINGLE_PAGE_PX = 1126;

export function getEffectiveColumn(sec: SectionConfig): SectionColumn {
  if (sec.column === 'left' || sec.column === 'right') return sec.column;
  return ['education', 'skills', 'awards'].includes(sec.type) ? 'left' : 'right';
}

/**
 * Rich text parser that supports:
 * 1. Automatic bold prefix for "项目成果：" / "核心成果：" / "阶段成果："
 * 2. Markdown bold syntax: **关键词**
 * 3. Inline code/tag syntax: `STM32H7`
 */
function renderRichText(text: string): React.ReactNode {
  if (!text) return null;

  let prefixNode: React.ReactNode = null;
  let body = text;

  const prefixMatch = text.match(/^(项目成果[:：]|核心成果[:：]|阶段成果[:：])(.*)$/);
  if (prefixMatch) {
    prefixNode = <strong className="font-bold text-[#141414]">{prefixMatch[1]}</strong>;
    body = prefixMatch[2];
  }

  // Split by **bold** or `code`
  const tokens = body.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  const renderedTokens = tokens.map((tok, i) => {
    if (tok.startsWith('**') && tok.endsWith('**') && tok.length > 4) {
      return (
        <strong key={i} className="font-bold text-[#141414]">
          {tok.slice(2, -2)}
        </strong>
      );
    }
    if (tok.startsWith('`') && tok.endsWith('`') && tok.length > 2) {
      return (
        <code
          key={i}
          className="px-1 py-[0.5px] mx-[1px] bg-black/[0.06] text-[#1f1f1f] rounded font-mono text-[0.92em]"
        >
          {tok.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={i}>{tok}</React.Fragment>;
  });

  return (
    <>
      {prefixNode}
      {renderedTokens}
    </>
  );
}

/**
 * Inline double-click editable text wrapper for WYSIWYG editing directly on the A4 sheet.
 */
const InlineEditableText: React.FC<{
  value: string;
  onSave?: (newValue: string) => void;
  multiline?: boolean;
  className?: string;
  placeholder?: string;
  richRender?: boolean;
}> = ({ value, onSave, multiline = false, className = '', placeholder = '', richRender = false }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const comparison = useContext(ResumeDiffContext);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  if (!onSave) {
    // Only the ORIGINAL A4 carries review annotations. The proposed A4 is
    // deliberately clean, matching what would be saved/exported on approval.
    const highlighted = comparison?.side === 'before' ? comparison.byText.get(value) : undefined;
    if (highlighted) {
      const parts = buildOriginalReviewParts(highlighted);
      return (
        <span className={className + ' whitespace-pre-wrap break-words'}>
          {parts.map((part, index) => (
            <span key={index}
              title={part.kind === 'removed' ? '原文中将删去或替换的文字' : part.kind === 'added' ? '建议新增或替换为的文字，仅用于审阅' : undefined}
              className={part.kind === 'removed'
                ? 'rounded-[2px] bg-rose-100 text-rose-800 line-through decoration-rose-600'
                : part.kind === 'added'
                  ? 'rounded-[2px] bg-sky-100 text-sky-900 border-b border-sky-400 font-semibold'
                  : ''}>
              {part.kind === 'added' ? '＋' : ''}{part.text}
            </span>
          ))}
        </span>
      );
    }
    // Read-only and export previews must never display editor placeholder text as resume content.
    return <span className={className}>{richRender ? renderRichText(value) : value}</span>;
  }

  if (editing) {
    const commit = () => {
      setEditing(false);
      if (draft !== value) {
        onSave(draft);
      }
    };

    if (multiline) {
      return (
        <textarea
          autoFocus
          value={draft}
          rows={Math.max(2, Math.min(6, Math.ceil(draft.length / 36)))}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setDraft(value);
              setEditing(false);
            } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              commit();
            }
          }}
          className="w-full p-1 text-[1em] leading-snug bg-blue-50/90 text-slate-900 border border-blue-500 rounded focus:outline-none shadow-xs"
        />
      );
    }

    return (
      <input
        type="text"
        autoFocus
        value={draft}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit();
          } else if (e.key === 'Escape') {
            setDraft(value);
            setEditing(false);
          }
        }}
        className="px-1 py-0.5 text-[1em] bg-blue-50/90 text-slate-900 border border-blue-500 rounded focus:outline-none shadow-xs min-w-[60px] max-w-full"
      />
    );
  }

  const startEditing = () => {
    setDraft(value);
    setEditing(true);
  };

  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={'编辑：' + (value || placeholder || '空白字段').slice(0, 60)}
      data-inline-editable="true"
      onClick={(e) => {
        // Inline edit takes priority; clicking elsewhere within a section opens its inspector.
        e.stopPropagation();
        startEditing();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          startEditing();
        }
      }}
      title="单击直接修改，Enter 确认，Esc 取消"
      className={className + ' cursor-text hover:bg-blue-500/[0.08] focus-visible:bg-blue-500/[0.08] focus-visible:outline focus-visible:outline-1 focus-visible:outline-blue-500 rounded-xs transition-colors'}
    >
      {richRender ? renderRichText(value || placeholder) : value || placeholder}
    </span>
  );
};

export const ResumePreview: React.FC<ResumePreviewProps> = ({
  resume,
  previewId = 'a4-resume-sheet',
  onSelectSection,
  onMoveSectionInView,
  onToggleSectionColumn,
  onReorderSectionsDirect,
  onToggleAvatarColumn,
  onInlineUpdateResume,
  onAutoFitOnePage,
  onPageMetricsChange,
  onRequestAIOptimize,
}) => {
  const { basics, sections, education, projects, experience, skills, awards, customSections, style } = resume;
  const { vars: rhythmVars, ...rhythmAttributes } = internalSpacingCssProps(style);
  const [imgError, setImgError] = useState(false);
  const [draggedSecId, setDraggedSecId] = useState<string | null>(null);
  const draggedSecRef = useRef<string | null>(null);
  const [dragOverSecId, setDragOverSecId] = useState<string | null>(null);
  const [fillPercentState, setFillPercentState] = useState<number>(92);
  const [isOverflowingOnePage, setIsOverflowingOnePage] = useState<boolean>(false);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const onePageMarkerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setImgError(false);
  }, [basics.avatarUrl]);

  // Measure actual content bottom relative to exact 297mm marker in real time
  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;

    const updateMetrics = () => {
      const sheetRect = el.getBoundingClientRect();
      const markerRect = onePageMarkerRef.current?.getBoundingClientRect();
      const onePageScreenHeight =
        markerRect && markerRect.height > 100 ? markerRect.height : A4_SINGLE_PAGE_PX;

      const contentNodes = el.querySelectorAll('section, header');
      let maxContentBottom = 0;
      contentNodes.forEach((node) => {
        const rect = node.getBoundingClientRect();
        const distFromSheetTop = rect.bottom - sheetRect.top;
        if (distFromSheetTop > maxContentBottom) {
          maxContentBottom = distFromSheetTop;
        }
      });

      const ratio = onePageScreenHeight > 0 ? maxContentBottom / onePageScreenHeight : 0.9;
      const fillPercent = Math.max(15, Math.round(ratio * 100));
      // Only flag overflow when actual section text crosses the 297mm boundary (> 100%)
      const isOverflowing = ratio > 1.0;

      setFillPercentState(fillPercent);
      setIsOverflowingOnePage(isOverflowing);

      onPageMetricsChange?.({
        heightPx: Math.round(ratio * 1122.5),
        isOverflowing,
        fillPercent,
      }, resume);
    };

    updateMetrics();
    const observer = new ResizeObserver(updateMetrics);
    observer.observe(el);
    return () => observer.disconnect();
  }, [resume, onPageMetricsChange]);

  const fontSizeClass =
    style.fontSize === 'sm'
      ? 'text-[11.2px]'
      : style.fontSize === 'lg'
        ? 'text-[13.2px]'
        : 'text-[12px]';

  const lineHeightClass =
    style.lineHeight === 'tight'
      ? 'leading-[1.42]'
      : style.lineHeight === 'relaxed'
        ? 'leading-[1.7]'
        : 'leading-[1.58]';

  const paddingClass =
    style.pageMargin === 'compact'
      ? 'px-7 py-6'
      : style.pageMargin === 'generous'
        ? 'px-12 py-10'
        : 'px-9 py-8';

  const visibleSections = sections.filter((s) => s.visible);

  // Shared single-click field editors keep the document model as the only source
  // of truth. A field is edited in place; a section background opens its inspector.
  const editText = (
    value: string,
    update: (doc: ResumeDocument, next: string) => ResumeDocument,
    options: { multiline?: boolean; richRender?: boolean; placeholder?: string } = {},
  ) => (
    <InlineEditableText
      value={value || ''}
      onSave={onInlineUpdateResume ? (next) => onInlineUpdateResume((doc) => update(doc, next)) : undefined}
      {...options}
    />
  );

  type BasicTextField =
    | 'name' | 'title' | 'directionTags' | 'phone' | 'email' | 'github'
    | 'website' | 'location' | 'graduationYear' | 'politicalStatus'
    | 'schoolTag' | 'statusTag' | 'summary';
  const editBasic = (field: BasicTextField, display?: string) =>
    editText(display ?? basics[field] ?? '', (doc, next) => ({
      ...doc, basics: { ...doc.basics, [field]: next },
    }), { multiline: field === 'summary', richRender: field === 'summary' });

  const editItem = (
    collection: 'education' | 'projects' | 'experience' | 'skills' | 'awards',
    itemId: string,
    field: string,
    value: string,
    options: { multiline?: boolean; richRender?: boolean; asList?: boolean } = {},
  ) => {
    const { asList, ...textOptions } = options;
    return editText(value, (doc, next) => {
      const updated = asList ? next.split(/[,，、/；;|]+/).map((x) => x.trim()).filter(Boolean) : next;
      switch (collection) {
        case 'education':
          return { ...doc, education: doc.education.map((item) => item.id === itemId ? { ...item, [field]: updated } : item) };
        case 'projects':
          return { ...doc, projects: doc.projects.map((item) => item.id === itemId ? { ...item, [field]: updated } : item) };
        case 'experience':
          return { ...doc, experience: doc.experience.map((item) => item.id === itemId ? { ...item, [field]: updated } : item) };
        case 'skills':
          return { ...doc, skills: doc.skills.map((item) => item.id === itemId ? { ...item, [field]: updated } : item) };
        case 'awards':
          return { ...doc, awards: doc.awards.map((item) => item.id === itemId ? { ...item, [field]: updated } : item) };
      }
    }, textOptions);
  };


  const visibleBulletIndex = (bullets: string[], visibleIndex: number): number => {
    let seen = -1;
    for (let i = 0; i < bullets.length; i += 1) {
      if (!bullets[i]) continue;
      seen += 1;
      if (seen === visibleIndex) return i;
    }
    return -1;
  };

  const editBullet = (
    collection: 'projects' | 'experience',
    itemId: string,
    index: number,
    value: string,
  ) => editText(value, (doc, next) => (
    collection === 'projects'
      ? { ...doc, projects: doc.projects.map((item) =>
          item.id === itemId ? { ...item, bullets: item.bullets.map((bullet, i) => i === visibleBulletIndex(item.bullets, index) ? next : bullet) } : item) }
      : { ...doc, experience: doc.experience.map((item) =>
          item.id === itemId ? { ...item, bullets: item.bullets.map((bullet, i) => i === visibleBulletIndex(item.bullets, index) ? next : bullet) } : item) }
  ), { multiline: true, richRender: true });

  const editCustomField = (
    customSectionId: string,
    itemId: string,
    field: 'heading' | 'subheading' | 'date',
    value: string,
  ) => editText(value, (doc, next) => ({
    ...doc,
    customSections: doc.customSections.map((section) =>
      section.id === customSectionId
        ? { ...section, items: section.items.map((item) =>
            item.id === itemId ? { ...item, [field]: next } : item) }
        : section),
  }));

  const editCustomBullet = (
    customSectionId: string,
    itemId: string,
    index: number,
    value: string,
  ) => editText(value, (doc, next) => ({
    ...doc,
    customSections: doc.customSections.map((section) =>
      section.id === customSectionId
        ? { ...section, items: section.items.map((item) =>
            item.id === itemId
              ? { ...item, bullets: item.bullets.map((bullet, i) => i === visibleBulletIndex(item.bullets, index) ? next : bullet) }
              : item) }
        : section),
  }), { multiline: true, richRender: true });

  const editSectionTitle = (sec: SectionConfig) =>
    editText(sec.title, (doc, next) => ({
      ...doc,
      sections: doc.sections.map((section) => section.id === sec.id ? { ...section, title: next } : section),
    }));

  const editSectionEnglishTitle = (sec: SectionConfig) =>
    editText(sec.englishTitle || '', (doc, next) => ({
      ...doc,
      sections: doc.sections.map((section) => section.id === sec.id ? { ...section, englishTitle: next } : section),
    }));


  // A single HTML5 drag contract for every native layout. Preview sections,
  // not the inline-editable content inside them, own reordering.
  const clearSectionDrag = () => {
    draggedSecRef.current = null;
    setDraggedSecId(null);
    setDragOverSecId(null);
  };

  const getSectionDragProps = (sectionId: string, targetColumn?: SectionColumn) => ({
    'data-section-id': sectionId,
    draggable: Boolean(onReorderSectionsDirect),
    onDragStart: (e: React.DragEvent<HTMLElement>) => {
      if (!onReorderSectionsDirect) return;
      // Editing/selection inside an input must not start a module drag.
      if ((e.target as HTMLElement).closest('input, textarea, [contenteditable="true"]')) {
        e.preventDefault();
        return;
      }
      draggedSecRef.current = sectionId;
      setDraggedSecId(sectionId);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', sectionId);
    },
    onDragOver: (e: React.DragEvent<HTMLElement>) => {
      if (!onReorderSectionsDirect) return;
      const from = draggedSecRef.current;
      if (!from || from === sectionId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (dragOverSecId !== sectionId) setDragOverSecId(sectionId);
    },
    onDragLeave: (e: React.DragEvent<HTMLElement>) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      if (dragOverSecId === sectionId) setDragOverSecId(null);
    },
    onDrop: (e: React.DragEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const from = draggedSecRef.current || e.dataTransfer.getData('text/plain');
      if (onReorderSectionsDirect && from && from !== sectionId) {
        onReorderSectionsDirect(from, sectionId, targetColumn);
      }
      clearSectionDrag();
    },
    onDragEnd: () => clearSectionDrag(),
  });


  // Render Portrait Avatar with Crop / Zoom / Offset / Background color support
  const renderAvatar = (defaultWidthPx = 106, defaultHeightPx = 142, extraClass = '') => {
    if (!basics.showAvatar) return null;
    const widthPx = basics.avatarWidthPx ?? defaultWidthPx;
    const heightPx = Math.round((widthPx * defaultHeightPx) / defaultWidthPx);
    const zoom = basics.avatarZoom ?? 1;
    const offsetX = basics.avatarOffsetX ?? 0;
    const offsetY = basics.avatarOffsetY ?? 0;
    const bgColor = basics.avatarBgColor ?? '#ffffff';

    return (
      <div
        style={{
          width: `${widthPx}px`,
          height: `${heightPx}px`,
          backgroundColor: bgColor,
        }}
        role="button"
        tabIndex={0}
        aria-label="点击修改或更换证件照"
        title="点击修改证件照，在左侧调整照片及裁剪"
        onClick={(e) => {
          e.stopPropagation();
          onSelectSection?.('basics');
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelectSection?.('basics');
          }
        }}
        className={`${extraClass} shrink-0 overflow-hidden flex items-center justify-center relative`}
      >
        {!imgError && basics.avatarUrl ? (
          <img
            src={basics.avatarUrl}
            alt={`${basics.name} 证件照`}
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            style={{
              transform: `translate(${offsetX}px, ${offsetY}px) scale(${zoom})`,
              transformOrigin: 'center center',
            }}
            className="w-full h-full object-cover object-top transition-transform duration-75"
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-slate-400 p-2 text-center">
            <User className="w-7 h-7 mb-1 stroke-[1.5]" />
            <span className="text-[11px] font-medium text-slate-600">{basics.name?.slice(0, 2) || '简历'}</span>
          </div>
        )}
      </div>
    );
  };

  // Visual A4 1st Page Break Guide & Overflow Alert Banner
  const renderPageBreakGuide = () => {
    return (
      <>
        {/* Invisible 297mm reference ruler for zoom-independent height measurement */}
        <div
          ref={onePageMarkerRef}
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-0 w-0 h-[297mm] opacity-0"
        />
        {(style.showPageBreakGuide || isOverflowingOnePage) && (
          <div
            className={`no-print absolute left-0 right-0 top-[297mm] z-30 border-t-2 border-dashed flex items-center justify-between px-3 py-0.5 ${
              isOverflowingOnePage
                ? 'border-red-500 bg-red-50/95 text-red-800'
                : 'border-emerald-500/70 pointer-events-none'
            }`}
          >
            <span
              className={`text-[11px] font-mono px-2 py-0.5 rounded-b ${
                isOverflowingOnePage
                  ? 'font-semibold text-red-700'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-300'
              }`}
            >
              {isOverflowingOnePage
                ? `⚠️ 内容已超出第一页 A4 底线（当前内容占 ${fillPercentState}% 页高，下方文字将落入第 2 页）`
                : `✓ A4 第一页底部分页线 (297mm) · 当前内容占 ${fillPercentState}% 页高（未超页）`}
            </span>

            {isOverflowingOnePage && onAutoFitOnePage && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAutoFitOnePage();
                }}
                className="px-2.5 py-0.5 text-[11px] font-semibold bg-red-600 hover:bg-red-700 text-white rounded flex items-center gap-1 shadow-xs cursor-pointer"
              >
                <Minimize2 className="w-3 h-3" />
                一键自适应收敛至一页 A4
              </button>
            )}
          </div>
        )}
      </>
    );
  };

  // Granular Per-Item / Per-Category Inline AI Optimize Button rendered on each item in the A4 preview (hidden in print)
  const renderItemAIButton = (target: AIOptimizeTarget, label = 'AI优化', extraClass = '') => {
    if (!onRequestAIOptimize) return null;
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRequestAIOptimize(target);
        }}
        title={`单独使用 AI 智能润色「${target.sectionTitle}」`}
        className={`no-print os26-press opacity-0 group-hover/item:opacity-100 group-hover/sec:opacity-100 focus:opacity-100 px-2 py-0.5 text-[10px] font-semibold text-[#0071e3] bg-white/95 backdrop-blur-md hover:bg-[#0071e3] hover:text-white ring-1 ring-[#0071e3]/25 rounded-full inline-flex items-center gap-0.5 transition-all duration-150 shrink-0 cursor-pointer shadow-2xs leading-none ${extraClass}`}
      >
        <Sparkles className="w-2.5 h-2.5" />
        <span>{label}</span>
      </button>
    );
  };

  // Only 'summary' is a single-block section where a header-level AI button optimizes that single summary
  const renderSectionAIButton = (sec: SectionConfig) => {
    if (!onRequestAIOptimize || sec.type !== 'summary') return null;
    return renderItemAIButton(
      {
        sectionId: sec.id,
        sectionType: 'summary',
        sectionTitle: `${sec.title}`,
      },
      'AI优化简介',
      'ml-auto'
    );
  };

  // Floating On-Canvas Position Control Toolbar for every module on the A4 Preview
  const renderOnCanvasControls = (
    sec: SectionConfig,
    idxInList: number,
    listLength: number,
    isTwoColumn: boolean
  ) => {
    if (!onMoveSectionInView) return null;
    const col = getEffectiveColumn(sec);
    return (
      <div
        onClick={(e) => e.stopPropagation()}
        className="no-print pointer-events-none opacity-0 group-hover/sec:opacity-100 transition-all duration-150 absolute -top-3.5 right-1 z-20 flex items-center gap-0.5 bg-slate-900/90 backdrop-blur-xl text-white px-2 py-0.5 rounded-full shadow-lg ring-1 ring-white/15 text-[10px]"
      >
        <span className="cursor-grab px-1 text-slate-300 flex items-center gap-0.5" title="在纸张上直接拖拽移动此模块">
          <GripVertical className="w-3 h-3" />
          拖拽
        </span>
        <button
          type="button"
          disabled={idxInList === 0}
          onClick={() => onMoveSectionInView(sec.id, -1, isTwoColumn)}
          className="pointer-events-auto px-1 py-0.5 hover:bg-white/15 disabled:opacity-30 rounded-full flex items-center cursor-pointer"
          title="上移模块"
        >
          <ArrowUp className="w-3 h-3" />
        </button>
        <button
          type="button"
          disabled={idxInList === listLength - 1}
          onClick={() => onMoveSectionInView(sec.id, 1, isTwoColumn)}
          className="pointer-events-auto px-1 py-0.5 hover:bg-white/15 disabled:opacity-30 rounded-full flex items-center cursor-pointer"
          title="下移模块"
        >
          <ArrowDown className="w-3 h-3" />
        </button>
        {isTwoColumn && onToggleSectionColumn && (
          <button
            type="button"
            onClick={() => onToggleSectionColumn(sec.id)}
            className="pointer-events-auto px-2 py-0.5 bg-[#0071e3] hover:bg-[#0077ed] rounded-full flex items-center gap-0.5 ml-0.5 font-medium cursor-pointer"
            title={col === 'left' ? '将此模块移至右侧主栏' : '将此模块移至左侧灰栏'}
          >
            <ArrowLeftRight className="w-2.5 h-2.5" />
            {col === 'left' ? '移至右栏' : '移至左栏'}
          </button>
        )}
      </div>
    );
  };

  // Universal content renderer for any section in PDF-Classic style (with per-item AI optimize & double-click inline editing)
  const renderPdfClassicSectionContent = (sec: SectionConfig, inLeftSidebar: boolean) => {
    const useColor = Boolean(style.useThemeColorInPdf && style.accentColor);
    const themeHex = useColor ? style.accentColor : '#222222';

    switch (sec.type) {
      case 'summary':
        return (
          <div className="text-[0.98em] text-[#333333]">
            <InlineEditableText
              value={basics.summary}
              multiline
              richRender
              placeholder="点击此处填写个人简介，也可以在左侧编辑器中修改..."
              onSave={
                onInlineUpdateResume
                  ? (val) =>
                      onInlineUpdateResume((prev) => ({
                        ...prev,
                        basics: { ...prev.basics, summary: val },
                      }))
                  : undefined
              }
            />
          </div>
        );

      case 'education':
        if (inLeftSidebar) {
          return (
            <div className="space-y-[14px]">
              {education.map((edu) => (
                <div key={edu.id} className="group/item relative text-[0.97em]">
                  <div className="flex items-center justify-between gap-1.5 mb-[2px]">
                    <div className="font-bold text-[#222222] text-[1.06em]">
                      <InlineEditableText
                        value={edu.school}
                        onSave={
                          onInlineUpdateResume
                            ? (val) =>
                                onInlineUpdateResume((prev) => ({
                                  ...prev,
                                  education: prev.education.map((x) => (x.id === edu.id ? { ...x, school: val } : x)),
                                }))
                            : undefined
                        }
                      />
                    </div>
                    {renderItemAIButton({
                      sectionId: sec.id,
                      sectionType: 'education',
                      sectionTitle: `${sec.title} · ${edu.school}`,
                      itemId: edu.id,
                    })}
                  </div>
                  <div className="text-[#444444] mb-[2px]">
                    <InlineEditableText
                      value={edu.major}
                      onSave={
                        onInlineUpdateResume
                          ? (val) =>
                              onInlineUpdateResume((prev) => ({
                                ...prev,
                                education: prev.education.map((x) => (x.id === edu.id ? { ...x, major: val } : x)),
                              }))
                          : undefined
                      }
                    />
                    {edu.degree && !edu.major.includes(edu.degree) && <>（{editItem('education', edu.id, 'degree', edu.degree)}）</>}
                  </div>
                  <div className="text-[#333333] mb-[5px]">
                    {editItem('education', edu.id, 'startDate', edu.startDate)} - {editItem('education', edu.id, 'endDate', edu.endDate)}
                  </div>

                  <div className="space-y-[3px] text-[#3a3a3a]">
                    {edu.gpa && (
                      <div>
                        · GPA {editItem('education', edu.id, 'gpa', edu.gpa)}
                        {edu.ranking && !edu.gpa.includes(edu.ranking) && <>（{editItem('education', edu.id, 'ranking', edu.ranking)}）</>}
                      </div>
                    )}
                    {edu.honors && <div>· {editItem('education', edu.id, 'honors', edu.honors, { richRender: true })}</div>}
                    {edu.courses && <div>· 核心课程：{editItem('education', edu.id, 'courses', edu.courses, { richRender: true })}</div>}
                  </div>
                </div>
              ))}
            </div>
          );
        }
        return (
          <div className="space-y-[10px]">
            {education.map((edu) => (
              <div key={edu.id} className="group/item relative text-[0.97em]">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-[#222222] text-[1.06em]">{editItem('education', edu.id, 'school', edu.school)}</span>
                    <span className="text-[#888888]">·</span>
                    <span className="text-[#444444]">{editItem('education', edu.id, 'major', edu.major)}</span>
                    {renderItemAIButton({
                      sectionId: sec.id,
                      sectionType: 'education',
                      sectionTitle: `${sec.title} · ${edu.school}`,
                      itemId: edu.id,
                    })}
                  </div>
                  <span className="text-[#444444] shrink-0">
                    {editItem('education', edu.id, 'startDate', edu.startDate)} - {editItem('education', edu.id, 'endDate', edu.endDate)}
                  </span>
                </div>
                <div className="text-[#3a3a3a] mt-0.5 space-y-0.5">
                  {edu.gpa && (
                    <div>
                      · GPA {editItem('education', edu.id, 'gpa', edu.gpa)} {edu.honors ? ` | ${edu.honors}` : ''}
                    </div>
                  )}
                  {edu.courses && <div>· 核心课程：{editItem('education', edu.id, 'courses', edu.courses, { richRender: true })}</div>}
                </div>
              </div>
            ))}
          </div>
        );

      case 'skills':
        return (
          <div className="space-y-[11px]">
            {skills.map((sk) => (
              <div key={sk.id} className="group/item relative text-[0.97em]">
                <div className="flex items-center justify-between gap-1.5 mb-[5px]">
                  <div
                    className="inline-block font-bold text-[1em] px-[8px] py-[2px] leading-snug"
                    style={{
                      backgroundColor: useColor ? `${style.accentColor}18` : '#e3e3e3',
                      color: themeHex,
                    }}
                  >
                    <InlineEditableText
                      value={sk.category}
                      onSave={
                        onInlineUpdateResume
                          ? (val) =>
                              onInlineUpdateResume((prev) => ({
                                ...prev,
                                skills: prev.skills.map((x) => (x.id === sk.id ? { ...x, category: val } : x)),
                              }))
                          : undefined
                      }
                    />
                  </div>
                  {renderItemAIButton({
                    sectionId: sec.id,
                    sectionType: 'skills',
                    sectionTitle: `专业技能 · ${sk.category}`,
                    itemId: sk.id,
                  })}
                </div>
                <p className="text-[#333333]">
                  <InlineEditableText
                    value={sk.items}
                    multiline
                    richRender
                    onSave={
                      onInlineUpdateResume
                        ? (val) =>
                            onInlineUpdateResume((prev) => ({
                              ...prev,
                              skills: prev.skills.map((x) => (x.id === sk.id ? { ...x, items: val } : x)),
                            }))
                        : undefined
                    }
                  />
                </p>
              </div>
            ))}
          </div>
        );

      case 'awards':
        return (
          <div className="space-y-[6px] text-[0.97em] text-[#333333]">
            {awards.map((aw) => (
              <div key={aw.id} className="group/item relative">
                <div className="flex items-start justify-between gap-1.5">
                  <span className="flex-1">
                    ·{' '}
                    <InlineEditableText
                      value={aw.title}
                      richRender
                      onSave={
                        onInlineUpdateResume
                          ? (val) =>
                              onInlineUpdateResume((prev) => ({
                                ...prev,
                                awards: prev.awards.map((x) => (x.id === aw.id ? { ...x, title: val } : x)),
                              }))
                          : undefined
                      }
                    />
                    {aw.level && <>（{editItem('awards', aw.id, 'level', aw.level)}）</>}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {!inLeftSidebar && aw.date && (
                      <span className="text-[#555555] text-[0.92em]">{editItem('awards', aw.id, 'date', aw.date)}</span>
                    )}
                    {renderItemAIButton({
                      sectionId: sec.id,
                      sectionType: 'awards',
                      sectionTitle: `证书与荣誉 · ${aw.title}`,
                      itemId: aw.id,
                    })}
                  </div>
                </div>
                {aw.description && (
                  <div className="text-[#555555] pl-2.5 text-[0.92em] mt-0.5">{editItem('awards', aw.id, 'description', aw.description, {multiline:true,richRender:true})}</div>
                )}
              </div>
            ))}
          </div>
        );

      case 'projects':
        return (
          <div data-cv-items className="space-y-[13px]">
            {projects.map((proj) => (
              <div data-cv-item key={proj.id} className="group/item relative">
                <div className="flex items-baseline justify-between gap-2 mb-[2.5px]">
                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <h3 className="font-bold text-[#222222] text-[1.1em] leading-snug">
                      <InlineEditableText
                        value={proj.name}
                        onSave={
                          onInlineUpdateResume
                            ? (val) =>
                                onInlineUpdateResume((prev) => ({
                                  ...prev,
                                  projects: prev.projects.map((x) => (x.id === proj.id ? { ...x, name: val } : x)),
                                }))
                            : undefined
                        }
                      />
                    </h3>
                    {renderItemAIButton({
                      sectionId: sec.id,
                      sectionType: 'projects',
                      sectionTitle: `项目经历 · ${proj.name}`,
                      itemId: proj.id,
                    })}
                  </div>
                  {proj.role && (
                    <span
                      className="text-[0.97em] shrink-0"
                      style={{ color: useColor ? style.accentColor : '#555555' }}
                    >
                      <InlineEditableText
                        value={proj.role}
                        onSave={
                          onInlineUpdateResume
                            ? (val) =>
                                onInlineUpdateResume((prev) => ({
                                  ...prev,
                                  projects: prev.projects.map((x) => (x.id === proj.id ? { ...x, role: val } : x)),
                                }))
                            : undefined
                        }
                      />
                    </span>
                  )}
                </div>

                <div className="text-[0.97em] flex flex-wrap items-center mb-[4px]">
                  <span className="font-bold text-[#222222]">
                    {editItem('projects', proj.id, 'startDate', proj.startDate)} - {editItem('projects', proj.id, 'endDate', proj.endDate)}
                  </span>
                  {proj.techStack.length > 0 && (
                    <>
                      <span className="mx-[8px] text-[#b0b0b0]">|</span>
                      <span className="text-[#555555]">{editItem('projects', proj.id, 'techStack', proj.techStack.join(' / '), { asList: true })}</span>
                    </>
                  )}
                </div>

                {proj.summary && (
                  <p className="text-[0.97em] text-[#333333] mb-[3px]">{editItem('projects', proj.id, 'summary', proj.summary, { multiline: true, richRender: true })}</p>
                )}

                <ul data-cv-bullets className="space-y-[3px] text-[0.97em] text-[#333333]">
                  {proj.bullets.filter(Boolean).map((bullet, idx) => (
                    <li key={idx} className="flex items-start gap-[7px]">
                      <span className="text-[#333333] shrink-0 select-none">•</span>
                      <span className="flex-1">
                        <InlineEditableText
                          value={bullet}
                          multiline
                          richRender
                          onSave={
                            onInlineUpdateResume
                              ? (val) =>
                                  onInlineUpdateResume((prev) => ({
                                    ...prev,
                                    projects: prev.projects.map((x) =>
                                      x.id === proj.id
                                        ? {
                                            ...x,
                                            bullets: x.bullets.map((b, bIdx) => (bIdx === visibleBulletIndex(x.bullets, idx) ? val : b)),
                                          }
                                        : x
                                    ),
                                  }))
                              : undefined
                          }
                        />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        );

      case 'experience':
        return (
          <div data-cv-items className="space-y-[11px]">
            {experience.map((exp) => {
              const cleanBullets = exp.bullets.filter(Boolean);
              return (
                <div data-cv-item key={exp.id} className="group/item relative">
                  <div className="flex items-center justify-between gap-2 mb-[2px]">
                    <div className="flex flex-wrap items-baseline gap-x-[6px]">
                      <span className="font-bold text-[#222222] text-[1.05em]">
                        <InlineEditableText
                          value={exp.company}
                          onSave={
                            onInlineUpdateResume
                              ? (val) =>
                                  onInlineUpdateResume((prev) => ({
                                    ...prev,
                                    experience: prev.experience.map((x) =>
                                      x.id === exp.id ? { ...x, company: val } : x
                                    ),
                                  }))
                              : undefined
                          }
                        />
                      </span>
                      {exp.position && (
                        <>
                          <span className="text-[#888888]">·</span>
                          <span
                            className="text-[1em]"
                            style={{ color: useColor ? style.accentColor : '#555555' }}
                          >
                            {editItem('experience', exp.id, 'position', exp.position)}
                            {exp.department && <>（{editItem('experience', exp.id, 'department', exp.department)}）</>}
                          </span>
                        </>
                      )}
                    </div>
                    {renderItemAIButton({
                      sectionId: sec.id,
                      sectionType: 'experience',
                      sectionTitle: `实习经历 · ${exp.company}`,
                      itemId: exp.id,
                    })}
                  </div>
                  <div className="text-[0.97em] text-[#444444] mb-[3.5px]">
                    {editItem('experience', exp.id, 'startDate', exp.startDate)} - {editItem('experience', exp.id, 'endDate', exp.endDate)}
                  </div>
                  {cleanBullets.length === 1 ? (
                    <p className="text-[0.97em] text-[#333333]">
                      <InlineEditableText
                        value={cleanBullets[0]}
                        multiline
                        richRender
                        onSave={
                          onInlineUpdateResume
                            ? (val) =>
                                onInlineUpdateResume((prev) => ({
                                  ...prev,
                                  experience: prev.experience.map((x) =>
                                    x.id === exp.id ? { ...x, bullets: x.bullets.map((b, i) => i === visibleBulletIndex(x.bullets, 0) ? val : b) } : x
                                  ),
                                }))
                            : undefined
                        }
                      />
                    </p>
                  ) : (
                    <ul data-cv-bullets className="space-y-[3px] text-[0.97em] text-[#333333]">
                      {cleanBullets.map((bullet, idx) => (
                        <li key={idx} className="flex items-start gap-[7px]">
                          <span className="text-[#333333] shrink-0 select-none">•</span>
                          <span className="flex-1">
                            <InlineEditableText
                              value={bullet}
                              multiline
                              richRender
                              onSave={
                                onInlineUpdateResume
                                  ? (val) =>
                                      onInlineUpdateResume((prev) => ({
                                        ...prev,
                                        experience: prev.experience.map((x) =>
                                          x.id === exp.id
                                            ? {
                                                ...x,
                                                bullets: x.bullets.map((b, bIdx) => (bIdx === visibleBulletIndex(x.bullets, idx) ? val : b)),
                                              }
                                            : x
                                        ),
                                      }))
                                  : undefined
                              }
                            />
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        );

      case 'custom': {
        const customSec = customSections.find((c) => c.id === sec.customSectionId);
        if (!customSec) return null;
        return (
          <div className="space-y-[10px]">
            {customSec.items.map((item) => (
                <div key={item.id} className="group/item relative space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-[#222222] text-[1.04em]">{editCustomField(customSec.id, item.id, 'heading', item.heading)}</span>
                      {renderItemAIButton({
                        sectionId: sec.id,
                        sectionType: 'custom',
                        sectionTitle: `${sec.title} · ${item.heading}`,
                        customSectionId: sec.customSectionId,
                        itemId: item.id,
                      })}
                    </div>
                    {item.date && <span className="text-[0.95em] text-[#555555] shrink-0">{editCustomField(customSec.id, item.id, 'date', item.date)}</span>}
                  </div>
                  {item.subheading && <div className="text-[0.95em] text-[#555555]">{editCustomField(customSec.id, item.id, 'subheading', item.subheading)}</div>}
                  {item.bullets.filter(Boolean).map((b, i) => (
                    <p key={i} className="text-[0.97em] text-[#333333]">
                      {editCustomBullet(customSec.id, item.id, i, b)}
                    </p>
                  ))}
                </div>
              ))}
          </div>
        );
      }

      default:
        return null;
    }
  };

  // ============================================================================
  // TEMPLATE 0 (DEFAULT): 1:1 PIXEL-ACCURATE REPLICA OF UPLOADED PDF ('pdf-classic')
  // ============================================================================
  if (style.template === 'pdf-classic') {
    const leftSections = visibleSections.filter((s) => getEffectiveColumn(s) === 'left');
    const rightSections = visibleSections.filter((s) => getEffectiveColumn(s) === 'right');

    const outerPagePad =
      style.pageMargin === 'compact'
        ? 'px-[7mm] py-[6mm]'
        : style.pageMargin === 'generous'
          ? 'px-[12mm] py-[10mm]'
          : 'px-[9.5mm] py-[7.5mm]';

    const schoolDisplay = basics.schoolTag ?? education[0]?.school ?? '';
    const statusDisplay =
      basics.statusTag ??
      `${education[0]?.major?.replace(/（.*）/, '') || '电子信息工程'} · ${basics.graduationYear || '随时到岗'}`;

    const avatarInRight = basics.avatarPosition === 'right';
    const leftWidthPercent = style.leftColumnWidth ?? 31.5;
    const rightWidthPercent = 100 - leftWidthPercent;
    const useColor = Boolean(style.useThemeColorInPdf && style.accentColor);
    const headerTitleColor = useColor ? style.accentColor : '#222222';
    const slantBarColor = useColor ? style.accentColor : style.accentColor || '#666666';

    return (
      <div
        ref={sheetRef}
        id={previewId}
        {...rhythmAttributes}
        style={rhythmVars as React.CSSProperties}
        className={`w-[210mm] min-h-[297mm] bg-white text-[#333333] shadow-sm border border-slate-200 relative ${outerPagePad} flex items-stretch ${fontSizeClass} ${lineHeightClass}`}
      >
        {/* LEFT GRAY COLUMN (matches exact PDF #F5F5F5 panel inside outer page margin) */}
        <aside
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (draggedSecId && onReorderSectionsDirect && leftSections.length === 0) {
              onToggleSectionColumn?.(draggedSecId);
              setDraggedSecId(null);
            }
          }}
          style={{
            width: `${leftWidthPercent}%`,
            gap: 0,
          }}
          className="shrink-0 bg-[#f5f5f5] px-[15px] py-[14px] flex flex-col"
        >
          {/* Top Centered Portrait Photo (if placed in left sidebar) */}
          {basics.showAvatar && !avatarInRight && (
            <div
              onClick={() => onSelectSection?.('basics')}
              className="group/avatar relative cursor-pointer flex justify-center pt-[2px] pb-[2px]"
              title="点击展开左侧照片裁剪/底色设置，或点击右上角切换栏位"
            >
              {onToggleAvatarColumn && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleAvatarColumn();
                  }}
                  className="no-print opacity-0 group-hover/avatar:opacity-100 transition-opacity absolute -top-2 right-1 z-20 bg-slate-900 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5 cursor-pointer"
                >
                  <ArrowLeftRight className="w-2.5 h-2.5" />
                  移至右栏头部
                </button>
              )}
              {renderAvatar(106, 142)}
            </div>
          )}

          {/* Left Column Dynamic Sections (Any section assigned to 'left' renders here in exact order) */}
          {leftSections.map((sec, idx) => {
            const enTitle = sec.englishTitle ?? DEFAULT_EN_TITLES[sec.type];
            const isDragTarget = dragOverSecId === sec.id;
            return (
              <section
                key={sec.id}
                style={{ marginTop: idx === 0 && !(basics.showAvatar && !avatarInRight) && sec.spacingBeforePx === undefined ? 0 : sectionGapPx(style, sec) }}
                draggable
                onDragStart={() => setDraggedSecId(sec.id)}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (draggedSecId && draggedSecId !== sec.id) {
                    setDragOverSecId(sec.id);
                  }
                }}
                onDragLeave={() => setDragOverSecId(null)}
                onDrop={(e) => {
                  e.stopPropagation();
                  if (draggedSecId && draggedSecId !== sec.id && onReorderSectionsDirect) {
                    onReorderSectionsDirect(draggedSecId, sec.id, 'left');
                  }
                  setDraggedSecId(null);
                  setDragOverSecId(null);
                }}
                onDragEnd={() => {
                  setDraggedSecId(null);
                  setDragOverSecId(null);
                }}
                onClick={() => onSelectSection?.(sec.type === 'summary' ? 'basics' : sec.id)}
                className={`group/sec relative cursor-pointer hover:bg-black/[0.03] rounded transition-all ${
                  isDragTarget ? 'ring-2 ring-blue-500 bg-blue-50/40' : ''
                }`}
              >
                {renderOnCanvasControls(sec, idx, leftSections.length, true)}

                {/* Left Section Header: Bold Chinese + Uppercase English */}
                <div
                  data-cv-section-heading
                  className="border-b pb-[5px] mb-[10px] flex items-center gap-[6px]"
                  style={{ borderColor: useColor ? `${style.accentColor}40` : '#d6d6d6' }}
                >
                  <div className="flex items-baseline gap-[6px] min-w-0">
                    <h2
                      className="text-[1.28em] font-bold tracking-tight leading-none"
                      style={{ color: headerTitleColor }}
                    >
                    {editSectionTitle(sec)}
                  </h2>
                    {enTitle && (
                      <span className="text-[0.87em] font-normal text-[#666666] uppercase tracking-normal leading-none truncate">
                        {enTitle}
                      </span>
                    )}
                  </div>
                  {renderSectionAIButton(sec)}
                </div>

                <div data-cv-section-body>{renderPdfClassicSectionContent(sec, true)}</div>
              </section>
            );
          })}
        </aside>

        {/* RIGHT MAIN WHITE COLUMN */}
        <main
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (draggedSecId && onReorderSectionsDirect && rightSections.length === 0) {
              onToggleSectionColumn?.(draggedSecId);
              setDraggedSecId(null);
            }
          }}
          style={{
            width: `${rightWidthPercent}%`,
            gap: 0,
          }}
          className="bg-white pl-[24px] pr-[4px] py-[6px] flex flex-col"
        >
          {/* Top Header: Left (Name + Role + Divider + Direction Tags) | Right (5-Row Contact Grid) */}
          <header
            onClick={() => onSelectSection?.('basics')}
            className="group/avatar relative cursor-pointer flex items-start justify-between gap-[16px] pb-[4px] hover:bg-slate-50/70 rounded transition-colors"
            title="点击文字直接修改；点击空白处在左侧面板中编辑"
          >
            {/* Left Name & Role Block */}
            <div className="w-[44%] shrink-0 pt-[2px]">
              <h1 className="text-[2.65em] font-bold text-[#222222] tracking-tight leading-[1.12] mb-[11px]">
                <InlineEditableText
                  value={basics.name}
                  onSave={
                    onInlineUpdateResume
                      ? (val) => onInlineUpdateResume((prev) => ({ ...prev, basics: { ...prev.basics, name: val } }))
                      : undefined
                  }
                />
              </h1>
              <div
                className="text-[1.36em] font-bold pb-[7px] border-b border-[#e0e0e0] leading-snug flex items-center justify-between gap-1"
                style={{ color: useColor ? style.accentColor : '#2b2b2b' }}
              >
                <InlineEditableText
                  value={basics.title}
                  onSave={
                    onInlineUpdateResume
                      ? (val) => onInlineUpdateResume((prev) => ({ ...prev, basics: { ...prev.basics, title: val } }))
                      : undefined
                  }
                />
                {renderItemAIButton(
                  {
                    sectionId: 'basics',
                    sectionType: 'basics',
                    sectionTitle: '求职岗位与细分技术方向标签',
                  },
                  'AI优化'
                )}
              </div>
              {(basics.directionTags || basics.politicalStatus) && (
                <div className="text-[0.96em] text-[#555555] pt-[7px] leading-snug">
                  <InlineEditableText
                    value={basics.directionTags || basics.politicalStatus}
                    onSave={
                      onInlineUpdateResume
                        ? (val) =>
                            onInlineUpdateResume((prev) => ({
                              ...prev,
                              basics: { ...prev.basics, directionTags: val },
                            }))
                        : undefined
                    }
                  />
                </div>
              )}
            </div>

            {/* Right 5-Row Contact Info Block */}
            <div className="flex-1 text-[0.95em] leading-[1.82] pt-[4px]">
              {basics.phone && (
                <div className="grid grid-cols-[44px_1fr] gap-x-[8px] items-baseline">
                  <span className="text-[#777777]">电话</span>
                  <span className="text-[#222222] font-medium">
                    <InlineEditableText
                      value={basics.phone}
                      onSave={
                        onInlineUpdateResume
                          ? (val) =>
                              onInlineUpdateResume((prev) => ({ ...prev, basics: { ...prev.basics, phone: val } }))
                          : undefined
                      }
                    />
                  </span>
                </div>
              )}
              {basics.email && (
                <div className="grid grid-cols-[44px_1fr] gap-x-[8px] items-baseline">
                  <span className="text-[#777777]">邮箱</span>
                  <span className="text-[#222222] font-medium break-all">
                    <InlineEditableText
                      value={basics.email}
                      onSave={
                        onInlineUpdateResume
                          ? (val) =>
                              onInlineUpdateResume((prev) => ({ ...prev, basics: { ...prev.basics, email: val } }))
                          : undefined
                      }
                    />
                  </span>
                </div>
              )}
              {basics.github && (
                <div className="grid grid-cols-[44px_1fr] gap-x-[8px] items-baseline">
                  <span className="text-[#777777]">GitHub</span>
                  <span className="text-[#222222] font-medium break-all">
                    <InlineEditableText
                      value={basics.github.replace(/^https?:\/\//, '')}
                      onSave={
                        onInlineUpdateResume
                          ? (val) =>
                              onInlineUpdateResume((prev) => ({ ...prev, basics: { ...prev.basics, github: val } }))
                          : undefined
                      }
                    />
                  </span>
                </div>
              )}
              {schoolDisplay && (
                <div className="grid grid-cols-[44px_1fr] gap-x-[8px] items-baseline">
                  <span className="text-[#777777]">院校</span>
                  <span className="text-[#555555]">
                    <InlineEditableText
                      value={schoolDisplay}
                      onSave={
                        onInlineUpdateResume
                          ? (val) =>
                              onInlineUpdateResume((prev) => ({
                                ...prev,
                                basics: { ...prev.basics, schoolTag: val },
                              }))
                          : undefined
                      }
                    />
                  </span>
                </div>
              )}
              {statusDisplay && (
                <div className="grid grid-cols-[44px_1fr] gap-x-[8px] items-baseline">
                  <span className="text-[#777777]">状态</span>
                  <span className="text-[#555555]">
                    <InlineEditableText
                      value={statusDisplay}
                      onSave={
                        onInlineUpdateResume
                          ? (val) =>
                              onInlineUpdateResume((prev) => ({
                                ...prev,
                                basics: { ...prev.basics, statusTag: val },
                              }))
                          : undefined
                      }
                    />
                  </span>
                </div>
              )}
            </div>

            {basics.showAvatar && avatarInRight && (
              <div className="relative shrink-0">
                {onToggleAvatarColumn && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleAvatarColumn();
                    }}
                    className="no-print opacity-0 group-hover/avatar:opacity-100 transition-opacity absolute -top-2 right-0 z-20 bg-slate-900 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5 cursor-pointer whitespace-nowrap"
                  >
                    <ArrowLeftRight className="w-2.5 h-2.5" />
                    移回左栏
                  </button>
                )}
                {renderAvatar(78, 104, 'border border-zinc-200')}
              </div>
            )}
          </header>

          {/* Right Column Dynamic Sections */}
          {rightSections.map((sec, idx) => {
            const enTitle = sec.englishTitle ?? DEFAULT_EN_TITLES[sec.type];
            const isDragTarget = dragOverSecId === sec.id;
            return (
              <section
                key={sec.id}
                style={{ marginTop: sectionGapPx(style, sec) }}
                draggable
                onDragStart={() => setDraggedSecId(sec.id)}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (draggedSecId && draggedSecId !== sec.id) {
                    setDragOverSecId(sec.id);
                  }
                }}
                onDragLeave={() => setDragOverSecId(null)}
                onDrop={(e) => {
                  e.stopPropagation();
                  if (draggedSecId && draggedSecId !== sec.id && onReorderSectionsDirect) {
                    onReorderSectionsDirect(draggedSecId, sec.id, 'right');
                  }
                  setDraggedSecId(null);
                  setDragOverSecId(null);
                }}
                onDragEnd={() => {
                  setDraggedSecId(null);
                  setDragOverSecId(null);
                }}
                onClick={() => onSelectSection?.(sec.type === 'summary' ? 'basics' : sec.id)}
                className={`group/sec relative cursor-pointer hover:bg-slate-50/80 rounded transition-all ${
                  isDragTarget ? 'ring-2 ring-blue-500 bg-blue-50/40' : ''
                }`}
              >
                {renderOnCanvasControls(sec, idx, rightSections.length, true)}

                {/* Right Column Section Header: Slanted Parallelogram + Chinese Title + English Subtitle */}
                <div
                  data-cv-section-heading
                  className="border-b pb-[5px] mb-[10px] flex items-center justify-between gap-2"
                  style={{ borderColor: useColor ? `${style.accentColor}40` : '#d6d6d6' }}
                >
                  <div className="flex items-baseline min-w-0">
                    <span
                      className="inline-block w-[7.5px] h-[14px] -skew-x-[16deg] mr-[9px] shrink-0 translate-y-[1.5px]"
                      style={{ backgroundColor: slantBarColor }}
                    />
                    <h2
                      className="text-[1.28em] font-bold tracking-tight leading-none"
                      style={{ color: headerTitleColor }}
                    >
                    {editSectionTitle(sec)}
                  </h2>
                    {enTitle && (
                      <span className="text-[0.87em] font-normal text-[#666666] uppercase tracking-normal ml-[8px] leading-none truncate">
                        {enTitle}
                      </span>
                    )}
                  </div>
                  {renderSectionAIButton(sec)}
                </div>

                <div data-cv-section-body>{renderPdfClassicSectionContent(sec, false)}</div>
              </section>
            );
          })}
        </main>

        {renderPageBreakGuide()}
      </div>
    );
  }

  // Shared section content renderer for Template 1 (Modern), Template 2 (Classic ATS) & Template 3 (Creative Split)
  const renderSectionBody = (sec: SectionConfig, isClassicATS: boolean) => {
    switch (sec.type) {
      case 'summary':
        return (
          <p className="text-[0.95em] text-slate-700 leading-relaxed">
            <InlineEditableText
              value={basics.summary}
              multiline
              richRender
              onSave={
                onInlineUpdateResume
                  ? (val) =>
                      onInlineUpdateResume((prev) => ({
                        ...prev,
                        basics: { ...prev.basics, summary: val },
                      }))
                  : undefined
              }
            />
          </p>
        );

      case 'education':
        return (
          <div className="space-y-2.5">
            {education.map((edu) => (
              <div key={edu.id} className="space-y-1 ats-print-entry">
                <div className="flex items-baseline justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-x-2">
                    <span className="font-bold text-slate-900 text-[1.06em]">{editItem('education', edu.id, 'school', edu.school)}</span>
                    <span className="text-slate-400">·</span>
                    <span className="font-semibold text-slate-800">{editItem('education', edu.id, 'major', edu.major)}</span>
                    {edu.degree && !edu.major.includes(edu.degree) && (
                      <>
                        <span className="text-slate-400">·</span>
                        <span className="text-slate-600 text-[0.94em]">{editItem('education', edu.id, 'degree', edu.degree)}</span>
                      </>
                    )}
                    {renderItemAIButton({
                      sectionId: sec.id,
                      sectionType: 'education',
                      sectionTitle: `${sec.title} · ${edu.school}`,
                      itemId: edu.id,
                    })}
                  </div>
                  <span className="font-mono tabular-nums text-[0.92em] text-slate-600 shrink-0">
                    {editItem('education', edu.id, 'startDate', edu.startDate)} – {editItem('education', edu.id, 'endDate', edu.endDate)}
                  </span>
                </div>
                {(edu.gpa || edu.ranking || edu.honors) && (
                  <div className="flex flex-wrap items-center gap-x-2 text-[0.94em] text-slate-700">
                    {edu.gpa && (
                      <span>
                        <strong className="font-semibold text-slate-800">GPA:</strong>{' '}
                        <span className="font-mono tabular-nums">{editItem('education', edu.id, 'gpa', edu.gpa)}</span>
                      </span>
                    )}
                    {edu.gpa && edu.ranking && <span className="text-slate-300">|</span>}
                    {edu.ranking && (
                      <span>
                        <strong className="font-semibold text-slate-800">专业排名:</strong>{' '}
                        <span className="font-mono tabular-nums">{editItem('education', edu.id, 'ranking', edu.ranking)}</span>
                      </span>
                    )}
                    {(edu.gpa || edu.ranking) && edu.honors && <span className="text-slate-300">|</span>}
                    {edu.honors && (
                      <span>
                        <strong className="font-semibold text-slate-800">荣誉:</strong> {editItem('education', edu.id, 'honors', edu.honors, {richRender:true})}
                      </span>
                    )}
                  </div>
                )}
                {edu.courses && (
                  <p className="text-[0.93em] text-slate-600">
                    <strong className="font-semibold text-slate-800">核心课程：</strong>
                    {editItem('education', edu.id, 'courses', edu.courses, {richRender:true})}
                  </p>
                )}
              </div>
            ))}
          </div>
        );

      case 'projects':
        return (
          <div data-cv-items className={isClassicATS ? 'space-y-3' : 'space-y-3.5'}>
            {projects.map((proj) => (
              <div data-cv-item key={proj.id} className={'space-y-1 ats-print-entry ats-print-project-entry' +
                (isLongAtsProject(proj) ? ' ats-print-project-breakable' : '')}>
                <div className="flex items-baseline justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-x-2">
                    <span className="font-bold text-slate-900 text-[1.05em]">
                      <InlineEditableText
                        value={proj.name}
                        onSave={
                          onInlineUpdateResume
                            ? (val) =>
                                onInlineUpdateResume((prev) => ({
                                  ...prev,
                                  projects: prev.projects.map((x) => (x.id === proj.id ? { ...x, name: val } : x)),
                                }))
                            : undefined
                        }
                      />
                    </span>
                    {proj.role && (
                      <>
                        <span className="text-slate-400">·</span>
                        <span
                          className="font-semibold text-[0.94em]"
                          style={{ color: isClassicATS ? '#1e293b' : style.accentColor }}
                        >
                          {editItem('projects', proj.id, 'role', proj.role)}
                        </span>
                      </>
                    )}
                    {renderItemAIButton({
                      sectionId: sec.id,
                      sectionType: 'projects',
                      sectionTitle: `项目经历 · ${proj.name}`,
                      itemId: proj.id,
                    })}
                  </div>
                  <span className="font-mono tabular-nums text-[0.92em] text-slate-600 shrink-0">
                    {editItem('projects', proj.id, 'startDate', proj.startDate)} – {editItem('projects', proj.id, 'endDate', proj.endDate)}
                  </span>
                </div>

                {(proj.techStack.length > 0 || proj.repoUrl) && (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[0.9em] text-slate-600">
                    {proj.techStack.length > 0 && (
                      <div className="font-mono text-slate-700">
                        <span className="font-sans font-semibold text-slate-800">技术栈：</span>
                        {editItem('projects', proj.id, 'techStack', proj.techStack.join(' / '), {asList:true})}
                      </div>
                    )}
                    {proj.repoUrl && (
                      <span data-ats-project-repo className="font-mono text-[0.92em] text-slate-600 break-all max-w-[280px] inline-flex items-center gap-1.5">
                        {editItem('projects', proj.id, 'repoUrl', proj.repoUrl)}
                        <a
                          href={proj.repoUrl.startsWith('http') ? proj.repoUrl : `https://${proj.repoUrl}`}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="在浏览器打开项目仓库"
                          title="在浏览器打开项目仓库"
                          className="no-print text-blue-600 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >↗</a>
                      </span>
                    )}
                  </div>
                )}

                {proj.summary && <p className="text-[0.94em] text-slate-700 italic">{editItem('projects', proj.id, 'summary', proj.summary, {multiline:true, richRender:true})}</p>}

                <ul data-cv-bullets className="list-disc pl-4 space-y-0.5 text-slate-800">
                  {proj.bullets.filter(Boolean).map((bullet, idx) => (
                    <li key={idx} className="text-[0.95em] marker:text-slate-400">
                      <InlineEditableText
                        value={bullet}
                        multiline
                        richRender
                        onSave={
                          onInlineUpdateResume
                            ? (val) =>
                                onInlineUpdateResume((prev) => ({
                                  ...prev,
                                  projects: prev.projects.map((x) =>
                                    x.id === proj.id
                                      ? {
                                          ...x,
                                          bullets: x.bullets.map((b, bIdx) => (bIdx === visibleBulletIndex(x.bullets, idx) ? val : b)),
                                        }
                                      : x
                                  ),
                                }))
                            : undefined
                        }
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        );

      case 'experience':
        return (
          <div data-cv-items className="space-y-3">
            {experience.map((exp) => (
              <div data-cv-item key={exp.id} className="space-y-1 ats-print-entry">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-x-2">
                    <span className="font-bold text-slate-900 text-[1.05em]">{editItem('experience', exp.id, 'company', exp.company)}</span>
                    <span className="text-slate-400">·</span>
                    <span
                      className="font-semibold text-[0.96em]"
                      style={{ color: isClassicATS ? '#0f172a' : style.accentColor }}
                    >
                      {editItem('experience', exp.id, 'position', exp.position)}
                    </span>
                    {exp.department && (
                      <>
                        <span className="text-slate-400">·</span>
                        <span className="text-slate-600 text-[0.92em]">{editItem('experience', exp.id, 'department', exp.department)}</span>
                      </>
                    )}
                    {renderItemAIButton({
                      sectionId: sec.id,
                      sectionType: 'experience',
                      sectionTitle: `实习经历 · ${exp.company}`,
                      itemId: exp.id,
                    })}
                  </div>
                  <span className="font-mono tabular-nums text-[0.92em] text-slate-600 shrink-0">
                    {exp.location && <>{editItem('experience', exp.id, 'location', exp.location)} · </>}
                    {editItem('experience', exp.id, 'startDate', exp.startDate)} – {editItem('experience', exp.id, 'endDate', exp.endDate)}
                  </span>
                </div>
                {exp.techStack.length > 0 && (
                  <div className="text-[0.9em] font-mono text-slate-600">
                    <span className="font-sans font-semibold text-slate-800">涉及技术：</span>
                    {editItem('experience', exp.id, 'techStack', exp.techStack.join(' · '), {asList:true})}
                  </div>
                )}
                <ul data-cv-bullets className="list-disc pl-4 space-y-0.5 text-slate-800">
                  {exp.bullets.filter(Boolean).map((bullet, idx) => (
                    <li key={idx} className="text-[0.95em] marker:text-slate-400">
                      {editBullet('experience', exp.id, idx, bullet)}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        );

      case 'skills':
        return (
          <div className="space-y-1.5">
            {skills.map((sk) => (
              <div key={sk.id} className="text-[0.95em] text-slate-800 flex items-start justify-between gap-2">
                <div>
                  <span className="font-bold text-slate-900">{editItem('skills', sk.id, 'category', sk.category)}：</span>
                  <span>{editItem('skills', sk.id, 'items', sk.items, {multiline:true, richRender:true})}</span>
                </div>
                {renderItemAIButton({
                  sectionId: sec.id,
                  sectionType: 'skills',
                  sectionTitle: `专业技能 · ${sk.category}`,
                  itemId: sk.id,
                })}
              </div>
            ))}
          </div>
        );

      case 'awards':
        return (
          <div className="space-y-1.5">
            {awards.map((aw) => (
              <div key={aw.id} className="text-[0.95em] ats-print-entry">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-x-2">
                    <span className="font-bold text-slate-900">{editItem('awards', aw.id, 'title', aw.title, {richRender:true})}</span>
                    {aw.level && (
                      <>
                        <span className="text-slate-400">·</span>
                        <span
                          className="font-semibold"
                          style={{ color: isClassicATS ? '#0f172a' : style.accentColor }}
                        >
                          {editItem('awards', aw.id, 'level', aw.level)}
                        </span>
                      </>
                    )}
                    {aw.issuer && (
                      <>
                        <span className="text-slate-400">·</span>
                        <span className="text-slate-600 text-[0.92em]">{editItem('awards', aw.id, 'issuer', aw.issuer)}</span>
                      </>
                    )}
                    {renderItemAIButton({
                      sectionId: sec.id,
                      sectionType: 'awards',
                      sectionTitle: `证书与荣誉 · ${aw.title}`,
                      itemId: aw.id,
                    })}
                  </div>
                  <span className="font-mono tabular-nums text-[0.9em] text-slate-600 shrink-0">{editItem('awards', aw.id, 'date', aw.date)}</span>
                </div>
                {aw.description && <p className="text-[0.92em] text-slate-600 mt-0.5">{editItem('awards', aw.id, 'description', aw.description, {multiline:true,richRender:true})}</p>}
              </div>
            ))}
          </div>
        );

      case 'custom': {
        const customSec = customSections.find((c) => c.id === sec.customSectionId);
        if (!customSec) return null;
        return (
          <div className="space-y-2">
            {customSec.items.map((item) => (
              <div key={item.id} className="space-y-0.5 ats-print-entry">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-x-2">
                    <span className="font-bold text-slate-900">{editCustomField(customSec.id, item.id, 'heading', item.heading)}</span>
                    {item.subheading && (
                      <>
                        <span className="text-slate-400">·</span>
                        <span className="text-slate-600 text-[0.93em]">{editCustomField(customSec.id, item.id, 'subheading', item.subheading)}</span>
                      </>
                    )}
                    {renderItemAIButton({
                      sectionId: sec.id,
                      sectionType: 'custom',
                      sectionTitle: `${sec.title} · ${item.heading}`,
                      customSectionId: sec.customSectionId,
                      itemId: item.id,
                    })}
                  </div>
                  {item.date && (
                    <span className="font-mono tabular-nums text-[0.9em] text-slate-600 shrink-0">{editCustomField(customSec.id, item.id, 'date', item.date)}</span>
                  )}
                </div>
                {item.bullets.filter(Boolean).length > 0 && (
                  <ul className="list-disc pl-4 space-y-0.5 text-slate-800">
                    {item.bullets.filter(Boolean).map((b, i) => (
                      <li key={i} className="text-[0.94em] marker:text-slate-400">
                        {editCustomBullet(customSec.id, item.id, i, b)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        );
      }

      default:
        return null;
    }
  };


  // Reusable single-column native layouts inspired by public resume template projects.
  // These are original React renderings, not imported LaTeX, Typst or third-party PDF code.
  const referenceTemplate = TEMPLATE_CATALOG.find(
    (candidate) => candidate.id === style.template && candidate.source !== 'CraftCV'
  );
  if (referenceTemplate) {
    const id = referenceTemplate.id;
    const isMeowth = id === 'reactive-meowth';
    const isOnyx = id === 'reactive-onyx';
    const isBronzor = id === 'reactive-bronzor';
    const isHarvard = id === 'render-harvard';
    const isEngineering = id === 'render-engineering';
    const isEngineeringClassic = id === 'render-engineering-classic';
    const isAwesome = id === 'awesome-inspired';
    const isSample = id === 'resumesample-engineer';
    const isCentered = isHarvard || isEngineering;
    const accent = style.accentColor || referenceTemplate.accent;

    const contactFields = ([
      { field: 'phone', value: basics.phone },
      { field: 'email', value: basics.email },
      { field: 'github', value: basics.github },
      { field: 'website', value: basics.website },
      { field: 'location', value: basics.location },
      { field: 'graduationYear', value: basics.graduationYear },
    ] as Array<{ field: BasicTextField; value: string }>).filter((entry) => Boolean(entry.value));

    const headingClass = isHarvard
      ? 'text-[1.05em] font-bold tracking-[0.08em] uppercase'
      : isAwesome
        ? 'text-[1.09em] font-bold tracking-[0.04em]'
        : isEngineering || isSample
          ? 'text-[1.04em] font-extrabold tracking-[0.025em]'
          : 'text-[1.05em] font-bold tracking-[0.045em]';

    const headingColor = isHarvard || isEngineering
      ? '#1f2937'
      : accent;

    return (
      <div
        ref={sheetRef}
        id={previewId}
        {...rhythmAttributes}
        data-template-id={referenceTemplate.id}
        className={'w-[210mm] min-h-[297mm] relative bg-white text-slate-900 shadow-sm border border-slate-200 ' +
          paddingClass + ' ' + fontSizeClass + ' ' + lineHeightClass}
        style={{
          fontFamily: isHarvard
            ? 'Georgia, Cambria, "Songti SC", "SimSun", serif'
            : '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", Arial, sans-serif',
          ...rhythmVars,
        }}
      >
        <header
          onClick={() => onSelectSection?.('basics')}
          className={'cursor-pointer group/sec flex gap-5 pb-3 ' +
            (isCentered ? 'flex-col items-center text-center' : 'items-start justify-between') +
            (isHarvard || isEngineering ? ' border-b-[1.5px] border-slate-800' : '')}
          style={isAwesome ? { borderBottom: '2px solid ' + accent } : undefined}
        >
          <div className={'min-w-0 flex-1 ' + (isCentered ? 'w-full' : '')}>
            <div className={'flex flex-wrap items-baseline gap-x-3 gap-y-1 ' + (isCentered ? 'justify-center' : '')}>
              <h1
                className={
                  (isAwesome ? 'text-[29px] font-light tracking-[-0.025em] ' :
                    isHarvard ? 'text-[27px] font-bold tracking-[0.015em] ' :
                    isEngineering ? 'text-[24px] font-bold ' :
                    isMeowth ? 'text-[26px] font-semibold ' :
                    'text-[25px] font-bold tracking-tight ') +
                  (isAwesome ? '' : 'text-slate-900')
                }
                style={isAwesome ? { color: accent } : undefined}
              >
                {editBasic('name')}
              </h1>
              {renderItemAIButton({
                sectionId: 'basics',
                sectionType: 'basics',
                sectionTitle: '求职方向及个人信息',
              })}
            </div>
            <div
              className={'mt-0.5 text-[1.04em] ' +
                (isEngineering || isSample ? 'font-bold' : 'font-medium')}
              style={{ color: isHarvard || isEngineering ? '#334155' : accent }}
            >
              {editBasic('title')}
              {basics.directionTags && <span className="font-normal text-slate-500"> · {editBasic('directionTags')}</span>}
            </div>
            <div
              className={'mt-2 flex flex-wrap gap-x-2.5 gap-y-1 text-[0.87em] text-slate-600 ' +
                (isCentered ? 'justify-center' : '')}
            >
              {contactFields.map((entry, i) => (
                <React.Fragment key={entry.field}>
                  {i > 0 && <span aria-hidden="true" className="text-slate-300">|</span>}
                  <span className="break-all">{editBasic(entry.field)}</span>
                </React.Fragment>
              ))}
            </div>
          </div>
          {!isCentered && referenceTemplate.portrait && (
            renderAvatar(isMeowth ? 70 : 78, isMeowth ? 86 : 94, 'rounded-[2px] border border-slate-200')
          )}
        </header>

        <div>
          {visibleSections.map((sec, idx) => (
            <section
              key={sec.id}
              {...getSectionDragProps(sec.id)}
              onClick={() => onSelectSection?.(sec.type === 'summary' ? 'basics' : sec.id)}
              className={'group/sec relative cursor-pointer hover:bg-slate-50/50 -mx-1.5 px-1.5 py-[1px] transition-colors ' +
                (isBronzor ? 'grid grid-cols-[88px_minmax(0,1fr)] gap-x-4 ' : '') +
                (dragOverSecId === sec.id ? 'ring-2 ring-blue-500 bg-blue-50/40 ' : '')}
              style={{ breakInside: 'avoid', marginTop: sectionGapPx(style, sec) }}
            >
              {renderOnCanvasControls(sec, idx, visibleSections.length, false)}
              <div
                data-cv-section-heading
                className={
                  (isBronzor ? 'self-start pt-0.5 ' : 'mb-2 ') +
                  (isOnyx ? 'border-l-[3px] pl-2 ' : '') +
                  (isHarvard ? 'border-b-[1.5px] border-slate-800 pb-0.5 ' : '') +
                  (isEngineering || isSample ? 'border-b border-slate-700 pb-[1px] ' : '') +
                  (isMeowth || isEngineeringClassic ? 'border-b pb-[3px] ' : '')
                }
                style={
                  isMeowth || isEngineeringClassic
                    ? { borderColor: accent + '95' }
                    : isOnyx
                      ? { borderColor: accent }
                      : undefined
                }
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className={headingClass} style={{ color: headingColor }}>
                    {editSectionTitle(sec)}
                  </h2>
                  {renderSectionAIButton(sec)}
                </div>
                {(isMeowth || isAwesome) && sec.englishTitle && (
                  <div className="text-[0.72em] tracking-[0.07em] text-slate-400 mt-0.5">{editSectionEnglishTitle(sec)}</div>
                )}
              </div>
              <div data-cv-section-body className={'min-w-0 ' + (isHarvard ? 'font-sans' : '')}>
                {renderSectionBody(sec, false)}
              </div>
            </section>
          ))}
        </div>

        {renderPageBreakGuide()}
      </div>
    );
  }

  // ============================================================================
  // TEMPLATE 3: CREATIVE EDITORIAL SPLIT (创意设计感双栏风)
  // ============================================================================
  if (style.template === 'creative-split') {
    const sidebarSections = visibleSections.filter((s) => getEffectiveColumn(s) === 'left');
    const mainSections = visibleSections.filter((s) => getEffectiveColumn(s) === 'right');

    return (
      <div
        ref={sheetRef}
        id={previewId}
        {...rhythmAttributes}
        style={rhythmVars as React.CSSProperties}
        className={`w-[210mm] min-h-[297mm] bg-white text-slate-900 shadow-sm border border-slate-200 relative grid grid-cols-12 ${fontSizeClass} ${lineHeightClass}`}
      >
        <aside
          className="col-span-4 px-6 py-8 border-r border-slate-200 flex flex-col justify-between"
          style={{ backgroundColor: '#f8fafc' }}
        >
          <div>
            <div
              onClick={() => onSelectSection?.('basics')}
              className="cursor-pointer group space-y-3"
              title="点击定位编辑个人信息"
            >
              {basics.showAvatar && <div className="mb-3">{renderAvatar(96, 120, 'rounded border border-slate-200')}</div>}
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900">{editBasic('name')}</h1>
                  {renderItemAIButton(
                    {
                      sectionId: 'basics',
                      sectionType: 'basics',
                      sectionTitle: '求职岗位与细分技术方向标签',
                    },
                    'AI优化'
                  )}
                </div>
                <p className="font-semibold text-[0.98em] mt-1" style={{ color: style.accentColor }}>{editBasic('title')}</p>
                {basics.directionTags && (
                  <p className="text-[0.88em] text-slate-500 mt-1">{editBasic('directionTags')}</p>
                )}
              </div>

              <div className="pt-2 border-t border-slate-200/80 space-y-1.5 text-[0.92em] text-slate-700">
                {basics.phone && (
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-slate-500">电话</span>
                    <span className="font-mono tabular-nums text-slate-800">{editBasic('phone')}</span>
                  </div>
                )}
                {basics.email && (
                  <div className="flex flex-col">
                    <span className="text-slate-500 text-[0.9em]">邮箱</span>
                    <span className="font-mono text-slate-800 break-all">{editBasic('email')}</span>
                  </div>
                )}
                {basics.github && (
                  <div className="flex flex-col">
                    <span className="text-slate-500 text-[0.9em]">GitHub</span>
                    <span className="font-mono text-slate-800 break-all">{editBasic('github')}</span>
                  </div>
                )}
              </div>
            </div>

            {sidebarSections.map((sec, idx) => (
              <section
                key={sec.id}
                style={{ marginTop: sectionGapPx(style, sec) }}
                {...getSectionDragProps(sec.id, 'left')}
                onClick={() => onSelectSection?.(sec.type === 'summary' ? 'basics' : sec.id)}
                className={'group/sec relative cursor-pointer space-y-2.5 pt-4 border-t border-slate-200/90 hover:bg-slate-100/60 -mx-2 px-2 py-1 rounded transition-colors ' +
                  (dragOverSecId === sec.id ? 'ring-2 ring-blue-500 bg-blue-50/40' : '')}
              >
                {renderOnCanvasControls(sec, idx, sidebarSections.length, true)}
                <div
                  data-cv-section-heading
                  className="pb-1 border-b flex items-center justify-between gap-2"
                  style={{ borderColor: `${style.accentColor}33` }}
                >
                  <h2
                    className="text-[1.04em] font-bold tracking-tight"
                    style={{ color: style.accentColor }}
                  >
                    {editSectionTitle(sec)}
                  </h2>
                  {renderSectionAIButton(sec)}
                </div>
                <div data-cv-section-body>{renderSectionBody(sec, false)}</div>
              </section>
            ))}
          </div>
        </aside>

        <main className="col-span-8 px-7 py-8">
          {mainSections.map((sec, idx) => (
            <section
              key={sec.id}
              style={{ marginTop: idx === 0 && sec.spacingBeforePx === undefined ? 0 : sectionGapPx(style, sec) }}
              {...getSectionDragProps(sec.id, 'right')}
              onClick={() => onSelectSection?.(sec.type === 'summary' ? 'basics' : sec.id)}
              className={'group/sec relative cursor-pointer space-y-2.5 hover:bg-slate-50/80 -mx-2 px-2 py-1 rounded transition-colors ' +
                (dragOverSecId === sec.id ? 'ring-2 ring-blue-500 bg-blue-50/40' : '')}
            >
              {renderOnCanvasControls(sec, idx, mainSections.length, true)}
              <div data-cv-section-heading className="flex items-center justify-between gap-3 border-b border-slate-200 pb-1">
                <h2
                  className="text-[1.08em] font-bold tracking-tight"
                  style={{ color: style.accentColor }}
                >
                    {editSectionTitle(sec)}
                  </h2>
                {renderSectionAIButton(sec)}
              </div>
              <div data-cv-section-body>{renderSectionBody(sec, false)}</div>
            </section>
          ))}
        </main>

        {renderPageBreakGuide()}
      </div>
    );
  }

  // ============================================================================
  // TEMPLATE 2: CLASSIC ATS & BIG-TECH STANDARD (经典学术/大厂标准风)
  // ============================================================================
  if (style.template === 'classic-ats') {
    return (
      <div
        ref={sheetRef}
        id={previewId}
        {...rhythmAttributes}
        style={rhythmVars as React.CSSProperties}
        className={`w-[210mm] min-h-[297mm] bg-white text-slate-900 shadow-sm border border-slate-200 relative ${paddingClass} ${fontSizeClass} ${lineHeightClass}`}
      >
        <header
          onClick={() => onSelectSection?.('basics')}
          className="cursor-pointer pb-3 border-b-2 border-slate-900 flex items-start justify-between gap-6"
        >
          <div className="flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-x-3">
              <h1 className="text-[22px] font-bold tracking-tight text-slate-950">{editBasic('name')}</h1>
              <span data-ats-role-title className="text-[14px] font-semibold text-slate-800">{editBasic('title')}</span>
              {basics.directionTags && (
                <span data-ats-direction-tags className="text-[12.5px] text-slate-600">· {basics.directionTags}</span>
              )}
              {renderItemAIButton(
                {
                  sectionId: 'basics',
                  sectionType: 'basics',
                  sectionTitle: '求职岗位与细分技术方向标签',
                },
                'AI优化方向'
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.93em] text-slate-700 font-mono tabular-nums">
              {basics.phone && <span>{editBasic('phone')}</span>}
              {basics.email && (
                <>
                  <span className="text-slate-300">|</span>
                  <span>{editBasic('email')}</span>
                </>
              )}
              {basics.github && (
                <>
                  <span className="text-slate-300">|</span>
                  <span>{editBasic('github')}</span>
                </>
              )}
              {basics.graduationYear && (
                <>
                  <span className="text-slate-300">|</span>
                  <span className="font-sans">{editBasic('graduationYear')}</span>
                </>
              )}
              {basics.location && (
                <>
                  <span className="text-slate-300">|</span>
                  <span className="font-sans">{editBasic('location')}</span>
                </>
              )}
            </div>
          </div>

          {renderAvatar(72, 92, 'rounded border border-slate-200')}
        </header>

        <div>
          {visibleSections.map((sec, idx) => (
            <section
              key={sec.id}
              data-resume-section={sec.type}
              style={{ marginTop: sectionGapPx(style, sec) }}
              {...getSectionDragProps(sec.id)}
              onClick={() => onSelectSection?.(sec.type === 'summary' ? 'basics' : sec.id)}
              className={'group/sec relative cursor-pointer space-y-2 hover:bg-slate-50/70 -mx-2 px-2 py-0.5 rounded transition-colors ' +
                (dragOverSecId === sec.id ? 'ring-2 ring-blue-500 bg-blue-50/40' : '')}
            >
              {renderOnCanvasControls(sec, idx, visibleSections.length, false)}
              <div data-ats-section-heading data-cv-section-heading className="border-b border-slate-900 pb-0.5 flex items-center justify-between gap-2">
                <h2 className="text-[1.08em] font-bold tracking-tight text-slate-950">
                    {editSectionTitle(sec)}
                  </h2>
                {renderSectionAIButton(sec)}
              </div>
              <div data-cv-section-body>{renderSectionBody(sec, true)}</div>
            </section>
          ))}
        </div>

        {renderPageBreakGuide()}
      </div>
    );
  }

  // ============================================================================
  // TEMPLATE 1: MODERN MINIMALIST SWISS GRID (现代极简商务风)
  // ============================================================================
  return (
    <div
      ref={sheetRef}
      id={previewId}
      {...rhythmAttributes}
      style={rhythmVars as React.CSSProperties}
      className={`w-[210mm] min-h-[297mm] bg-white text-slate-900 shadow-sm border border-slate-200 relative ${paddingClass} ${fontSizeClass} ${lineHeightClass}`}
    >
      <header
        onClick={() => onSelectSection?.('basics')}
        className="cursor-pointer flex items-start justify-between gap-6 pb-4 border-b border-slate-200"
      >
        <div className="flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-x-3">
            <h1 className="text-[24px] font-bold tracking-tight text-slate-900">{editBasic('name')}</h1>
            <span className="text-[15px] font-semibold" style={{ color: style.accentColor }}>{editBasic('title')}</span>
            {basics.directionTags && (
              <span className="text-[12.5px] text-slate-500">· {basics.directionTags}</span>
            )}
            {renderItemAIButton(
              {
                sectionId: 'basics',
                sectionType: 'basics',
                sectionTitle: '求职岗位与细分技术方向标签',
              },
              'AI优化方向'
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.93em] text-slate-600">
            {basics.phone && <span className="font-mono tabular-nums text-slate-800">{editBasic('phone')}</span>}
            {basics.email && (
              <>
                <span aria-hidden="true" className="text-slate-300">·</span>
                <span className="font-mono text-slate-800">{editBasic('email')}</span>
              </>
            )}
            {basics.github && (
              <>
                <span aria-hidden="true" className="text-slate-300">·</span>
                <span className="font-mono text-slate-800">{editBasic('github')}</span>
              </>
            )}
            {basics.graduationYear && (
              <>
                <span aria-hidden="true" className="text-slate-300">·</span>
                <span>{editBasic('graduationYear')}</span>
              </>
            )}
            {basics.location && (
              <>
                <span aria-hidden="true" className="text-slate-300">·</span>
                <span>{editBasic('location')}</span>
              </>
            )}
          </div>
        </div>

        {renderAvatar(80, 100, 'rounded border border-slate-200')}
      </header>

      <div>
        {visibleSections.map((sec, index) => (
          <section
            key={sec.id}
            data-resume-section={sec.type}
            style={{ marginTop: sectionGapPx(style, sec) }}
            {...getSectionDragProps(sec.id)}
            onClick={() => onSelectSection?.(sec.type === 'summary' ? 'basics' : sec.id)}
            className={'group/sec relative cursor-pointer space-y-2 hover:bg-slate-50/70 -mx-2 px-2 py-1 rounded transition-colors ' +
              (dragOverSecId === sec.id ? 'ring-2 ring-blue-500 bg-blue-50/40' : '')}
          >
            {renderOnCanvasControls(sec, index, visibleSections.length, false)}
            <div
              data-cv-section-heading
              className="flex items-center justify-between pb-1 border-b gap-2"
              style={{ borderColor: `${style.accentColor}30` }}
            >
              <div className="flex items-baseline gap-2">
                <span
                  className="font-mono tabular-nums text-[0.85em] font-semibold"
                  style={{ color: style.accentColor }}
                >
                  0{index + 1}.
                </span>
                <h2
                  className="text-[1.08em] font-bold tracking-tight"
                  style={{ color: style.accentColor }}
                >
                    {editSectionTitle(sec)}
                  </h2>
              </div>
              {renderSectionAIButton(sec)}
            </div>
            <div data-cv-section-body>{renderSectionBody(sec, false)}</div>
          </section>
        ))}
      </div>

      {renderPageBreakGuide()}
    </div>
  );
};
