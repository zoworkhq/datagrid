/**
 * Focus movement, as pure logic over a grid's shape.
 *
 * Pure because focus under virtualisation is the part most likely to be subtly
 * wrong, and a bug here is invisible until a screen-reader user reports it. As
 * a pure function it is property-testable at 40,000 rows with no DOM at all.
 *
 * The focused cell's identity is `{ rowId, columnKey }` and never a node
 * reference — the node it was on may have been recycled into a different row.
 */
import type { FocusTarget } from "@oxygenui-design/grid-core";

export interface GridShape {
  readonly rowIds: readonly string[];
  /** Visible columns, in visual order. Hidden columns are not navigable. */
  readonly columnKeys: readonly string[];
}

export type FocusMove =
  | "left"
  | "right"
  | "up"
  | "down"
  | "rowStart"
  | "rowEnd"
  | "gridStart"
  | "gridEnd"
  | "columnTop"
  | "columnBottom"
  | "pageUp"
  | "pageDown";

const clamp = (n: number, max: number): number => Math.max(0, Math.min(n, max));

/**
 * Returns the next focus target, or the current one when the move would leave
 * the grid. Movement never wraps: arrowing right at the last column stays put
 * rather than dropping to the next row, because a clinician tracking a value
 * across a row must not silently change row.
 */
export function moveFocus(
  shape: GridShape,
  current: FocusTarget | null,
  move: FocusMove,
  pageRows = 20,
): FocusTarget | null {
  const { rowIds, columnKeys } = shape;
  if (rowIds.length === 0 || columnKeys.length === 0) return null;

  const firstRow = rowIds[0] as string;
  const firstCol = columnKeys[0] as string;
  if (!current) return { rowId: firstRow, columnKey: firstCol };

  const r = rowIds.indexOf(current.rowId);
  const c = columnKeys.indexOf(current.columnKey);
  // The focused row or column has left the view — a filter changed, a column
  // was hidden. Fall back to the first cell rather than losing focus to body.
  if (r === -1 || c === -1) return { rowId: firstRow, columnKey: firstCol };

  const lastRow = rowIds.length - 1;
  const lastCol = columnKeys.length - 1;

  let nr = r;
  let nc = c;
  switch (move) {
    case "left": nc = clamp(c - 1, lastCol); break;
    case "right": nc = clamp(c + 1, lastCol); break;
    case "up": nr = clamp(r - 1, lastRow); break;
    case "down": nr = clamp(r + 1, lastRow); break;
    case "rowStart": nc = 0; break;
    case "rowEnd": nc = lastCol; break;
    case "gridStart": nr = 0; nc = 0; break;
    case "gridEnd": nr = lastRow; nc = lastCol; break;
    case "columnTop": nr = 0; break;
    case "columnBottom": nr = lastRow; break;
    case "pageUp": nr = clamp(r - pageRows, lastRow); break;
    case "pageDown": nr = clamp(r + pageRows, lastRow); break;
  }

  return { rowId: rowIds[nr] as string, columnKey: columnKeys[nc] as string };
}

/**
 * Where focus should sit when the grid is entered, or when the previously
 * focused cell no longer exists. Never `null` for a non-empty grid: the body is
 * one tab stop, so exactly one cell must always be tabbable.
 */
export function resolveFocus(shape: GridShape, wanted: FocusTarget | null): FocusTarget | null {
  if (shape.rowIds.length === 0 || shape.columnKeys.length === 0) return null;
  if (
    wanted &&
    shape.rowIds.includes(wanted.rowId) &&
    shape.columnKeys.includes(wanted.columnKey)
  ) {
    return wanted;
  }
  return { rowId: shape.rowIds[0] as string, columnKey: shape.columnKeys[0] as string };
}
