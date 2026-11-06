import React from 'react';
import { ResumeStyleConfig, TemplateId } from '../types/resume';
import { ACCENT_COLORS } from '../data/defaultResume';
import { Check, Layout, Palette, Sliders, Minimize2 } from 'lucide-react';

interface TemplateStylePanelProps {
  style: ResumeStyleConfig;
  onChangeStyle: (updater: (prev: ResumeStyleConfig) => ResumeStyleConfig) => void;
}

const TEMPLATES: {
  id: TemplateId;
  name: string;
  tag: string;
  description: string;
  features: string[];
}[] = [
  {
    id: 'pdf-classic',
    name: '1. 经典工程双栏风 (PDF 1:1 复刻版)',
    tag: '当前默认 · 完美还原上传PDF',
    description:
      '1:1 还原您上传的 PDF 版式：左侧浅灰底栏（居中证件照、教育背景、灰底块专业技能、证书与荣誉），右侧白底主栏（姓名+方向标签、右上角五项对齐信息、斜切几何块中英双语标题、加粗项目成果）。',
    features: ['左侧灰底块技能标签', '右侧斜切块中英标题', '右上角五项对齐档案'],
  },
  {
    id: 'modern',
    name: '2. 现代极简商务风 (Modern Minimalist)',
    tag: '瑞士网格 · 单栏',
    description: '清爽留白与精致序号引导，突出 GitHub 链接与核心技术栈，适合外企、互联网研发及综合技术岗。',
    features: ['瑞士网格对齐', '章节序号引导', '高辨识度主题强调色'],
  },
  {
    id: 'classic-ats',
    name: '3. 经典学术/大厂标准风 (Classic ATS)',
    tag: '高密度单栏',
    description: '紧凑高信息密度单栏排版，纯正黑线分割，100% 兼容各大研究所及互联网大厂 ATS 简历解析系统。',
    features: ['超高信息密度', '100% ATS 解析友好', '严谨工程规范'],
  },
  {
    id: 'creative-split',
    name: '4. 现代设计感双栏风 (Creative Split)',
    tag: '左4右8分栏',
    description: '左侧集中展示个人档案、专业技能与竞赛奖项，右侧深度展开教育、科研与项目架构。',
    features: ['4:8 不对称双栏', '技能与奖项侧栏聚合', '层次分明'],
  },
];

export const TemplateStylePanel: React.FC<TemplateStylePanelProps> = ({ style, onChangeStyle }) => {
  const applyOnePageCompactPreset = () => {
    onChangeStyle((prev) => ({
      ...prev,
      fontSize: 'sm',
      lineHeight: 'tight',
      pageMargin: 'compact',
      sectionSpacing: 13,
    }));
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
      {/* Template Selection */}
      <div className="os26-card rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Layout className="w-4 h-4 text-[#0071e3]" />
              四大专业简历视觉模板切换
            </h2>
            <p className="text-xs text-slate-500">
              点击任意模板即可实时重排右侧 A4 简历画布，所有内容数据与模块顺序无缝保留。
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2.5">
          {TEMPLATES.map((tpl) => {
            const active = style.template === tpl.id;
            return (
              <div
                key={tpl.id}
                onClick={() => onChangeStyle((prev) => ({ ...prev, template: tpl.id }))}
                className={`os26-press p-4 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-4 ${
                  active
                    ? 'border-[#0071e3] bg-[#0071e3]/[0.05]'
                    : 'border-slate-200/80 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">{tpl.name}</span>
                    <span className="text-slate-300">·</span>
                    <span className="text-xs font-medium text-[#0071e3]">{tpl.tag}</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{tpl.description}</p>
                  <div className="text-[11px] text-slate-500 font-mono">
                    {tpl.features.join(' · ')}
                  </div>
                </div>
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                    active ? 'bg-[#0071e3] text-white' : 'border border-slate-300'
                  }`}
                >
                  {active && <Check className="w-3 h-3" />}
                </div>
              </div>
            );
          })}
        </div>
      </div>

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
              如果项目经历较多超出了一页 A4 纸，可一键开启「一页纸紧凑收敛模式」或拖动下方滑块微调。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={applyOnePageCompactPreset}
              className="os26-press px-3 py-1.5 text-xs font-semibold text-[#0071e3] bg-[#0071e3]/10 hover:bg-[#0071e3]/16 rounded-xl flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Minimize2 className="w-3.5 h-3.5" />
              一键一页纸紧凑收敛
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
                {style.sectionSpacing ?? 18}px
              </span>
            </div>
            <input
              type="range"
              min={10}
              max={28}
              step={1}
              value={style.sectionSpacing ?? 18}
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

        {/* Page Break Guide Toggle */}
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
