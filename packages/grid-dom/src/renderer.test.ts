// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GridAction, GridError } from "@oxygenui-design/grid-core";
import { createGridRenderer, HEADER_ROW_ID, type GridViewModel } from "./renderer.js";

interface Patient {
  readonly id: string;
  readonly name: string;
  readonly potassium: string;
}

const columns = [
  { key: "name", header: "Patient", sortable: true },
  { key: "potassium", header: "Potassium", sortable: true },
];

function model(over: Partial<GridViewModel<Patient>> = {}): GridViewModel<Patient> {
  return {
    columns,
    rows: [
      { id: "p1", row: { id: "p1", name: "A. Okafor", potassium: "3.7" }, index: 0 },
      { id: "p2", row: { id: "p2", name: "B. Lindqvist", potassium: "5.1" }, index: 1 },
      { id: "p3", row: { id: "p3", name: "C. Rahman", potassium: "4.2" }, index: 2 },
    ],
    total: 3,
    sort: [],
    selection: [],
    focus: null,
    ...over,
  };
}

let host: HTMLElement;
let actions: GridAction[];
const fallback = (row: Patient, key: string) => ({
  kind: "text" as const,
  text: String(row[key as keyof Patient] ?? ""),
});

function mount(m = model()) {
  const r = createGridRenderer<Patient>(host, {
    label: "Patient roster",
    onAction: (a) => actions.push(a),
    fallback,
  });
  r.render(m);
  return r;
}

const key = (el: Element, k: string, mods: Partial<KeyboardEventInit> = {}) =>
  el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...mods }));

beforeEach(() => {
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.append(host);
  actions = [];
});

describe("the ARIA contract", () => {
  it("builds a grid with rowgroups, rows and cells", () => {
    mount();
    expect(host.querySelector('[role="grid"]')?.getAttribute("aria-label")).toBe("Patient roster");
    expect(host.querySelectorAll('[role="rowgroup"]')).toHaveLength(2);
    expect(host.querySelectorAll('[role="columnheader"]')).toHaveLength(2);
    expect(host.querySelectorAll('[role="gridcell"]')).toHaveLength(6);
  });

  it("announces an absolute row index under windowing", () => {
    // The window holds one row. Its absolute position is 19,998 of 40,000 --
    // the defect that makes so many grids announce "row 1 of 20" forever.
    mount(
      model({
        rows: [{ id: "p9", row: { id: "p9", name: "Z. Mbeki", potassium: "4.0" }, index: 19_997 }],
        total: 40_000,
      }),
    );
    const row = host.querySelector('[role="row"][data-row-id="p9"]');
    expect(row?.getAttribute("aria-rowindex")).toBe("19999"); // 0-based + header + 1
    expect(host.querySelector('[role="grid"]')?.getAttribute("aria-rowcount")).toBe("40000");
  });

  it('reports aria-rowcount="-1" when the source does not know the total', () => {
    mount(model({ total: "unknown" }));
    expect(host.querySelector('[role="grid"]')?.getAttribute("aria-rowcount")).toBe("-1");
  });

  it("reflects sort direction on the header, and none on an unsorted sortable column", () => {
    mount(model({ sort: [{ key: "potassium", direction: "desc" }] }));
    const [name, potassium] = Array.from(host.querySelectorAll('[role="columnheader"]'));
    expect(potassium?.getAttribute("aria-sort")).toBe("descending");
    expect(name?.getAttribute("aria-sort")).toBe("none");
  });

  it("marks selected rows", () => {
    mount(model({ selection: ["p2"] }));
    expect(host.querySelector('[data-row-id="p2"]')?.getAttribute("aria-selected")).toBe("true");
    expect(host.querySelector('[data-row-id="p1"]')?.hasAttribute("aria-selected")).toBe(false);
  });
});

describe("the body is one tab stop", () => {
  it("puts exactly one tabbable element in the whole grid", () => {
    mount();
    expect(host.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
  });

  it("keeps exactly one after focus moves", () => {
    mount(model({ focus: { rowId: "p2", columnKey: "potassium" } }));
    const tabbable = host.querySelectorAll('[tabindex="0"]');
    expect(tabbable).toHaveLength(1);
    expect((tabbable[0] as HTMLElement).dataset["colKey"]).toBe("potassium");
  });
});

describe("keyboard operation -- no pointer event is ever dispatched", () => {
  it("moves right, down, and to the row end", () => {
    mount(model({ focus: { rowId: "p1", columnKey: "name" } }));
    const grid = host.querySelector('[role="grid"]') as HTMLElement;

    key(grid, "ArrowRight");
    expect(actions.at(-1)).toEqual({ type: "focus/cell", rowId: "p1", columnKey: "potassium" });

    key(grid, "ArrowDown");
    expect(actions.at(-1)).toEqual({ type: "focus/cell", rowId: "p2", columnKey: "potassium" });

    key(grid, "Home");
    expect(actions.at(-1)).toEqual({ type: "focus/cell", rowId: "p2", columnKey: "name" });
  });

  it("reaches the column header by arrowing up from the first data row", () => {
    mount(model({ focus: { rowId: "p1", columnKey: "name" } }));
    const grid = host.querySelector('[role="grid"]') as HTMLElement;
    key(grid, "ArrowUp");
    expect(actions.at(-1)).toEqual({ type: "focus/cell", rowId: HEADER_ROW_ID, columnKey: "name" });
  });

  it("sorts from the header with Enter, and never from the body", () => {
    mount(model({ focus: { rowId: HEADER_ROW_ID, columnKey: "potassium" } }));
    const grid = host.querySelector('[role="grid"]') as HTMLElement;
    key(grid, "Enter");
    expect(actions.at(-1)).toEqual({ type: "sort/toggle", key: "potassium", additive: false });

    actions = [];
    mount(model({ focus: { rowId: "p1", columnKey: "potassium" } }));
    key(host.querySelectorAll('[role="grid"]')[1] as HTMLElement, "Enter");
    expect(actions.some((a) => a.type === "sort/toggle")).toBe(false);
  });

  it("selects a row with Space, in the body only", () => {
    mount(model({ focus: { rowId: "p2", columnKey: "name" } }));
    key(host.querySelector('[role="grid"]') as HTMLElement, " ");
    expect(actions.at(-1)).toEqual({ type: "select/toggle", id: "p2" });
  });

  it("does not wrap at an edge, and does not scroll the page instead", () => {
    mount(model({ focus: { rowId: "p1", columnKey: "potassium" } }));
    const grid = host.querySelector('[role="grid"]') as HTMLElement;
    const notCancelled = key(grid, "ArrowRight");
    expect(notCancelled).toBe(false); // preventDefault called
    expect(actions).toHaveLength(0); // and focus did not move
  });

  it("folds Meta into Control so one keymap serves both platforms", () => {
    mount(model({ focus: { rowId: "p2", columnKey: "potassium" } }));
    const grid = host.querySelector('[role="grid"]') as HTMLElement;
    key(grid, "Home", { metaKey: true });
    expect(actions.at(-1)).toEqual({ type: "focus/cell", rowId: HEADER_ROW_ID, columnKey: "name" });
  });
});

describe("the live region", () => {
  it("announces column, value and absolute position", () => {
    mount(model({ focus: { rowId: "p1", columnKey: "name" } }));
    key(host.querySelector('[role="grid"]') as HTMLElement, "ArrowDown");
    expect(host.querySelector(".oxg-live")?.textContent).toBe("Patient, B. Lindqvist, row 2 of 3");
  });

  it("omits the total when the source does not know it", () => {
    mount(model({ total: "unknown", focus: { rowId: "p1", columnKey: "name" } }));
    key(host.querySelector('[role="grid"]') as HTMLElement, "ArrowDown");
    expect(host.querySelector(".oxg-live")?.textContent).toBe("Patient, B. Lindqvist, row 2");
  });
});

describe("a throwing renderer reports no PHI", () => {
  it("survives, and the reported error carries coordinates only", () => {
    const PHI = "Aurelia Marchetti-Okonkwo 4471-882";
    const errors: GridError[] = [];
    const r = createGridRenderer<Patient>(host, {
      label: "Patient roster",
      onAction: () => {},
      onError: (e) => errors.push(e),
      cells: {
        name: {
          mount: () => {
            throw new Error(`Cannot format ${PHI}`);
          },
          update: () => {},
          unmount: () => {},
          measure: () => ({ intrinsic: 0, growable: false }),
          read: () => "",
          compare: () => 0,
          toExport: () => ({ kind: "value", value: null }),
          toPrint: () => ({ kind: "value", value: null }),
        },
      },
      fallback,
    });
    r.render(model());

    expect(host.querySelectorAll('[role="gridcell"]')).toHaveLength(6); // grid survived
    expect(errors.length).toBeGreaterThan(0);
    expect(JSON.stringify(errors)).not.toContain("Aurelia");
    expect(JSON.stringify(errors)).not.toContain("4471-882");
    expect(errors[0]).toMatchObject({ code: "renderer-threw", phase: "render", columnKey: "name" });
    r.destroy();
  });
});

describe("teardown", () => {
  it("unmounts every cell and removes the grid", () => {
    const unmount = vi.fn();
    const r = createGridRenderer<Patient>(host, {
      label: "g",
      onAction: () => {},
      cells: {
        name: {
          mount: () => {}, update: () => {}, unmount,
          measure: () => ({ intrinsic: 0, growable: false }),
          read: () => "", compare: () => 0,
          toExport: () => ({ kind: "value", value: null }),
          toPrint: () => ({ kind: "value", value: null }),
        },
      },
      fallback,
    });
    r.render(model());
    r.destroy();
    expect(unmount).toHaveBeenCalledTimes(3);
    expect(host.querySelector('[role="grid"]')).toBeNull();
  });
});
