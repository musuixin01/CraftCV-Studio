import type { BasicsInfo } from '../types/resume';
import { inspectAtsPrintGeometry, type AtsPrintGeometry } from './atsPrintPreflight.ts';

export type ExportFormat = 'ats' | 'image';
export type ExportSeverity = 'error' | 'warning' | 'info';

export interface ExportQualityIssue {
  id: string;
  severity: ExportSeverity;
  title: string;
  detail: string;
  action: string;
}

export interface ExportQualityReport {
  format: ExportFormat;
  estimatedPages: number | null;
  issues: ExportQualityIssue[];
  canContinue: boolean;
}

export interface ExportPreflightInput {
  format: ExportFormat;
  basics: Pick<BasicsInfo, 'name' | 'title' | 'phone' | 'email'>;
  visibleSectionCount: number;
  geometry: AtsPrintGeometry | null;
  fontLoading: boolean;
  /** Explicit one-page mode. Legacy resumes can still export multiple pages. */
  singlePageOnly?: boolean;
}

function addIssue(
  issues: ExportQualityIssue[],
  severity: ExportSeverity,
  id: string,
  title: string,
  detail: string,
  action: string,
): void {
  issues.push({ id, severity, title, detail, action });
}

/**
 * On-screen estimates only. Real PDF font embedding, selectable text, printed
 * page boundaries, line clipping, and ATS vendor parsing require inspecting
 * the actual exported PDF. Do not present this report as a PDF file audit.
 */
export function buildExportQualityReport(input: ExportPreflightInput): ExportQualityReport {
  const issues: ExportQualityIssue[] = [];
  const { format, basics, geometry } = input;
  let estimatedPages: number | null = null;

  if (!geometry) {
    addIssue(issues, 'error', 'unavailable', '无法测量导出版式',
      '独立导出画布尚未就绪，继续操作可能生成错误或空白文件。',
      '关闭窗口后重新打开当前简历，再执行导出检查。');
  } else if (format === 'ats') {
    const measured = inspectAtsPrintGeometry(geometry);
    if (!measured) {
      addIssue(issues, 'error', 'unmeasurable', '无法测量 ATS 打印版',
        '当前打印版的宽高信息无效，无法可靠估算纸张尺寸。',
        '重新打开简历并等待排版完成，然后重试。');
    } else {
      estimatedPages = measured.pageCount;
      if (measured.widthOverflow) {
        addIssue(issues, 'error', 'ats-overflow', '文字可能超出 A4 可打印宽度',
          'ATS 单栏正文检测到横向溢出，长链接或不可换行文本可能被裁切。',
          '检查项目 GitHub 长链接、过长连续字符与外部文本，调整后重新检查。');
      }
    }
  } else {
    const { sheetWidthPx, sheetHeightPx, scrollHeightPx, scrollWidthPx, clientWidthPx } = geometry;
    const values = [sheetWidthPx, sheetHeightPx, scrollHeightPx, scrollWidthPx, clientWidthPx];
    if (values.some((x) => !Number.isFinite(x)) || sheetWidthPx <= 0 ||
        clientWidthPx <= 0 || sheetHeightPx <= 0 || scrollHeightPx < 0 || scrollWidthPx < 0) {
      addIssue(issues, 'error', 'image-size', '无法测量高清 PDF 截图范围',
        '图片版预览的宽高尚未准备好。',
        '请重新打开当前模板，待预览稳定后重试。');
    } else {
      const height = Math.max(sheetHeightPx, scrollHeightPx);
      const paperHeight = sheetWidthPx * 297 / 210;
      estimatedPages = Math.max(1, Math.ceil((height - 3) / paperHeight));
      if (scrollWidthPx > clientWidthPx + 3) {
        addIssue(issues, 'error', 'image-overflow', '视觉模板内容可能横向越界',
          '截图画布内容比可用宽度更宽，直接截取可能裁切右侧内容。',
          '检查左右栏、长链接和模块宽度，再重新预检。');
      }
    }
  }

  if (!basics.name.trim()) {
    addIssue(issues, 'warning', 'name', '尚未填写姓名',
      '正式简历缺少姓名，招聘人员可能无法准确识别。',
      '在「内容编辑 → 基本信息」填写真实姓名。');
  }
  if (!basics.title.trim()) {
    addIssue(issues, 'warning', 'role', '尚未填写求职岗位',
      '简历顶部没有明确的目标岗位。',
      '在基本信息中填写意向职位，避免自行编造经历。');
  }
  if (!basics.phone.trim() && !basics.email.trim()) {
    addIssue(issues, 'warning', 'contact', '缺少基本联系方式',
      '电话号码与邮箱均为空，招聘方可能无法联系。',
      '至少填写一个本人确认可用的联系方式。');
  }
  if (input.visibleSectionCount === 0) {
    addIssue(issues, 'warning', 'empty-sections', '当前没有显示的内容模块',
      '导出结果可能只有个人信息，缺少教育、项目或工作经历等内容。',
      '在内容编辑中检查模块可见性。');
  }
  if (input.fontLoading) {
    addIssue(issues, 'warning', 'fonts-loading', '页面字体仍在加载',
      '导出时字体替换可能改变换行与分页。',
      '等待字体加载完成后重新检查。');
  }

  if (input.singlePageOnly && estimatedPages !== null) {
    if (estimatedPages > 1) {
      addIssue(issues, 'error', 'single-page-limit', '校招单页限制：当前内容放不进一页 A4',
        `当前版式预估 ${estimatedPages} 页。不会删除项目或证据，也不会把正文字号压到不可读。`,
        '先使用「尝试单页排版」收紧留白，再人工精简重复描述或切换更紧凑的模板；也可以主动将目标改为「允许多页」。');
    } else {
      addIssue(issues, 'info', 'single-page-estimate', '单页版式预检符合目标',
        format === 'ats'
          ? '这是浏览器预检估计，Chrome/Edge 的实际打印分页仍可能不同；本工具无法自动验证另存的 PDF。'
          : '预计为一页，最终图片 PDF 在保存前还会检查实际切片页数，绝不自动删除内容。',
        '导出后仍需检查实际 PDF 的页数、正文可读性和页底。');
    }
  }

  if (estimatedPages !== null && estimatedPages > 1 && !input.singlePageOnly) {
    addIssue(issues, 'warning', 'multipage',
      `预计 ${estimatedPages} 页 A4，需检查分页`,
      format === 'ats'
        ? '此页数来自屏幕布局估算，Chrome 实际打印可能不同；跨页标题与项目要点仍需核对。'
        : '图片式 PDF 按文字行和模块位置寻找安全断点；如果双栏内容过密而无法安全分页，会取消导出而不是直接截断文字。实际页数可能与预估不同。',
      '导出后仍需逐页检查模块标题、跨页首行与页底是否完整。');
  }
  if (format === 'image') {
    addIssue(issues, 'info', 'image-text-layer', '高清版是图片式 PDF',
      '它保留视觉模板，但正文通常无法选中或复制；不等同于可检索文字 PDF。',
      '如需投递 ATS 系统，优先使用「ATS 文字 PDF」。');
  } else {
    addIssue(issues, 'info', 'pdf-not-verified', '字体与文字层须导出后核实',
      '当前仅做浏览器排版预检，尚未读取最终 PDF，无法证明字体已嵌入或所有文字可提取。',
      '另存为 PDF 后，检查字体显示、文字复制、分页及链接。');
  }

  return {
    format,
    estimatedPages,
    issues,
    canContinue: !issues.some((issue) => issue.severity === 'error'),
  };
}
