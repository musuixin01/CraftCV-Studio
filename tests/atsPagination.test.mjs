import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isLongAtsProject,
  MAX_ATS_WHOLE_PROJECT_CHARS,
} from '../src/utils/atsPagination.ts';

const sample = {
  name: '智能传感示例',
  role: '固件开发',
  summary: '',
  repoUrl: 'https://github.com/example/example',
  techStack: ['C', 'FreeRTOS'],
  bullets: ['通过任务与消息队列处理实时采集。'],
};

test('short ATS project stays in one readable entry when possible', () => {
  assert.equal(isLongAtsProject(sample), false);
  assert.equal(isLongAtsProject({ ...sample, bullets: [] }), false);
  assert.equal(isLongAtsProject({ ...sample, bullets: [''] }), false);
});

test('long projects may break only at browser-managed bullet boundaries', () => {
  const project = { ...sample, bullets: ['状态机与实时控制'.repeat(55)] };
  assert.equal(isLongAtsProject(project), true);
  assert.equal(isLongAtsProject({ ...sample, bullets: Array(5).fill('一条真实工程记录') }), true);
  assert.equal(isLongAtsProject({ ...sample, bullets: Array(4).fill('短要点') }), false);
});

test('character threshold boundary is deterministic and never mutates project', () => {
  const bare = { ...sample, name: '', role: '', repoUrl: '', techStack: [], bullets: ['x'.repeat(MAX_ATS_WHOLE_PROJECT_CHARS)] };
  const original = structuredClone(bare);
  assert.equal(isLongAtsProject(bare), false);
  assert.equal(isLongAtsProject({ ...bare, bullets: ['x'.repeat(MAX_ATS_WHOLE_PROJECT_CHARS + 1)] }), true);
  assert.deepEqual(bare, original);
});
