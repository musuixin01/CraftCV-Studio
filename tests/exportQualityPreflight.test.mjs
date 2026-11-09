import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildExportQualityReport } from '../src/utils/exportQualityPreflight.ts';

const basics = {
  name: '匿名求职者',
  title: '嵌入式软件开发',
  phone: '13800000000',
  email: 'example@example.com',
};
const geometry = {
  sheetWidthPx: 703,
  sheetHeightPx: 1025,
  scrollHeightPx: 1025,
  scrollWidthPx: 703,
  clientWidthPx: 703,
};
const input = {
  format: 'ats',
  basics,
  visibleSectionCount: 5,
  fontLoading: false,
  geometry,
};

test('one-page ATS print preflight does not mistake an estimate for verified PDF embedding', () => {
  const report = buildExportQualityReport(input);
  assert.equal(report.canContinue, true);
  assert.equal(report.estimatedPages, 1);
  assert.deepEqual(report.issues.map((issue) => issue.id), ['pdf-not-verified']);
  assert.match(report.issues[0].detail, /尚未读取最终 PDF/);
});

test('multi-page estimates explain risks without blocking normal export', () => {
  const report = buildExportQualityReport({
    ...input,
    geometry: { ...geometry, scrollHeightPx: 2090 },
  });
  assert.equal(report.canContinue, true);
  assert.ok(report.estimatedPages > 1);
  assert.equal(report.issues.find((issue) => issue.id === 'multipage')?.severity, 'warning');
  assert.match(report.issues.find((issue) => issue.id === 'multipage').action, /逐页检查/);
});

test('broken ATS geometry and overflow block export with actionable guidance', () => {
  const missing = buildExportQualityReport({ ...input, geometry: null });
  assert.equal(missing.canContinue, false);
  assert.equal(missing.estimatedPages, null);
  assert.equal(missing.issues[0].id, 'unavailable');
  const bad = buildExportQualityReport({ ...input, geometry: { ...geometry, sheetWidthPx: NaN } });
  assert.equal(bad.canContinue, false);
  assert.equal(bad.issues[0].id, 'unmeasurable');
  const overflow = buildExportQualityReport({
    ...input,
    geometry: { ...geometry, scrollWidthPx: 770 },
  });
  assert.equal(overflow.canContinue, false);
  assert.equal(overflow.issues[0].id, 'ats-overflow');
  assert.match(overflow.issues[0].action, /长链接/);
});

test('missing identity and contact are warnings, never automatically fabricated', () => {
  const report = buildExportQualityReport({
    ...input,
    basics: { name: ' ', title: '', phone: ' ', email: '' },
    visibleSectionCount: 0,
    fontLoading: true,
  });
  assert.equal(report.canContinue, true);
  assert.deepEqual(report.issues.map((issue) => issue.id), [
    'name', 'role', 'contact', 'empty-sections', 'fonts-loading', 'pdf-not-verified',
  ]);
  assert.ok(report.issues.every((issue) => issue.severity !== 'error'));
});

test('visual image PDF uses A4 aspect ratio and clearly warns about rasterization', () => {
  const single = buildExportQualityReport({
    ...input,
    format: 'image',
    geometry: { ...geometry, sheetWidthPx: 794, clientWidthPx: 794, scrollWidthPx: 794,
      sheetHeightPx: 1122, scrollHeightPx: 1122 },
  });
  assert.equal(single.canContinue, true);
  assert.equal(single.estimatedPages, 1);
  assert.deepEqual(single.issues.map((issue) => issue.id), ['image-text-layer']);
  const multi = buildExportQualityReport({
    ...input,
    format: 'image',
    geometry: { ...geometry, sheetWidthPx: 794, clientWidthPx: 794, scrollWidthPx: 794,
      sheetHeightPx: 1550, scrollHeightPx: 1550 },
  });
  assert.equal(multi.estimatedPages, 2);
  assert.equal(multi.issues.find((issue) => issue.id === 'multipage')?.severity, 'warning');
  const overflow = buildExportQualityReport({
    ...input,
    format: 'image',
    geometry: { ...geometry, sheetWidthPx: 794, clientWidthPx: 794, scrollWidthPx: 915 },
  });
  assert.equal(overflow.canContinue, false);
  assert.equal(overflow.issues[0].id, 'image-overflow');
});

test('visual export warns about actual multi-page slicing, not a fixed classic-only capture defect', () => {
  const single = buildExportQualityReport({
    ...input,
    format: 'image',
    geometry: { ...geometry, sheetWidthPx: 794, clientWidthPx: 794, scrollWidthPx: 794,
      sheetHeightPx: 1122, scrollHeightPx: 1122 },
  });
  assert.equal(single.canContinue, true);
  assert.deepEqual(single.issues.map((issue) => issue.id), ['image-text-layer']);
  const multipage = buildExportQualityReport({
    ...input, format: 'image',
    geometry: { ...geometry, sheetWidthPx: 794, clientWidthPx: 794, scrollWidthPx: 794,
      sheetHeightPx: 1800, scrollHeightPx: 1800 },
  });
  assert.equal(multipage.estimatedPages, 2);
  assert.equal(multipage.issues.find((issue) => issue.id === 'multipage')?.severity, 'warning');
  assert.match(multipage.issues.find((issue) => issue.id === 'multipage')?.detail ?? '', /安全断点/);
  assert.equal(multipage.issues.some((issue) => issue.id === 'image-classic-capture'), false);
});

test('strict campus single-page setting blocks estimated multi-page exports in both modes', () => {
  for (const format of ['image', 'ats']) {
    const wide = format === 'image'
      ? { ...geometry, sheetWidthPx:794, clientWidthPx:794, scrollWidthPx:794, sheetHeightPx:1900, scrollHeightPx:1900 }
      : { ...geometry, sheetHeightPx:2090, scrollHeightPx:2090 };
    const report = buildExportQualityReport({ ...input, format, singlePageOnly:true, geometry:wide });
    assert.equal(report.canContinue, false);
    assert.ok(report.estimatedPages > 1);
    const blocking = report.issues.find((issue) => issue.id === 'single-page-limit');
    assert.equal(blocking?.severity, 'error');
    assert.match(blocking?.detail ?? '', /不会删除/);
  }
});

test('single-page constraint is opt-in and successful preflight admits export with a disclaimer', () => {
  const strict = buildExportQualityReport({ ...input, singlePageOnly:true });
  assert.equal(strict.canContinue, true);
  assert.equal(strict.estimatedPages, 1);
  assert.equal(strict.issues.find((x) => x.id === 'single-page-estimate')?.severity, 'info');
  assert.match(strict.issues.find((x) => x.id === 'single-page-estimate')?.detail ?? '', /实际打印分页/);
  assert.equal(buildExportQualityReport({ ...input, singlePageOnly:false }).canContinue, true);
});

test('two buttons share a single review and image PDF failure cannot silently switch formats', () => {
  const app = fs.readFileSync('src/App.tsx', 'utf8');
  const modal = fs.readFileSync('src/components/ExportQualityDialog.tsx', 'utf8');
  assert.match(app, /handleExportPDF = \(\) => requestExportReview\('ats'\)/);
  assert.match(app, /handleDownloadImagePDF = \(\) => requestExportReview\('image'\)/);
  assert.match(app, /<ExportQualityDialog/);
  assert.match(app, /JSON\.stringify\(resume\) !== pendingExport\.resumeSnapshot/);
  assert.match(app, /activeSlotId !== pendingExport\.slotId/);
  assert.match(app, /if \(!latest\.canContinue\) return/);
  assert.match(app, /没有自动切换为 ATS 文字版/);
  assert.doesNotMatch(app, /catch \(err\) \{[\s\S]*?正在尝试调起系统打印/);
  assert.match(modal, /aria-modal="true"/);
  assert.match(modal, /disabled=\{!report\.canContinue \|\| busy\}/);
});
