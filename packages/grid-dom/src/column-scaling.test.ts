// @vitest-environment jsdom
/**
 * The column axis is virtualised, and stays that way.
 *
 * This is the gate that would have caught the defect the audit found. The grid
 * shipped rendering EVERY column of every visible row, so cost per row grew
 * linearly with column count: at 100 columns scroll p50 measured 33.3 ms
 * against AG Grid's 8.3 ms, and at 250 columns it emitted 12.6x more DOM.
 *
 * Nothing caught it. The scaling test guards the ROW axis by counting index
 * reads; the a11y and renderer suites use five columns, where the defect is
 * invisible. A cell-count assertion is cheap and would have failed on the day.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createGridRenderer, type GridViewModel } from "./renderer.js";

interface Row { readonly id: string; readonly [key: string]: string }

function fixture(rowCount: number, colCount: number) {
  const columns = Array.from({ length: colCount }, (_, c) => ({
    key: `c${c}`, header: `C${c}`, width: 140,
  }));
  const rows = Array.from({ length: rowCount }, (_, i) => {
    const row: Record<string, string> = { id: `r${i}` };
    for (let c = 0; c < colCount; c++) row[`c${c}`] = `${i}-${c}`;
    return row as Row;
  });
  return { columns, rows };
}

let host: HTMLElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  // jsdom reports 0 for every layout box, and a zero-width viewport cannot be
  // windowed — the renderer deliberately falls back to rendering all columns
  // there, because a window of one column would paint an empty grid. Give it
  // real numbers so the windowing path is the one under test.
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get(): number { return this.classList?.contains("oxg-viewport") ? 600 : 0; },
  });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get(): number { return this.classList?.contains("oxg-viewport") ? 1200 : 0; },
  });
});

const mount = (colCount: number, rowCount = 500) => {
  const { columns, rows } = fixture(rowCount, colCount);
  const r = createGridRenderer<Row>(host, {
    label: "scaling", rowHeight: 32, onAction: () => {},
    fallback: (row, key) => ({ kind: "text", text: String(row[key] ?? "") }),
  });
  const model: GridViewModel<Row> = {
    columns, rows: rows.map((row, index) => ({ id: row.id, row, index })),
    total: rows.length, sort: [], selection: [], focus: null,
  };
  r.render(model);
  return { r, model, columns, rows };
};

const cellsPerRow = (): number => {
  const rows = host.querySelectorAll('.oxg-body [role="row"]');
  if (rows.length === 0) return 0;
  const cells = host.querySelectorAll('.oxg-body [role="gridcell"]');
  return cells.length / rows.length;
};

describe("cells rendered per row", () => {
  it.each([[20], [100], [250], [500]])("stays bounded at %i columns", (colCount) => {
    mount(colCount);
    // A 1200px viewport of 140px columns holds ~9, plus overscan either side.
    // The bound is generous; what it forbids is growth WITH the column count.
    expect(cellsPerRow()).toBeLessThanOrEqual(20);
    expect(cellsPerRow()).toBeGreaterThan(0);
  });

  it("does not grow between 20 and 500 columns", () => {
    mount(20);
    const narrow = cellsPerRow();
    host.textContent = "";
    mount(500);
    const wide = cellsPerRow();
    // THE REGRESSION: this was 20 against 500 before column virtualisation.
    expect(wide).toBeLessThanOrEqual(narrow + 2);
  });

  it("renders headers for the window, not for every column", () => {
    mount(500);
    expect(host.querySelectorAll('[role="columnheader"]').length).toBeLessThanOrEqual(20);
  });
});

describe("what windowing must not break", () => {
  it("numbers columns absolutely, whatever is rendered", () => {
    mount(500);
    const first = host.querySelector('.oxg-body [role="gridcell"]');
    // Column index is the position in the COLUMN LIST. A screen reader saying
    // "column 1" for what is actually column 187 is worse than saying nothing.
    expect(Number(first?.getAttribute("aria-colindex"))).toBeGreaterThan(0);
    expect(host.querySelector('[role="grid"]')?.getAttribute("aria-colcount")).toBe("500");
  });

  it("keeps the spacers out of the accessibility tree", () => {
    mount(500);
    // Spacers hold the horizontal scroll extent. They are not cells, and
    // announcing them as such puts empty gridcells either side of every row.
    for (const cell of host.querySelectorAll('.oxg-body [role="gridcell"]')) {
      expect(cell.textContent?.trim()).not.toBe("");
    }
  });

  it("gives the canvas the full width of every column, not the rendered ones", () => {
    mount(500);
    const canvas = host.querySelector<HTMLElement>(".oxg-canvas");
    // 500 x 140px. Without this the scrollbar spans the window and the other
    // 480 columns are unreachable.
    expect(parseInt(canvas?.style.width ?? "0", 10)).toBe(70_000);
  });

  it("keeps the focused column rendered even when it is outside the window", () => {
    const { r, model } = mount(500);
    r.render({ ...model, focus: { rowId: "r0", columnKey: "c400" } });
    // Recycling the focused cell drops focus to the body, and the body is one
    // tab stop — there would be nothing to tab back to.
    expect(host.querySelector('[role="gridcell"][data-col-key="c400"]')).not.toBeNull();
  });

  it("renders every column when spans are in use", () => {
    // `planSpans` reasons over the whole column list, and a span beginning left
    // of the window cannot be planned from a slice. Correctness over speed.
    const { columns, rows } = fixture(100, 60);
    const r = createGridRenderer<Row>(host, {
      label: "spans", rowHeight: 32, onAction: () => {},
      span: () => undefined,
      fallback: (row, key) => ({ kind: "text", text: String(row[key] ?? "") }),
    });
    r.render({
      columns, rows: rows.map((row, index) => ({ id: row.id, row, index })),
      total: rows.length, sort: [], selection: [], focus: null,
    });
    expect(cellsPerRow()).toBe(60);
  });
});
