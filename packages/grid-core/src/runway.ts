/**
 * Making a windowed row model renderable.
 *
 * ── THE GAP THIS CLOSES ─────────────────────────────────────────────────────
 *
 * `createBlockRowModel` publishes only the window the viewport declared. The
 * DOM renderer takes its geometry from the LENGTH OF THE ROW LIST it is handed.
 * Hand it the window and you get a grid exactly one window tall: it cannot be
 * scrolled, so it never asks for the next page, so it stays one window tall.
 *
 * The application closes that gap, and this is the closing of it — a list as
 * long as what has arrived plus one page of runway, with a typed loading row
 * wherever nothing has arrived yet. Memory does not grow: the loading rows are
 * two fields each, and the real ones are still bounded by `maxBlocks`.
 *
 * ── THE TWO MISTAKES IT EXISTS TO PREVENT ───────────────────────────────────
 *
 * Both were made writing the FHIR panel by hand, and neither announces itself:
 *
 * 1 · A RANGE THAT REACHES PAST THE RUNWAY. The runway is one page beyond what
 *     has arrived, so a range inside it can only ever need the NEXT block —
 *     which is the one a cursor source can reach. Ask past it and the source
 *     refuses, correctly, and the grid stalls one page short of where it was
 *     going with no way to recover. It stopped dead after a single page on a
 *     viewport 289px tall and not on one 340px tall, which is as arbitrary as
 *     it sounds.
 *
 * 2 · A HIGH-WATER MARK THAT GOES BACKWARDS. The model publishes only the
 *     declared window, so a scroll into rows that have not arrived shrinks the
 *     runway back under the viewport and strands the grid where it stands.
 *
 * The range is HALF-OPEN, `[start, end)`, and `end === start` means "nothing
 * wanted" — the block model loads nothing for it, which looks exactly like a
 * source that refused.
 */
import type { ModelRow, RowModelResult } from "./row-model.js";
import { isLoadingRow, type LoadingRow } from "./block-model.js";

export interface RunwayOptions {
  /** Rows per page. The runway extends one page past what has arrived. */
  readonly pageSize: number;
  /**
   * Pages of runway to keep below the last row that arrived.
   *
   * One is the safe maximum for a CURSOR source: two pages of runway lets the
   * viewport reach a block whose cursor has not been handed over yet. Raise it
   * only for an offset source, which can seek.
   */
  readonly pagesAhead?: number;
}

export interface Runway<TRow> {
  /**
   * Folds a published result into the list to render.
   *
   * Rows land at their ABSOLUTE index; everything else is a typed loading row,
   * so an empty grid never reads as "no patients" when it means "wait".
   */
  absorb(result: RowModelResult<TRow>): readonly ModelRow<TRow | LoadingRow>[];
  /**
   * The range to declare next, clamped so it can only need the next block.
   *
   * `firstVisible` and `visibleCount` are in rows. Both are clamped, and the
   * result is never empty — an empty range is indistinguishable from a refusal.
   */
  rangeFor(firstVisible: number, visibleCount: number): { readonly start: number; readonly end: number };
  /** How many rows the grid currently has, real and pending together. */
  readonly length: number;
  /** The highest index that has actually arrived. Only ever grows. */
  readonly arrived: number;
}

export function createRunway<TRow>(options: RunwayOptions): Runway<TRow> {
  const page = Math.max(1, Math.floor(options.pageSize));
  const ahead = Math.max(1, Math.floor(options.pagesAhead ?? 1)) * page;

  let arrived = 0;
  let length = page * 2;
  /** Set once the source states a total; the runway stops guessing then. */
  let known: number | null = null;

  return {
    absorb(result) {
      for (const row of result.rows) {
        if (!isLoadingRow(row.row)) arrived = Math.max(arrived, row.index + 1);
      }
      if (result.total !== "unknown") known = result.total;

      // A stated total wins outright. Until there is one the runway only ever
      // grows, because it is derived from a high-water mark that only grows.
      length = known ?? Math.max(length, arrived + ahead);

      const byIndex = new Map(result.rows.map((row) => [row.index, row]));
      return Array.from({ length }, (_, index) => {
        const held = byIndex.get(index);
        if (held) return held as ModelRow<TRow | LoadingRow>;
        // The id is namespaced so it cannot collide with a real row id, and is
        // stable per index so the renderer recycles the same node for it.
        return { id: `oxg-loading-${index}`, row: { loading: true, index } as LoadingRow, index };
      });
    },

    rangeFor(firstVisible, visibleCount) {
      const ceiling = Math.max(1, length);
      const start = Math.max(0, Math.min(Math.floor(firstVisible), ceiling - 1));
      const end = Math.max(start + 1, Math.min(start + Math.max(1, Math.ceil(visibleCount)), ceiling));
      return { start, end };
    },

    get length() {
      return length;
    },
    get arrived() {
      return arrived;
    },
  };
}
