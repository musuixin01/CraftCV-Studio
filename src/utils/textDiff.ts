export type TextDiffPart = {
  text: string;
  kind: 'unchanged' | 'removed' | 'added';
};

export interface PairedTextDiff {
  before: TextDiffPart[];
  after: TextDiffPart[];
}

const MAX_EXACT_TOKENS = 420;

function tokenize(text: string): string[] {
  // Han characters have character-level precision; Latin technical tokens
  // such as UART/DMA/FreeRTOS stay intact, with whitespace preserved.
  return text.match(/[A-Za-z0-9_.+#-]+|\s+|\p{Script=Han}|[^\s]/gu) ?? [];
}

function append(parts: TextDiffPart[], kind: TextDiffPart['kind'], text: string) {
  if (!text) return;
  const last = parts[parts.length - 1];
  if (last?.kind === kind) last.text += text;
  else parts.push({ kind, text });
}

function fallbackBeforeAfter(before: string[], after: string[]): PairedTextDiff {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let end = 0;
  while (end < before.length - start && end < after.length - start &&
    before[before.length - 1 - end] === after[after.length - 1 - end]) end++;
  const head = before.slice(0, start).join('');
  const tail = end ? before.slice(-end).join('') : '';
  const beforeMiddle = before.slice(start, before.length - end).join('');
  const afterMiddle = after.slice(start, after.length - end).join('');
  const result: PairedTextDiff = { before: [], after: [] };
  append(result.before, 'unchanged', head);
  append(result.after, 'unchanged', head);
  append(result.before, 'removed', beforeMiddle);
  append(result.after, 'added', afterMiddle);
  append(result.before, 'unchanged', tail);
  append(result.after, 'unchanged', tail);
  return result;
}

/** Review overlay shown *only on the original resume*. Its unchanged and
 * removed fragments reconstruct the unmodified original; added fragments
 * are clearly labeled proposed insertions, not part of the original data.
 */
export function buildOriginalReviewParts({ before, after }: PairedTextDiff): TextDiffPart[] {
  const combined: TextDiffPart[] = [];
  let left = 0;
  let right = 0;
  let leftOffset = 0;
  let rightOffset = 0;

  // The same unchanged LCS can be split into different-sized pieces:
  // e.g. original [unchanged: '采集数据'] and proposed
  // [unchanged: '采集', added: '传感器', unchanged: '数据'].
  // Consume common text by offsets rather than treating parts as aligned.
  while (left < before.length || right < after.length) {
    const oldPart = before[left];
    const newPart = after[right];
    if (oldPart?.kind === 'removed') {
      append(combined, 'removed', oldPart.text.slice(leftOffset));
      left += 1;
      leftOffset = 0;
    } else if (newPart?.kind === 'added') {
      append(combined, 'added', newPart.text.slice(rightOffset));
      right += 1;
      rightOffset = 0;
    } else if (oldPart?.kind === 'unchanged' && newPart?.kind === 'unchanged') {
      const n = Math.min(oldPart.text.length - leftOffset, newPart.text.length - rightOffset);
      const oldSlice = oldPart.text.slice(leftOffset, leftOffset + n);
      if (oldSlice !== newPart.text.slice(rightOffset, rightOffset + n)) {
        // In case a future diff algorithm breaks the common-anchor invariant,
        // show a conservative full replacement instead of inventing alignment.
        return [
          { kind: 'removed', text: before.map((p) => p.text).join('') },
          { kind: 'added', text: after.map((p) => p.text).join('') },
        ];
      }
      append(combined, 'unchanged', oldSlice);
      leftOffset += n;
      rightOffset += n;
      if (leftOffset === oldPart.text.length) {
        left += 1;
        leftOffset = 0;
      }
      if (rightOffset === newPart.text.length) {
        right += 1;
        rightOffset = 0;
      }
    } else {
      // Fail closed rather than entering an infinite loop on malformed diff.
      return [
        { kind: 'removed', text: before.map((p) => p.text).join('') },
        { kind: 'added', text: after.map((p) => p.text).join('') },
      ];
    }
  }
  return combined;
}

/**
 * Exact token-level LCS highlighting for typical resume paragraphs.
 * Very long texts use a bounded prefix/suffix comparison instead of an
 * unbounded quadratic DP. Does not modify either input.
 */
export function buildPairedTextDiff(original: string, proposed: string): PairedTextDiff {
  const a = tokenize(original);
  const b = tokenize(proposed);
  if (a.length > MAX_EXACT_TOKENS || b.length > MAX_EXACT_TOKENS) {
    return fallbackBeforeAfter(a, b);
  }
  const width = b.length + 1;
  const dp = new Uint16Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i * width + j] = a[i] === b[j]
        ? 1 + dp[(i + 1) * width + j + 1]
        : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1]);
    }
  }
  const result: PairedTextDiff = { before: [], after: [] };
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      append(result.before, 'unchanged', a[i]);
      append(result.after, 'unchanged', b[j]);
      i++;
      j++;
    } else if (j < b.length && (i === a.length ||
      dp[i * width + j + 1] >= dp[(i + 1) * width + j])) {
      append(result.after, 'added', b[j++]);
    } else {
      append(result.before, 'removed', a[i++]);
    }
  }
  return result;
}
