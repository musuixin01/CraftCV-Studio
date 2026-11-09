import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { inspectAtsPrintGeometry } from '../src/utils/atsPrintPreflight.ts';

const base = {
  sheetWidthPx: 703,
  sheetHeightPx: 1025,
  scrollHeightPx: 1025,
  scrollWidthPx: 703,
  clientWidthPx: 703,
};

test('ATS preflight accepts one A4 page with a small rounding tolerance', () => {
  assert.deepEqual(inspectAtsPrintGeometry(base), {
    pageCount: 1,
    widthOverflow: false,
    contentHeightPx: 1025,
  });
  assert.equal(inspectAtsPrintGeometry({...base,scrollHeightPx:1028})?.pageCount,1);
});

test('ATS preflight warns about long resumes without hiding content', () => {
  assert.equal(inspectAtsPrintGeometry({...base,scrollHeightPx:1900})?.pageCount,2);
  assert.equal(inspectAtsPrintGeometry({...base,scrollHeightPx:3400})?.pageCount,4);
});

test('ATS preflight detects horizontal overflow and invalid measurement', () => {
  assert.equal(inspectAtsPrintGeometry({...base,scrollWidthPx:755})?.widthOverflow,true);
  assert.equal(inspectAtsPrintGeometry({...base,sheetWidthPx:0}),null);
  assert.equal(inspectAtsPrintGeometry({...base,scrollWidthPx:NaN}),null);
});

test('ATS text printing is independent of chosen image PDF template', () => {
  const source=fs.readFileSync('src/App.tsx','utf8');
  const css=fs.readFileSync('src/index.css','utf8');
  assert.match(source,/pdfCaptureRef/);
  assert.match(source,/atsPrintRef/);
  assert.match(source,/template: 'classic-ats'/);
  assert.match(source,/basics: \{ \.\.\.resume\.basics, showAvatar: false \}/);
  assert.match(source,/pdf-image-capture/);
  assert.match(css,/\.no-print, \.pdf-image-capture/);
});

test('ATS typography uses a fixed job-application scale without overriding visual templates', () => {
  const css = fs.readFileSync('src/index.css', 'utf8');
  const preview = fs.readFileSync('src/components/ResumePreview.tsx', 'utf8');
  assert.match(css, /\.ats-print-surface #a4-resume-sheet\s*\{[\s\S]*?font-family:\s*Arial,\s*"Microsoft YaHei"/);
  assert.match(css, /\.ats-print-surface #a4-resume-sheet\s*\{[\s\S]*?font-size:\s*10\.5pt\s*!important/);
  assert.match(css, /header h1\s*\{[\s\S]*?font-size:\s*22pt/);
  assert.match(css, /\[data-ats-role-title\]\s*\{[\s\S]*?font-size:\s*13pt/);
  assert.match(css, /\[data-ats-direction-tags\]\s*\{[\s\S]*?font-size:\s*10pt/);
  assert.match(css, /section h2\s*\{[\s\S]*?font-size:\s*12\.5pt/);
  assert.match(css, /\.ats-print-surface #a4-resume-sheet \.font-mono\s*\{[\s\S]*?font-size:\s*max\(9\.5pt, 0\.92em\)/);
  assert.match(preview, /data-ats-role-title className="text-\[14px\]/);
  assert.doesNotMatch(css, /(^|\n)\s*(?:body|#a4-resume-sheet)\s*\{\s*font-family:\s*Arial/m);
});

test('ATS print allows long projects to flow while preserving section and bullet boundaries', () => {
  const css = fs.readFileSync('src/index.css', 'utf8');
  const preview = fs.readFileSync('src/components/ResumePreview.tsx', 'utf8');
  assert.match(preview, /ats-print-entry ats-print-project-entry/);
  assert.match(preview, /data-ats-project-repo/);
  assert.match(preview, /data-ats-section-heading/);
  assert.match(preview, /data-resume-section=\{sec\.type\}/);
  assert.match(css, /\.ats-print-surface \.ats-print-entry\s*\{\s*break-inside: avoid-page/);
  assert.match(css, /\.ats-print-surface \.ats-print-project-breakable\s*\{\s*break-inside: auto/);
  assert.match(css, /\.ats-print-surface \.ats-print-project-entry li\s*\{\s*break-inside: avoid-page/);
  assert.match(css, /\.ats-print-surface \[data-ats-section-heading\]\s*\{[\s\S]*?break-after: avoid-page/);
  assert.match(css, /\.ats-print-project-entry \[data-ats-project-repo\]\s*\{\s*max-width: 100%/);
  assert.match(css, /section\[data-resume-section="experience"\]/);
});

test('ATS standalone preflight does not count the editor hover gutter as overflow', () => {
  const css = fs.readFileSync('src/index.css', 'utf8');
  assert.match(css, /\.ats-print-surface #a4-resume-sheet section\[data-resume-section\]\s*\{\s*margin-inline:\s*0\s*!important;\s*padding-inline:\s*0\s*!important/);
});
