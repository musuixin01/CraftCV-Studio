import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const initialResume = {
  style: { template: 'pdf-classic', pageMargin: 'standard' },
  sections: [
    { id: 'sec-edu', title: '教育背景' },
    { id: 'sec-skills', title: '专业技能' },
    { id: 'sec-awards', title: '证书与荣誉' },
    { id: 'sec-summary', title: '个人简介' },
    { id: 'sec-projects', title: '项目经历' },
    { id: 'sec-exp', title: '实习经历' },
  ],
};
import {
  clampSectionGapPx,
  defaultSectionGapPx,
  globalSectionGapPx,
  sectionGapPx,
} from '../src/utils/sectionSpacing.ts';

test('old resumes with no new gap fields retain safe template defaults', () => {
  const old = JSON.parse(JSON.stringify(initialResume));
  assert.equal(old.style.sectionSpacing, undefined);
  assert.equal(old.sections[0].spacingBeforePx, undefined);
  assert.equal(globalSectionGapPx(old.style), 15);
  assert.equal(sectionGapPx(old.style, old.sections[0]), 15);
  assert.equal(defaultSectionGapPx('classic-ats', 'standard'), 18);
  assert.equal(defaultSectionGapPx('render-harvard', 'standard'), 15);
  assert.equal(defaultSectionGapPx('reactive-bronzor', 'standard'), 11);
  assert.equal(defaultSectionGapPx('creative-split', 'standard'), 20);
});

test('global spacing updates every non-overridden module', () => {
  const style = { ...initialResume.style, sectionSpacing: 27 };
  for (const section of initialResume.sections) {
    assert.equal(sectionGapPx(style, section), 27);
  }
  assert.equal(globalSectionGapPx({ ...style, sectionSpacing: 0 }), 0);
  assert.equal(globalSectionGapPx({ ...style, sectionSpacing: 40 }), 40);
});

test('one module override survives reordering, JSON backup and reset', () => {
  const style = { ...initialResume.style, sectionSpacing: 18 };
  const original = JSON.parse(JSON.stringify(initialResume.sections));
  const targetId = original[2].id;
  const edited = original.map((section) =>
    section.id === targetId ? { ...section, spacingBeforePx: 33 } : section
  );
  const persisted = JSON.parse(JSON.stringify({ style, sections: [edited[3], edited[2], edited[0], edited[1], edited[4], edited[5]] }));
  const chosen = persisted.sections.find((s) => s.id === targetId);
  assert.equal(sectionGapPx(persisted.style, chosen), 33);
  assert.equal(sectionGapPx({ ...style, sectionSpacing: 9 }, chosen), 33);
  assert.equal(sectionGapPx(persisted.style, persisted.sections[0]), 18);
  const reset = { ...chosen, spacingBeforePx: undefined };
  assert.equal(sectionGapPx(persisted.style, reset), 18);
  assert.equal(JSON.parse(JSON.stringify(reset)).spacingBeforePx, undefined);
});

test('gap bounds reject invalid or oversized persisted values', () => {
  assert.equal(clampSectionGapPx(-19), 0);
  assert.equal(clampSectionGapPx(89), 40);
  assert.equal(sectionGapPx({ ...initialResume.style, sectionSpacing: Infinity }, {}), 15);
  assert.equal(sectionGapPx(initialResume.style, { spacingBeforePx: Number.NaN }), 15);
  assert.equal(sectionGapPx(initialResume.style, { spacingBeforePx: -2 }), 0);
});

test('all visual layouts and ATS use the same module gap source', () => {
  const preview = fs.readFileSync('src/components/ResumePreview.tsx', 'utf8');
  const settings = fs.readFileSync('src/components/TemplateStylePanel.tsx', 'utf8');
  const app = fs.readFileSync('src/App.tsx', 'utf8');
  assert.match(preview, /sectionGapPx\(style, sec\)/);
  assert.ok((preview.match(/sectionGapPx\(style, sec\)/g) ?? []).length >= 7);
  assert.match(settings, /单独调整模块间距/);
  assert.match(settings, /全部恢复全局/);
  assert.match(settings, /globalSectionGapPx\(style\)/);
  assert.match(app, /onChangeSectionSpacing=/);
  assert.match(app, /onResetIndividualSectionSpacing=/);
});
