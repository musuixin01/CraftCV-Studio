import test from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATE_CATALOG, TEMPLATE_SOURCES, getTemplateOption } from '../src/data/templateCatalog.ts';

test('the gallery has all four original layouts and eight new reference styles', () => {
  assert.equal(TEMPLATE_CATALOG.length, 12);
  assert.equal(new Set(TEMPLATE_CATALOG.map(x => x.id)).size, TEMPLATE_CATALOG.length);
  assert.equal(TEMPLATE_CATALOG.filter(x => x.source === 'CraftCV').length, 4);
  assert.equal(TEMPLATE_CATALOG.filter(x => x.source !== 'CraftCV').length, 8);
  assert.ok(TEMPLATE_CATALOG.some(x => x.id === 'reactive-meowth'));
  assert.ok(TEMPLATE_CATALOG.some(x => x.id === 'awesome-inspired'));
  assert.ok(TEMPLATE_SOURCES.includes('ResumeSample'));
});

test('every layout has well-defined presentation metadata and an accessible display name', () => {
  for (const item of TEMPLATE_CATALOG) {
    assert.equal(getTemplateOption(item.id).id, item.id);
    assert.match(item.accent, /^#[0-9a-fA-F]{6}$/);
    assert.ok(item.name.length >= 4);
    assert.ok(item.description.length >= 12);
    assert.ok(['one-column', 'two-column', 'label-column'].includes(item.layout));
    assert.ok(item.features.length >= 2);
    assert.equal(typeof item.atsSingleColumn, 'boolean');
  }
});

test('older saved resume template ids keep the original rendering selection', () => {
  for (const id of ['pdf-classic','modern','classic-ats','creative-split']) {
    assert.equal(getTemplateOption(id).id,id);
  }
  assert.equal(getTemplateOption('invalid-missing-id').id,'pdf-classic');
});
