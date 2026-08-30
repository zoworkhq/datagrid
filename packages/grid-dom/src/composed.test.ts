// @vitest-environment jsdom
/**
 * The features together, which is where they actually break.
 *
 * Each of column virtualisation, frozen columns, spans, dragging, transactions
 * and the keyboard has its own file and passes on its own. Every defect this
 * file has caught lived in a PAIR of them — a spacer that was right until a
 * column was pinned, a drag that was right until the column was outside the
 * window, a focus that was right until it crossed a frozen edge.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MIN_COLUMN_WIDTH, type GridAction } from "@oxygenui-design/grid-core";
import { createGridRenderer, HEADER_ROW_ID, type GridViewModel, type RenderColumn } from "./renderer.js";

interface P { readonly id: string; readonly [k: string]: unknown }

let host: HTMLElement;
let actions: GridAction[];

const COLS = 60;
const ROWS = 200;

const columns = (over: Partial<Record<string, Partial<RenderColumn>>> = {}): RenderColumn[] =>
  Array.from({ length: COLS }, (_, i) => ({
    key: `c${i}`,
    header: `C${i}`,
    width: 100,
    ...over[`c${i}`],
  }));

const model = (cols: RenderColumn[], over: Partial<GridViewModel<P>> = {}): GridViewModel<P> => ({
  columns: cols,
  rows: Array.from({ length: ROWS }, (_, i) => ({ id: `r${i}`, row: { id: `r${i}` } as P, index: i })),
  total: ROWS,
  sort: [],
  selection: [],
  focus: null,
  ...over,
});

const mount = (cols: RenderColumn[], over: Partial<GridViewModel<P>> = {}, opts: Record<string, unknown> = {}) => {
  const r = createGridRenderer<P>(host, {
    label: "g",
    onAction: (a) => actions.push(a),
    fallback: (_row, key) => ({ kind: "text", text: key }),
    ...opts,
  });
  r.render(model(cols, over));
  return r;
};

const viewport = () => host.querySelector<HTMLElement>(".oxg-viewport") as HTMLElement;
const scrollTo = (left: number): void => {
  viewport().scrollLeft = left;
  viewport().dispatchEvent(new Event("scroll"));
};
const bodyKeys = (rowId = "r0") =>
  Array.from(host.querySelectorAll(`[data-row-id="${rowId}"] [role="gridcell"]`)).map(
    (c) => (c as HTMLElement).dataset["colKey"],
  );
const headKeys = () =>
  Array.from(host.querySelectorAll('[role="columnheader"]')).map((c) => (c as HTMLElement).dataset["colKey"]);
const th = (key: string) =>
  host.querySelector<HTMLElement>(`[data-row-id="${HEADER_ROW_ID}"] [data-col-key="${key}"]`);

const press = (target: Element | null, keys: string): void => {
  const parts = keys.split("+");
  const key = parts[parts.length - 1] as string;
  target?.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: key === "Space" ? " " : key,
      ctrlKey: parts.includes("Control"),
      shiftKey: parts.includes("Shift"),
      altKey: parts.includes("Alt"),
      bubbles: true,
      cancelable: true,
    }),
  );
};

const pointer = (el: Element | null, type: string, clientX: number): void => {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, { pointerId: 1, button: 0, clientX, clientY: 15 });
  el?.dispatchEvent(e);
};

const layOut = (boxes: Readonly<Record<string, [number, number]>>): void => {
  for (const [key, [left, right]] of Object.entries(boxes)) {
    const el = th(key);
    if (!el) continue;
    el.getBoundingClientRect = () =>
      ({ left, right, width: right - left, top: 0, bottom: 30, height: 30, x: left, y: 0 }) as DOMRect;
  }
};

beforeEach(() => {
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.append(host);
  actions = [];
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, value: 600 });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, value: 400 });
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => {
    fn(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
});

// ── pinned × virtualised ────────────────────────────────────────────────────

describe("frozen columns and column virtualisation", () => {
  it("keeps both bands at every scroll position", () => {
    mount(columns({ c0: { pinned: "start" }, c59: { pinned: "end" } }));
    for (const left of [0, 500, 1_500, 3_000, 5_000, 5_800]) {
      scrollTo(left);
      const keys = bodyKeys();
      expect(keys[0], `at scrollLeft ${left}`).toBe("c0");
      expect(keys[keys.length - 1], `at scrollLeft ${left}`).toBe("c59");
      expect(keys.length, `at scrollLeft ${left}`).toBeLessThan(COLS);
      expect(new Set(keys).size, `duplicate cells at scrollLeft ${left}`).toBe(keys.length);
    }
  });

  it("keeps the header and the body agreeing on which columns exist", () => {
    mount(columns({ c0: { pinned: "start" }, c59: { pinned: "end" } }));
    for (const left of [0, 900, 2_400, 4_800]) {
      scrollTo(left);
      expect(headKeys(), `at scrollLeft ${left}`).toEqual(bodyKeys());
    }
  });

  it("never renders a pinned column twice, at any scroll position", () => {
    mount(columns({ c0: { pinned: "start" }, c1: { pinned: "start" }, c59: { pinned: "end" } }));
    for (const left of [0, 100, 250, 700, 3_000]) {
      scrollTo(left);
      const keys = bodyKeys();
      for (const key of ["c0", "c1", "c59"]) {
        expect(keys.filter((k) => k === key), `${key} at scrollLeft ${left}`).toHaveLength(1);
      }
    }
  });

  it("puts the spacers between the bands, never outside them", () => {
    mount(columns({ c0: { pinned: "start" }, c59: { pinned: "end" } }));
    scrollTo(2_000);
    const kids = Array.from(
      (host.querySelector('[data-row-id="r0"]') as HTMLElement).children,
    ) as HTMLElement[];
    const roles = kids.map((k) => (k.dataset["colKey"] ? "cell" : "spacer"));
    // cell, spacer, …cells…, spacer, cell
    expect(roles[0]).toBe("cell");
    expect(roles[1]).toBe("spacer");
    expect(roles[roles.length - 1]).toBe("cell");
    expect(roles[roles.length - 2]).toBe("spacer");
    expect(roles.filter((r) => r === "spacer")).toHaveLength(2);
  });

  it("survives every column being pinned", () => {
    const all = Object.fromEntries(
      Array.from({ length: COLS }, (_, i) => [`c${i}`, { pinned: "start" as const }]),
    );
    mount(columns(all));
    scrollTo(1_000);
    expect(bodyKeys()).toHaveLength(COLS);
    expect(new Set(bodyKeys()).size).toBe(COLS);
  });

  it("survives pinned columns wider than the viewport", () => {
    // Eight 100px columns frozen into a 600px viewport. There is no scrollable
    // band left at all, and that must not produce a negative window.
    const wide = Object.fromEntries(
      Array.from({ length: 8 }, (_, i) => [`c${i}`, { pinned: "start" as const }]),
    );
    mount(columns(wide));
    scrollTo(400);
    const keys = bodyKeys();
    expect(keys.length).toBeGreaterThanOrEqual(8);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.slice(0, 8)).toEqual(["c0", "c1", "c2", "c3", "c4", "c5", "c6", "c7"]);
  });
});

// ── pinned × keyboard ───────────────────────────────────────────────────────

describe("frozen columns and the keyboard", () => {
  it("moves focus across the frozen boundary in visual order", () => {
    mount(columns({ c5: { pinned: "start" } }), { focus: { rowId: "r0", columnKey: "c5" } });
    press(host.querySelector('[data-row-id="r0"] [data-col-key="c5"]'), "ArrowRight");
    // c5 is visually first, so right of it is c0 — the first unpinned column.
    expect(actions.at(-1)).toEqual({ type: "focus/cell", rowId: "r0", columnKey: "c0" });
  });

  it("resizes a pinned column from the header, like any other", () => {
    mount(columns({ c0: { pinned: "start" } }), { focus: { rowId: HEADER_ROW_ID, columnKey: "c0" } });
    press(th("c0"), "Control+Shift+ArrowRight");
    expect(actions).toContainEqual({ type: "column/resize", key: "c0", width: 124 });
  });

  it("selects every row with a pinned column present", () => {
    mount(columns({ c0: { pinned: "start" } }), { focus: { rowId: "r3", columnKey: "c0" } });
    press(host.querySelector('[data-row-id="r3"] [data-col-key="c0"]'), "Control+a");
    expect(actions).toContainEqual({ type: "select/all" });
  });

  it("keeps exactly one tab stop when a pinned column holds focus", () => {
    mount(columns({ c0: { pinned: "start" }, c59: { pinned: "end" } }), {
      focus: { rowId: "r2", columnKey: "c59" },
    });
    scrollTo(0);
    expect(host.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
    scrollTo(4_000);
    expect(host.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
  });
});

// ── focus × horizontal scroll ───────────────────────────────────────────────

describe("focus scrolls the viewport horizontally, not just vertically", () => {
  /**
   * The vertical equivalent has always existed; this did not, and the browser's
   * native focus-scroll was covering for it — badly. That fires before the
   * repaint, so the cell it scrolled to moves underneath it. Measured at 250
   * columns before the fix: column 44 focused at x=1212 in a viewport ending at
   * 1279, with 37px of a 104px cell outside.
   */
  const focusTo = (key: string, from: string): void => {
    const r = mount(columns(), { focus: { rowId: "r0", columnKey: from } });
    void r;
  };

  it("scrolls right to bring a column that is off the right edge into view", () => {
    const r = mount(columns(), { focus: { rowId: "r0", columnKey: "c0" } });
    expect(viewport().scrollLeft).toBe(0);
    // c9 starts at 900 in a 600px viewport: it cannot be visible at scroll 0.
    for (let i = 0; i < 9; i++) {
      press(host.querySelector(`[data-row-id="r0"] [data-col-key="c${i}"]`), "ArrowRight");
      r.render(model(columns(), { focus: { rowId: "r0", columnKey: `c${i + 1}` } }));
    }
    expect(viewport().scrollLeft).toBeGreaterThan(0);
    // The whole column, not just its leading edge.
    expect(viewport().scrollLeft).toBeGreaterThanOrEqual(1_000 - 600);
    void focusTo;
  });

  it("scrolls left again when focus comes back", () => {
    const r = mount(columns(), { focus: { rowId: "r0", columnKey: "c20" } });
    scrollTo(2_000);
    for (let i = 20; i > 14; i--) {
      press(host.querySelector(`[data-row-id="r0"] [data-col-key="c${i}"]`), "ArrowLeft");
      r.render(model(columns(), { focus: { rowId: "r0", columnKey: `c${i - 1}` } }));
    }
    expect(viewport().scrollLeft).toBeLessThan(2_000);
  });

  it("does not scroll for a pinned column, which is always in view", () => {
    const cols = columns({ c0: { pinned: "start" } });
    const r = mount(cols, { focus: { rowId: "r0", columnKey: "c1" } });
    scrollTo(2_500);
    const before = viewport().scrollLeft;
    press(host.querySelector('[data-row-id="r0"] [data-col-key="c1"]'), "ArrowLeft");
    r.render(model(cols, { focus: { rowId: "r0", columnKey: "c0" } }));
    expect(viewport().scrollLeft).toBe(before);
  });

  it("leaves room for the frozen bands rather than scrolling a column under one", () => {
    // A column scrolled flush to the viewport edge sits UNDER a pinned one:
    // visible to the code, covered on the screen.
    const cols = columns({ c0: { pinned: "start" }, c59: { pinned: "end" } });
    const r = mount(cols, { focus: { rowId: "r0", columnKey: "c1" } });
    for (let i = 1; i < 9; i++) {
      press(host.querySelector(`[data-row-id="r0"] [data-col-key="c${i}"]`), "ArrowRight");
      r.render(model(cols, { focus: { rowId: "r0", columnKey: `c${i + 1}` } }));
    }
    // Band = 600 - 100 (start) - 100 (end) = 400. Column 9 ends at 1000 in
    // geometry space, minus the 100px frozen prefix, so it needs 900 - 400.
    expect(viewport().scrollLeft).toBeGreaterThanOrEqual(500);
  });

  it("does nothing when spans have turned windowing off", () => {
    // With a span function every column is rendered and laid out in flow; the
    // browser's own focus handling is correct there and this must not fight it.
    const r = mount(columns(), { focus: { rowId: "r0", columnKey: "c0" } }, { span: () => 1 });
    const before = viewport().scrollLeft;
    press(host.querySelector('[data-row-id="r0"] [data-col-key="c0"]'), "ArrowRight");
    void r;
    expect(viewport().scrollLeft).toBe(before);
  });
});

// ── pinned × dragging ───────────────────────────────────────────────────────

describe("frozen columns and dragging", () => {
  it("resizes a pinned column by its edge", () => {
    mount(columns({ c0: { pinned: "start", resizable: true } }));
    layOut({ c0: [0, 100] });
    const handle = host.querySelector('[data-resize-for="c0"]');
    pointer(handle, "pointerdown", 100);
    pointer(handle, "pointermove", 180);
    pointer(handle, "pointerup", 180);
    expect(actions).toContainEqual({ type: "column/resize", key: "c0", width: 180 });
  });

  it("still stops a pinned column at the minimum width", () => {
    mount(columns({ c0: { pinned: "start", resizable: true } }));
    layOut({ c0: [0, 100] });
    const handle = host.querySelector('[data-resize-for="c0"]');
    pointer(handle, "pointerdown", 100);
    pointer(handle, "pointermove", -900);
    pointer(handle, "pointerup", -900);
    expect(actions.filter((a) => a.type === "column/resize").pop()).toEqual({
      type: "column/resize",
      key: "c0",
      width: MIN_COLUMN_WIDTH,
    });
  });

  it("reorders within the scrollable band without touching the frozen ones", () => {
    mount(columns({ c0: { pinned: "start" }, c1: { movable: true }, c2: { movable: true } }));
    layOut({ c1: [100, 200], c2: [200, 300] });
    pointer(th("c1"), "pointerdown", 150);
    pointer(th("c1"), "pointermove", 290);
    pointer(th("c1"), "pointerup", 290);
    const reorder = actions.find((a) => a.type === "column/reorder");
    expect(reorder).toBeDefined();
    // The frozen column keeps its place whatever the drop said.
    expect(headKeys()[0]).toBe("c0");
  });
});

// ── spans × everything ──────────────────────────────────────────────────────

describe("spans compose with the rest", () => {
  it("renders every column exactly once when a span turns windowing off", () => {
    mount(columns({ c0: { pinned: "start" }, c59: { pinned: "end" } }), {}, { span: () => 1 });
    const keys = bodyKeys();
    expect(keys).toHaveLength(COLS);
    expect(new Set(keys).size).toBe(COLS);
    expect(keys[0]).toBe("c0");
    expect(keys[keys.length - 1]).toBe("c59");
  });

  it("keeps a spanned row's cell count consistent with its plan", () => {
    const span = (row: P, key: string): number => (row.id === "r1" && key === "c0" ? 3 : 1);
    mount(columns({ c0: { pinned: "start" } }), {}, { span });
    // The spanned row covers three columns with one cell, so it has two fewer.
    expect(bodyKeys("r1").length).toBe(bodyKeys("r0").length - 2);
    expect(
      host.querySelector('[data-row-id="r1"] [data-col-key="c0"]')?.getAttribute("aria-colspan"),
    ).toBe("3");
  });
});

// ── transactions × pinned and windowed ──────────────────────────────────────

describe("transactions reach frozen and windowed cells", () => {
  it("repaints a pinned cell without disturbing the window", () => {
    const r = mount(columns({ c0: { pinned: "start" } }));
    scrollTo(2_000);
    const before = bodyKeys();
    r.applyTransaction({ update: [{ id: "r0", row: { id: "r0", c0: "patched" } as P }] });
    expect(bodyKeys()).toEqual(before);
    expect(host.querySelector('[data-row-id="r0"] [data-col-key="c0"]')).not.toBeNull();
  });

  it("ignores a patch for a row that is not rendered, rather than throwing", () => {
    const r = mount(columns());
    expect(() =>
      r.applyTransaction({ update: [{ id: "r199", row: { id: "r199" } as P }] }),
    ).not.toThrow();
  });
});

// ── the whole thing, repeatedly ─────────────────────────────────────────────

describe("nothing leaks across a long session", () => {
  it("keeps the DOM bounded through scrolling, pinning and resizing", () => {
    const r = mount(columns({ c0: { pinned: "start" }, c59: { pinned: "end" }, c1: { resizable: true } }));
    const nodes = () => host.querySelectorAll("*").length;

    scrollTo(0);
    const settled = nodes();

    for (let i = 0; i < 40; i++) {
      scrollTo((i * 313) % 5_800);
      viewport().scrollTop = (i * 977) % 8_000;
      viewport().dispatchEvent(new Event("scroll"));
    }
    // A window is a window however long you scroll for.
    expect(nodes()).toBeLessThan(settled * 2);
    r.destroy();
    expect(host.querySelector(".oxg-root")).toBeNull();
  });

  it("leaves no listener behind after destroy", () => {
    const r = mount(columns({ c0: { resizable: true, movable: true } }));
    const head = host.querySelector(".oxg-head") as HTMLElement;
    r.destroy();
    // Dispatching into the detached tree must not reach the (gone) handlers.
    actions = [];
    pointer(head, "pointerdown", 10);
    pointer(head, "pointermove", 200);
    pointer(head, "pointerup", 200);
    expect(actions).toEqual([]);
  });
});
