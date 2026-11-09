/**
 * Content-aware cuts for visual A4 PDFs. Screenshot pixels are the source of
 * truth; DOM ranges are only used to locate text lines before rasterization.
 * No resume content or spacing is modified.
 */
export interface ImagePdfBand {
  top: number;
  bottom: number;
}

export interface ImagePdfSlice {
  start: number;
  end: number;
}

export interface ImagePdfPlan {
  slices: ImagePdfSlice[];
  /** True only when the last <=1% overhang is scaled slightly to one page. */
  fittedSinglePage: boolean;
}

export class ImagePdfPaginationError extends Error {}

const MIN_PAGE_FILL = 0.61;
const SMALL_OVERHANG = 0.01;
const MAX_IMAGE_PDF_PAGES = 40;

function validBand(band: ImagePdfBand): boolean {
  return Number.isFinite(band.top) && Number.isFinite(band.bottom) &&
    band.bottom > band.top;
}

function mergeBands(bands: ImagePdfBand[], total: number): ImagePdfBand[] {
  const ordered = bands.filter(validBand).map(({ top, bottom }) => ({
    top: Math.max(0, Math.min(total, top)),
    bottom: Math.max(0, Math.min(total, bottom)),
  })).filter((band) => band.bottom > band.top).sort((a, b) => a.top - b.top);

  const merged: ImagePdfBand[] = [];
  for (const band of ordered) {
    const last = merged[merged.length - 1];
    if (last && band.top <= last.bottom + 0.5) {
      last.bottom = Math.max(last.bottom, band.bottom);
    } else {
      merged.push({ ...band });
    }
  }
  return merged;
}

function findUnoccupiedCut(target: number, occupied: ImagePdfBand[]): number {
  let cut = target;
  // Intervals are ordered. Repeatedly shift to the start of the preceding
  // line if either column covers the current candidate.
  for (let i = occupied.length - 1; i >= 0; i--) {
    const { top, bottom } = occupied[i];
    if (top < cut && bottom > cut) cut = top;
  }
  return cut;
}

/**
 * Plan contiguous, non-overlapping vertical slices of one rasterized document.
 * Fails closed if two continuous columns leave no safe gap in the last 39% of
 * a page: an incorrect split is not silently treated as a successful export.
 */
export function planImagePdfSlices(
  totalHeightPx: number,
  pageHeightPx: number,
  protectedBands: ImagePdfBand[],
  preferredBreaks: number[] = [],
): ImagePdfPlan {
  if (![totalHeightPx, pageHeightPx].every(Number.isFinite) ||
      totalHeightPx <= 0 || pageHeightPx <= 1 ||
      !Array.isArray(protectedBands) || !Array.isArray(preferredBreaks)) {
    throw new Error('Invalid dimensions for image PDF pagination');
  }
  if (totalHeightPx <= pageHeightPx * (1 + SMALL_OVERHANG)) {
    return { slices: [{ start: 0, end: totalHeightPx }], fittedSinglePage: totalHeightPx > pageHeightPx };
  }

  const occupied = mergeBands(protectedBands, totalHeightPx);
  const breaks = preferredBreaks.filter((point) => Number.isFinite(point) && point > 0 &&
    point < totalHeightPx).sort((a, b) => b - a);
  const slices: ImagePdfSlice[] = [];
  let start = 0;

  for (let index = 0; index < MAX_IMAGE_PDF_PAGES; index++) {
    const remaining = totalHeightPx - start;
    if (remaining <= pageHeightPx * (1 + SMALL_OVERHANG)) {
      slices.push({ start, end: totalHeightPx });
      return { slices, fittedSinglePage: false };
    }

    const target = start + pageHeightPx;
    const minimum = start + pageHeightPx * MIN_PAGE_FILL;
    let cut = findUnoccupiedCut(target, occupied);
    // Prefer to keep an entire project bullet/section together when its
    // actual DOM boundary is within 15% of the normal page end.
    const nearby = breaks.find((point) => point <= cut &&
      point >= Math.max(minimum, cut - pageHeightPx * 0.15) &&
      findUnoccupiedCut(point, occupied) === point);
    if (nearby !== undefined) cut = nearby;

    // Ensure integer pixel boundaries and exact coverage: no lost or repeated
    // rows even after multiple pages.
    cut = Math.floor(cut);
    if (cut < minimum || cut <= start || cut > target) {
      throw new ImagePdfPaginationError('Cannot safely split image PDF without cutting text');
    }
    slices.push({ start, end: cut });
    start = cut;
  }
  throw new ImagePdfPaginationError('Image PDF exceeds the safe 40-page limit');
}

/** Read visible text line rectangles in the original browser layout. */
export function measureImagePdfBreakBands(
  root: HTMLElement,
  canvasWidth: number,
  canvasHeight: number,
): { protectedBands: ImagePdfBand[]; preferredBreaks: number[] } {
  const rect = root.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0 || !root.isConnected) {
    throw new Error('Image PDF capture surface no longer has a layout');
  }
  const scaleX = canvasWidth / rect.width;
  const scaleY = canvasHeight / rect.height;
  if (![scaleX, scaleY].every(Number.isFinite) || scaleX <= 0 || scaleY <= 0) {
    throw new Error('Invalid image PDF raster scale');
  }
  const protectedBands: ImagePdfBand[] = [];
  const preferredBreaks: number[] = [];
  const buffer = 2.5 * scaleY;
  const toY = (value: number) => (value - rect.top) * scaleY;

  const addProtected = (top: number, bottom: number) => {
    if (Number.isFinite(top) && Number.isFinite(bottom) && bottom > top) {
      protectedBands.push({ top: toY(top) - buffer, bottom: toY(bottom) + buffer });
    }
  };

  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  const range = root.ownerDocument.createRange();
  while ((node = walker.nextNode())) {
    if (!node.textContent?.trim()) continue;
    const parent = node.parentElement;
    if (!parent || parent.closest('.no-print, [data-html2canvas-ignore]')) continue;
    const computed = getComputedStyle(parent);
    if (computed.display === 'none' || computed.visibility === 'hidden') continue;
    range.selectNodeContents(node);
    for (const line of Array.from(range.getClientRects())) {
      if (line.width > 0 && line.height > 0) addProtected(line.top, line.bottom);
    }
  }

  for (const element of root.querySelectorAll<HTMLElement>(
    '[data-cv-item], [data-cv-section-heading], [data-cv-bullets] > li, p, h1, h2, h3',
  )) {
    if (element.closest('.no-print')) continue;
    const box = element.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) continue;
    preferredBreaks.push(toY(box.top) - 5 * scaleY, toY(box.bottom) + 5 * scaleY);
  }

  // A page break after a section heading but before its first readable line
  // creates an orphan heading. Treat that heading+first line as an indivisible
  // vertical band, including in split-column templates.
  const firstTextLineBottom = (element: Element): number | null => {
    const textWalker = root.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let text: Node | null;
    while ((text = textWalker.nextNode())) {
      if (!text.textContent?.trim() || text.parentElement?.closest('.no-print')) continue;
      range.selectNodeContents(text);
      const fragment = Array.from(range.getClientRects()).find((box) => box.width > 0 && box.height > 0);
      if (fragment) return fragment.bottom;
    }
    return null;
  };

  for (const heading of root.querySelectorAll<HTMLElement>('[data-cv-section-heading]')) {
    if (heading.closest('.no-print')) continue;
    const body = heading.nextElementSibling;
    if (!body?.hasAttribute('data-cv-section-body')) continue;
    const top = heading.getBoundingClientRect().top;
    const firstLineBottom = firstTextLineBottom(body);
    if (firstLineBottom !== null && firstLineBottom > top) {
      addProtected(top, firstLineBottom);
    }
  }

  // Keep project title/metadata with its first bullet when possible; longer
  // projects still continue between subsequent full lines instead of becoming
  // unbreakable page-sized blocks.
  for (const item of root.querySelectorAll<HTMLElement>('[data-cv-item]')) {
    if (item.closest('.no-print')) continue;
    const firstBullet = item.querySelector('[data-cv-bullets] > li');
    if (!firstBullet) continue;
    const top = item.getBoundingClientRect().top;
    const bulletBox = firstBullet.getBoundingClientRect();
    // Keep the entire first bullet, not just its first line, so a project
    // heading cannot be separated from a wrapped opening bullet.
    if (bulletBox.width > 0 && bulletBox.bottom > top && bulletBox.bottom - top < 250) {
      addProtected(top, bulletBox.bottom);
    }
  }

  for (const element of root.querySelectorAll('img, svg, canvas')) {
    if (element.closest('.no-print')) continue;
    const box = element.getBoundingClientRect();
    if (box.width > 0 && box.height > 0) addProtected(box.top, box.bottom);
  }
  return { protectedBands, preferredBreaks };
}
