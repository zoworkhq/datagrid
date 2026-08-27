/**
 * Sorting.
 *
 * Two properties the tests hold us to, because both are how a clinical list
 * silently misleads:
 *
 *   - **Stable.** Equal rows keep their relative order, so toggling a second
 *     sort key does not reshuffle the rows the first key tied.
 *   - **Refuses rather than coerces.** A comparator may return
 *     `"incomparable"` — a quantity with no unit, a value with no reference
 *     range — and an incomparable pair sorts to the end in source order rather
 *     than being ordered by accident.
 */
import type { SortSpec } from "./query.js";

export type Comparator<TRow> = (a: TRow, b: TRow) => number | "incomparable";

export interface SortResult<TRow> {
  readonly rows: readonly TRow[];
  /** Rows the comparators refused to order. They keep source order, at the end. */
  readonly incomparable: number;
}

/**
 * A stable multi-key sort.
 *
 * Implemented by decorating with the source index and using it as the final
 * tiebreak — `Array.prototype.sort` is specified stable in ES2019, but the
 * explicit index also gives us a deterministic answer for incomparable pairs,
 * which stability alone does not.
 */
export function sortRows<TRow>(
  rows: readonly TRow[],
  sort: readonly SortSpec[],
  comparators: Readonly<Record<string, Comparator<TRow>>>,
): SortResult<TRow> {
  if (sort.length === 0) return { rows, incomparable: 0 };

  const decorated = rows.map((row, index) => ({ row, index }));
  let incomparable = 0;

  decorated.sort((a, b) => {
    for (const spec of sort) {
      const cmp = comparators[spec.key];
      if (!cmp) continue;
      const r = cmp(a.row, b.row);
      if (r === "incomparable") {
        incomparable++;
        continue;
      }
      if (r !== 0) return spec.direction === "asc" ? r : -r;
    }
    return a.index - b.index; // stable, and deterministic for refusals
  });

  return { rows: decorated.map((d) => d.row), incomparable };
}

/**
 * Toggling cycles asc → desc → none, rather than asc → desc → asc.
 *
 * A two-state toggle makes "no sort" unreachable once a column has been
 * clicked, and the unsorted order is often the source's own clinical ordering.
 */
export function toggleSort(
  current: readonly SortSpec[],
  key: string,
  additive: boolean,
): readonly SortSpec[] {
  const existing = current.find((s) => s.key === key);
  const rest = additive ? current.filter((s) => s.key !== key) : [];

  if (!existing) return [...rest, { key, direction: "asc" }];
  if (existing.direction === "asc") return [...rest, { key, direction: "desc" }];
  return rest;
}
