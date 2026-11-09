import test from 'node:test';
import assert from 'node:assert/strict';
import { reorderSections } from '../src/utils/reorderSections.ts';

const source = [
  {id:'edu',title:'教育',column:'left',visible:true},
  {id:'skills',title:'技能',column:'right',visible:true},
  {id:'awards',title:'奖项',column:'right',visible:false},
  {id:'projects',title:'项目',column:'left',visible:true},
];

test('downward drag moves a module after its target and preserves content',()=>{
  const next = reorderSections(source, 'edu', 'awards');
  assert.deepEqual(next.map(s=>s.id), ['skills','awards','edu','projects']);
  assert.equal(next.find(s=>s.id==='edu').column,'left');
  assert.deepEqual(next.find(s=>s.id==='awards'),source[2]);
  assert.deepEqual(source.map(s=>s.id),['edu','skills','awards','projects']);
});

test('upward drag places module before target without an off-by-one error',()=>{
  const next = reorderSections(source, 'projects', 'skills');
  assert.deepEqual(next.map(s=>s.id), ['edu','projects','skills','awards']);
});

test('explicit cross-column drag only changes the dragged module',()=>{
  const next = reorderSections(source, 'edu', 'skills', 'right');
  assert.deepEqual(next.map(s=>s.id), ['skills','edu','awards','projects']);
  assert.equal(next.find(s=>s.id==='edu').column,'right');
  assert.equal(next.find(s=>s.id==='projects').column,'left');
});

test('invalid and self drop are safe no-ops',()=>{
  assert.strictEqual(reorderSections(source, 'missing', 'edu'),source);
  assert.strictEqual(reorderSections(source, 'edu', 'missing'),source);
  assert.strictEqual(reorderSections(source, 'edu', 'edu'),source);
});
