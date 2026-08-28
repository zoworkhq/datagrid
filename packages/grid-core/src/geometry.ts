/**
 * Virtualisation geometry — pure arithmetic, no DOM.
 *
 * The split is deliberate: geometry lives here so it is property-testable at
 * 40,000 rows with no renderer, and `grid-dom` measures. The core computes
 * positions from heights it is *told*; it never touches a node.
 *
 * Rows have an estimated height until they are measured. A measured row
 * contributes a *delta* from the estimate, held in a Fenwick tree so that the
 * offset of any row is O(log n) rather than a scan — which is what makes
 * scroll anchoring across dynamic heights affordable at all.
 */

/** Prefix sums with O(log n) point update. The only clever data structure in the engine. */
class DeltaTree {
  private t: number[];
  constructor(private n: number) {
    this.t = new Array<number>(n + 1).fill(0);
  }
  add(index: number, delta: number): void {
    for (let k = index + 1; k <= this.n; k += k & -k) this.t[k] = (this.t[k] ?? 0) + delta;
  }
  /** Sum of deltas over `[0, count)`. */
  prefix(count: number): number {
    let s = 0;
    for (let k = Math.min(count, this.n); k > 0; k -= k & -k) s += this.t[k] ?? 0;
    return s;
  }
  get size(): number {
    return this.n;
  }
}

export interface RowWindow {
  /** First row to render, inclusive. Includes overscan. */
  readonly start: number;
  /** Last row to render, exclusive. Includes overscan. */
  readonly end: number;
  /** Pixel offset of `start` from the top of the scrollable content. */
  readonly offsetTop: number;
  /** Height of everything, so the scrollbar is the right size. */
  readonly totalHeight: number;
}

export interface Geometry {
  setRowCount(count: number): void;
  /** Records a measured height. Returns the delta this applied, for anchoring. */
  measure(index: number, height: number): number;
  offsetOf(index: number): number;
  heightOf(index: number): number;
  totalHeight(): number;
  /** The first row whose span contains `offset`. Clamped to the row range. */
  indexAt(offset: number): number;
  windowFor(scrollTop: number, viewportHeight: number, overscan?: number): RowWindow;
  /**
   * How much `scrollTop` must change so the anchor row stays visually still
   * after a re-measure. Zero when the change was below the anchor.
   */
  anchorShift(anchorIndex: number, changedIndex: number, delta: number): number;
  reset(): void;
}

export function createGeometry(rowCount: number, estimate: number): Geometry {
  if (estimate <= 0) throw new Error("row height estimate must be positive");

  let count = rowCount;
  let tree = new DeltaTree(count);
  const measured = new Map<number, number>();

  const offsetOf = (index: number): number => {
    const i = Math.max(0, Math.min(index, count));
    return i * estimate + tree.prefix(i);
  };

  const heightOf = (index: number): number => measured.get(index) ?? estimate;
  const totalHeight = (): number => count * estimate + tree.prefix(count);

  const indexAt = (offset: number): number => {
    if (count === 0) return 0;
    if (offset <= 0) return 0;
    // Offsets are monotonically increasing in the index, so binary search is
    // valid even with arbitrary per-row heights.
    let lo = 0;
    let hi = count - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (offsetOf(mid) <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };

  return {
    setRowCount(next) {
      if (next === count) return;
      count = next;
      // Measurements past the new end are meaningless; those before it survive,
      // because a row that kept its identity kept its height.
      const kept = [...measured].filter(([i]) => i < next);
      measured.clear();
      tree = new DeltaTree(next);
      for (const [i, h] of kept) {
        measured.set(i, h);
        tree.add(i, h - estimate);
      }
    },

    measure(index, height) {
      if (index < 0 || index >= count) return 0;
      const previous = measured.get(index) ?? estimate;
      const delta = height - previous;
      if (delta === 0) return 0;
      measured.set(index, height);
      tree.add(index, delta);
      return delta;
    },

    offsetOf,
    heightOf,
    totalHeight,
    indexAt,

    windowFor(scrollTop, viewportHeight, overscan = 4) {
      if (count === 0) return { start: 0, end: 0, offsetTop: 0, totalHeight: 0 };
      const first = indexAt(Math.max(0, scrollTop));
      let last = first;
      const limit = scrollTop + viewportHeight;
      while (last < count - 1 && offsetOf(last + 1) < limit) last++;

      const start = Math.max(0, first - overscan);
      const end = Math.min(count, last + 1 + overscan);
      return { start, end, offsetTop: offsetOf(start), totalHeight: totalHeight() };
    },

    anchorShift(anchorIndex, changedIndex, delta) {
      // A row that grew *above* the anchor pushes the anchor down the page, so
      // scrollTop must grow by the same amount to hold it still. A row that
      // changed below the anchor moves nothing the reader can see.
      return changedIndex < anchorIndex ? delta : 0;
    },

    reset() {
      measured.clear();
      tree = new DeltaTree(count);
    },
  };
}
