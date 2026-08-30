import { describe, expect, it } from "vitest";
import { createRunway } from "./runway.js";
import { isLoadingRow } from "./block-model.js";
import { arraySource } from "./query.js";
import { createBlockRowModel } from "./block-model.js";
import { resultOf, type ModelRow, type RowModelResult } from "./row-model.js";

interface P { readonly id: string; readonly n: number }

const row = (index: number): ModelRow<P> => ({ id: `p${index}`, row: { id: `p${index}`, n: index }, index });

/** A published window, as `createBlockRowModel` would emit one. */
const window_ = (from: number, to: number, over: Partial<RowModelResult<P>> = {}): RowModelResult<P> => {
  const rows: ModelRow<P>[] = [];
  for (let i = from; i < to; i++) rows.push(row(i));
  return { ...resultOf<P>(rows, { total: "unknown", loading: false, errors: [] }), ...over };
};

const realIndices = (rows: readonly ModelRow<unknown>[]): number[] =>
  rows.filter((r) => !isLoadingRow(r.row)).map((r) => r.index);

describe("the runway", () => {
  it("is one page past what has arrived, so the grid can be scrolled at all", () => {
    // Handed the window, the renderer builds a grid exactly one window tall:
    // it cannot scroll, so it never asks for the next page, so it stays that
    // tall. This is the whole reason the helper exists.
    const r = createRunway<P>({ pageSize: 25 });
    const rows = r.absorb(window_(0, 25));
    expect(rows).toHaveLength(50);
    expect(r.arrived).toBe(25);
  });

  it("fills every gap with a typed loading row, never a blank", () => {
    const r = createRunway<P>({ pageSize: 10 });
    const rows = r.absorb(window_(0, 10));
    expect(realIndices(rows)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const pending = rows.filter((x) => isLoadingRow(x.row));
    expect(pending).toHaveLength(10);
    // An empty grid must never read as "no patients" when it means "wait".
    expect(pending.every((x) => (x.row as { loading: true }).loading === true)).toBe(true);
  });

  it("puts every row at its ABSOLUTE index, not its position in the window", () => {
    const r = createRunway<P>({ pageSize: 10 });
    r.absorb(window_(0, 10));
    const rows = r.absorb(window_(20, 30));
    expect(rows[20]?.id).toBe("p20");
    expect(rows[29]?.id).toBe("p29");
    expect(isLoadingRow(rows[15]?.row)).toBe(true);
  });

  it("gives a pending row a stable id, so its node is recycled and not rebuilt", () => {
    const r = createRunway<P>({ pageSize: 10 });
    const first = r.absorb(window_(0, 10));
    const again = r.absorb(window_(0, 10));
    expect(first[15]?.id).toBe(again[15]?.id);
  });

  it("gives a pending row an id that cannot collide with a real one", () => {
    const r = createRunway<P>({ pageSize: 4 });
    const rows = r.absorb(window_(0, 4));
    const real = new Set(realIndices(rows).map((i) => `p${i}`));
    for (const x of rows) if (isLoadingRow(x.row)) expect(real.has(x.id)).toBe(false);
  });

  describe("the high-water mark only ever grows", () => {
    it("does not shrink when the window moves into rows that have not arrived", () => {
      // The model publishes only the declared window. Deriving the runway from
      // that window shrinks it back under the viewport and strands the grid.
      const r = createRunway<P>({ pageSize: 25 });
      r.absorb(window_(0, 50));
      expect(r.length).toBe(75);

      const rows = r.absorb(window_(60, 70, { rows: [] } as Partial<RowModelResult<P>>));
      expect(r.arrived).toBe(50);
      expect(r.length).toBe(75);
      expect(rows).toHaveLength(75);
    });

    it("does not shrink when a window arrives entirely as loading rows", () => {
      const r = createRunway<P>({ pageSize: 20 });
      r.absorb(window_(0, 20));
      const before = r.length;
      const loadingOnly = resultOf<P>(
        [{ id: "l", row: { loading: true, index: 30 } as unknown as P, index: 30 }],
        { total: "unknown", loading: true, errors: [] },
      );
      r.absorb(loadingOnly);
      expect(r.length).toBe(before);
      expect(r.arrived).toBe(20);
    });
  });

  describe("a stated total ends the guessing", () => {
    it("takes the total the moment a source gives one", () => {
      const r = createRunway<P>({ pageSize: 25 });
      r.absorb(window_(0, 25));
      expect(r.length).toBe(50);
      const rows = r.absorb(window_(0, 25, { total: 31 }));
      expect(r.length).toBe(31);
      expect(rows).toHaveLength(31);
    });

    it("shrinks to a total smaller than the runway it had guessed", () => {
      // The guess is a runway, not a claim. A server that says 30 is right and
      // the guess of 50 was always provisional.
      const r = createRunway<P>({ pageSize: 25 });
      r.absorb(window_(0, 25));
      r.absorb(window_(0, 25, { total: 30 }));
      expect(r.length).toBe(30);
    });

    it("keeps the total once stated, even if a later page omits it", () => {
      const r = createRunway<P>({ pageSize: 10 });
      r.absorb(window_(0, 10, { total: 42 }));
      r.absorb(window_(10, 20));
      expect(r.length).toBe(42);
    });
  });

  describe("rangeFor", () => {
    it("is half-open, and never empty", () => {
      // `end === start` means "nothing wanted": the block model loads nothing
      // for it, which looks exactly like a source that refused.
      const r = createRunway<P>({ pageSize: 25 });
      r.absorb(window_(0, 25));
      for (const [first, count] of [[0, 0], [10, 0], [49, 0], [49, 1], [0, 1]] as const) {
        const range = r.rangeFor(first, count);
        expect(range.end).toBeGreaterThan(range.start);
      }
    });

    it("never reaches past the runway, whatever the viewport asks for", () => {
      // Asking past it asks for a block whose cursor has not arrived. The
      // source refuses, correctly, and the grid stalls one page short.
      const r = createRunway<P>({ pageSize: 25 });
      r.absorb(window_(0, 25)); // runway 50
      const range = r.rangeFor(9_999, 40);
      expect(range.start).toBeLessThan(50);
      expect(range.end).toBeLessThanOrEqual(50);
    });

    it("clamps a negative or fractional scroll position", () => {
      const r = createRunway<P>({ pageSize: 10 });
      r.absorb(window_(0, 10));
      expect(r.rangeFor(-5, 4)).toEqual({ start: 0, end: 4 });
      expect(r.rangeFor(2.7, 3.2)).toEqual({ start: 2, end: 6 });
    });

    it("asks for a real span before anything has arrived at all", () => {
      const r = createRunway<P>({ pageSize: 25 });
      const range = r.rangeFor(0, 10);
      expect(range).toEqual({ start: 0, end: 10 });
    });

    /**
     * The regression that motivated the clamp.
     *
     * Paging stopped dead after a single page on a viewport 289px tall and not
     * on one 340px tall. The cause was a range that reached past the runway
     * into a block whose cursor had not been handed over.
     */
    it("only ever needs the NEXT block, at every viewport height", () => {
      const PAGE = 25;
      for (const visible of [1, 4, 7, 9, 12, 20, 33, 60]) {
        const r = createRunway<P>({ pageSize: PAGE });
        let loaded = 0;
        // Walk to the bottom repeatedly, the way an infinite scroll does.
        for (let step = 0; step < 12; step++) {
          r.absorb(window_(0, loaded));
          const range = r.rangeFor(Math.max(0, r.length - visible), visible);
          const highestBlock = Math.floor((range.end - 1) / PAGE);
          const reachable = Math.floor(Math.max(0, loaded - 1) / PAGE) + 1;
          expect(
            highestBlock,
            `visible=${visible} loaded=${loaded} asked for block ${highestBlock}, only ${reachable} is reachable`,
          ).toBeLessThanOrEqual(reachable);
          loaded = Math.min(loaded + PAGE, (reachable + 1) * PAGE);
        }
      }
    });
  });

  describe("against the real block model", () => {
    it("pages all the way through a source, one block at a time", async () => {
      const ROWS = 240;
      const PAGE = 25;
      const rows: P[] = Array.from({ length: ROWS }, (_, i) => ({ id: `p${i}`, n: i }));
      const model = createBlockRowModel<P>({
        dataSource: arraySource(rows),
        rowKey: (r) => r.id,
        blockSize: PAGE,
        maxBlocks: 4,
      });
      const runway = createRunway<P>({ pageSize: PAGE });

      const settle = () => new Promise((r) => setTimeout(r, 0));
      let list = runway.absorb(model.result());
      model.setRange(0, PAGE);
      await settle();

      // Twelve passes is more than the ten blocks the source holds.
      for (let step = 0; step < 12; step++) {
        list = runway.absorb(model.result());
        const range = runway.rangeFor(Math.max(0, runway.length - 8), 8);
        model.setRange(range.start, range.end);
        await settle();
      }
      list = runway.absorb(model.result());

      // `arraySource` reports an exact total, so the runway ends at it.
      expect(runway.length).toBe(ROWS);
      expect(list).toHaveLength(ROWS);
      // Blocks are still capped: this never became "load everything".
      expect(model.resident).toBeLessThanOrEqual(4);
      model.destroy();
    });

    it("never asks a block model for an empty range", async () => {
      const model = createBlockRowModel<P>({
        dataSource: arraySource(Array.from({ length: 100 }, (_, i) => ({ id: `p${i}`, n: i }))),
        rowKey: (r) => r.id,
        blockSize: 10,
      });
      const runway = createRunway<P>({ pageSize: 10 });
      const asked: { start: number; end: number }[] = [];
      const spy = { setRange: (s: number, e: number) => { asked.push({ start: s, end: e }); model.setRange(s, e); } };

      runway.absorb(model.result());
      for (const [first, count] of [[0, 0], [0, 5], [999, 3], [-4, 2]] as const) {
        const range = runway.rangeFor(first, count);
        spy.setRange(range.start, range.end);
        await new Promise((r) => setTimeout(r, 0));
        runway.absorb(model.result());
      }
      expect(asked.every((a) => a.end > a.start)).toBe(true);
      model.destroy();
    });
  });

  describe("degenerate inputs", () => {
    it("survives a page size of zero or a fraction", () => {
      for (const pageSize of [0, -5, 0.4]) {
        const r = createRunway<P>({ pageSize });
        expect(r.length).toBeGreaterThan(0);
        const range = r.rangeFor(0, 5);
        expect(range.end).toBeGreaterThan(range.start);
      }
    });

    it("handles a source that reports a total of zero", () => {
      const r = createRunway<P>({ pageSize: 25 });
      const rows = r.absorb(resultOf<P>([], { total: 0, loading: false, errors: [] }));
      expect(rows).toHaveLength(0);
      expect(r.length).toBe(0);
      // …and still hands back a usable range rather than an empty one.
      const range = r.rangeFor(0, 10);
      expect(range.end).toBeGreaterThan(range.start);
    });

    it("ignores pagesAhead below one, which would freeze the runway", () => {
      const r = createRunway<P>({ pageSize: 10, pagesAhead: 0 });
      r.absorb(window_(0, 10));
      expect(r.length).toBeGreaterThan(10);
    });

    it("extends further when told to, for a source that can seek", () => {
      const r = createRunway<P>({ pageSize: 10, pagesAhead: 3 });
      r.absorb(window_(0, 10));
      expect(r.length).toBe(40);
    });
  });
});
