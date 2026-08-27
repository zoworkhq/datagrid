import { describe, expect, it } from "vitest";
import { moveFocus, resolveFocus, type GridShape } from "./focus.js";

const shape = (rows: number, cols: number): GridShape => ({
  rowIds: Array.from({ length: rows }, (_, i) => `r${i}`),
  columnKeys: Array.from({ length: cols }, (_, i) => `c${i}`),
});

describe("focus movement", () => {
  const s = shape(5, 3);

  it("enters at the first cell", () => {
    expect(moveFocus(s, null, "right")).toEqual({ rowId: "r0", columnKey: "c0" });
  });

  it("never wraps at an edge -- arrowing right on the last column stays in the row", () => {
    // A clinician tracking a value across a row must not silently change row.
    expect(moveFocus(s, { rowId: "r2", columnKey: "c2" }, "right")).toEqual({ rowId: "r2", columnKey: "c2" });
    expect(moveFocus(s, { rowId: "r0", columnKey: "c0" }, "left")).toEqual({ rowId: "r0", columnKey: "c0" });
    expect(moveFocus(s, { rowId: "r0", columnKey: "c1" }, "up")).toEqual({ rowId: "r0", columnKey: "c1" });
    expect(moveFocus(s, { rowId: "r4", columnKey: "c1" }, "down")).toEqual({ rowId: "r4", columnKey: "c1" });
  });

  it("clamps a page move rather than overshooting", () => {
    expect(moveFocus(s, { rowId: "r1", columnKey: "c0" }, "pageDown", 20)).toEqual({ rowId: "r4", columnKey: "c0" });
    expect(moveFocus(s, { rowId: "r3", columnKey: "c0" }, "pageUp", 20)).toEqual({ rowId: "r0", columnKey: "c0" });
  });

  it("recovers when the focused row has left the view", () => {
    // A filter changed under the user, or a column was hidden. Focus must not
    // be lost to the document body -- the body is one tab stop and something
    // has to hold it.
    expect(moveFocus(s, { rowId: "gone", columnKey: "c1" }, "down")).toEqual({ rowId: "r0", columnKey: "c0" });
    expect(moveFocus(s, { rowId: "r1", columnKey: "gone" }, "down")).toEqual({ rowId: "r0", columnKey: "c0" });
  });

  it("returns null only for an empty grid", () => {
    expect(moveFocus(shape(0, 3), null, "down")).toBeNull();
    expect(moveFocus(shape(5, 0), null, "down")).toBeNull();
  });

  it("holds at 40,000 rows -- every move stays in bounds", () => {
    const big = shape(40_000, 40);
    let cur = moveFocus(big, null, "down");
    const moves = ["down", "down", "right", "pageDown", "columnBottom", "right", "gridEnd", "gridStart"] as const;
    for (const m of moves) {
      cur = moveFocus(big, cur, m);
      expect(cur).not.toBeNull();
      expect(big.rowIds).toContain(cur?.rowId);
      expect(big.columnKeys).toContain(cur?.columnKey);
    }
    expect(moveFocus(big, cur, "columnBottom")).toEqual({ rowId: "r39999", columnKey: "c0" });
  });
});

describe("resolveFocus", () => {
  it("keeps a still-valid target", () => {
    expect(resolveFocus(shape(3, 2), { rowId: "r1", columnKey: "c1" })).toEqual({ rowId: "r1", columnKey: "c1" });
  });
  it("falls back to the first cell when the target has gone", () => {
    expect(resolveFocus(shape(3, 2), { rowId: "r9", columnKey: "c1" })).toEqual({ rowId: "r0", columnKey: "c0" });
  });
});
