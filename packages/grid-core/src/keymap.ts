/**
 * The keymap, as data.
 *
 * It is data rather than a switch statement so it can be replaced: a clinician
 * with nine years of muscle memory in one EHR has something worth more than our
 * defaults. No competitor does this well.
 *
 * Two structural rules this encodes:
 *   - The body is ONE tab stop, with a roving `tabindex` inside it. A tab stop
 *     per cell is 800 presses to leave a 40x20 grid.
 *   - Every operation has a keyboard path. WCAG 2.2 SC 2.5.7 makes a drag-only
 *     column reorder a failure, and no competitor has a complete keyboard path
 *     for resize, reorder, hide and pin.
 */

export type KeyContext = "body" | "header" | "any";

export interface KeyBinding {
  readonly id: string;
  readonly keys: string;
  readonly context: KeyContext;
  readonly description: string;
}

export const DEFAULT_KEYMAP: readonly KeyBinding[] = [
  { id: "cell.right", keys: "ArrowRight", context: "any", description: "Move to the next cell" },
  { id: "cell.left", keys: "ArrowLeft", context: "any", description: "Move to the previous cell" },
  { id: "cell.down", keys: "ArrowDown", context: "body", description: "Move to the cell below" },
  { id: "cell.up", keys: "ArrowUp", context: "body", description: "Move to the cell above" },
  { id: "row.start", keys: "Home", context: "any", description: "Move to the first cell in the row" },
  { id: "row.end", keys: "End", context: "any", description: "Move to the last cell in the row" },
  { id: "grid.start", keys: "Control+Home", context: "body", description: "Move to the first cell in the grid" },
  { id: "grid.end", keys: "Control+End", context: "body", description: "Move to the last cell in the grid" },
  { id: "column.top", keys: "Control+ArrowUp", context: "body", description: "Move to the first row in this column" },
  { id: "column.bottom", keys: "Control+ArrowDown", context: "body", description: "Move to the last row in this column" },
  { id: "page.down", keys: "PageDown", context: "body", description: "Move one viewport down" },
  { id: "page.up", keys: "PageUp", context: "body", description: "Move one viewport up" },
  { id: "row.activate", keys: "Enter", context: "body", description: "Open the row" },
  { id: "row.select", keys: " ", context: "body", description: "Select or deselect the row" },
  { id: "row.selectExtend", keys: "Shift+ ", context: "body", description: "Extend the selection to this row" },
  { id: "select.down", keys: "Shift+ArrowDown", context: "body", description: "Extend the selection down" },
  { id: "select.up", keys: "Shift+ArrowUp", context: "body", description: "Extend the selection up" },
  { id: "select.all", keys: "Control+a", context: "body", description: "Select every row in the current view" },
  { id: "select.clear", keys: "Escape", context: "body", description: "Clear the selection, or cancel an edit" },
  { id: "cell.edit", keys: "F2", context: "body", description: "Begin editing this cell" },
  { id: "sort.toggle", keys: "Enter", context: "header", description: "Sort by this column" },
  { id: "sort.additive", keys: "Shift+Enter", context: "header", description: "Add this column to the sort" },
  { id: "column.menu", keys: "Alt+ArrowDown", context: "header", description: "Open the column menu" },
  { id: "column.resize", keys: "Control+Shift+ArrowRight", context: "header", description: "Widen this column" },
  // Widening with no way back is not a resize, it is a one-way ratchet — and a
  // keyboard user who overshoots has no pointer to drag it back with.
  { id: "column.narrow", keys: "Control+Shift+ArrowLeft", context: "header", description: "Narrow this column" },
];

/** How much one keyboard resize moves a column. */
export const COLUMN_RESIZE_STEP = 24;

/** Below this a column cannot show a value, only that it has one. */
export const MIN_COLUMN_WIDTH = 56;

export function assertUniqueBindings(keymap: readonly KeyBinding[]): void {
  const seen = new Map<string, string>();
  for (const b of keymap) {
    const slot = `${b.context}:${b.keys}`;
    const existing = seen.get(slot);
    if (existing) throw new Error(`keymap conflict: ${b.id} and ${existing} both bind ${slot}`);
    seen.set(slot, b.id);
  }
}
