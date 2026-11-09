import React, { useState } from 'react';
import { ResumeStyleConfig, SectionConfig } from '../types/resume';
import { globalSectionGapPx, MAX_SECTION_GAP_PX, MIN_SECTION_GAP_PX, sectionGapPx } from '../utils/sectionSpacing';
import { INTERNAL_SPACING_KEYS, INTERNAL_SPACING_LIMITS, normalizedInternalSpacing, templateInternalSpacingPreview } from '../utils/internalSpacing';
import { TEMPLATE_CATALOG, TEMPLATE_SOURCES, type TemplateOption, type TemplateSource } from '../data/templateCatalog';
import { ACCENT_COLORS } from '../data/defaultResume';
import { compactOnePageStyle } from '../utils/onePageResume';
import { Check, Layout, Palette, Sliders, Minimize2 } from 'lucide-react';

interface TemplateStylePanelProps {
  style: ResumeStyleConfig;
  onChangeStyle: (updater: (prev: ResumeStyleConfig) => ResumeStyleConfig) => void;
  sections: SectionConfig[];
  onChangeSectionSpacing: (sectionId: string, px: number | undefined) => void;
  onResetIndividualSectionSpacing: () => void;
  onRequestOnePageAI: () => void;
}


/** CSS-only schematic previews, not screenshots or full-size third-party documents. */
const TemplateMiniature: React.FC<{ template: TemplateOption }> = ({ template }) => {
  const isSplit = template.layout === 'two-column';
  const isLabel = template.layout === 'label-column';
  const isCenter = template.id === 'render-harvard' || template.id === 'render-engineering';
  const line = (width: string, key: string) => (
    <div key={key} className="h-[2px] rounded-full bg-slate-300/85" style={{ width }} />
  );
  return (
    <div
      aria-hidden="true"
      className="w-[90px] h-[126px] shrink-0 bg-white border border-slate-200 rounded-[3px] shadow-[0_3px_9px_rgba(15,23,42,0.09)] relative overflow-hidden"
    >
      <div className="h-full p-[9px] flex flex-col gap-[5px]">
        <div className={'flex items-start gap-1 ' + (isCenter ? 'justify-center text-center' : 'justify-between')}>
          <div className={'flex flex-col gap-[3px] ' + (isCenter ? 'items-center' : '')}>
            <div
              className={'h-[6px] rounded-[1px] ' + (template.id === 'awesome-inspired' ? 'w-12' : 'w-10')}
              style={{ backgroundColor: template.accent }}
            />
            <div className="w-9 h-[2px] rounded bg-slate-400" />
            <div className="w-12 h-[2px] rounded bg-slate-200" />
          </div>
          {!isCenter && template.portrait && (
            <div className="h-[17px] w-[12px] rounded-[1px] bg-slate-200 border border-slate-300" />
          )}
        </div>
        <div className="h-[1px] w-full" style={{ backgroundColor: template.accent, opacity: 0.6 }} />
        <div className={'flex gap-[5px] min-h-0 flex-1 ' + (isSplit ? '-mx-[9px]' : '')}>
          {isSplit && (
            <div className="w-[30%] bg-slate-100/90 flex flex-col gap-[5px] p-[5px]">
              <div className="h-[3px] w-7" style={{ background: template.accent }} />
              {line('100%', 'as')}
              {line('65%', 'bs')}
              <div className="h-[3px] w-6 mt-1" style={{ background: template.accent }} />
              {line('100%', 'cs')}
              {line('85%', 'ds')}
              {line('70%', 'es')}
            </div>
          )}
          <div className="flex-1 flex flex-col gap-[4px]">
            {[0, 1, 2].map((part) => (
              <div key={part} className={isLabel ? 'flex gap-[4px]' : 'space-y-[3px]'}>
                <div className={isLabel ? 'w-[24%] shrink-0' : ''}>
                  <div className={'h-[3px] ' + (isLabel ? 'w-full' : 'w-[52%]')} style={{ backgroundColor: template.accent }} />
                  {template.titleStyle === 'rule' && <div className="h-px w-full bg-slate-500/50 mt-[2px]" />}
                </div>
                <div className="flex-1 space-y-[3px]">
                  {line('100%', part + 'a')}
                  {line('85%', part + 'b')}
                  {line(part % 2 ? '74%' : '92%', part + 'c')}
                  {part !== 2 && line('63%', part + 'd')}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export const TemplateStylePanel: React.FC<TemplateStylePanelProps> = ({
  style, onChangeStyle, sections, onChangeSectionSpacing, onResetIndividualSectionSpacing,
  onRequestOnePageAI,
}) => {
  const [sourceFilter, setSourceFilter] = useState<TemplateSource | '全部'>('全部');
  const availableTemplates = TEMPLATE_CATALOG.filter((item) => sourceFilter === '全部' || item.source === sourceFilter);
  const applyOnePageCompactPreset = () => {
    onChangeStyle(compactOnePageStyle);
  };

  const applyStandardPreset = () => {
    onChangeStyle((prev) => ({
      ...prev,
      fontSize: 'md',
      lineHeight: 'normal',
      pageMargin: 'standard',
      leftColumnWidth: 31.5,
      sectionSpacing: 18,
    }));
  };

  return (
    <div className="space-y-4">
      {/* Template gallery: native layouts, no content replacement. */}
      <section className="os26-card rounded-2xl p-5 space-y-4" aria-label="简历模板库">
        <div className="space-y-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Layout className="w-4 h-4 text-[#0071e3]" />
                模板库 · {TEMPLATE_CATALOG.length} 款可直接使用
              </h2>
              <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                点击模板立即套用当前简历。只改变版式和主题色，不改变真实内容、顺序或已有简历版本。
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-blue-50 text-blue-700 text-[10px] px-2 py-1 font-semibold">A4 实时预览</span>
          </div>
          <div className="flex gap-1.5 overflow-x-auto py-2" role="group" aria-label="模板来源筛选">
            {TEMPLATE_SOURCES.map((source) => (
              <button
                key={source}
                type="button"
                aria-pressed={sourceFilter === source}
                onClick={() => setSourceFilter(source)}
                className={'px-2.5 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap cursor-pointer transition-colors ' + (
                  sourceFilter === source ? 'bg-[#0071e3] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                )}
              >
                {source}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 2xl:grid-cols-2 gap-2.5">
          {availableTemplates.map((tpl) => {
            const active = style.template === tpl.id;
            return (
              <button
                type="button"
                key={tpl.id}
                aria-pressed={active}
                onClick={() => onChangeStyle((prev) => ({
                  ...prev,
                  template: tpl.id,
                  accentColor: tpl.accent,
                }))}
                className={'os26-press w-full text-left p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-3 ' + (
                  active
                    ? 'border-[#0071e3] bg-[#0071e3]/[0.05] ring-1 ring-[#0071e3]/15'
                    : 'border-slate-200/80 hover:border-slate-400 bg-white/80'
                )}
              >
                <TemplateMiniature template={tpl} />
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[13px] font-bold text-slate-900">{tpl.name}</span>
                    {active && <Check className="w-3.5 h-3.5 text-[#0071e3]" />}
                  </div>
                  <span className="text-[10px] font-semibold text-slate-500">
                    {tpl.source === 'CraftCV' ? '原有模板' : '参考 · ' + tpl.source}
                  </span>
                  <p className="text-[11px] text-slate-600 leading-relaxed line-clamp-3">{tpl.description}</p>
                  <div className="flex gap-1 flex-wrap">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-600">
                      {tpl.layout === 'two-column' ? '双栏' : tpl.layout === 'label-column' ? '标签式单栏' : '单栏'}
                    </span>
                    {tpl.atsSingleColumn && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-600">ATS 易读结构</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        <p className="text-[10px] leading-relaxed text-slate-500">
          这里是 CraftCV 原生实现的参考风格，并非第三方原版 Typst/LaTeX 引擎或官方模板文件；
          具体字体、行距和图像可能不同。ResumeSample 主要提供中文技术简历写作思路。
        </p>
      </section>

      {/* Theme Accent Color Picker + PDF Classic Color Linkage */}
      <div className="os26-card rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-0.5">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Palette className="w-4 h-4 text-[#0071e3]" />
              主题强调色定制（支持 PDF 双栏联动）
            </h3>
            <p className="text-xs text-slate-500">
              用于斜切几何块、模块标题、技能分类底块与角色标签的高亮配色。
            </p>
          </div>

          {style.template === 'pdf-classic' && (
            <div className="flex items-center gap-0.5 p-0.5 bg-slate-200/70 rounded-lg text-xs">
              <button
                type="button"
                onClick={() =>
                  onChangeStyle((prev) => ({
                    ...prev,
                    useThemeColorInPdf: false,
                    accentColor: '#666666',
                  }))
                }
                className={`os26-press px-2.5 py-1 rounded-md font-medium cursor-pointer transition-colors ${
                  !style.useThemeColorInPdf
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                原版PDF黑白灰
              </button>
              <button
                type="button"
                onClick={() =>
                  onChangeStyle((prev) => ({
                    ...prev,
                    useThemeColorInPdf: true,
                    accentColor: prev.accentColor === '#666666' ? '#1e40af' : prev.accentColor,
                  }))
                }
                className={`os26-press px-2.5 py-1 rounded-md font-medium cursor-pointer transition-colors ${
                  style.useThemeColorInPdf
                    ? 'bg-white text-[#0071e3] shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                开启彩色主题联动
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {ACCENT_COLORS.map((color) => {
            const active = style.accentColor.toLowerCase() === color.value.toLowerCase();
            return (
              <button
                key={color.value}
                type="button"
                onClick={() =>
                  onChangeStyle((prev) => ({
                    ...prev,
                    accentColor: color.value,
                    useThemeColorInPdf: color.value !== '#262626',
                  }))
                }
                className={`os26-press p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition-colors cursor-pointer ${
                  active ? 'border-[#0071e3] bg-[#0071e3]/[0.05]' : 'border-slate-200/80 hover:bg-slate-50/60 bg-white'
                }`}
              >
                <span
                  className="w-4 h-4 rounded-md shrink-0 border border-black/10"
                  style={{ backgroundColor: color.value }}
                />
                <span className="text-xs font-medium text-slate-800 truncate">{color.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Typography, Column Width & One-Page Density Controls */}
      <div className="os26-card rounded-2xl p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-0.5">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-[#0071e3]" />
              A4 纸张密度、左右栏宽比与排版微调
            </h3>
            <p className="text-xs text-slate-500">
              超过一页时可尝试压缩留白、保留内容和可读字号，再逐项调整模块间距；能否真正单页以实际导出检查为准。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onRequestOnePageAI}
              title="有模型时点击将可编辑文字描述及目标岗位发送给选定 AI 服务商并生成精简候选；无模型时提示确认压缩间距或配置 AI 模型"
              className="os26-press px-3 py-1.5 text-xs font-semibold text-white bg-[#0071e3] hover:bg-[#0077ed] rounded-xl whitespace-nowrap cursor-pointer">
              AI 一键精简
            </button>
            <button
              type="button"
              onClick={applyOnePageCompactPreset}
              className="os26-press px-3 py-1.5 text-xs font-semibold text-[#0071e3] bg-[#0071e3]/10 hover:bg-[#0071e3]/16 rounded-xl flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Minimize2 className="w-3.5 h-3.5" />
              尝试单页排版（不缩字）
            </button>
            <button
              type="button"
              onClick={applyStandardPreset}
              className="os26-press px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl whitespace-nowrap shrink-0 cursor-pointer"
            >
              恢复原版默认比例
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-blue-100 bg-blue-50/40 px-3.5 py-3 space-y-2.5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-xs font-bold text-slate-800">校招简历页数目标</div>
              <p className="mt-1 text-[11px] text-slate-600 max-w-xl leading-relaxed">应届生建议优先一页，但并非所有岗位强制。严格单页模式会在导出检查发现超页时阻止下载；不会删除经历、虚构成果或强制缩小正文。</p>
            </div>
            <div className="flex gap-1 p-1 bg-white rounded-lg border border-slate-200" role="group" aria-label="简历页数目标">
              {[
                { id: 'one', label: '严格单页' },
                { id: 'flexible', label: '允许多页' },
              ].map((item) => {
                const active = (style.pageGoal ?? 'flexible') === item.id;
                return <button key={item.id} type="button" aria-pressed={active}
                  onClick={() => onChangeStyle((prev) => ({ ...prev, pageGoal: item.id as 'one' | 'flexible' }))}
                  className={'os26-press px-3 py-1.5 rounded-md text-[11px] font-semibold cursor-pointer ' +
                    (active ? 'bg-[#0071e3] text-white' : 'text-slate-600 hover:bg-slate-50')}>{item.label}</button>;
              })}
            </div>
          </div>
          {style.pageGoal === 'one' && <p className="text-[11px] text-blue-800">已启用单页限制。导出前将分别测量当前视觉模板和独立 ATS 打印版；ATS 最终页数仍以浏览器另存后的 PDF 为准。</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-100">
          {/* Font Size */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 block">全局正文字号（联动双栏）</label>
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
              {[
                { id: 'sm', label: '紧凑小号' },
                { id: 'md', label: '原版标准' },
                { id: 'lg', label: '舒展大号' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChangeStyle((prev) => ({ ...prev, fontSize: opt.id as any }))}
                  className={`flex-1 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    style.fontSize === opt.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Line Height */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 block">段落行距（联动双栏）</label>
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
              {[
                { id: 'tight', label: '紧凑 (1.42)' },
                { id: 'normal', label: '标准 (1.58)' },
                { id: 'relaxed', label: '宽松 (1.72)' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChangeStyle((prev) => ({ ...prev, lineHeight: opt.id as any }))}
                  className={`flex-1 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    style.lineHeight === opt.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Page Margin */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 block">A4 外页边距</label>
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
              {[
                { id: 'compact', label: '窄边距 (7mm)' },
                { id: 'standard', label: '原版 (9.5mm)' },
                { id: 'generous', label: '宽边距 (12mm)' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChangeStyle((prev) => ({ ...prev, pageMargin: opt.id as any }))}
                  className={`flex-1 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    style.pageMargin === opt.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Fine-Grained Sliders: Left Column Width & Section Spacing */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-100">
          {style.template === 'pdf-classic' && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700">左侧灰底栏宽度比例</span>
                <span className="font-mono tabular-nums text-blue-700 font-semibold">
                  {(style.leftColumnWidth ?? 31.5).toFixed(1)}%（右栏 {(100 - (style.leftColumnWidth ?? 31.5)).toFixed(1)}%）
                </span>
              </div>
              <input
                type="range"
                min={26}
                max={38}
                step={0.5}
                value={style.leftColumnWidth ?? 31.5}
                onChange={(e) =>
                  onChangeStyle((prev) => ({
                    ...prev,
                    leftColumnWidth: parseFloat(e.target.value),
                  }))
                }
                className="w-full accent-blue-600 cursor-pointer"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700">模块垂直间距</span>
              <span className="font-mono tabular-nums text-blue-700 font-semibold">
                {globalSectionGapPx(style)}px
              </span>
            </div>
            <input
              type="range"
              min={MIN_SECTION_GAP_PX}
              max={MAX_SECTION_GAP_PX}
              step={1}
              aria-label="全局模块间距"
              value={globalSectionGapPx(style)}
              onChange={(e) =>
                onChangeStyle((prev) => ({
                  ...prev,
                  sectionSpacing: parseInt(e.target.value, 10),
                }))
              }
              className="w-full accent-blue-600 cursor-pointer"
            />
          </div>
        </div>

        {/* Independent overrides for each visible module. */}
        <section className="space-y-3 pt-3 border-t border-slate-100" aria-label="各模块独立间距">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs font-semibold text-slate-800">单独调整模块间距</div>
              <p className="text-[11px] text-slate-500 mt-1">调整模块上方留白；未单独设置时跟随全局间距。模块移动后设置仍跟随模块。</p>
            </div>
            <button type="button" onClick={onResetIndividualSectionSpacing}
              disabled={!sections.some((section) => section.spacingBeforePx !== undefined)}
              className="text-[11px] text-blue-700 hover:underline disabled:text-slate-400 disabled:no-underline disabled:cursor-not-allowed">全部恢复全局</button>
          </div>
          <div className="space-y-2">
            {sections.filter((section) => section.visible).map((section) => {
              const overridden = section.spacingBeforePx !== undefined;
              return (
                <div key={section.id} className="rounded-xl border border-slate-200/80 bg-slate-50/60 px-3 py-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-slate-800 truncate" title={section.title}>{section.title}</span>
                    <div className="flex gap-2 items-center shrink-0">
                      <span className="tabular-nums text-slate-600">{sectionGapPx(style, section)}px{overridden ? ' · 单独' : ' · 全局'}</span>
                      <button type="button" onClick={() => onChangeSectionSpacing(section.id, undefined)}
                        disabled={!overridden}
                        aria-label={`恢复${section.title}的全局间距`}
                        className="text-blue-700 disabled:text-slate-400 disabled:cursor-not-allowed">重置</button>
                    </div>
                  </div>
                  <input type="range" min={MIN_SECTION_GAP_PX} max={MAX_SECTION_GAP_PX} step={1}
                    aria-label={`${section.title}模块上方间距`}
                    value={sectionGapPx(style, section)}
                    onChange={(event) => onChangeSectionSpacing(section.id, Number(event.target.value))}
                    className="w-full accent-blue-600 cursor-pointer" />
                </div>
              );
            })}
          </div>
        </section>

        <section className="space-y-3 pt-4 border-t border-slate-100" aria-label="模块内部精细排版">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-xs font-semibold text-slate-800">模块内部精细排版</div>
              <p className="text-[11px] text-slate-500 mt-1">
                单独控制条目、标题与正文、项目要点之间的留白。未设置的参数沿用所选模板的原始排版。
              </p>
            </div>
            <button
              type="button"
              aria-label="全部恢复内部排版默认值"
              disabled={!INTERNAL_SPACING_KEYS.some((key) => normalizedInternalSpacing(style[key], key) !== undefined)}
              onClick={() => onChangeStyle((prev) => {
                const next = { ...prev };
                for (const key of INTERNAL_SPACING_KEYS) delete next[key];
                return next;
              })}
              className="text-[11px] text-blue-700 hover:underline disabled:text-slate-400 disabled:no-underline disabled:cursor-not-allowed"
            >
              恢复模板默认
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {INTERNAL_SPACING_KEYS.map((key) => {
              const current = normalizedInternalSpacing(style[key], key);
              const fallback = templateInternalSpacingPreview(style.template, key);
              const label = key === 'itemSpacingPx' ? '项目／实习条目之间'
                : key === 'headingContentSpacingPx' ? '模块标题与正文之间'
                : '项目／实习要点之间';
              return (
                <div key={key} className="rounded-xl border border-slate-200/80 bg-slate-50/60 px-3 py-3 space-y-2">
                  <div className="flex items-start justify-between gap-2 text-xs">
                    <span className="font-medium text-slate-800">{label}</span>
                    <span className="tabular-nums shrink-0 text-slate-600">
                      {current === undefined ? '模板默认' : `${current}px`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={INTERNAL_SPACING_LIMITS[key].min}
                    max={INTERNAL_SPACING_LIMITS[key].max}
                    step={1}
                    aria-label={label}
                    value={current ?? fallback}
                    onChange={(event) => onChangeStyle((prev) => ({
                      ...prev, [key]: Number(event.target.value),
                    }))}
                    className="w-full accent-blue-600 cursor-pointer"
                  />
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-slate-500">
                      {INTERNAL_SPACING_LIMITS[key].min}–{INTERNAL_SPACING_LIMITS[key].max}px
                    </span>
                    <button
                      type="button"
                      disabled={current === undefined}
                      onClick={() => onChangeStyle((prev) => {
                        const next = { ...prev };
                        delete next[key];
                        return next;
                      })}
                      aria-label={`重置${label}`}
                      className="text-blue-700 disabled:text-slate-400 disabled:cursor-not-allowed"
                    >
                      重置
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-500">
            间距调整会影响 PDF 分页，正式投递前请检查两页衔接和文字完整性。
          </p>
        </section>

        <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-800">显示 A4 单页警戒线 (297mm)</div>
            <div className="text-[11px] text-slate-500">
              在预览画布底部显示第一页结束位置虚线与超页提醒（导出 PDF 时自动隐藏）
            </div>
          </div>
          <button
            type="button"
            onClick={() => onChangeStyle((prev) => ({ ...prev, showPageBreakGuide: !prev.showPageBreakGuide }))}
            className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
              style.showPageBreakGuide
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-300'
            }`}
          >
            {style.showPageBreakGuide ? '已开启提示线' : '已隐藏提示线'}
          </button>
        </div>
      </div>
    </div>
  );
};
