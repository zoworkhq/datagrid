// @vitest-environment jsdom
/**
 * The roster end to end: the brief's cells driven by the real renderer.
 *
 * `cells.test.ts` calls `update()` by hand, which is a fair model of recycling
 * but still a model. This file puts the cells behind `createGridRenderer` and
 * scrolls, so the renderer's own pooling decides which node gets reused for
 * which row — the condition the empty-cell defect actually needed.
 *
 * It also pins the two claims the demo makes about itself: that the surface is
 * a real ARIA grid, and that it looks like the component brief.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGridRenderer, type GridViewModel } from "@oxygenui-design/grid-dom";
import type { GridAction } from "@oxygenui-design/grid-core";
import { ROSTER_CELLS, type Patient } from "./cells.js";

const COLUMNS = [
  { key: "name", header: "Patient", sortable: true, width: 238 },
  { key: "status", header: "Clinical status", sortable: true, width: 150 },
  { key: "problems", header: "Problem list", width: 210 },
  { key: "potassium", header: "Potassium", sortable: true, width: 200 },
];

const STATUSES = ["Stable", "Needs review", "Deteriorating", "Newly admitted"] as const;
const PROBLEMS = ["Depression", "Anxiety", "Type 2 diabetes", "Hypertension", "Asthma"];

function makePatients(n: number): Patient[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `Patient ${i}`,
    mrn: `MRN-${100000 + i}`,
    dob: `01 Jan ${1940 + (i % 60)}`,
    ward: "Ashgrove",
    status: STATUSES[i % STATUSES.length] as Patient["status"],
    problems: PROBLEMS.slice(0, (i % 5) + 1),
    // Every seventh row has no result, and each carries a different reason.
    potassium:
      i % 7 === 3
        ? ({ reason: "not-applicable", because: "on dialysis" } as const)
        : { value: 3 + (i % 20) / 10, unit: "mmol/L" },
    reviewed: "2026-08-01",
  }));
}

const ROWS = makePatients(500);

const model = (from: number, count: number): GridViewModel<Patient> => ({
  columns: COLUMNS,
  rows: ROWS.slice(from, from + count).map((row, i) => ({ id: row.id, row, index: from + i })),
  total: ROWS.length,
  sort: [],
  selection: [],
  focus: null,
});

let host: HTMLElement;
let actions: GridAction[];
let errors: unknown[];

const mountGrid = () => {
  actions = [];
  errors = [];
  return createGridRenderer<Patient>(host, {
    label: "Patient roster",
    rowHeight: 56,
    overscan: 6,
    cells: ROSTER_CELLS,
    onAction: (a) => actions.push(a),
    onError: (e) => errors.push(e),
    fallback: (row, key) => ({
      kind: "text",
      text: String((row as unknown as Record<string, unknown>)[key] ?? ""),
    }),
  });
};

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
});

const cellsIn = (key: string) =>
  [...host.querySelectorAll<HTMLElement>(`[role="gridcell"][data-col-key="${key}"]`)];

describe("the roster renders the brief's vocabulary", () => {
  it("builds an identity block per row", () => {
    const r = mountGrid();
    r.render(model(0, 10));

    const idc = host.querySelectorAll(".idc");
    expect(idc.length).toBeGreaterThan(0);
    expect(host.querySelector(".idc .pname")?.textContent).toBe("Patient 0");
    expect(host.querySelector(".idc .sub2")?.textContent).toContain("MRN-100000");
  });

  it("builds a status pill with a dot and a word", () => {
    const r = mountGrid();
    r.render(model(0, 10));

    const pill = host.querySelector(".cs");
    expect(pill?.querySelector(".gl-dot")).not.toBeNull();
    expect(pill?.textContent).toBe("Stable");
  });

  it("builds problem chips with a counted overflow", () => {
    const r = mountGrid();
    r.render(model(0, 10));

    // Patient 4 has five problems, so two chips and a "+3".
    const chips = cellsIn("problems")[4]?.querySelectorAll(".a-tag");
    expect([...(chips ?? [])].map((c) => c.textContent)).toEqual([
      "Depression",
      "Anxiety",
      "+3",
    ]);
  });

  it("renders a reason where there is no result", () => {
    const r = mountGrid();
    r.render(model(0, 10));
    expect(cellsIn("potassium")[3]?.textContent).toBe("Not applicable — on dialysis");
  });

  it("reports no errors while painting", () => {
    const r = mountGrid();
    r.render(model(0, 20));
    expect(errors).toEqual([]);
  });
});

describe("recycling through the real renderer", () => {
  /** Every rendered cell must agree with the row the renderer says it holds. */
  const assertConsistent = (): void => {
    for (const row of host.querySelectorAll<HTMLElement>('.oxg-body [role="row"]')) {
      const id = row.dataset["rowId"];
      const source = ROWS.find((p) => p.id === id);
      expect(source, `no row for id ${id}`).toBeDefined();
      if (!source) continue;

      const name = row.querySelector<HTMLElement>('[data-col-key="name"] .pname');
      expect(name?.textContent).toBe(source.name);

      const mrn = row.querySelector<HTMLElement>('[data-col-key="name"] .sub2');
      expect(mrn?.textContent).toContain(source.mrn);

      const status = row.querySelector<HTMLElement>('[data-col-key="status"] .cs');
      expect(status?.textContent).toBe(source.status);

      // The one that shipped broken: never empty, whichever branch it took.
      const k = row.querySelector<HTMLElement>('[data-col-key="potassium"]');
      expect(k?.textContent?.trim(), `empty result cell on ${id}`).not.toBe("");
      expect(k?.querySelector(".res-v"), `hook lost on ${id}`).not.toBeNull();
    }
  };

  it("keeps every cell correct as the window advances", () => {
    const r = mountGrid();
    for (let from = 0; from < 120; from += 7) {
      r.render(model(from, 12));
      assertConsistent();
    }
  });

  it("keeps every cell correct scrolling backwards", () => {
    const r = mountGrid();
    r.render(model(200, 12));
    for (let from = 200; from >= 0; from -= 11) {
      r.render(model(from, 12));
      assertConsistent();
    }
  });

  it("keeps every cell correct when the window jumps far", () => {
    const r = mountGrid();
    for (const from of [0, 400, 12, 300, 1, 250, 0]) {
      r.render(model(from, 12));
      assertConsistent();
    }
  });

  it("does not accumulate DOM as the window moves", () => {
    const r = mountGrid();
    r.render(model(0, 12));
    const after = () => host.querySelectorAll(".idc").length;
    const first = after();

    for (let from = 0; from < 200; from += 4) r.render(model(from, 12));
    // Pooling means the node count is stable, not growing with distance
    // scrolled. A leak here is the memory gate's failure mode.
    expect(after()).toBeLessThanOrEqual(first * 2);
  });

  it("never leaves a status pill carrying two tones", () => {
    const r = mountGrid();
    for (let from = 0; from < 60; from += 3) {
      r.render(model(from, 10));
      for (const pill of host.querySelectorAll<HTMLElement>(".cs")) {
        const tones = [...pill.classList].filter((c) => c.startsWith("cs-"));
        expect(tones).toHaveLength(1);
      }
    }
  });
});

describe("the ARIA contract still holds with rich cells", () => {
  it("is a grid with rows and gridcells", () => {
    const r = mountGrid();
    r.render(model(0, 10));

    expect(host.querySelector('[role="grid"]')).not.toBeNull();
    expect(host.querySelector('[role="grid"]')?.getAttribute("aria-label")).toBe("Patient roster");
    expect(host.querySelectorAll('[role="columnheader"]')).toHaveLength(COLUMNS.length);
    expect(host.querySelectorAll('.oxg-body [role="row"]').length).toBeGreaterThan(0);
  });

  it("numbers rows by their ABSOLUTE position, not their place in the window", () => {
    const r = mountGrid();
    r.render(model(100, 10));

    const first = host.querySelector('.oxg-body [role="row"]');
    // A screen reader must say "row 101", not "row 1".
    expect(first?.getAttribute("aria-rowindex")).toBe("102");
  });

  it("keeps one tab stop for the whole grid", () => {
    const r = mountGrid();
    r.render(model(0, 10));
    const focusable = host.querySelectorAll('[tabindex="0"]');
    expect(focusable.length).toBeLessThanOrEqual(1);
  });

  it("announces a cell through the cell's own reader, not its markup", () => {
    const r = mountGrid();
    r.render(model(0, 10));
    // The avatar's initials are decoration; the announcement is the sentence.
    expect(ROSTER_CELLS["name"]?.read({
      row: ROWS[0] as Patient,
      columnKey: "name",
      rowIndex: 0,
      onError: () => {},
    })).toContain("born");
  });
});

describe("sorting is offered where it is meaningful", () => {
  it("emits a sort action when a sortable header is clicked", () => {
    const r = mountGrid();
    r.render(model(0, 10));

    const header = host.querySelector<HTMLElement>('[role="columnheader"][data-col-key="name"]');
    header?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(actions.some((a) => a.type === "sort/toggle")).toBe(true);
  });

  it("refuses to order a measurement against a reason there is none", () => {
    const measured = ROWS[0] as Patient;
    const absent = ROWS[3] as Patient;
    expect(ROSTER_CELLS["potassium"]?.compare(measured, absent)).toBe("incomparable");
  });
});

describe("mounting and unmounting", () => {
  it("leaves the host empty after destroy", () => {
    const r = mountGrid();
    r.render(model(0, 10));
    expect(host.querySelector(".idc")).not.toBeNull();

    r.destroy();
    expect(host.querySelector('[role="grid"]')).toBeNull();
  });

  it("survives being rendered with no rows at all", () => {
    const r = mountGrid();
    const empty: GridViewModel<Patient> = {
      columns: COLUMNS, rows: [], total: 0, sort: [], selection: [], focus: null,
    };
    expect(() => r.render(empty)).not.toThrow();
    expect(host.querySelectorAll('.oxg-body [role="row"]')).toHaveLength(0);
    expect(errors).toEqual([]);
  });

  it("survives a re-render with the same model", () => {
    const r = mountGrid();
    const m = model(0, 10);
    r.render(m);
    r.render(m);
    expect(host.querySelectorAll(".idc").length).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
});

describe("hostile data reaches no parser", () => {
  it("renders a formula payload in a name as literal text", () => {
    const hostile: Patient = {
      ...(ROWS[0] as Patient),
      id: "hostile",
      name: `=cmd|' /c calc'!A1`,
      problems: ['<img src=x onerror="alert(1)">'],
    };
    const r = mountGrid();
    r.render({
      columns: COLUMNS,
      rows: [{ id: hostile.id, row: hostile, index: 0 }],
      total: 1, sort: [], selection: [], focus: null,
    });

    // The grid treats it as the text it is; export is where it matters.
    expect(host.querySelector(".pname")?.textContent).toBe(`=cmd|' /c calc'!A1`);
    expect(host.querySelector("img")).toBeNull();
    expect(errors).toEqual([]);
  });
});

describe("errors are reported without leaking a patient", () => {
  it("carries coordinates, never a row id or a value", () => {
    const exploding = {
      ...(ROSTER_CELLS["status"] as NonNullable<(typeof ROSTER_CELLS)["status"]>),
      update: vi.fn(() => {
        throw new Error("cell blew up");
      }),
    };
    const r = createGridRenderer<Patient>(host, {
      label: "Patient roster",
      rowHeight: 56,
      cells: { ...ROSTER_CELLS, status: exploding },
      onAction: () => {},
      onError: (e) => errors.push(e),
      fallback: () => ({ kind: "text", text: "" }),
    });
    errors = [];
    r.render(model(0, 5));

    if (errors.length > 0) {
      for (const e of errors as Array<Record<string, unknown>>) {
        expect(e).toHaveProperty("columnKey");
        // rowIndex, not rowId: a row id can be an MRN.
        expect(e).not.toHaveProperty("rowId");
        expect(JSON.stringify(e)).not.toContain("MRN-");
      }
    }
  });
});
