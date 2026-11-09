/**
 * Conservative browser preflight for 186mm content width and 12mm A4 margins.
 * This is a layout warning, not proof of final PDF pagination or font fidelity.
 */
export interface AtsPrintGeometry {
  sheetWidthPx: number;
  sheetHeightPx: number;
  scrollHeightPx: number;
  scrollWidthPx: number;
  clientWidthPx: number;
}

export function inspectAtsPrintGeometry(input: AtsPrintGeometry): {
  pageCount: number;
  widthOverflow: boolean;
  contentHeightPx: number;
} | null {
  const { sheetWidthPx, sheetHeightPx, scrollHeightPx, scrollWidthPx, clientWidthPx } = input;
  if (![sheetWidthPx, sheetHeightPx, scrollHeightPx, scrollWidthPx, clientWidthPx].every(Number.isFinite) ||
      sheetWidthPx <= 0 || clientWidthPx <= 0 || sheetHeightPx < 0 || scrollHeightPx < 0) {
    return null;
  }
  // A4 height 297mm minus 12mm top and bottom print margins.
  const pageHeightPx = sheetWidthPx * 273 / 186;
  const contentHeightPx = Math.max(sheetHeightPx, scrollHeightPx);
  const tolerancePx = Math.max(3, sheetWidthPx * 0.004);
  return {
    pageCount: Math.max(1, Math.ceil((contentHeightPx - tolerancePx) / pageHeightPx)),
    widthOverflow: scrollWidthPx > clientWidthPx + tolerancePx,
    contentHeightPx,
  };
}
