import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  INTERNAL_SPACING_KEYS,
  INTERNAL_SPACING_LIMITS,
  normalizedInternalSpacing,
  templateInternalSpacingPreview,
  internalSpacingCssProps,
} from '../src/utils/internalSpacing.ts';

const legacyStyle = {
  template: 'pdf-classic',
  accentColor: '#666666',
  fontSize: 'md',
  lineHeight: 'normal',
  pageMargin: 'standard',
  showPageBreakGuide: false,
  showIcons: true,
};

test('legacy resumes retain the original template rhythm by omitting new flags', () => {
  assert.deepEqual(Object.keys(internalSpacingCssProps(legacyStyle).vars), []);
  const attrs = internalSpacingCssProps(legacyStyle);
  for (const key of ['data-cv-item-spacing','data-cv-heading-spacing','data-cv-bullet-spacing']) {
    assert.equal(attrs[key], undefined);
  }
  assert.equal(templateInternalSpacingPreview('pdf-classic','itemSpacingPx'),13);
  assert.equal(templateInternalSpacingPreview('classic-ats','bulletSpacingPx'),2);
});

test('all three independent rhythm controls clamp safely and preserve an explicit zero', () => {
  for (const key of INTERNAL_SPACING_KEYS) {
    assert.equal(normalizedInternalSpacing(0,key),0);
    assert.equal(normalizedInternalSpacing(-18,key),0);
    assert.equal(normalizedInternalSpacing(1000,key),INTERNAL_SPACING_LIMITS[key].max);
    assert.equal(normalizedInternalSpacing(3.8,key),4);
    assert.equal(normalizedInternalSpacing(Number.NaN,key),undefined);
    assert.equal(normalizedInternalSpacing(Infinity,key),undefined);
    assert.equal(normalizedInternalSpacing('6',key),undefined);
    assert.equal(normalizedInternalSpacing(null,key),undefined);
  }
});

test('fine spacing tokens use only explicit saved values and survive JSON import/export', () => {
  const config = {...legacyStyle, itemSpacingPx: 21, headingContentSpacingPx: 6, bulletSpacingPx: 0};
  const decoded = JSON.parse(JSON.stringify(config));
  const attrs = internalSpacingCssProps(decoded);
  assert.equal(attrs['data-cv-item-spacing'],'on');
  assert.equal(attrs['data-cv-heading-spacing'],'on');
  assert.equal(attrs['data-cv-bullet-spacing'],'on');
  assert.deepEqual(attrs.vars,{
    '--cv-item-spacing':'21px',
    '--cv-heading-spacing':'6px',
    '--cv-bullet-spacing':'0px',
  });
  const reset = {...decoded};
  for (const key of INTERNAL_SPACING_KEYS) delete reset[key];
  assert.deepEqual(internalSpacingCssProps(reset).vars,{});
});

test('layout markers are shared across PDF classic, modern, ATS and reference layouts', () => {
  const src=fs.readFileSync('src/components/ResumePreview.tsx','utf8');
  const css=fs.readFileSync('src/index.css','utf8');
  const panel=fs.readFileSync('src/components/TemplateStylePanel.tsx','utf8');
  assert.ok((src.match(/\{\.\.\.rhythmAttributes\}/g)||[]).length===5);
  assert.ok((src.match(/data-cv-items/g)||[]).length>=4);
  assert.ok((src.match(/data-cv-item/g)||[]).length>=4);
  assert.ok((src.match(/data-cv-bullets/g)||[]).length>=4);
  assert.ok((src.match(/data-cv-section-heading/g)||[]).length>=6);
  assert.ok((src.match(/data-cv-section-body/g)||[]).length>=6);
  for(const attr of ['data-cv-item-spacing','data-cv-heading-spacing','data-cv-bullet-spacing']){
    assert.ok(css.includes(`#a4-resume-sheet[${attr}="on"]`));
  }
  assert.match(panel,/模块内部精细排版/);
  assert.match(panel,/恢复模板默认/);
  assert.match(panel,/delete next\[key\]/);
  assert.match(css,/\[data-cv-bullets\] > li \+ li/);
});
