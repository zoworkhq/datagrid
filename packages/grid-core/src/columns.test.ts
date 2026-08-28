import { describe, expect, it } from "vitest";
import {
  layoutColumns,
  partitionPinned,
  planSpans,
  totalWidth,
  visualOrder,
  type ColumnSpec,
} from "./columns.js";

const keysOf = (specs: readonly { key: string }[]) => specs.map((c) => c.key);

describe("column sizing", () => {
  it("uses a fixed width verbatim", () => {
    const out = layoutColumns([{ key: "a", width: 60 }], { available: 1000 });
    expect(out[0]?.width).toBe(60);
  });

  it("never stretches a fixed column, even with space to spare", () => {
    // A grid that quietly widens a 60px status column is a grid nobody trusts
    // with widths.
    const out = layoutColumns([{ key: "a", width: 60 }, { key: "b", grow: 1 }], { available: 1000 });
    expect(out[0]?.width).toBe(60);
    expect(out[1]?.width).toBe(940);
  });

  it("falls back to a measured intrinsic width", () => {
    const out = layoutColumns([{ key: "a" }], { intrinsic: { a: 210 } });
    expect(out[0]?.width).toBe(210);
  });

  it("clamps a measured width to the column's own bounds", () => {
    const specs: ColumnSpec[] = [{ key: "a", minWidth: 100, maxWidth: 150 }];
    expect(layoutColumns(specs, { intrinsic: { a: 20 } })[0]?.width).toBe(100);
    expect(layoutColumns(specs, { intrinsic: { a: 900 } })[0]?.width).toBe(150);
  });

  it("shares leftover space by weight", () => {
    const out = layoutColumns([{ key: "a", width: 100 }, { key: "b", grow: 1 }, { key: "c", grow: 3 }], {
      available: 500,
    });
    // 500 - 100 - 140 - 140 = 120 to share, 1:3
    expect(out[1]?.width).toBe(170);
    expect(out[2]?.width).toBe(230);
    expect(totalWidth(out)).toBe(500);
  });

  it("does not shrink anything when the columns overflow", () => {
    // Overflow scrolls. Squeezing forty columns into a laptop is how a
    // flowsheet becomes unreadable.
    const out = layoutColumns([{ key: "a", width: 400 }, { key: "b", width: 400 }], { available: 500 });
    expect(totalWidth(out)).toBe(800);
  });

  it("computes offsets in visual order", () => {
    const out = layoutColumns([{ key: "a", width: 100 }, { key: "b", width: 50 }]);
    expect(out.map((c) => c.offset)).toEqual([0, 100]);
  });

  it("holds at a hundred columns", () => {
    const specs = Array.from({ length: 100 }, (_, i) => ({ key: `c${i}`, grow: 1 }));
    const out = layoutColumns(specs, { available: 20_000 });
    expect(out).toHaveLength(100);
    expect(Math.round(totalWidth(out))).toBe(20_000);
  });
});

describe("pinned columns", () => {
  const specs: ColumnSpec[] = [
    { key: "notes" },
    { key: "identity", pinned: "start" },
    { key: "actions", pinned: "end" },
    { key: "ward" },
  ];

  it("orders pinned-start, scrollable, pinned-end", () => {
    expect(keysOf(visualOrder(specs))).toEqual(["identity", "notes", "ward", "actions"]);
  });

  it("keeps the caller's order inside each band", () => {
    // A pinned identity column stays where the recipe put it rather than being
    // re-sorted by pin state.
    const out = layoutColumns(specs, { available: 800 });
    expect(keysOf(out)).toEqual(["identity", "notes", "ward", "actions"]);
    expect(out.map((c) => c.pinned)).toEqual(["start", null, null, "end"]);
  });
});

describe("column spanning", () => {
  const keys = ["a", "b", "c", "d"];

  it("renders one cell per column when nothing spans", () => {
    const plan = planSpans({}, keys, undefined);
    expect(plan.cells.map((c) => `${c.key}:${c.span}`)).toEqual(["a:1", "b:1", "c:1", "d:1"]);
    expect(plan.covered.size).toBe(0);
  });

  it("covers the columns a span swallows so they do not render twice", () => {
    // The masking case: one "withheld under 42 CFR Part 2" notice across three
    // columns instead of the same notice repeated in each.
    const plan = planSpans({}, keys, (_row, key) => (key === "b" ? 3 : 1));
    expect(plan.cells.map((c) => `${c.key}:${c.span}`)).toEqual(["a:1", "b:3"]);
    expect([...plan.covered].sort()).toEqual(["c", "d"]);
  });

  it("clamps a span to the columns that remain", () => {
    // An aria-colspan that runs past the row breaks the announcement of the
    // whole row, not just that cell.
    const plan = planSpans({}, keys, (_row, key) => (key === "c" ? 9 : 1));
    expect(plan.cells.map((c) => `${c.key}:${c.span}`)).toEqual(["a:1", "b:1", "c:2"]);
    expect([...plan.covered]).toEqual(["d"]);
  });

  it("treats a nonsensical span as one column rather than throwing", () => {
    const plan = planSpans({}, keys, () => 0);
    expect(plan.cells.every((c) => c.span === 1)).toBe(true);
  });
});

describe("pinned rows", () => {
  interface R { readonly id: string }
  const rows: R[] = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  const rowKey = (r: R) => r.id;

  it("splits into top, scrollable and bottom, keeping order", () => {
    const out = partitionPinned(rows, rowKey, { top: new Set(["c"]), bottom: new Set(["a"]) });
    expect(out.top.map(rowKey)).toEqual(["c"]);
    expect(out.scrollable.map(rowKey)).toEqual(["b", "d"]);
    expect(out.bottom.map(rowKey)).toEqual(["a"]);
  });

  it("puts everything in the scrollable band when nothing is pinned", () => {
    expect(partitionPinned(rows, rowKey).scrollable).toHaveLength(4);
  });
});
