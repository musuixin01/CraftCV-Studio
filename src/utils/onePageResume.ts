import type { ResumeStyleConfig } from '../types/resume';
import { globalSectionGapPx } from './sectionSpacing.ts';

export class SinglePageLimitError extends Error {}

/**
 * A restrained one-page attempt, not an auto-delete or promise of one page.
 * Preserve all section/item overrides and do not make readable type smaller
 * than the existing "md" (12px) template setting.
 */
export function compactOnePageStyle(style: ResumeStyleConfig): ResumeStyleConfig {
  const nextFont = style.fontSize === 'lg' ? 'md' : style.fontSize;
  const nextGap = Math.min(globalSectionGapPx(style), 12);
  if (nextFont === style.fontSize && style.lineHeight === 'tight' &&
      style.pageMargin === 'compact' && globalSectionGapPx(style) === nextGap &&
      style.pageGoal === 'one') {
    return style;
  }
  return {
    ...style,
    fontSize: nextFont,
    pageGoal: 'one',
    lineHeight: 'tight',
    pageMargin: 'compact',
    sectionSpacing: nextGap,
  };
}

/** No-AI quick action: compress spacing only, without touching the chosen font size. */
export function compactOnePageSpacing(style: ResumeStyleConfig): ResumeStyleConfig {
  const nextGap = Math.min(globalSectionGapPx(style), 12);
  if (style.pageGoal === 'one' && style.lineHeight === 'tight' &&
      style.pageMargin === 'compact' && globalSectionGapPx(style) === nextGap) {
    return style;
  }
  return {
    ...style,
    pageGoal: 'one',
    lineHeight: 'tight',
    pageMargin: 'compact',
    sectionSpacing: nextGap,
  };
}

export function needsSinglePage(style: ResumeStyleConfig): boolean {
  return style.pageGoal === 'one';
}
