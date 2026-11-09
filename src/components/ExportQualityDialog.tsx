import React, { useEffect, useRef } from 'react';
import { AlertTriangle, CheckCircle2, FileCheck2, Info, X } from 'lucide-react';
import type { ExportQualityReport } from '../utils/exportQualityPreflight';

interface ExportQualityDialogProps {
  report: ExportQualityReport;
  onClose: () => void;
  onContinue: () => void;
  busy: boolean;
}

/** A browser layout preflight, not a claim that the final PDF has been audited. */
export const ExportQualityDialog: React.FC<ExportQualityDialogProps> = ({
  report, onClose, onContinue, busy,
}) => {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const errorCount = report.issues.filter((issue) => issue.severity === 'error').length;
  const warningCount = report.issues.filter((issue) => issue.severity === 'warning').length;

  useEffect(() => {
    closeRef.current?.focus();
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault();
        onClose();
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const buttons = Array.from(dialogRef.current.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
      if (!buttons.length) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [onClose, busy]);

  return (
    <div className="no-print fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 backdrop-blur-[3px] p-4"
      onMouseDown={(event) => {
        if (!busy && event.target === event.currentTarget) onClose();
      }}>
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="export-quality-title"
        aria-describedby="export-quality-summary"
        className="w-full max-w-[620px] max-h-[min(88vh,780px)] flex flex-col rounded-[22px] bg-white shadow-[0_24px_80px_rgba(15,23,42,0.24)] border border-white/80 overflow-hidden">
        <div className="px-6 pt-6 pb-4 flex items-start justify-between gap-3 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <span className="p-2.5 rounded-xl bg-blue-50 text-[#0071e3] shrink-0">
              <FileCheck2 className="w-5 h-5" aria-hidden="true"/>
            </span>
            <div>
              <h2 id="export-quality-title" className="text-lg font-bold text-slate-900">正式导出前检查</h2>
              <p id="export-quality-summary" className="mt-1 text-xs text-slate-600 leading-relaxed">
                {report.format === 'ats' ? 'ATS 可检索文字版' : '高清视觉图片版'} · 当前浏览器排版预检，不代表已检查最终 PDF 文件。
              </p>
            </div>
          </div>
          <button type="button" ref={closeRef} onClick={onClose} disabled={busy} aria-label="关闭导出质量检查"
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50">
            <X className="w-4 h-4"/>
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5 space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={`px-3 py-2 rounded-xl font-semibold ${errorCount
              ? 'bg-red-50 text-red-700'
              : 'bg-slate-100 text-slate-800'}`}>
              {errorCount ? `${errorCount} 项需先修复` : '未检测到阻断导出的问题'}
            </span>
            {warningCount > 0 && (
              <span className="px-3 py-2 rounded-xl bg-amber-50 text-amber-800 font-medium">
                {warningCount} 项需注意
              </span>
            )}
            <span className="px-3 py-2 rounded-xl bg-blue-50 text-blue-800">
              {report.estimatedPages !== null ? `估计 ${report.estimatedPages} 页 A4` : '页数待确认'}
            </span>
          </div>

          <div className="space-y-2">
            {report.issues.map((issue) => (
              <div key={issue.id} className="rounded-xl border border-slate-200 px-3.5 py-3 flex items-start gap-3">
                {issue.severity === 'error'
                  ? <AlertTriangle aria-hidden="true" className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                  : issue.severity === 'warning'
                    ? <AlertTriangle aria-hidden="true" className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                    : <Info aria-hidden="true" className="w-4 h-4 shrink-0 mt-0.5 text-blue-600" />}
                <div className="space-y-1.5 min-w-0">
                  <h3 className="text-[13px] font-semibold text-slate-900">{issue.title}</h3>
                  <p className="text-xs text-slate-600 leading-relaxed">{issue.detail}</p>
                  <p className="text-xs text-slate-700 leading-relaxed"><span className="font-semibold">建议：</span>{issue.action}</p>
                </div>
              </div>
            ))}
          </div>

          {report.canContinue && (
            <p className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-500">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true"/>
              导出后仍应核对 PDF 页数、末页内容和字体。ATS 文字版请测试复制文本；图片版无法用文字层检查替代截图质量检查。
            </p>
          )}
        </div>
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/60 flex flex-wrap justify-end gap-2">
          <button type="button" disabled={busy} onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold disabled:opacity-50">
            返回修改
          </button>
          <button type="button" disabled={!report.canContinue || busy} onClick={onContinue}
            className="px-4 py-2.5 rounded-xl bg-[#0071e3] hover:bg-[#0077ed] text-white text-xs font-semibold disabled:bg-slate-300 disabled:cursor-not-allowed">
            {busy ? '正在生成 PDF…' : report.format === 'ats' ? '继续打开打印预览' : '继续下载高清 PDF'}
          </button>
        </div>
      </section>
    </div>
  );
};
