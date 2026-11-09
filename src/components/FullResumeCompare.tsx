import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ResumeDocument } from '../types/resume';
import type { OnePageCandidate } from '../utils/onePageAI';
import { applyReviewedOnePageCandidates, collectOnePageTextFields } from '../utils/onePageAI';
import { buildPairedTextDiff } from '../utils/textDiff';
import { ResumeDiffContext, ResumePreview } from './ResumePreview';

const A4_WIDTH_PX = 794;

/**
 * Compares the entire original and proposed resumes using the *same* A4
 * renderer and template as the normal editor, without touching stored data.
 * Selected field changes are highlighted in-place; all other content stays.
 */
export const FullResumeCompare: React.FC<{
  original: ResumeDocument;
  selected: OnePageCandidate[];
}> = ({ original, selected }) => {
  const [mobileSide, setMobileSide] = useState<'before' | 'after'>('after');
  const [zoomFactor, setZoomFactor] = useState(1);
  const proposed = useMemo(
    () => applyReviewedOnePageCandidates(original, selected),
    [original, selected],
  );
  const byText = useMemo(() => {
    const fields = new Map(collectOnePageTextFields(original).map((field) => [field.id, field]));
    const map = new Map<string, ReturnType<typeof buildPairedTextDiff>>();
    for (const item of selected) {
      const field = fields.get(item.id);
      if (!field) continue;
      const diff = buildPairedTextDiff(field.original, item.proposed);
      // Only original text gets annotated. The right-hand A4 is a clean final
      // preview, never carrying review colors or proposed inline badges.
      map.set(field.original, diff);
    }
    return map;
  }, [original, selected]);

  return (
    <section aria-label="完整简历修改前后对比" className="flex flex-col flex-1 min-h-0 gap-1.5">
      <div className="flex justify-between flex-wrap gap-x-4 gap-y-1.5 items-center shrink-0">
        <h3 className="text-[12px] font-semibold text-slate-900">完整简历对比</h3>
        <p className="text-[10px] text-slate-500">
          左侧原稿标记：<span className="text-rose-800 bg-rose-100 line-through px-1">红色拟删除</span>
          {' · '}
          <span className="text-sky-900 bg-sky-100 border-b border-sky-400 px-1">蓝色＋新文字</span>
          {' · '}右侧为无标记的最终预览
        </p>
        <div role="group" aria-label="完整简历预览缩放" className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="text-slate-500">两份同步缩放 · 放大后可拖动查看</span>
        <button type="button" disabled={zoomFactor <= 1} onClick={() => setZoomFactor((z) => Math.max(1, z - 0.5))}
          className="px-2.5 py-1 rounded border border-slate-200 text-slate-700 disabled:opacity-35 cursor-pointer">缩小</button>
        <button type="button" onClick={() => setZoomFactor(1)}
          className="px-2.5 py-1 rounded border border-slate-200 text-slate-700 cursor-pointer">适应宽度</button>
        <button type="button" disabled={zoomFactor >= 2.5} onClick={() => setZoomFactor((z) => Math.min(2.5, z + 0.5))}
          className="px-2.5 py-1 rounded border border-slate-200 text-slate-700 disabled:opacity-35 cursor-pointer">放大</button>
        </div>
      </div>
      <div role="group" aria-label="手机简历对比视图切换"
        className="flex lg:hidden rounded-lg border border-slate-200 overflow-hidden">
        <button type="button" onClick={() => setMobileSide('before')}
          aria-pressed={mobileSide === 'before'}
          className={'flex-1 text-xs py-2 font-semibold cursor-pointer ' +
            (mobileSide === 'before' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600')}>
          修改前 · 原简历
        </button>
        <button type="button" onClick={() => setMobileSide('after')}
          aria-pressed={mobileSide === 'after'}
          className={'flex-1 text-xs py-2 font-semibold cursor-pointer ' +
            (mobileSide === 'after' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600')}>
          修改后 · 完整预览
        </button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 flex-1 min-h-0 lg:overflow-hidden">
        <div className={(mobileSide === 'before' ? 'block' : 'hidden') + ' lg:flex lg:flex-col min-w-0 min-h-0'}>
          <p className="text-center text-[11px] font-semibold text-slate-700 pb-1 shrink-0">
            原简历 · 所有删改标记
          </p>
          <ComparisonPaper key="before" original={original} side="before" byText={byText} zoomFactor={zoomFactor} />
        </div>
        <div className={(mobileSide === 'after' ? 'block' : 'hidden') + ' lg:flex lg:flex-col min-w-0 min-h-0'}>
          <p className="text-center text-[11px] font-semibold text-slate-700 pb-1 shrink-0">
            修改后 · 干净预览（已选 {selected.length} 处）
          </p>
          <ComparisonPaper key="after" original={proposed} side="after" byText={byText} zoomFactor={zoomFactor} />
        </div>
      </div>
    </section>
  );
};

const ComparisonPaper: React.FC<{
  original: ResumeDocument;
  side: 'before' | 'after';
  byText: ReadonlyMap<string, ReturnType<typeof buildPairedTextDiff>>;
  zoomFactor: number;
}> = ({ original, side, byText, zoomFactor }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | null>(null);
  const [fitScale, setFitScale] = useState(0.68);
  const scale = fitScale * zoomFactor;
  const [height, setHeight] = useState(1123);

  useEffect(() => {
    const parent = containerRef.current;
    const paper = paperRef.current;
    if (!parent || !paper) return;
    const measure = () => {
      const width = parent.clientWidth;
      const nextScale = Math.min(1, Math.max(0.28, (width - 4) / A4_WIDTH_PX));
      const naturalHeight = Math.max(1123, paper.scrollHeight);
      setFitScale((old) => Math.abs(old - nextScale) < 0.001 ? old : nextScale);
      setHeight((old) => Math.abs(old - naturalHeight) < 1 ? old : naturalHeight);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    observer.observe(paper);
    return () => observer.disconnect();
  }, [original, byText]);

  // Mouse drag moves the zoomed paper, while touch devices use native
  // scrolling (including diagonal panning) and the viewport stays keyboard
  // scrollable. Each A4 keeps its own pan position even with shared zoom.
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (zoomFactor <= 1 || event.pointerType !== 'mouse' || event.button !== 0) return;
    const viewport = event.currentTarget;
    panRef.current = {
      pointerId: event.pointerId, x: event.clientX, y: event.clientY,
      left: viewport.scrollLeft, top: viewport.scrollTop,
    };
    viewport.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    event.currentTarget.scrollLeft = pan.left - (event.clientX - pan.x);
    event.currentTarget.scrollTop = pan.top - (event.clientY - pan.y);
    event.preventDefault();
  };
  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (panRef.current?.pointerId !== event.pointerId) return;
    panRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div ref={containerRef} tabIndex={0}
      className={'min-w-0 w-full lg:flex-1 lg:min-h-0 rounded-lg border border-slate-200 bg-slate-100/80 overflow-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0071e3] ' +
        (zoomFactor > 1 ? 'cursor-grab active:cursor-grabbing' : '')}
      aria-label={side === 'before' ? '左侧带删改标记的原始简历全文' : '右侧没有修改标记的最终简历全文'}
      title={zoomFactor > 1 ? '按住鼠标拖动查看，触屏可滑动；聚焦后也可用方向键滚动' : '放大后可以拖动查看细节'}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}
      style={{ maxHeight: '78dvh',
        touchAction: 'pan-x pan-y', userSelect: zoomFactor > 1 ? 'none' : undefined }}>
      <div className="relative" style={{ height: height * scale, minHeight: 140, width: A4_WIDTH_PX * scale }}>
        <div ref={paperRef} style={{
          width: A4_WIDTH_PX,
          position: 'absolute',
          top: 0,
          left: 0,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}>
          <ResumeDiffContext.Provider value={{ side, byText }}>
            <ResumePreview resume={original} previewId={`compare-resume-${side}`} />
          </ResumeDiffContext.Provider>
        </div>
      </div>
    </div>
  );
};
