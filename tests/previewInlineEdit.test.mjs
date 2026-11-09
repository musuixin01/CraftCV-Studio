import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const preview = fs.readFileSync(path.resolve('src/components/ResumePreview.tsx'), 'utf8');

test('inline fields use single click with Enter/Space, not double-click', () => {
  assert.ok(preview.includes('data-inline-editable="true"'));
  assert.ok(preview.includes('onClick={(e) => {'));
  assert.ok(preview.includes('startEditing()'));
  assert.ok(preview.includes("e.key === 'Enter' || e.key === ' '"));
  assert.ok(!preview.includes('onDoubleClick={(e) =>'));
});

test('field edits and module moves remain separate', () => {
  assert.ok(preview.includes("closest('input, textarea, [contenteditable=\"true\"]')"));
  assert.ok(preview.includes("e.stopPropagation();"));
  assert.ok(preview.includes("onSelectSection?.('basics')"));
});

test('section titles and major resume item categories support direct updates', () => {
  assert.ok(preview.includes('const editSectionTitle'));
  for(const field of ['education','projects','experience','skills','awards']){
    assert.ok(preview.includes("case '" + field + "':"));
  }
  assert.ok(preview.includes('const editCustomBullet'));
  assert.ok(preview.includes('const editBasic'));
});
