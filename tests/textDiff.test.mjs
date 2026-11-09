import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildPairedTextDiff, buildOriginalReviewParts } from '../src/utils/textDiff.ts';

function restored(parts) {
  return parts.map(part => part.text).join('');
}

test('the diff restores exact original and proposed Chinese technical text', () => {
  const before = '基于 STM32，采用 DMA 配合 UART 进行串口数据接收，并维护缓冲区状态。';
  const after = '基于 STM32，使用 DMA + UART 接收串口数据，维护缓冲区状态。';
  const result = buildPairedTextDiff(before, after);
  assert.equal(restored(result.before), before);
  assert.equal(restored(result.after), after);
  assert.ok(result.before.some(part => part.kind === 'removed' && part.text.length));
  assert.ok(result.after.some(part => part.kind === 'added' && part.text.length));
  assert.ok(result.before.some(part => part.kind === 'unchanged' && part.text.includes('STM32')));
});

test('unchanged, deletion-only, insertion-only and empty paragraphs are handled', () => {
  for (const [before, after] of [
    ['DMA+UART', 'DMA+UART'],
    ['曾经通过 UART 完成测试', '通过 UART 完成测试'],
    ['使用 UART', '使用 UART 和 DMA'],
    ['', '新增一行'],
    ['删除整行', ''],
    ['', ''],
  ]) {
    const output = buildPairedTextDiff(before, after);
    assert.equal(restored(output.before), before);
    assert.equal(restored(output.after), after);
    assert.ok(output.before.every(part => part.kind !== 'added'));
    assert.ok(output.after.every(part => part.kind !== 'removed'));
  }
});

test('repeated Chinese characters, punctuation and whitespace preserve exact data', () => {
  const before = '处理数据数据；使用  UART。\n下一行继续。';
  const after = '处理数据；使用 UART。\n下一行保持。';
  const output = buildPairedTextDiff(before, after);
  assert.equal(restored(output.before), before);
  assert.equal(restored(output.after), after);
});

test('very long input falls back without quadratic expansion or losing content', () => {
  const before = '开始 ' + '重复技术内容'.repeat(220) + ' 结束';
  const after = '开始 ' + '重复技术数据'.repeat(220) + ' 结束';
  const output = buildPairedTextDiff(before, after);
  assert.equal(restored(output.before), before);
  assert.equal(restored(output.after), after);
  assert.ok(output.before.some(part => part.kind === 'removed'));
  assert.ok(output.after.some(part => part.kind === 'added'));
});

test('all annotation types appear on the original while both plain texts reconstruct exactly', () => {
  const cases = [
    ['基于 STM32 实现 UART 串口通信。', '使用 STM32 实现 UART 串口通信。'],
    ['曾经使用 FreeRTOS 配置 7 个任务。', '使用 FreeRTOS 配置 7 个任务。'],
    ['采用 DMA 传输数据。', '采用 DMA 高效传输数据。'],
    ['处理数据数据；使用  UART。', '处理数据；使用 UART。'],
    ['', '新增一行'],
    ['仅保留原文', ''],
    ['完全相同', '完全相同'],
    ['开始 ' + '重复技术内容'.repeat(220), '开始 ' + '重复技术数据'.repeat(220)],
  ];
  for (const [original, proposed] of cases) {
    const review = buildOriginalReviewParts(buildPairedTextDiff(original, proposed));
    assert.equal(restored(review.filter(p => p.kind !== 'added')), original);
    assert.equal(restored(review.filter(p => p.kind !== 'removed')), proposed);
  }
});

test('full A4 comparison comes before optional details; highlights use React spans', () => {
  const dialog = fs.readFileSync('src/components/OnePageAICompactDialog.tsx', 'utf8');
  const view = fs.readFileSync('src/components/FullResumeCompare.tsx', 'utf8');
  const preview = fs.readFileSync('src/components/ResumePreview.tsx', 'utf8');
  const comparison = dialog.indexOf('<FullResumeCompare original={resume} selected={selected} />');
  const details = dialog.indexOf('<details className');
  assert.ok(comparison > 0 && details > comparison);
  assert.match(dialog, /aria-label="逐项采纳修改"/);
  assert.match(dialog, /应用修改：\$\{source\.label\}/);
  assert.match(view, /aria-label="完整简历修改前后对比"/);
  assert.match(view, /<ResumePreview resume=\{original\}/);
  assert.match(view, /role="group" aria-label="手机简历对比视图切换"/);
  assert.match(view, /role="group" aria-label="完整简历预览缩放"/);
  assert.match(view, /overflow-auto/);
  assert.match(view, /onPointerDown=\{onPointerDown\} onPointerMove=\{onPointerMove\}/);
  assert.match(view, /setPointerCapture\(event.pointerId\)/);
  assert.match(view, /overflow-x-auto|scrollLeft = pan.left/);
  assert.match(view, /applyReviewedOnePageCandidates\(original, selected\)/);
  assert.match(preview, /comparison\?\.side === 'before' \? comparison\.byText\.get\(value\) : undefined/);
  assert.match(preview, /buildOriginalReviewParts\(highlighted\)/);
  assert.match(preview, /part\.kind === 'added' \? '＋' : ''/);
  assert.match(view, /map\.set\(field\.original, diff\)/);
  assert.doesNotMatch(view, /map\.set\(item\.proposed, diff\)/);
  assert.doesNotMatch(view + preview, /dangerouslySetInnerHTML/);
});
