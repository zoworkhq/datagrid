// @vitest-environment jsdom
/**
 * Columns frozen against the horizontal scroll.
 *
 * `layoutColumns` has assigned every column an offset and a `pinned` edge since
 * the engine was written, and the renderer ignored the edge — so a host could
 * compute a frozen layout and then watch the identity column scroll away. The
 * demo printed the layout beside a grid that did not honour it.
 *
 * jsdom has no layout, so this asserts the STRUCTURE that produces frozen
 * columns — which column renders, in what order, with what `position` and what
 * offset — and the browser smoke test asserts that they actually stay put.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createGridRenderer, HEADER_ROW_ID, type GridViewModel, type RenderColumn } from "./renderer.js";

interface P { readonly id: string; readonly [k: string]: string }

let host: HTMLElement;

const COLS = 40;
const columns = (over: Readonly<Record<string, "start" | "end">> = {}): RenderColumn[] =>
  Array.from({ length: COLS }, (_, i) => {
    const key = `c${i}`;
    const pin = over[key];
    return { key, header: `C${i}`, width: 100, ...(pin ? { pinned: pin } : {}) };
  });

const model = (cols: RenderColumn[]): GridViewModel<P> => ({
  columns: cols,
  rows: [{ id: "r1", row: { id: "r1" } as P, index: 0 }],
  total: 1, sort: [], selection: [], focus: null,
});

const mount = (cols: RenderColumn[]) => {
  const r = createGridRenderer<P>(host, {
    label: "g", onAction: () => {}, fallback: (_row, key) => ({ kind: "text", text: key }),
  });
  r.render(model(cols));
  return r;
};

const bodyKeys = () =>
  Array.from(host.querySelectorAll('.oxg-body [role="row"]:first-child [role="gridcell"]')).map(
    (c) => (c as HTMLElement).dataset["colKey"],
  );
const headKeys = () =>
  Array.from(host.querySelectorAll('[role="columnheader"]')).map((c) => (c as HTMLElement).dataset["colKey"]);
const cellFor = (key: string) =>
  host.querySelector<HTMLElement>(`.oxg-body [data-col-key="${key}"]`);

beforeEach(() => {
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.append(host);
  // jsdom reports 0, which is the renderer's "not laid out" signal and disables
  // column virtualisation. These tests need it on.
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, value: 600 });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, value: 400 });
});

describe("pinned columns", () => {
  it("moves a pinned column to the edge whatever order it was passed in", () => {
    // A `pinned: "end"` column left in the middle does not fail loudly — it
    // renders frozen in the wrong place, which looks like a bug in the grid.
    mount(columns({ c5: "start", c2: "end" }));
    expect(headKeys()[0]).toBe("c5");
    expect(headKeys()[headKeys().length - 1]).toBe("c2");
  });

  it("renders a pinned column even when it is far outside the window", () => {
    const r = mount(columns({ c0: "start", c39: "end" }));
    const vp = host.querySelector<HTMLElement>(".oxg-viewport") as HTMLElement;
    vp.scrollLeft = 2_000; // deep into the middle
    vp.dispatchEvent(new Event("scroll"));

    const keys = bodyKeys();
    expect(keys[0]).toBe("c0");
    expect(keys[keys.length - 1]).toBe("c39");
    // …and it is still a WINDOW: the middle did not materialise.
    expect(keys.length).toBeLessThan(COLS);
    r.destroy();
  });

  it("freezes with sticky, at the offset the geometry gives it", () => {
    mount(columns({ c0: "start", c1: "start" }));
    expect(cellFor("c0")?.style.position).toBe("sticky");
    expect(cellFor("c0")?.style.left).toBe("0px");
    expect(cellFor("c1")?.style.left).toBe("100px");
  });

  it("freezes an end column against the right edge", () => {
    mount(columns({ c39: "end" }));
    // 40 columns of 100px; the last one's right offset is 0 from the end.
    expect(cellFor("c39")?.style.position).toBe("sticky");
    expect(cellFor("c39")?.style.right).toBe("0px");
  });

  it("puts the spacers inside the frozen bands, never over them", () => {
    // A spacer before the frozen prefix would scroll a blank block over it.
    mount(columns({ c0: "start", c39: "end" }));
    const row = host.querySelector('.oxg-body [role="row"]') as HTMLElement;
    const kids = Array.from(row.children) as HTMLElement[];
    expect(kids[0]?.dataset["colKey"]).toBe("c0");
    expect(kids[1]?.getAttribute("role")).toBe("presentation");
    expect(kids[kids.length - 1]?.dataset["colKey"]).toBe("c39");
    expect(kids[kids.length - 2]?.getAttribute("role")).toBe("presentation");
  });

  it("announces the visual column index, not the one it was passed in", () => {
    mount(columns({ c5: "start" }));
    const th = host.querySelector<HTMLElement>('[role="columnheader"][data-col-key="c5"]');
    expect(th?.getAttribute("aria-colindex")).toBe("1");
  });

  it("counter-translates a pinned header, because the header does not scroll", () => {
    mount(columns({ c0: "start" }));
    const vp = host.querySelector<HTMLElement>(".oxg-viewport") as HTMLElement;
    vp.scrollLeft = 700;
    vp.dispatchEvent(new Event("scroll"));
    const th = host.querySelector<HTMLElement>('[role="columnheader"][data-col-key="c0"]');
    const row = host.querySelector<HTMLElement>('.oxg-head [role="row"]');
    // The row moves by -scrollLeft; the pinned header moves back by +scrollLeft.
    expect(row?.style.transform).toBe("translateX(-700px)");
    expect(th?.style.transform).toBe("translateX(700px)");
  });

  it("changes nothing at all when no column is pinned", () => {
    mount(columns());
    const row = host.querySelector('.oxg-body [role="row"]') as HTMLElement;
    const cells = Array.from(row.querySelectorAll('[role="gridcell"]')) as HTMLElement[];
    expect(cells.every((c) => c.style.position === "")).toBe(true);
    expect(host.querySelector("[data-pinned]")).toBeNull();
  });

  it("does not render a pinned column twice when spans turn windowing off", () => {
    // Spans opt out of column virtualisation, so the middle IS everything and
    // the frozen bands are already inside it.
    const r = createGridRenderer<P>(host, {
      label: "g", onAction: () => {}, span: () => 1,
      fallback: (_row, key) => ({ kind: "text", text: key }),
    });
    r.render(model(columns({ c0: "start", c39: "end" })));
    const keys = bodyKeys();
    expect(keys).toHaveLength(COLS);
    expect(new Set(keys).size).toBe(COLS);
  });
});
