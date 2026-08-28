// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { createGridRenderer, HEADER_ROW_ID, type GridRenderer, type GridViewModel } from "./renderer.js";

/**
 * Recycling correctness.
 *
 * The catastrophic failure of a recycled virtualiser is a reused node keeping a
 * previous row's content — the grid showing one patient's potassium on another
 * patient's row. It passes every ARIA test, every keyboard test and every axe
 * run. The only thing that catches it is asserting, at every scroll position,
 * that what a row renders matches the row it claims to be.
 */

interface P { readonly id: string; readonly name: string; readonly k: string }

const ROWS = 40_000;
const ROW_H = 40;
const VIEWPORT_H = 600;

const all: P[] = Array.from({ length: ROWS }, (_, i) => ({
  id: `p${i}`,
  name: `Patient ${i}`,
  k: (3 + (i % 30) / 10).toFixed(1),
}));

const model = (over: Partial<GridViewModel<P>> = {}): GridViewModel<P> => ({
  columns: [
    { key: "name", header: "Patient", sortable: true },
    { key: "k", header: "Potassium" },
  ],
  rows: all.map((row, index) => ({ id: row.id, row, index })),
  total: ROWS,
  sort: [],
  selection: [],
  focus: null,
  ...over,
});

let host: HTMLElement;
let r: GridRenderer<P>;
const fallback = (row: P, key: string) => ({ kind: "text" as const, text: String(row[key as keyof P]) });

const viewportEl = () => host.querySelector<HTMLElement>(".oxg-viewport") as HTMLElement;

function scrollTo(px: number): void {
  const v = viewportEl();
  v.scrollTop = px;
  v.dispatchEvent(new Event("scroll"));
}

/** Every rendered row must show its own data. This is the whole point. */
function assertNoCrossContamination(): number {
  const rows = host.querySelectorAll<HTMLElement>('.oxg-body [role="row"]');
  for (const row of rows) {
    const id = row.dataset["rowId"] as string;
    const source = all[Number(id.slice(1))] as P;
    const cells = row.querySelectorAll<HTMLElement>('[role="gridcell"]');
    expect(cells[0]?.textContent).toBe(source.name);
    expect(cells[1]?.textContent).toBe(source.k);
    // And the announced position must match the row it is showing.
    expect(row.getAttribute("aria-rowindex")).toBe(String(Number(id.slice(1)) + 2));
  }
  return rows.length;
}

beforeEach(() => {
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.append(host);
  r = createGridRenderer<P>(host, {
    label: "Patient roster",
    onAction: () => {},
    fallback,
    rowHeight: ROW_H,
    overscan: 4,
  });
  // jsdom performs no layout, so the viewport reports zero height. The
  // virtualiser reads clientHeight; give it one.
  Object.defineProperty(viewportEl(), "clientHeight", { value: VIEWPORT_H, configurable: true });
  r.render(model());
});

describe("windowing", () => {
  it("renders a window, not forty thousand rows", () => {
    const rendered = host.querySelectorAll('.oxg-body [role="row"]').length;
    expect(rendered).toBeGreaterThan(10);
    expect(rendered).toBeLessThan(40); // ~15 visible + 8 overscan
  });

  it("sizes the canvas to the whole set so the scrollbar tells the truth", () => {
    expect(host.querySelector<HTMLElement>(".oxg-canvas")?.style.height).toBe(`${ROWS * ROW_H}px`);
  });

  it("keeps aria-rowcount at the real total, not the window", () => {
    expect(host.querySelector('[role="grid"]')?.getAttribute("aria-rowcount")).toBe(String(ROWS));
  });

  it("positions each row at its true offset", () => {
    scrollTo(400_000);
    const row = host.querySelector<HTMLElement>('.oxg-body [role="row"]') as HTMLElement;
    const index = Number((row.dataset["rowId"] as string).slice(1));
    expect(row.style.top).toBe(`${index * ROW_H}px`);
  });
});

describe("recycling", () => {
  it("never shows one row's data on another row, at any scroll position", () => {
    for (const px of [0, 40, 137, 1_000, 9_999, 400_000, 799_960, 1_599_960, 250_000, 0]) {
      scrollTo(px);
      expect(assertNoCrossContamination()).toBeGreaterThan(0);
    }
  });

  it("survives a long continuous scroll", () => {
    for (let px = 0; px < 20_000; px += 173) {
      scrollTo(px);
      assertNoCrossContamination();
    }
  });

  it("reuses the same DOM nodes rather than creating new ones", () => {
    // The scroll cost of a virtualised grid is nodes entering and leaving, not
    // nodes existing. Glide abandoned DOM virtualisation over exactly this.
    //
    // The pool is allowed to grow by a few: at scrollTop 0 there is no leading
    // overscan, so the first window is genuinely smaller. What must never
    // happen is the pool being rebuilt -- every node that existed before is
    // still one of the nodes after.
    const before = Array.from(host.querySelectorAll('.oxg-body [role="row"]'));
    scrollTo(200_000);
    const after = Array.from(host.querySelectorAll('.oxg-body [role="row"]'));
    for (const node of before) expect(after).toContain(node);
    expect(after.length - before.length).toBeLessThanOrEqual(4); // the leading overscan

    // And it settles: from here, scrolling reuses every node with no churn.
    const settled = Array.from(host.querySelectorAll('.oxg-body [role="row"]'));
    for (const px of [250_000, 900_000, 300_000]) {
      scrollTo(px);
      const now = Array.from(host.querySelectorAll('.oxg-body [role="row"]'));
      expect(now).toEqual(settled);
    }
  });

  it("clears a cell that previously errored when the node is reused", () => {
    // A throwing renderer marks its cell. A recycled node must not inherit
    // that mark, or a healthy row renders as broken.
    const rows = model().rows;
    const boom = new Set(["p0"]);
    const r2 = createGridRenderer<P>(host, {
      label: "g",
      onAction: () => {},
      rowHeight: ROW_H,
      fallback: (row, key) => {
        if (boom.has(row.id)) throw new Error("PHI 4471-882");
        return { kind: "text", text: String(row[key as keyof P]) };
      },
    });
    Object.defineProperty(host.querySelectorAll<HTMLElement>(".oxg-viewport")[1] as HTMLElement, "clientHeight", {
      value: VIEWPORT_H,
      configurable: true,
    });
    r2.render({ ...model(), rows });
    const scroller = host.querySelectorAll<HTMLElement>(".oxg-viewport")[1] as HTMLElement;
    scroller.scrollTop = 200_000;
    scroller.dispatchEvent(new Event("scroll"));
    const errored = host.querySelectorAll('.oxg-body [data-error="1"]');
    expect(errored).toHaveLength(0);
    r2.destroy();
  });
});

describe("focus under virtualisation", () => {
  it("keeps the focused row rendered after scrolling away from it", () => {
    // Otherwise the focused node is recycled, the browser drops focus to the
    // document body, and the one tab stop has nothing to return to.
    r.render(model({ focus: { rowId: "p2", columnKey: "name" } }));
    scrollTo(600_000);
    expect(host.querySelector('[data-row-id="p2"]')).not.toBeNull();
    expect(host.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
  });

  it("scrolls a keyboard move into view", () => {
    r.render(model({ focus: { rowId: "p0", columnKey: "name" } }));
    const grid = host.querySelector('[role="grid"]') as HTMLElement;
    for (let i = 0; i < 30; i++) {
      grid.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    }
    expect(viewportEl().scrollTop).toBeGreaterThan(0);
  });

  it("still has exactly one tab stop after scrolling", () => {
    scrollTo(300_000);
    expect(host.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
  });

  it("puts the tab stop on the header when focus is there", () => {
    r.render(model({ focus: { rowId: HEADER_ROW_ID, columnKey: "k" } }));
    const tabbable = host.querySelector('[tabindex="0"]') as HTMLElement;
    expect(tabbable.getAttribute("role")).toBe("columnheader");
  });
});

describe("scroll anchoring", () => {
  it("holds the anchor row still when a row above it grows", () => {
    scrollTo(40_000); // row 1000 at the top
    const before = viewportEl().scrollTop;
    r.measureRow(500, 140); // a row above the anchor grew by 100
    expect(viewportEl().scrollTop).toBe(before + 100);
  });

  it("does not move when a row below the anchor changes", () => {
    scrollTo(40_000);
    const before = viewportEl().scrollTop;
    r.measureRow(2_000, 140);
    expect(viewportEl().scrollTop).toBe(before);
  });

  it("re-measuring to the same height changes nothing", () => {
    scrollTo(40_000);
    const before = viewportEl().scrollTop;
    r.measureRow(500, 140);
    const after = viewportEl().scrollTop;
    r.measureRow(500, 140);
    expect(viewportEl().scrollTop).toBe(after);
    expect(after).not.toBe(before);
  });
});
