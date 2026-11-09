import test from 'node:test';
import assert from 'node:assert/strict';
import { compactOnePageSpacing, compactOnePageStyle, needsSinglePage } from '../src/utils/onePageResume.ts';
import { sectionGapPx } from '../src/utils/sectionSpacing.ts';

const style = {
  template: 'modern', accentColor: '#222', fontSize: 'md',
  lineHeight: 'normal', pageMargin: 'standard', sectionSpacing: 22,
  showPageBreakGuide: true, showIcons: true,
  pageGoal: 'flexible',
};

test('safe compact preset makes one page the goal without shrinking normal text', () => {
  const result = compactOnePageStyle(style);
  assert.equal(result.pageGoal, 'one');
  assert.equal(result.fontSize, 'md');
  assert.equal(result.lineHeight, 'tight');
  assert.equal(result.pageMargin, 'compact');
  assert.equal(result.sectionSpacing, 12);
  assert.equal(style.fontSize, 'md');
  assert.equal(style.pageGoal, 'flexible');
  assert.equal(result.showIcons, style.showIcons);
});

test('large template typography can normalize to standard but never to small', () => {
  assert.equal(compactOnePageStyle({...style, fontSize: 'lg'}).fontSize, 'md');
  assert.equal(compactOnePageStyle({...style, fontSize: 'sm'}).fontSize, 'sm');
});

test('existing small spacing, per-section overrides and arbitrary style values are preserved', () => {
  const candidate = { ...style, sectionSpacing: 6, itemSpacingPx: 15,
    bulletSpacingPx: 3, headingContentSpacingPx: 11 };
  const result = compactOnePageStyle(candidate);
  assert.equal(result.sectionSpacing, 6);
  assert.equal(result.itemSpacingPx, 15);
  assert.equal(result.bulletSpacingPx, 3);
  assert.equal(result.headingContentSpacingPx, 11);
  assert.equal(sectionGapPx(result, { spacingBeforePx: 35 }), 35);
  assert.equal(compactOnePageStyle(result), result);
});

test('no-AI spacing action never changes typography or per-module overrides', () => {
  const existing = {...style, fontSize:'lg', sectionSpacing:25, bulletSpacingPx:7,
    headingContentSpacingPx:6, itemSpacingPx:9};
  const adjusted = compactOnePageSpacing(existing);
  assert.equal(adjusted.fontSize,'lg');
  assert.equal(adjusted.lineHeight,'tight');
  assert.equal(adjusted.pageMargin,'compact');
  assert.equal(adjusted.sectionSpacing,12);
  assert.equal(adjusted.itemSpacingPx,9);
  assert.equal(adjusted.bulletSpacingPx,7);
  assert.equal(adjusted.headingContentSpacingPx,6);
  assert.equal(adjusted.pageGoal,'one');
  assert.equal(compactOnePageSpacing(adjusted),adjusted);
  assert.equal(existing.sectionSpacing,25);
});

test('legacy layouts remain flexible unless user explicitly chooses strict one-page', () => {
  assert.equal(needsSinglePage({ ...style, pageGoal: undefined }), false);
  assert.equal(needsSinglePage(style), false);
  assert.equal(needsSinglePage(compactOnePageStyle(style)), true);
});
