import type { TemplateId } from '../types/resume';

export type TemplateSource = 'CraftCV' | 'Reactive Resume' | 'RenderCV' | 'Awesome-CV' | 'ResumeSample';
export type TemplateLayout = 'one-column' | 'two-column' | 'label-column';

export interface TemplateOption {
  id: TemplateId;
  name: string;
  source: TemplateSource;
  description: string;
  features: string[];
  accent: string;
  layout: TemplateLayout;
  atsSingleColumn: boolean;
  portrait: boolean;
  titleStyle: 'line' | 'rule' | 'caps' | 'editorial' | 'label';
}

/**
 * Native CraftCV React layouts, not copies of the upstream LaTeX/Typst/React-PDF engines.
 * Upstream project names describe design references, not affiliation or pixel-perfect replicas.
 */
export const TEMPLATE_CATALOG: TemplateOption[] = [
  {
    id: 'pdf-classic', name: '经典工程双栏', source: 'CraftCV',
    description: '浅灰信息栏搭配宽阔项目展示区，保留原有工程模板。',
    features: ['双栏', '适合展示技能', '照片可选'],
    accent: '#666666', layout: 'two-column', atsSingleColumn: false, portrait: true, titleStyle: 'line',
  },
  {
    id: 'modern', name: '现代极简', source: 'CraftCV',
    description: '简约的版面网格和编号，适用于广泛的技术岗位。',
    features: ['单栏', '留白清晰', '编号'],
    accent: '#1d4ed8', layout: 'one-column', atsSingleColumn: true, portrait: true, titleStyle: 'caps',
  },
  {
    id: 'classic-ats', name: '经典 ATS', source: 'CraftCV',
    description: '高信息密度单栏，适合中文校园招聘和系统解析。',
    features: ['单栏', '黑白', '紧凑'],
    accent: '#262626', layout: 'one-column', atsSingleColumn: true, portrait: false, titleStyle: 'rule',
  },
  {
    id: 'creative-split', name: '创意分栏', source: 'CraftCV',
    description: '独立浅色侧栏，适合强调设计与跨领域技能。',
    features: ['双栏', '醒目侧栏', '照片可选'],
    accent: '#0f766e', layout: 'two-column', atsSingleColumn: false, portrait: true, titleStyle: 'line',
  },
  {
    id: 'reactive-meowth', name: 'Meowth 风格', source: 'Reactive Resume',
    description: '姓名左置、照片右置、暖棕色细线标题；你之前选定的风格。',
    features: ['单栏', '暖棕标题', '照片可选'],
    accent: '#a66a52', layout: 'one-column', atsSingleColumn: true, portrait: true, titleStyle: 'line',
  },
  {
    id: 'reactive-onyx', name: 'Onyx 风格', source: 'Reactive Resume',
    description: '深色标题配利落的栏目竖线，侧重职业形象。',
    features: ['单栏', '深墨色', '照片可选'],
    accent: '#263345', layout: 'one-column', atsSingleColumn: true, portrait: true, titleStyle: 'rule',
  },
  {
    id: 'reactive-bronzor', name: 'Bronzor 风格', source: 'Reactive Resume',
    description: '章节标签与内容左右对应，兼顾高密度和阅读节奏。',
    features: ['标签栏', '单栏阅读顺序', '紧凑'],
    accent: '#596a71', layout: 'label-column', atsSingleColumn: true, portrait: false, titleStyle: 'label',
  },
  {
    id: 'render-engineering', name: 'Engineering Resumes 风格', source: 'RenderCV',
    description: '为工程师设计的纯文本式排版，突出项目技术和时间线。',
    features: ['单栏', 'ATS 友好', '技术优先'],
    accent: '#27272a', layout: 'one-column', atsSingleColumn: true, portrait: false, titleStyle: 'caps',
  },
  {
    id: 'render-engineering-classic', name: 'Engineering Classic 风格', source: 'RenderCV',
    description: '平衡工程细节与正式求职格式，信息紧凑不拥挤。',
    features: ['单栏', '深蓝标题', '技术优先'],
    accent: '#254363', layout: 'one-column', atsSingleColumn: true, portrait: false, titleStyle: 'line',
  },
  {
    id: 'render-harvard', name: 'Harvard 风格', source: 'RenderCV',
    description: '居中署名与黑色横线，适合看重学历和成果的申请。',
    features: ['单栏', '经典学术', '黑白'],
    accent: '#1f2937', layout: 'one-column', atsSingleColumn: true, portrait: false, titleStyle: 'rule',
  },
  {
    id: 'awesome-inspired', name: 'Awesome 风格', source: 'Awesome-CV',
    description: '参考 Awesome-CV 的醒目姓名层级与精致彩色标题。',
    features: ['单栏', '彩色姓名', '现代专业'],
    accent: '#bd5c4b', layout: 'one-column', atsSingleColumn: true, portrait: false, titleStyle: 'editorial',
  },
  {
    id: 'resumesample-engineer', name: '中文工程校招', source: 'ResumeSample',
    description: '结合中文程序员简历的阅读习惯，浓缩课程、技能、项目和验证结果。',
    features: ['单栏', '中文校招', '高信息密度'],
    accent: '#2b4f6a', layout: 'one-column', atsSingleColumn: true, portrait: false, titleStyle: 'rule',
  },
];

export const TEMPLATE_SOURCES: Array<TemplateSource | '全部'> = [
  '全部', 'CraftCV', 'Reactive Resume', 'RenderCV', 'Awesome-CV', 'ResumeSample',
];

export function getTemplateOption(id: TemplateId): TemplateOption {
  return TEMPLATE_CATALOG.find((item) => item.id === id) ?? TEMPLATE_CATALOG[0];
}
