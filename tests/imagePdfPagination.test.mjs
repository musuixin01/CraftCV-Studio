import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ImagePdfPaginationError,
  planImagePdfSlices,
} from '../src/utils/imagePdfPagination.ts';

test('single A4 page is preserved without splitting or shortening content', () => {
  assert.deepEqual(planImagePdfSlices(900, 1000, []), {
    slices: [{ start: 0, end: 900 }], fittedSinglePage: false,
  });
  assert.deepEqual(planImagePdfSlices(1008, 1000, []), {
    slices: [{ start: 0, end: 1008 }], fittedSinglePage: true,
  });
});

test('multi-page cuts stop before a protected line and keep every source pixel exactly once', () => {
  const report = planImagePdfSlices(2500, 1000, [
    { top: 975, bottom: 1014 },
    { top: 1950, bottom: 2017 },
  ]);
  assert.deepEqual(report.slices, [
    { start: 0, end: 975 },
    { start: 975, end: 1950 },
    { start: 1950, end: 2500 },
  ]);
  assert.equal(report.slices[0].start, 0);
  assert.equal(report.slices.at(-1).end, 2500);
  assert.ok(report.slices.every((p) => p.end > p.start && p.end - p.start <= 1000));
  for (let i = 1; i < report.slices.length; i++) {
    assert.equal(report.slices[i].start, report.slices[i-1].end);
  }
});

test('nearby bullet boundaries are prioritized without cutting text in the other column', () => {
  const report = planImagePdfSlices(1600, 1000, [
    { top: 970, bottom: 1025 },
  ], [940, 960, 980]);
  assert.equal(report.slices[0].end, 960);
  // Candidate 980 is disallowed because it lies within the protected line.
});

test('section heading and first body line are protected from being orphaned', () => {
  const headingAndLead = { top: 950, bottom: 1030 };
  const report = planImagePdfSlices(1500, 1000, [headingAndLead], [975]);
  assert.equal(report.slices[0].end, 950);
  assert.equal(report.slices[1].start, 950);
  // Content inside the protected range is allowed on the next page;
  // only the actual page END may not fall inside that range.
  assert.ok(report.slices.slice(0, -1).every((slice) =>
    slice.end <= headingAndLead.top || slice.end >= headingAndLead.bottom));
});

test('preview DOM measures complete opening bullets and section title/lead as protected bands', () => {
  const source = fs.readFileSync('src/utils/imagePdfPagination.ts', 'utf8');
  assert.match(source, /querySelectorAll<HTMLElement>\('\[data-cv-section-heading\]'\)/);
  assert.match(source, /firstTextLineBottom\(body\)/);
  assert.match(source, /querySelector\('\[data-cv-bullets\] > li'\)/);
  assert.match(source, /addProtected\(top, bulletBox\.bottom\)/);
});

test('mixed-column continuous text fails closed instead of producing a cropped PDF', () => {
  assert.throws(() => planImagePdfSlices(2200, 1000, [
    { top: 0, bottom: 1040 },
  ]), ImagePdfPaginationError);
});

test('invalid bounds, duplicated/overlapping bands and non-finite candidate positions are handled', () => {
  assert.throws(() => planImagePdfSlices(NaN, 1000, []));
  assert.throws(() => planImagePdfSlices(2100, 0, []));
  const report = planImagePdfSlices(1600, 1000, [
    { top: 990, bottom: 995 },
    { top: 994, bottom: 1005 },
    { top: NaN, bottom: 200 },
  ], [NaN, -1, 1000]);
  assert.equal(report.slices[0].end, 990);
  assert.equal(report.slices.at(-1).end, 1600);
});

test('production visual export uses page-by-page raster crops and never shifts one giant JPEG', () => {
  const app = fs.readFileSync('src/App.tsx', 'utf8');
  assert.match(app, /measureImagePdfBreakBands\(\s*captureNode, canvas\.width, canvas\.height/);
  assert.match(app, /planImagePdfSlices\(\s*canvas\.height, pageHeightPx, protectedBands, preferredBreaks/);
  assert.match(app, /pageContext\.drawImage\(\s*canvas, 0, slice\.start, canvas\.width, sourceHeight/);
  assert.match(app, /pdf\.addImage\(\s*pageCanvas\.toDataURL/);
  assert.match(app, /err instanceof ImagePdfPaginationError/);
  assert.doesNotMatch(app, /pdf\.addImage\(imgData/);
  assert.doesNotMatch(app, /position = heightLeft - imgHeightMm/);
});
