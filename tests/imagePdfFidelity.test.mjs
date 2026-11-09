import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('src/App.tsx', 'utf8');
const manifest = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const bunLock = fs.readFileSync('bun.lock', 'utf8');

test('visual PDF captures live browser layout with an OKLCH-compatible renderer', () => {
  assert.match(app, /await import\('html2canvas-pro'\)/);
  assert.doesNotMatch(app, /import html2canvas from 'html2canvas-pro'/);
  assert.match(app, /await html2canvas\(captureNode,\s*\{/);
  assert.match(app, /scale:\s*3/);
  assert.match(app, /backgroundColor:\s*'#ffffff'/);
  assert.match(app, /useCORS:\s*true/);
  // html2canvas-pro is an EXCLUSION callback; true must omit only no-print UI.
  assert.match(app, /ignoreElements:\s*\(node\)\s*=>\s*node\.classList\?\.contains\('no-print'\)\s*\?\?\s*false/);
  assert.doesNotMatch(app, /domToCanvas\(|from 'modern-screenshot'/);
});

test('image PDF export waits for fonts and retains independent A4 and error paths', () => {
  assert.match(app, /document\.fonts\.ready/);
  assert.match(app, /document\.fonts\.status === 'loading'/);
  assert.match(app, /setTimeout\(\(\) => reject\(new Error\('Fonts did not settle before PDF capture'\)\), 5000\)/);
  assert.match(app, /new jsPDF\(\{[\s\S]*?format:\s*'a4'/);
  assert.match(app, /pdf\.addImage\(\s*pageCanvas\.toDataURL/);
  assert.match(app, /measureImagePdfBreakBands/);
  assert.match(app, /planImagePdfSlices/);
  assert.match(app, /pdf\.save\(/);
  assert.match(app, /高清图片 PDF 生成失败，没有自动切换为 ATS 文字版/);
  assert.match(app, /requestExportReview\('image'\)/);
});

test('strict one-page export checks actual screenshot slices before saving a PDF', () => {
  assert.match(app, /needsSinglePage\(resume\.style\) && slices\.length !== 1/);
  assert.match(app, /throw new SinglePageLimitError/);
  assert.match(app, /err instanceof SinglePageLimitError/);
  assert.match(app, /singlePageOnly: needsSinglePage\(resume\.style\)/);
});

test('checked-in dependency and Bun lock pin the renderer without leaving the superseded direct package', () => {
  assert.equal(manifest.dependencies['html2canvas-pro'], '2.6.3');
  assert.equal(manifest.dependencies['modern-screenshot'], undefined);
  assert.match(bunLock, /"html2canvas-pro": "2\.6\.3"/);
  assert.match(bunLock, /"html2canvas-pro": \["html2canvas-pro@2\.6\.3"/);
  assert.doesNotMatch(bunLock, /"modern-screenshot":/);
});
