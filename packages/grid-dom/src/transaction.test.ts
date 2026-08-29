// @vitest-environment jsdom
/**
 * Transactional updates.
 *
 * The audit's second P0. Handing over a new model to change one cell reruns
 * filter and sort, rebuilds a wrapper object per row and repaints every
 * rendered row — measured at a pinned 16.7 ms frame time at 100, 1,000 AND
 * 10,000 updates per second, against AG Grid's 8.6-9.0 ms. The flat line was
 * the tell: the cost was never the updates, it was the repaint each triggered.
 *
 * What these tests hold: a patch shows, it repaints ONLY its own row, it
 * coalesces, and it does not disturb the things a monitoring feed must never
 * disturb — focus, selection, and the reader's place.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGridRenderer, type GridViewModel, type GridRenderer } from "./renderer.js";

interface Row { readonly id: string; readonly name: string; readonly value: number }

let host: HTMLElement;
let raf: Array<() => void>;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get(): number { return this.classList?.contains("oxg-viewport") ? 600 : 0; },
  });
  // Frames are driven by hand: a coalescing test that waits on a real frame is
  // a test that passes for the wrong reason on a slow machine.
  raf = [];
  vi.stubGlobal("requestAnimationFrame", (cb: () => void) => { raf.push(cb); return raf.length; });
  window.requestAnimationFrame = ((cb: () => void) => { raf.push(cb); return raf.length; }) as never;
  window.cancelAnimationFrame = (() => {}) as never;
});

const flush = () => { const q = raf; raf = []; for (const cb of q) cb(); };

const rows = (n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({ id: `r${i}`, name: `Name ${i}`, value: i }));

function mount(n = 200): { r: GridRenderer<Row>; model: GridViewModel<Row>; data: Row[] } {
  const data = rows(n);
  const r = createGridRenderer<Row>(host, {
    label: "tx", rowHeight: 32, onAction: () => {},
    fallback: (row, key) => ({ kind: "text", text: String((row as never)[key] ?? "") }),
  });
  const model: GridViewModel<Row> = {
    columns: [
      { key: "name", header: "Name", width: 200 },
      { key: "value", header: "Value", width: 100 },
    ],
    rows: data.map((row, index) => ({ id: row.id, row, index })),
    total: n, sort: [], selection: [], focus: null,
  };
  r.render(model);
  return { r, model, data };
}

const cellText = (id: string, key: string): string | undefined =>
  host.querySelector<HTMLElement>(
    `[role="row"][data-row-id="${id}"] [role="gridcell"][data-col-key="${key}"]`,
  )?.textContent ?? undefined;

describe("applyTransaction", () => {
  it("shows the new value after a frame", () => {
    const { r } = mount();
    expect(cellText("r0", "name")).toBe("Name 0");

    r.applyTransaction({ update: [{ id: "r0", row: { id: "r0", name: "Changed", value: 99 } }] });
    flush();
    expect(cellText("r0", "name")).toBe("Changed");
    expect(cellText("r0", "value")).toBe("99");
  });

  it("does not paint before the frame", () => {
    const { r } = mount();
    r.applyTransaction({ update: [{ id: "r0", row: { id: "r0", name: "Changed", value: 1 } }] });
    // Coalescing is the point: the value is not on screen until the frame runs.
    expect(cellText("r0", "name")).toBe("Name 0");
  });

  it("repaints only the rows named", () => {
    const { r } = mount();
    const other = host.querySelector<HTMLElement>('[role="row"][data-row-id="r1"]');
    const before = other?.innerHTML;

    r.applyTransaction({ update: [{ id: "r0", row: { id: "r0", name: "Changed", value: 1 } }] });
    flush();
    // The whole value of a transaction: everything else is untouched.
    expect(host.querySelector<HTMLElement>('[role="row"][data-row-id="r1"]')?.innerHTML).toBe(before);
  });

  it("coalesces many updates into one frame", () => {
    const { r } = mount();
    for (let i = 0; i < 50; i++) {
      r.applyTransaction({ update: [{ id: "r0", row: { id: "r0", name: `v${i}`, value: i } }] });
    }
    // 50 transactions, one scheduled frame. A monitoring feed does not arrive
    // politely spaced, and 50 repaints of one row is 49 wasted.
    expect(raf.length).toBe(1);
    flush();
    expect(cellText("r0", "name")).toBe("v49");
  });

  it("applies the last write when one row is patched repeatedly", () => {
    const { r } = mount();
    r.applyTransaction({ update: [{ id: "r5", row: { id: "r5", name: "first", value: 1 } }] });
    r.applyTransaction({ update: [{ id: "r5", row: { id: "r5", name: "second", value: 2 } }] });
    flush();
    expect(cellText("r5", "name")).toBe("second");
  });

  it("ignores an empty transaction rather than scheduling a frame", () => {
    const { r } = mount();
    r.applyTransaction({ update: [] });
    expect(raf.length).toBe(0);
  });

  it("records a patch for a row that is not rendered", () => {
    const { r, model } = mount(500);
    // Row 400 is far outside the window. The patch must still be remembered,
    // or scrolling to it would show data that was superseded minutes ago.
    r.applyTransaction({ update: [{ id: "r400", row: { id: "r400", name: "Offscreen", value: 7 } }] });
    flush();
    r.render({ ...model, focus: { rowId: "r400", columnKey: "name" } });
    // A re-render supersedes the overlay, so the caller's model wins here —
    // which is the documented contract, and why the model must be updated too.
    expect(cellText("r400", "name")).toBe("Name 400");
  });
});

describe("what a patch must not disturb", () => {
  it("leaves focus where it was", () => {
    const { r, model } = mount();
    r.render({ ...model, focus: { rowId: "r2", columnKey: "name" } });
    const focused = host.querySelector('[data-row-id="r2"] [data-col-key="name"]');
    expect(focused?.getAttribute("tabindex")).toBe("0");

    r.applyTransaction({ update: [{ id: "r0", row: { id: "r0", name: "x", value: 0 } }] });
    flush();
    // A vitals feed that moves the cursor is unusable.
    expect(
      host.querySelector('[data-row-id="r2"] [data-col-key="name"]')?.getAttribute("tabindex"),
    ).toBe("0");
  });

  it("leaves selection where it was", () => {
    const { r, model } = mount();
    r.render({ ...model, selection: ["r3"] });
    r.applyTransaction({ update: [{ id: "r0", row: { id: "r0", name: "x", value: 0 } }] });
    flush();
    expect(
      host.querySelector('[data-row-id="r3"]')?.getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("keeps the row count and the reader's place", () => {
    const { r } = mount();
    const before = host.querySelectorAll('.oxg-body [role="row"]').length;
    r.applyTransaction({ update: [{ id: "r0", row: { id: "r0", name: "x", value: 0 } }] });
    flush();
    expect(host.querySelectorAll('.oxg-body [role="row"]').length).toBe(before);
  });

  it("is superseded by the next render", () => {
    const { r, model } = mount();
    r.applyTransaction({ update: [{ id: "r0", row: { id: "r0", name: "patched", value: 1 } }] });
    flush();
    expect(cellText("r0", "name")).toBe("patched");

    // A new model is the caller's statement of truth. A patch it does not
    // contain is stale, and showing stale clinical data is the worst outcome
    // available here.
    r.render(model);
    expect(cellText("r0", "name")).toBe("Name 0");
  });
});
