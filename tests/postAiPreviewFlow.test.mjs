import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('AI confirmation is anchored to the measured new resume, never stale page metrics', () => {
  const app = fs.readFileSync('src/App.tsx', 'utf8');
  const preview = fs.readFileSync('src/components/ResumePreview.tsx', 'utf8');
  assert.match(preview, /onPageMetricsChange\?: \(metrics: PageMetrics, measuredResume: ResumeDocument\)/);
  assert.match(preview, /onPageMetricsChange\?\.\(\{[\s\S]*?fillPercent,\s*\}, resume\)/);
  assert.match(app, /JSON\.stringify\(measuredResume\) !== pending\.snapshot/);
  assert.match(app, /snapshot: JSON\.stringify\(prepared\), slotId: activeSlotId, kind: 'content'/);
  assert.match(app, /lastAiCompactReview\?\.slotId === activeSlotId/);
  assert.match(app, /lastAiCompactReview\.snapshot === JSON\.stringify\(resume\)/);
  assert.match(app, /setLastAiCompactReview\(\{ \.\.\.pending, metrics \}\)/);
});

test('post-confirmation A4 preview offers existing checked export entry points, undo and editing', () => {
  const app = fs.readFileSync('src/App.tsx', 'utf8');
  const start = app.indexOf('aria-label="精简完成后的 A4 检查"');
  const end = app.indexOf('{/* Scrollable A4 Viewport */}', start);
  assert.ok(start > -1 && end > start);
  const panel = app.slice(start, end);
  assert.match(panel, /预览仍超出一页/);
  assert.match(panel, /预览未超出一页/);
  assert.match(panel, /此处是当前视觉模板的 A4 预览测量，不等于最终 PDF 已验收/);
  assert.match(panel, /onClick=\{handleDownloadImagePDF\}/);
  assert.match(panel, /onClick=\{handleExportPDF\}/);
  assert.match(panel, /onClick=\{handleTightenAfterAi\}/);
  assert.match(panel, /onClick=\{\(\) => \{ setLastAiCompactReview\(null\); handleUndo\(\); \}\}/);
  assert.match(panel, /继续编辑/);
  assert.match(app, /setActiveTab\('editor'\);[\s\S]*?previewDeskRef\.current\?\.scrollIntoView/);
});

test('narrow screens auto-fit A4 visually but preserve unscaled print/capture surfaces', () => {
  const app = fs.readFileSync('src/App.tsx', 'utf8');
  const preview = fs.readFileSync('src/components/ResumePreview.tsx', 'utf8');
  assert.match(app, /const mobileFitZoom = Math\.max\(0\.35, \(viewportWidth - 48\) \/ 794\)/);
  assert.match(app, /viewportWidth < 640 && fitPreviewToWidth/);
  assert.match(app, /transform: `scale\(\$\{effectiveZoom\}\)`/);
  assert.match(app, /setFitPreviewToWidth\(false\)/);
  assert.match(app, /setZoom\(0\.82\); setFitPreviewToWidth\(true\)/);
  assert.match(app, /window\.addEventListener\('resize', updateViewport\)/);
  assert.match(preview, /previewId = 'a4-resume-sheet'/);
  assert.match(preview, /id=\{previewId\}/);
  assert.match(app, /className="w-\[210mm\] bg-white pdf-capture-surface"/);
});

test('after-AI spacing change requires explicit confirmation and preserves original font size', () => {
  const app = fs.readFileSync('src/App.tsx', 'utf8');
  const onepage = fs.readFileSync('src/utils/onePageResume.ts', 'utf8');
  const handler = app.slice(app.indexOf('const handleTightenAfterAi ='), app.indexOf('const handleUndo ='));
  assert.match(handler, /const nextStyle = compactOnePageSpacing\(resume\.style\)/);
  assert.match(handler, /if \(!window\.confirm\(/);
  assert.match(handler, /commitResumeChange\(/);
  assert.match(onepage, /function compactOnePageSpacing/);
  assert.doesNotMatch(handler, /\.projects =|\.skills =|fontSize:\s*'sm'/);
});
