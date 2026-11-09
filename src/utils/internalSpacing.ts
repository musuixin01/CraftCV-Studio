import type { ResumeStyleConfig, TemplateId } from '../types/resume';

export type InternalSpacingKey = 'itemSpacingPx' | 'headingContentSpacingPx' | 'bulletSpacingPx';
export const INTERNAL_SPACING_LIMITS: Record<InternalSpacingKey, { min: number; max: number }> = {
  itemSpacingPx: { min: 0, max: 28 },
  headingContentSpacingPx: { min: 0, max: 20 },
  bulletSpacingPx: { min: 0, max: 12 },
};

export const INTERNAL_SPACING_KEYS: InternalSpacingKey[] = [
  'itemSpacingPx', 'headingContentSpacingPx', 'bulletSpacingPx',
];

/** A missing field means keep the selected template's original spacing. */
export function normalizedInternalSpacing(value: unknown, key: InternalSpacingKey): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const { min, max } = INTERNAL_SPACING_LIMITS[key];
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function templateInternalSpacingPreview(template: TemplateId, key: InternalSpacingKey): number {
  if (key === 'itemSpacingPx') return template === 'pdf-classic' ? 13 : 12;
  if (key === 'bulletSpacingPx') return template === 'pdf-classic' ? 3 : 2;
  return template === 'pdf-classic' ? 10 : 8;
}

export function internalSpacingCssProps(style: ResumeStyleConfig) {
  const item = normalizedInternalSpacing(style.itemSpacingPx, 'itemSpacingPx');
  const heading = normalizedInternalSpacing(style.headingContentSpacingPx, 'headingContentSpacingPx');
  const bullet = normalizedInternalSpacing(style.bulletSpacingPx, 'bulletSpacingPx');
  return {
    'data-cv-item-spacing': item !== undefined ? 'on' : undefined,
    'data-cv-heading-spacing': heading !== undefined ? 'on' : undefined,
    'data-cv-bullet-spacing': bullet !== undefined ? 'on' : undefined,
    vars: {
      ...(item !== undefined ? { '--cv-item-spacing': `${item}px` } : {}),
      ...(heading !== undefined ? { '--cv-heading-spacing': `${heading}px` } : {}),
      ...(bullet !== undefined ? { '--cv-bullet-spacing': `${bullet}px` } : {}),
    },
  };
}
