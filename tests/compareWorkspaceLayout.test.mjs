import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('ready AI review keeps both complete A4 sheets as dominant desktop workspace', () => {
  const dialog = fs.readFileSync('src/components/OnePageAICompactDialog.tsx', 'utf8');
  const full = fs.readFileSync('src/components/FullResumeCompare.tsx', 'utf8');
  assert.match(dialog, /h-\[calc\(100dvh-16px\)\]/);
  assert.match(dialog, /state === 'ready' \? 'max-w-\[1900px\]/);
  assert.match(dialog, /overflow-y-auto lg:overflow-hidden flex flex-col gap-2/);
  assert.match(dialog, /aria-label="逐项采纳修改" className="shrink-0/);
  assert.doesNotMatch(dialog, /<details[^>]*aria-label="逐项采纳修改"[^>]*\bopen(?:=|\s|>)/);
  const detailsPosition = dialog.indexOf('<details aria-label="逐项采纳修改"');
  const paperPosition = dialog.indexOf('<FullResumeCompare original={resume} selected={selected} />');
  const evidencePosition = dialog.indexOf('查看岗位依据、技术证据与招聘 JD（可选）');
  assert.ok(detailsPosition > 0 && paperPosition > detailsPosition && evidencePosition > paperPosition);
  assert.match(dialog, /确认精简 · 应用 \{selected\.length\} 处/);
  assert.match(full, /className="flex flex-col flex-1 min-h-0 gap-1\.5"/);
  assert.match(full, /lg:grid-cols-2 gap-2 flex-1 min-h-0 lg:overflow-hidden/);
  assert.match(full, /lg:flex-1 lg:min-h-0 rounded-lg/);
  assert.match(full, /maxHeight: '78dvh'/);
});

test('compact review keeps per-item opt-out, technical evidence, zoom, pan and mobile switching', () => {
  const dialog = fs.readFileSync('src/components/OnePageAICompactDialog.tsx', 'utf8');
  const full = fs.readFileSync('src/components/FullResumeCompare.tsx', 'utf8');
  assert.match(dialog, /onChange=\{\(event\) => setAccepted\(\(old\) => event\.target\.checked/);
  assert.match(dialog, /getOnePageWritingWarnings/);
  assert.match(dialog, /aria-label=\{\`应用修改：/);
  assert.match(dialog, /id="onepage-job-description"/);
  assert.match(full, /role="group" aria-label="完整简历预览缩放"/);
  assert.match(full, /role="group" aria-label="手机简历对比视图切换"/);
  assert.match(full, /onPointerDown=\{onPointerDown\} onPointerMove=\{onPointerMove\}/);
  assert.match(full, /<ResumePreview resume=\{original\}/);
});
