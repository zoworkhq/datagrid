// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { createGridRenderer, type GridViewModel } from "./renderer.js";

/**
 * Scroll must be O(window), not O(rows).
 *
 * The browser harness caught this the day it was built: partitioning every row
 * and scanning for the focused row ran on every scroll frame, so p95 frame time
 * went from 9.7 ms at 10k rows to 30 ms at 100k, with every frame dropped.
 *
 * A timing test would be flaky, so this counts WORK instead: how many cells the
 * renderer touches per scroll. That number must not change when the row count
 * grows a hundredfold.
 */

interface P { readonly id: string; readonly name: string }

const model = (n: number): GridViewModel<P> => ({
  columns: [
    { key: "name", header: "Patient" },
    { key: "id", header: "MRN" },
  ],
  rows: Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    row: { id: `p${i}`, name: `Patient ${i}` },
    index: i,
  })),
  total: n,
  sort: [],
  selection: [],
  focus: null,
});

let host: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.append(host);
});

/**
 * Counts how many times the renderer READS FROM THE ROW ARRAY.
 *
 * Counting rendered cells is not enough — it stays O(window) even when paint
 * scans every row internally, which is exactly how the original bug hid. A
 * proxy over the array counts index reads, so any full scan shows up whether
 * or not it produces a cell.
 */
function rowReadsWhileScrolling(rows: number, steps = 10): number {
  let reads = 0;
  const base = model(rows);
  const counted = new Proxy(base.rows as unknown as object, {
    get(target, key, receiver) {
      if (typeof key === "string" && /^\d+$/.test(key)) reads++;
      return Reflect.get(target, key, receiver);
    },
  }) as typeof base.rows;

  const r = createGridRenderer<P>(host, {
    label: "Patient roster",
    onAction: () => {},
    rowHeight: 40,
    overscan: 4,
    fallback: (row, key) => ({ kind: "text", text: String(row[key as keyof P]) }),
  });
  const viewport = host.querySelector<HTMLElement>(".oxg-viewport") as HTMLElement;
  Object.defineProperty(viewport, "clientHeight", { value: 600, configurable: true });
  r.render({ ...base, rows: counted });

  reads = 0; // measure the scrolling, not the first paint
  for (let i = 1; i <= steps; i++) {
    viewport.scrollTop = i * 400;
    viewport.dispatchEvent(new Event("scroll"));
  }
  r.destroy();
  host.textContent = "";
  return reads;
}

describe("scroll cost does not scale with row count", () => {
  it("reads the same number of rows while scrolling at 1,000 and at 100,000", () => {
    // Not "similar" — identical. The window is the same size either way, and a
    // single full scan of 100,000 rows would make these differ by a hundredfold.
    const small = rowReadsWhileScrolling(1_000);
    const large = rowReadsWhileScrolling(100_000);
    expect(small).toBeGreaterThan(0);
    expect(large).toBe(small);
  });

  it("reads only a window's worth of rows per scroll step", () => {
    // 600px viewport at 40px rows is ~15 visible plus 8 overscan. Anything near
    // the row count means a scan crept back into the paint path.
    expect(rowReadsWhileScrolling(100_000, 1)).toBeLessThan(120);
  });

  it("keeps the rendered node count flat as rows grow", () => {
    for (const n of [1_000, 100_000]) {
      const r = createGridRenderer<P>(host, {
        label: "g",
        onAction: () => {},
        rowHeight: 40,
        fallback: (row, key) => ({ kind: "text", text: String(row[key as keyof P]) }),
      });
      const viewport = host.querySelector<HTMLElement>(".oxg-viewport") as HTMLElement;
      Object.defineProperty(viewport, "clientHeight", { value: 600, configurable: true });
      r.render(model(n));
      expect(host.querySelectorAll('.oxg-body [role="row"]').length, `${n} rows`).toBeLessThan(40);
      r.destroy();
      host.textContent = "";
    }
  });
});
