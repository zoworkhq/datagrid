// @vitest-environment jsdom
/**
 * Dragging a column, by its edge and by its header.
 *
 * `column/resize` and `column/reorder` were typed actions with a reducer case
 * and no way to reach either with a mouse: the renderer bound click, focusin,
 * keydown and scroll, and nothing else. The keyboard route existed; the one
 * everybody actually uses did not.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MIN_COLUMN_WIDTH, type GridAction } from "@oxygenui-design/grid-core";
import { createGridRenderer, HEADER_ROW_ID, type GridViewModel } from "./renderer.js";

interface P { readonly id: string; readonly a: string; readonly b: string; readonly c: string }

let host: HTMLElement;
let actions: GridAction[];

const model = (over: Partial<GridViewModel<P>> = {}): GridViewModel<P> => ({
  columns: [
    { key: "a", header: "A", width: 100, resizable: true, movable: true, sortable: true },
    { key: "b", header: "B", width: 100, resizable: true, movable: true },
    { key: "c", header: "C", width: 100 },
  ],
  rows: [{ id: "r1", row: { id: "r1", a: "1", b: "2", c: "3" }, index: 0 }],
  total: 1, sort: [], selection: [], focus: null,
  ...over,
});

const mount = (m = model()) => {
  const r = createGridRenderer<P>(host, {
    label: "g", onAction: (a) => actions.push(a),
    fallback: (row, key) => ({ kind: "text", text: String(row[key as keyof P] ?? "") }),
  });
  r.render(m);
  return r;
};

const th = (key: string) =>
  host.querySelector<HTMLElement>(`[data-row-id="${HEADER_ROW_ID}"] [data-col-key="${key}"]`);
const handleOf = (key: string) => host.querySelector<HTMLElement>(`[data-resize-for="${key}"]`);

/** jsdom has no layout, so headers are given the boxes the test means. */
const layOut = (boxes: Readonly<Record<string, [number, number]>>): void => {
  for (const [key, [left, right]] of Object.entries(boxes)) {
    const el = th(key);
    if (!el) continue;
    el.getBoundingClientRect = () =>
      ({ left, right, width: right - left, top: 0, bottom: 30, height: 30, x: left, y: 0 }) as DOMRect;
  }
};

/** jsdom has no PointerEvent constructor, so this is an Event wearing its fields. */
const pointer = (el: Element | null, type: string, clientX: number): void => {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, { pointerId: 1, button: 0, clientX, clientY: 15 });
  el?.dispatchEvent(e);
};

beforeEach(() => {
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.append(host);
  actions = [];
  // Pointer capture does not exist in jsdom.
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => {
    fn(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
});

describe("resizing by the edge", () => {
  it("gives a resizable column a handle, and a fixed one none", () => {
    mount();
    expect(handleOf("a")).not.toBeNull();
    expect(handleOf("c")).toBeNull();
  });

  it("the handle is not a tab stop — the body is one tab stop", () => {
    mount();
    expect(handleOf("a")?.getAttribute("tabindex")).toBeNull();
    expect(handleOf("a")?.getAttribute("role")).toBe("presentation");
  });

  it("emits the width the pointer travelled to", () => {
    mount();
    layOut({ a: [0, 100] });
    pointer(handleOf("a"), "pointerdown", 100);
    pointer(handleOf("a"), "pointermove", 160);
    pointer(handleOf("a"), "pointerup", 160);
    expect(actions).toContainEqual({ type: "column/resize", key: "a", width: 160 });
  });

  it("stops at a width that can still show a value", () => {
    mount();
    layOut({ a: [0, 100] });
    pointer(handleOf("a"), "pointerdown", 100);
    pointer(handleOf("a"), "pointermove", -400);
    pointer(handleOf("a"), "pointerup", -400);
    const last = actions.filter((a) => a.type === "column/resize").pop();
    expect(last).toEqual({ type: "column/resize", key: "a", width: MIN_COLUMN_WIDTH });
  });

  it("coalesces a stream of moves to one action per frame", () => {
    // A pointermove stream is 60+ events a second, and every one of them would
    // otherwise be an entry in the caller's undo stack.
    let queued: FrameRequestCallback | null = null;
    vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => {
      queued = fn;
      return 1;
    });
    mount();
    layOut({ a: [0, 100] });
    pointer(handleOf("a"), "pointerdown", 100);
    for (let x = 101; x <= 140; x++) pointer(handleOf("a"), "pointermove", x);
    expect(actions.filter((a) => a.type === "column/resize")).toHaveLength(0);
    queued?.(0);
    expect(actions.filter((a) => a.type === "column/resize")).toHaveLength(1);
  });
});

describe("reordering by the header", () => {
  it("does not start on a click, only on travel", () => {
    mount();
    layOut({ a: [0, 100], b: [100, 200] });
    pointer(th("a"), "pointerdown", 50);
    pointer(th("a"), "pointermove", 52); // 2px — a shaky click
    pointer(th("a"), "pointerup", 52);
    expect(actions.filter((a) => a.type === "column/reorder")).toHaveLength(0);
  });

  it("moves a column to where it was dropped", () => {
    mount();
    layOut({ a: [0, 100], b: [100, 200], c: [200, 300] });
    pointer(th("a"), "pointerdown", 50);
    pointer(th("a"), "pointermove", 250); // over C, right half
    pointer(th("a"), "pointerup", 250);
    expect(actions).toContainEqual({ type: "column/reorder", key: "a", toIndex: 2 });
  });

  it("marks which side of a header it would land on", () => {
    mount();
    layOut({ a: [0, 100], b: [100, 200], c: [200, 300] });
    pointer(th("a"), "pointerdown", 50);
    pointer(th("a"), "pointermove", 120); // left half of B
    expect(th("b")?.dataset["drop"]).toBe("before");
    pointer(th("a"), "pointermove", 190); // right half of B
    expect(th("b")?.dataset["drop"]).toBe("after");
    pointer(th("a"), "pointerup", 190);
    expect(th("b")?.dataset["drop"]).toBeUndefined();
  });

  it("a column that is not movable is not picked up", () => {
    mount();
    layOut({ a: [0, 100], c: [200, 300] });
    pointer(th("c"), "pointerdown", 250);
    pointer(th("c"), "pointermove", 50);
    pointer(th("c"), "pointerup", 50);
    expect(actions.filter((a) => a.type === "column/reorder")).toHaveLength(0);
  });

  it("dragging a sortable header does not also sort it", () => {
    // The click that ends a drag is still a click. Sorting on it would mean a
    // column you dragged also changed the row order under you.
    mount();
    layOut({ a: [0, 100], c: [200, 300] });
    pointer(th("a"), "pointerdown", 50);
    pointer(th("a"), "pointermove", 250);
    pointer(th("a"), "pointerup", 250);
    th("a")?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(actions.filter((a) => a.type === "sort/toggle")).toHaveLength(0);
  });

  it("still sorts on a plain click", () => {
    mount();
    th("a")?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(actions).toContainEqual({ type: "sort/toggle", key: "a", additive: false });
  });

  it("a cancelled drag leaves nothing behind", () => {
    mount();
    layOut({ a: [0, 100], b: [100, 200] });
    pointer(th("a"), "pointerdown", 50);
    pointer(th("a"), "pointermove", 150);
    pointer(th("a"), "pointercancel", 150);
    expect(actions.filter((a) => a.type === "column/reorder")).toHaveLength(0);
    expect(host.querySelector("[data-drop]")).toBeNull();
    expect((host.firstElementChild as HTMLElement).dataset["dragging"]).toBeUndefined();
  });
});
