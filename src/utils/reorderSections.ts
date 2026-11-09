import type { SectionColumn, SectionConfig } from '../types/resume';

/** Reorder modules without changing their data, visibility or saved column on a single-column layout. */
export function reorderSections(
  sections: SectionConfig[],
  draggedId: string,
  targetId: string,
  targetColumn?: SectionColumn,
): SectionConfig[] {
  if (draggedId === targetId) return sections;
  const sourceIndex = sections.findIndex((s) => s.id === draggedId);
  const targetIndex = sections.findIndex((s) => s.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return sections;

  const ordered = [...sections];
  const [moved] = ordered.splice(sourceIndex, 1);
  const nextMoved = targetColumn ? { ...moved, column: targetColumn } : moved;

  const targetAfterRemoval = ordered.findIndex((s) => s.id === targetId);
  // A downward drop means "after"; an upward drop means "before".
  const insertionIndex = targetAfterRemoval + (sourceIndex < targetIndex ? 1 : 0);
  ordered.splice(insertionIndex, 0, nextMoved);
  return ordered;
}
