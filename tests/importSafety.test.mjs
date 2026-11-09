import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const importSource = fs.readFileSync(path.resolve('src/components/ResumeImportModal.tsx'), 'utf8');

test('partial AI imports never retain sample resume history or photos', () => {
  for (const category of ['education', 'projects', 'experience', 'skills', 'awards', 'customSections']) {
    assert.ok(importSource.includes('base.' + category + ' = [];'), category + ' should start empty');
  }
  assert.ok(importSource.includes("name: extractedBasics.name || ''"));
  assert.ok(importSource.includes("degree: ed.degree || ''"));
  assert.ok(importSource.includes("role: pr.role || ''"));
  assert.ok(importSource.includes("avatarUrl: ''"));
  assert.ok(importSource.includes('showAvatar: false'));
});

test('empty AI extraction cannot silently create a demo-filled resume', () => {
  assert.ok(importSource.includes('if (!extracted)'));
  assert.ok(importSource.includes('尚未创建新简历'));
  assert.ok(importSource.indexOf('if (!extracted)') < importSource.indexOf('const doc = buildResumeDocumentFromParsed(data, versionLabel)'));
});

test('AI import defaults to non-destructive new-slot', () => {
  assert.ok(importSource.includes("useState<'new-slot' | 'overwrite'>('new-slot')"));
});
