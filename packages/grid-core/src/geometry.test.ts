import { describe, expect, it } from "vitest";
import { createGeometry } from "./geometry.js";

describe("geometry", () => {
  it("places uniform rows at estimate multiples", () => {
    const g = createGeometry(1000, 40);
    expect(g.offsetOf(0)).toBe(0);
    expect(g.offsetOf(10)).toBe(400);
    expect(g.totalHeight()).toBe(40_000);
  });

  it("accounts for a measured row in everything below it", () => {
    const g = createGeometry(100, 40);
    g.measure(5, 100); // +60
    expect(g.offsetOf(5)).toBe(200); // unchanged: rows above it did not move
    expect(g.offsetOf(6)).toBe(300); // 200 + 100
    expect(g.totalHeight()).toBe(100 * 40 + 60);
  });

  it("re-measuring the same row applies only the difference", () => {
    const g = createGeometry(100, 40);
    expect(g.measure(5, 100)).toBe(60);
    expect(g.measure(5, 70)).toBe(-30);
    expect(g.totalHeight()).toBe(100 * 40 + 30);
    expect(g.measure(5, 70)).toBe(0);
  });

  it("finds the row at an offset, including exactly on a boundary", () => {
    const g = createGeometry(100, 40);
    expect(g.indexAt(0)).toBe(0);
    expect(g.indexAt(39)).toBe(0);
    expect(g.indexAt(40)).toBe(1);
    expect(g.indexAt(-10)).toBe(0);
    expect(g.indexAt(1e9)).toBe(99);
  });

  it("round-trips index -> offset -> index at 40,000 rows with mixed heights", () => {
    const g = createGeometry(40_000, 32);
    for (let i = 0; i < 40_000; i += 7) g.measure(i, 32 + (i % 11) * 6);
    for (const i of [0, 1, 999, 19_997, 19_998, 33_333, 39_999]) {
      expect(g.indexAt(g.offsetOf(i))).toBe(i);
    }
  });

  it("keeps offsets monotonically increasing after arbitrary measurement", () => {
    const g = createGeometry(5_000, 30);
    for (let i = 0; i < 5_000; i += 3) g.measure(i, 10 + ((i * 37) % 90));
    let previous = -1;
    for (let i = 0; i < 5_000; i++) {
      const o = g.offsetOf(i);
      expect(o).toBeGreaterThan(previous);
      previous = o;
    }
    expect(g.offsetOf(5_000)).toBe(g.totalHeight());
  });

  it("windows the viewport with overscan on both sides", () => {
    const g = createGeometry(1_000, 40);
    const w = g.windowFor(400, 200, 2);
    expect(w.start).toBe(8); // first visible is 10, minus 2 overscan
    expect(w.end).toBeGreaterThanOrEqual(15);
    expect(w.offsetTop).toBe(320);
    expect(w.totalHeight).toBe(40_000);
  });

  it("renders a window, not the whole set", () => {
    const g = createGeometry(40_000, 32);
    const w = g.windowFor(320_000, 800, 4);
    expect(w.end - w.start).toBeLessThan(40); // ~25 visible + overscan
  });

  it("clamps the window at both ends", () => {
    const g = createGeometry(20, 40);
    expect(g.windowFor(0, 100, 4).start).toBe(0);
    expect(g.windowFor(1e6, 100, 4).end).toBe(20);
  });

  it("handles an empty grid", () => {
    const g = createGeometry(0, 40);
    expect(g.windowFor(0, 500)).toEqual({ start: 0, end: 0, offsetTop: 0, totalHeight: 0 });
  });

  describe("scroll anchoring", () => {
    it("shifts scrollTop when a row above the anchor changes height", () => {
      // The anchor row must not move under the reader's eye. This is the
      // hardest single problem in the component and the one most likely to be
      // subtly wrong for months.
      const g = createGeometry(1_000, 40);
      expect(g.anchorShift(100, 50, 60)).toBe(60);
      expect(g.anchorShift(100, 50, -20)).toBe(-20);
    });

    it("does not shift when the change is at or below the anchor", () => {
      const g = createGeometry(1_000, 40);
      expect(g.anchorShift(100, 100, 60)).toBe(0);
      expect(g.anchorShift(100, 400, 60)).toBe(0);
    });

    it("holds the anchor still across a real re-measure", () => {
      const g = createGeometry(1_000, 40);
      const anchor = 100;
      let scrollTop = g.offsetOf(anchor); // anchor sits at the top of the viewport
      const before = g.offsetOf(anchor) - scrollTop;

      const delta = g.measure(50, 140); // a row above the anchor grew
      scrollTop += g.anchorShift(anchor, 50, delta);

      expect(g.offsetOf(anchor) - scrollTop).toBe(before); // visually unmoved
    });
  });

  it("keeps measurements below a new row count and drops those past it", () => {
    const g = createGeometry(100, 40);
    g.measure(5, 100);
    g.measure(90, 100);
    g.setRowCount(50);
    expect(g.heightOf(5)).toBe(100); // a row that kept its identity kept its height
    expect(g.totalHeight()).toBe(50 * 40 + 60); // row 90 is gone
  });

  it("rejects a non-positive estimate rather than dividing by zero later", () => {
    expect(() => createGeometry(10, 0)).toThrow();
  });
});
