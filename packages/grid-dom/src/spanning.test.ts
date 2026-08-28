// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { createGridRenderer, type GridRenderer, type GridViewModel } from "./renderer.js";

interface P {
  readonly id: string;
  readonly name: string;
  readonly k: string;
  readonly note: string;
  readonly restricted?: boolean;
}

const ROWS = 300;
const all: P[] = Array.from({ length: ROWS }, (_, i) => ({
  id: `p${i}`,
  name: `Patient ${i}`,
  k: String(3 + (i % 20) / 10),
  note: i === 2 ? "Withheld under 42 CFR Part 2" : "stable",
  ...(i === 2 ? { restricted: true } : {}),
}));

const model = (over: Partial<GridViewModel<P>> = {}): GridViewModel<P> => ({
  columns: [
    { key: "name", header: "Patient", sortable: true },
    { key: "k", header: "Potassium" },
    { key: "note", header: "Note" },
  ],
  rows: all.map((row, index) => ({ id: row.id, row, index })),
  total: ROWS,
  sort: [],
  selection: [],
  focus: null,
  ...over,
});

const fallback = (row: P, key: string) => ({
  kind: "text" as const,
  text: String(row[key as keyof P] ?? ""),
});

let host: HTMLElement;
const viewportEl = () => host.querySelector<HTMLElement>(".oxg-viewport") as HTMLElement;
const rowEl = (id: string) => host.querySelector<HTMLElement>(`.oxg-body [data-row-id="${id}"]`);

function mount(over: Partial<GridViewModel<P>> = {}, span?: (row: P, key: string) => number): GridRenderer<P> {
  const r = createGridRenderer<P>(host, {
    label: "Patient roster",
    onAction: () => {},
    fallback,
    rowHeight: 40,
    overscan: 2,
    ...(span ? { span } : {}),
  });
  Object.defineProperty(viewportEl(), "clientHeight", { value: 400, configurable: true });
  r.render(model(over));
  return r;
}

beforeEach(() => {
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.append(host);
});

describe("column spanning", () => {
  it("renders one cell per column when nothing spans", () => {
    const r = mount();
    expect(rowEl("p0")?.querySelectorAll('[role="gridcell"]')).toHaveLength(3);
    r.destroy();
  });

  it("spans a masked notice across the columns it covers", () => {
    // The case the architecture review found in our own mockup and nowhere in
    // the specification: one Part 2 notice, not the same notice three times.
    const r = mount({}, (row, key) => (row.restricted && key === "k" ? 2 : 1));
    const restricted = rowEl("p2") as HTMLElement;
    const cells = restricted.querySelectorAll('[role="gridcell"]');
    expect(cells).toHaveLength(2); // name, then k spanning k+note
    expect(cells[1]?.getAttribute("aria-colspan")).toBe("2");
    expect((cells[1] as HTMLElement).dataset["colKey"]).toBe("k");
    r.destroy();
  });

  it("leaves unspanned rows untouched", () => {
    const r = mount({}, (row, key) => (row.restricted && key === "k" ? 2 : 1));
    expect(rowEl("p0")?.querySelectorAll('[role="gridcell"]')).toHaveLength(3);
    expect(rowEl("p0")?.querySelector("[aria-colspan]")).toBeNull();
    r.destroy();
  });

  it("keeps aria-colindex pointing at the real column", () => {
    const r = mount({}, (row, key) => (row.restricted && key === "k" ? 2 : 1));
    const cells = rowEl("p2")?.querySelectorAll('[role="gridcell"]');
    expect(cells?.[0]?.getAttribute("aria-colindex")).toBe("1");
    expect(cells?.[1]?.getAttribute("aria-colindex")).toBe("2");
    r.destroy();
  });

  it("does not leave orphaned cells when a spanning row recycles into a plain one", () => {
    // The recycling hazard specific to spans: a node that held two cells is
    // reused by a row that needs three, or the reverse.
    const r = mount({}, (row, key) => (row.restricted && key === "k" ? 2 : 1));
    const v = viewportEl();
    for (const px of [0, 4_000, 0, 8_000, 0]) {
      v.scrollTop = px;
      v.dispatchEvent(new Event("scroll"));
      for (const row of host.querySelectorAll<HTMLElement>('.oxg-body [role="row"]')) {
        const source = all[Number((row.dataset["rowId"] as string).slice(1))] as P;
        const expected = source.restricted ? 2 : 3;
        expect(row.querySelectorAll('[role="gridcell"]')).toHaveLength(expected);
        // And the content still belongs to the row it claims to be.
        expect(row.querySelector('[data-col-key="name"]')?.textContent).toBe(source.name);
      }
    }
    r.destroy();
  });
});

describe("pinned rows", () => {
  const pinned = { top: new Set(["p0"]), bottom: new Set(["p299"]) };

  it("renders pinned rows outside the scrolling band", () => {
    const r = mount({ pinned });
    expect(rowEl("p0")?.dataset["pinned"]).toBe("start");
    expect(rowEl("p299")?.dataset["pinned"]).toBe("end");
    r.destroy();
  });

  it("keeps them rendered at any scroll position", () => {
    const r = mount({ pinned });
    const v = viewportEl();
    for (const px of [0, 2_000, 11_000]) {
      v.scrollTop = px;
      v.dispatchEvent(new Event("scroll"));
      expect(rowEl("p0"), `pinned top missing at ${px}`).not.toBeNull();
      expect(rowEl("p299"), `pinned bottom missing at ${px}`).not.toBeNull();
    }
    r.destroy();
  });

  it("keeps their absolute row index — pinning moves a row, it does not renumber it", () => {
    const r = mount({ pinned });
    expect(rowEl("p299")?.getAttribute("aria-rowindex")).toBe("301");
    r.destroy();
  });

  it("shortens the scrolling band rather than shifting every offset", () => {
    // 300 rows, two pinned, so the canvas covers 298.
    const r = mount({ pinned });
    expect(host.querySelector<HTMLElement>(".oxg-canvas")?.style.height).toBe(`${298 * 40}px`);
    r.destroy();
  });

  it("does not double-render a pinned row that is also in the window", () => {
    const r = mount({ pinned });
    expect(host.querySelectorAll('.oxg-body [data-row-id="p0"]')).toHaveLength(1);
    r.destroy();
  });
});
