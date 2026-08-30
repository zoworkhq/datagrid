/**
 * Row identity, checked rather than assumed.
 *
 * ── WHY THIS IS ITS OWN FILE ────────────────────────────────────────────────
 *
 * Identity is the axis everything else is addressed on. `applyTransaction`
 * patches by id, selection is a set of ids, the renderer keeps a
 * `Map<string, HTMLElement>` of rendered rows, `resolveRows` applies row-level
 * disclosure by id, and undo replays ids. A duplicate does not fail loudly in
 * any of them — it silently redirects every one at whichever row registered
 * last.
 *
 * That is worst exactly where this library is aimed: merging two sources whose
 * local identifiers are unique per source and not globally. Two patients with
 * `id: "1042"` from two hospitals is not a hypothetical.
 *
 * So every model that admits rows checks, and reports POSITIONS. The id itself
 * never travels in the error, because a row key is commonly an MRN.
 */
import { gridError, type GridError } from "./errors.js";
import type { RowId } from "./actions.js";

export interface DuplicateReport {
  /** Index of the first row that repeated an identity already seen. */
  readonly firstAt: number;
  /** How many rows in total carried an identity that was not unique. */
  readonly count: number;
}

/**
 * Finds repeated identities.
 *
 * Returns `null` when every id is distinct, which is the case that must stay
 * cheap: one `Set` and one pass, no allocation per row beyond the set entry.
 */
export function findDuplicateIds<TRow>(
  rows: readonly TRow[],
  rowKey: (row: TRow) => RowId,
): DuplicateReport | null {
  const seen = new Set<RowId>();
  let firstAt = -1;
  let count = 0;

  for (let i = 0; i < rows.length; i++) {
    const id = rowKey(rows[i] as TRow);
    if (seen.has(id)) {
      if (firstAt < 0) firstAt = i;
      count++;
      continue;
    }
    seen.add(id);
  }

  return firstAt < 0 ? null : { firstAt, count };
}

/**
 * The error a model publishes for a duplicated identity.
 *
 * `phase: "query"` because it is a property of the set that arrived, not of a
 * render or a write.
 */
export const duplicateIdError = (report: DuplicateReport): GridError =>
  gridError({ code: "duplicate-row-id", phase: "query", rowIndex: report.firstAt });
