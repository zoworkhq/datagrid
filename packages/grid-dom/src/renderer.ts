/**
 * The framework-free DOM renderer.
 *
 * This package sitting *below* the adapters is the decision that makes
 * framework agnosticism affordable: the ARIA contract, the keyboard model and
 * focus behaviour are written once here and are identical in React, Angular,
 * Vue and vanilla. Every multi-framework library that puts accessibility in the
 * adapters ends up with four subtly different implementations, and the fourth
 * is always the worst.
 *
 * Wave 1 renders every row. Windowing, node recycling and scroll anchoring are
 * wave 2 — but the structure here is the one they will patch, and the focus
 * model is already identity-based so recycling cannot move focus onto the
 * wrong row.
 */
import {
  type FocusTarget,
  type GridAction,
  type GridError,
  type KeyBinding,
  type SortSpec,
  DEFAULT_KEYMAP,
  sanitiseError,
} from "@oxygenui-design/grid-core";
import { ariaRowCount, ariaRowIndex } from "./aria.js";
import { setCellContent, type CellContent, type CellRenderer } from "./cell.js";
import { chordOf, moveForBinding, resolveBinding } from "./keyboard.js";
import { moveFocus, resolveFocus, type GridShape } from "./focus.js";

/** The header is row 1 of the grid, and is navigable — arrowing up from the first data row reaches it. */
export const HEADER_ROW_ID = "__oxg_header__";

export interface RenderColumn {
  readonly key: string;
  readonly header: string;
  readonly width?: number;
  readonly sortable?: boolean;
}

export interface RenderRow<TRow> {
  readonly id: string;
  readonly row: TRow;
  /** Absolute position in the whole result set, 0-based. Not the position in the window. */
  readonly index: number;
}

export interface GridViewModel<TRow> {
  readonly columns: readonly RenderColumn[];
  readonly rows: readonly RenderRow<TRow>[];
  /** `"unknown"` becomes `aria-rowcount="-1"`, which is the specified value. */
  readonly total: number | "unknown";
  readonly sort: readonly SortSpec[];
  readonly selection: readonly string[];
  readonly focus: FocusTarget | null;
}

export interface RendererOptions<TRow> {
  /** The grid's accessible name. "Patient roster", not "grid". */
  readonly label: string;
  readonly onAction: (action: GridAction) => void;
  readonly onError?: (error: GridError) => void;
  readonly cells?: Readonly<Record<string, CellRenderer<TRow>>>;
  readonly fallback?: (row: TRow, columnKey: string) => CellContent;
  readonly keymap?: readonly KeyBinding[];
  readonly pageRows?: number;
}

export interface GridRenderer<TRow> {
  render(model: GridViewModel<TRow>): void;
  destroy(): void;
}

const ariaSort = (sort: readonly SortSpec[], key: string): string | null => {
  const s = sort.find((x) => x.key === key);
  return s ? (s.direction === "asc" ? "ascending" : "descending") : null;
};

export function createGridRenderer<TRow>(
  host: HTMLElement,
  options: RendererOptions<TRow>,
): GridRenderer<TRow> {
  const doc = host.ownerDocument;
  const keymap = options.keymap ?? DEFAULT_KEYMAP;
  const pageRows = options.pageRows ?? 20;

  const grid = doc.createElement("div");
  grid.setAttribute("role", "grid");
  grid.setAttribute("aria-label", options.label);
  grid.className = "oxg";

  const headGroup = doc.createElement("div");
  headGroup.setAttribute("role", "rowgroup");
  headGroup.className = "oxg-head";

  const bodyGroup = doc.createElement("div");
  bodyGroup.setAttribute("role", "rowgroup");
  bodyGroup.className = "oxg-body";

  // The live region belongs to the grid, not the application: the renderer is
  // the only thing that knows a row's absolute position under windowing.
  const live = doc.createElement("div");
  live.setAttribute("role", "status");
  live.setAttribute("aria-live", "polite");
  live.className = "oxg-live";
  live.style.cssText =
    "position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap";

  grid.append(headGroup, bodyGroup, live);
  host.append(grid);

  let current: GridViewModel<TRow> | null = null;
  const mounted = new Map<HTMLElement, CellRenderer<TRow>>();

  const shapeOf = (m: GridViewModel<TRow>): GridShape => ({
    rowIds: [HEADER_ROW_ID, ...m.rows.map((r) => r.id)],
    columnKeys: m.columns.map((c) => c.key),
  });

  const report = (thrown: unknown, columnKey: string, rowIndex: number, phase: "render" | "read"): void => {
    options.onError?.(sanitiseError(thrown, { code: "renderer-threw", phase, columnKey, rowIndex }));
  };

  function fillCell(el: HTMLElement, column: RenderColumn, entry: RenderRow<TRow>): void {
    const renderer = options.cells?.[column.key];
    try {
      if (renderer) {
        const ctx = {
          row: entry.row,
          columnKey: column.key,
          rowIndex: entry.index,
          onError: (e: GridError) => options.onError?.(e),
        };
        const existing = mounted.get(el);
        if (existing === renderer) renderer.update(el, ctx);
        else {
          existing?.unmount(el);
          renderer.mount(el, ctx);
          mounted.set(el, renderer);
        }
        return;
      }
      const content = options.fallback?.(entry.row, column.key) ?? { kind: "text" as const, text: "" };
      setCellContent(el, content);
    } catch (thrown) {
      // A renderer that throws must not take the grid down, and must not carry
      // the value that caused it into the caller's error reporting.
      el.textContent = "";
      el.dataset["error"] = "1";
      report(thrown, column.key, entry.index, "render");
    }
  }

  function paint(m: GridViewModel<TRow>): void {
    grid.setAttribute("aria-rowcount", String(ariaRowCount(m.total)));
    grid.setAttribute("aria-colcount", String(m.columns.length));

    const focus = resolveFocus(shapeOf(m), m.focus);

    // ── header ──────────────────────────────────────────────────────────────
    headGroup.textContent = "";
    const hRow = doc.createElement("div");
    hRow.setAttribute("role", "row");
    hRow.setAttribute("aria-rowindex", "1");
    hRow.dataset["rowId"] = HEADER_ROW_ID;
    m.columns.forEach((column, i) => {
      const th = doc.createElement("div");
      th.setAttribute("role", "columnheader");
      th.setAttribute("aria-colindex", String(i + 1));
      const sorted = ariaSort(m.sort, column.key);
      if (sorted) th.setAttribute("aria-sort", sorted);
      else if (column.sortable) th.setAttribute("aria-sort", "none");
      th.dataset["colKey"] = column.key;
      const isFocus = focus?.rowId === HEADER_ROW_ID && focus.columnKey === column.key;
      th.setAttribute("tabindex", isFocus ? "0" : "-1");
      if (column.width !== undefined) th.style.width = `${column.width}px`;
      th.textContent = column.header;
      hRow.append(th);
    });
    headGroup.append(hRow);

    // ── body ────────────────────────────────────────────────────────────────
    for (const [el, r] of mounted) r.unmount(el);
    mounted.clear();
    bodyGroup.textContent = "";

    const selected = new Set(m.selection);
    for (const entry of m.rows) {
      const row = doc.createElement("div");
      row.setAttribute("role", "row");
      // Absolute, so a screen reader announces "row 19,998" and not the
      // position within a rendered window of fifteen.
      row.setAttribute("aria-rowindex", String(ariaRowIndex(entry.index)));
      row.dataset["rowId"] = entry.id;
      if (selected.has(entry.id)) row.setAttribute("aria-selected", "true");

      m.columns.forEach((column, i) => {
        const cell = doc.createElement("div");
        cell.setAttribute("role", "gridcell");
        cell.setAttribute("aria-colindex", String(i + 1));
        cell.dataset["colKey"] = column.key;
        const isFocus = focus?.rowId === entry.id && focus.columnKey === column.key;
        // The body is ONE tab stop: exactly one cell in the whole grid carries
        // tabindex="0". A tab stop per cell is 800 presses to leave a 40x20 grid.
        cell.setAttribute("tabindex", isFocus ? "0" : "-1");
        if (column.width !== undefined) cell.style.width = `${column.width}px`;
        fillCell(cell, column, entry);
        row.append(cell);
      });
      bodyGroup.append(row);
    }

    current = { ...m, focus };
  }

  function announce(m: GridViewModel<TRow>, target: FocusTarget): void {
    const column = m.columns.find((c) => c.key === target.columnKey);
    if (target.rowId === HEADER_ROW_ID) {
      live.textContent = `${column?.header ?? ""}, column header`;
      return;
    }
    const entry = m.rows.find((r) => r.id === target.rowId);
    if (!entry || !column) return;
    const renderer = options.cells?.[column.key];
    let value = "";
    try {
      value = renderer
        ? renderer.read({
            row: entry.row,
            columnKey: column.key,
            rowIndex: entry.index,
            onError: (e) => options.onError?.(e),
          })
        : (options.fallback?.(entry.row, column.key) as { text?: string } | undefined)?.text ?? "";
    } catch (thrown) {
      report(thrown, column.key, entry.index, "read");
    }
    const of = m.total === "unknown" ? "" : ` of ${m.total}`;
    live.textContent = `${column.header}, ${value}, row ${entry.index + 1}${of}`;
  }

  function focusCell(target: FocusTarget): void {
    const rowSel = `[data-row-id="${CSS.escape(target.rowId)}"]`;
    const colSel = `[data-col-key="${CSS.escape(target.columnKey)}"]`;
    const el = grid.querySelector<HTMLElement>(`${rowSel} ${colSel}`);
    el?.focus();
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (!current) return;
    const focus = current.focus;
    if (!focus) return;

    const context = focus.rowId === HEADER_ROW_ID ? "header" : "body";
    const binding = resolveBinding(keymap, context, chordOf(e));
    if (!binding) return;

    const move = moveForBinding(binding);
    if (move) {
      const next = moveFocus(shapeOf(current), focus, move, pageRows);
      if (next && (next.rowId !== focus.rowId || next.columnKey !== focus.columnKey)) {
        e.preventDefault();
        options.onAction({ type: "focus/cell", rowId: next.rowId, columnKey: next.columnKey });
        current = { ...current, focus: next };
        paint(current);
        focusCell(next);
        announce(current, next);
      } else {
        e.preventDefault(); // movement was refused at an edge; do not scroll the page
      }
      return;
    }

    switch (binding.id) {
      case "sort.toggle":
      case "sort.additive":
        e.preventDefault();
        options.onAction({
          type: "sort/toggle",
          key: focus.columnKey,
          additive: binding.id === "sort.additive",
        });
        return;
      case "row.select":
        if (context === "body") {
          e.preventDefault();
          options.onAction({ type: "select/toggle", id: focus.rowId });
        }
        return;
      case "select.clear":
        e.preventDefault();
        options.onAction({ type: "select/clear" });
        return;
      case "row.activate":
        if (context === "body") {
          e.preventDefault();
          options.onAction({ type: "focus/cell", rowId: focus.rowId, columnKey: focus.columnKey });
        }
        return;
      default:
        return;
    }
  }

  function onFocusIn(e: FocusEvent): void {
    const el = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-col-key]");
    const rowEl = el?.closest<HTMLElement>("[data-row-id]");
    const rowId = rowEl?.dataset["rowId"];
    const columnKey = el?.dataset["colKey"];
    if (!rowId || !columnKey || !current) return;
    if (current.focus?.rowId === rowId && current.focus.columnKey === columnKey) return;
    options.onAction({ type: "focus/cell", rowId, columnKey });
  }

  grid.addEventListener("keydown", onKeyDown);
  grid.addEventListener("focusin", onFocusIn);

  return {
    render(model) {
      paint(model);
    },
    destroy() {
      grid.removeEventListener("keydown", onKeyDown);
      grid.removeEventListener("focusin", onFocusIn);
      for (const [el, r] of mounted) r.unmount(el);
      mounted.clear();
      grid.remove();
      current = null;
    },
  };
}
