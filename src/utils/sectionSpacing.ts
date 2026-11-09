import type { ResumeStyleConfig, SectionConfig, TemplateId } from '../types/resume';

export const MIN_SECTION_GAP_PX = 0;
export const MAX_SECTION_GAP_PX = 40;

export function clampSectionGapPx(value: number): number {
  return Math.min(MAX_SECTION_GAP_PX, Math.max(MIN_SECTION_GAP_PX, Math.round(value)));
}

/** Legacy template-specific gaps, used only when a saved resume has no explicit setting. */
export function defaultSectionGapPx(template: TemplateId, pageMargin: ResumeStyleConfig['pageMargin']): number {
  if (template === 'pdf-classic') return 15;
  if (template === 'creative-split') return 20;
  if (template === 'render-harvard') return 15;
  if (template === 'reactive-bronzor' || template === 'render-engineering' || template === 'resumesample-engineer') return 11;
  if (template !== 'modern' && template !== 'classic-ats') return 17;
  return pageMargin === 'compact' ? 14 : pageMargin === 'generous' ? 24 : 18;
}

export function globalSectionGapPx(style: ResumeStyleConfig): number {
  return typeof style.sectionSpacing === 'number' && Number.isFinite(style.sectionSpacing)
    ? clampSectionGapPx(style.sectionSpacing)
    : defaultSectionGapPx(style.template, style.pageMargin);
}

export function sectionGapPx(style: ResumeStyleConfig, section: Pick<SectionConfig, 'spacingBeforePx'>): number {
  return typeof section.spacingBeforePx === 'number' && Number.isFinite(section.spacingBeforePx)
    ? clampSectionGapPx(section.spacingBeforePx)
    : globalSectionGapPx(style);
}
