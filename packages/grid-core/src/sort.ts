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
 *     range — and an incomparable PAIR is not ordered against each other.
 *
 * ── WHAT "REFUSES" DOES AND DOES NOT MEAN HERE ──────────────────────────────
 *
 * This docstring used to claim an incomparable pair "sorts to the end in
 * source order". It does not, and could not: `"incomparable"` is a property of
 * a PAIR, and "sorts to the end" is a property of a ROW. Deriving the second
 * from the first needs every pair — O(n²) — and every cheaper rule is a
 * heuristic, which is not a thing to put under a worklist.
 *
 * What actually happens: an incomparable pair falls through to the next sort
 * key, and finally to the source-index tiebreak. So the rows are not ordered
 * BY that column, and they keep source order relative to each other — but they
 * are not gathered at the end, and because a comparator that returns
 * `"incomparable"` is not a total order, their exact positions depend on the
 * sort's pivot choices.
 *
 * If you want "absent last, source order" — which is usually what a clinician
 * means — that IS available, from `sort-index.ts`. It can offer it precisely
 * because it works from VALUES rather than from pairwise comparisons: absence
 * is visible per row, so it can be placed. Use `createSortIndex` for a column
 * whose absences should gather.
 *
 * The two therefore order a column with absences differently, on purpose. That
 * divergence is tested in `sort-index.test.ts` so it stays a decision rather
 * than becoming a surprise.
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
