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
 * Rows are windowed and their nodes recycled. The scroll cost of a virtualised
 * grid is nodes entering and leaving, not nodes existing — Glide abandoned DOM
 * virtualisation over exactly this — so a row leaving the window is *reused*
 * with its content patched, never destroyed and recreated.
 *
 * Recycling has one catastrophic failure mode: a reused node keeping a previous
 * row's content, so the grid shows one patient's data on another patient's row.
 * It is invisible to every other kind of test. `recycling.test.ts` asserts, on
 * every scroll step, that each rendered cell matches the row it claims to be.
 */
import {
  type FocusTarget,
  type Geometry,
  type GridAction,
  type GridError,
  type KeyBinding,
  type SortSpec,
  createGeometry,
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
  /** Starting height for an unmeasured row. Measured heights replace it. */
  readonly rowHeight?: number;
  /** Rows rendered beyond each edge of the viewport. */
  readonly overscan?: number;
}

export interface GridRenderer<TRow> {
  render(model: GridViewModel<TRow>): void;
  /**
   * Records a row's measured height and adjusts `scrollTop` so the anchor row
   * does not move under the reader.
   *
   * The renderer observes its own rows and calls this itself — measurement is
   * a DOM concern and `grid-dom` owns the DOM. Putting it in the adapters
   * would mean writing it once per framework, which is the thing this layer
   * exists to prevent. It is public for tests and for a consumer whose row
   * heights come from somewhere the DOM cannot see.
   */
  measureRow(index: number, height: number): void;
  /** The mounted root, for an adapter that needs to observe or style it. */
  readonly element: HTMLElement;
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
  const overscan = options.overscan ?? 4;
  const estimate = options.rowHeight ?? 40;

  // The live region is a SIBLING of the grid, not a child of it: role="grid"
  // owns its children and admits only rowgroup and row. axe flags a role=status
  // inside it as a critical violation, and it is right to.
  const root = doc.createElement("div");
  root.className = "oxg-root";

  const grid = doc.createElement("div");
  grid.setAttribute("role", "grid");
  grid.setAttribute("aria-label", options.label);
  grid.className = "oxg";

  const headGroup = doc.createElement("div");
  headGroup.setAttribute("role", "rowgroup");
  headGroup.className = "oxg-head";

  // The scroller and the canvas carry role="presentation" so they do not appear
  // between role="grid" and its rowgroups in the accessibility tree. Without
  // that, the required-children rule fails — the same defect as the live region.
  const viewport = doc.createElement("div");
  viewport.setAttribute("role", "presentation");
  viewport.className = "oxg-viewport";
  viewport.style.cssText = "overflow-y:auto;overflow-x:hidden;position:relative";

  const canvas = doc.createElement("div");
  canvas.setAttribute("role", "presentation");
  canvas.className = "oxg-canvas";
  canvas.style.cssText = "position:relative;width:100%";

  const bodyGroup = doc.createElement("div");
  bodyGroup.setAttribute("role", "rowgroup");
  bodyGroup.className = "oxg-body";

  const live = doc.createElement("div");
  live.setAttribute("role", "status");
  live.setAttribute("aria-live", "polite");
  live.className = "oxg-live";
  live.style.cssText =
    "position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap";

  canvas.append(bodyGroup);
  viewport.append(canvas);
  grid.append(headGroup, viewport);
  root.append(grid, live);
  host.append(root);

  const geometry: Geometry = createGeometry(0, estimate);

  let current: GridViewModel<TRow> | null = null;
  let columnSignature = "";
  /** Recycled row nodes, in DOM order. Never destroyed while the grid lives. */
  const pool: HTMLElement[] = [];
  const mounted = new Map<HTMLElement, CellRenderer<TRow>>();
  let suppressScroll = false;

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
        // A recycled node calls update(), never mount() — that is the whole
        // point of the two-method contract, and it is what lets a React portal
        // keep its identity across a scroll frame.
        if (existing === renderer) renderer.update(el, ctx);
        else {
          existing?.unmount(el);
          renderer.mount(el, ctx);
          mounted.set(el, renderer);
        }
        delete el.dataset["error"];
        return;
      }
      const existing = mounted.get(el);
      if (existing) {
        existing.unmount(el);
        mounted.delete(el);
      }
      const content = options.fallback?.(entry.row, column.key) ?? { kind: "text" as const, text: "" };
      setCellContent(el, content);
      delete el.dataset["error"];
    } catch (thrown) {
      // A renderer that throws must not take the grid down, and must not carry
      // the value that caused it into the caller's error reporting. It must
      // also not leave a previous row's content behind on a recycled node.
      el.textContent = "";
      el.dataset["error"] = "1";
      report(thrown, column.key, entry.index, "render");
    }
  }

  /** Builds the cells of a row once. Reused for every row that node ever holds. */
  function buildRow(columns: readonly RenderColumn[]): HTMLElement {
    const row = doc.createElement("div");
    row.setAttribute("role", "row");
    row.style.cssText = "position:absolute;left:0;right:0";
    columns.forEach((column, i) => {
      const cell = doc.createElement("div");
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("aria-colindex", String(i + 1));
      cell.dataset["colKey"] = column.key;
      row.append(cell);
    });
    return row;
  }

  function bindRow(
    row: HTMLElement,
    entry: RenderRow<TRow>,
    m: GridViewModel<TRow>,
    selected: ReadonlySet<string>,
    focus: FocusTarget | null,
  ): void {
    // Absolute, so a screen reader announces "row 19,998" and not the position
    // within a rendered window of fifteen.
    row.setAttribute("aria-rowindex", String(ariaRowIndex(entry.index)));
    row.dataset["rowId"] = entry.id;
    row.dataset["rowIndex"] = String(entry.index);
    if (selected.has(entry.id)) row.setAttribute("aria-selected", "true");
    else row.removeAttribute("aria-selected");
    row.style.top = `${geometry.offsetOf(entry.index)}px`;

    const cells = row.children;
    m.columns.forEach((column, i) => {
      const cell = cells[i] as HTMLElement | undefined;
      if (!cell) return;
      const isFocus = focus?.rowId === entry.id && focus.columnKey === column.key;
      // The body is ONE tab stop: exactly one cell in the whole grid carries
      // tabindex="0". A tab stop per cell is 800 presses to leave a 40x20 grid.
      cell.setAttribute("tabindex", isFocus ? "0" : "-1");
      if (column.width !== undefined) cell.style.width = `${column.width}px`;
      fillCell(cell, column, entry);
    });
  }

  function paint(m: GridViewModel<TRow>): void {
    grid.setAttribute("aria-rowcount", String(ariaRowCount(m.total)));
    grid.setAttribute("aria-colcount", String(m.columns.length));

    geometry.setRowCount(m.rows.length);
    const focus = resolveFocus(shapeOf(m), m.focus);

    // ── header ──────────────────────────────────────────────────────────────
    const signature = m.columns.map((c) => `${c.key}:${c.header}`).join("|");
    if (signature !== columnSignature) {
      headGroup.textContent = "";
      const hRow = doc.createElement("div");
      hRow.setAttribute("role", "row");
      hRow.setAttribute("aria-rowindex", "1");
      hRow.dataset["rowId"] = HEADER_ROW_ID;
      m.columns.forEach((column, i) => {
        const th = doc.createElement("div");
        th.setAttribute("role", "columnheader");
        th.setAttribute("aria-colindex", String(i + 1));
        th.dataset["colKey"] = column.key;
        th.textContent = column.header;
        hRow.append(th);
      });
      headGroup.append(hRow);
      // Column identity changed, so every pooled row's cells are stale.
      for (const [el, r] of mounted) r.unmount(el);
      mounted.clear();
      pool.length = 0;
      bodyGroup.textContent = "";
      columnSignature = signature;
    }

    for (const th of headGroup.querySelectorAll<HTMLElement>('[role="columnheader"]')) {
      const key = th.dataset["colKey"] ?? "";
      const column = m.columns.find((c) => c.key === key);
      const sorted = ariaSort(m.sort, key);
      if (sorted) th.setAttribute("aria-sort", sorted);
      else if (column?.sortable) th.setAttribute("aria-sort", "none");
      else th.removeAttribute("aria-sort");
      th.setAttribute("tabindex", focus?.rowId === HEADER_ROW_ID && focus.columnKey === key ? "0" : "-1");
      if (column?.width !== undefined) th.style.width = `${column.width}px`;
    }

    // ── window ──────────────────────────────────────────────────────────────
    const viewportHeight = viewport.clientHeight || 600;
    const w = geometry.windowFor(viewport.scrollTop, viewportHeight, overscan);
    canvas.style.height = `${w.totalHeight}px`;

    const visible = m.rows.slice(w.start, w.end);
    // Keep the focused row rendered even when it has scrolled out of the
    // window. Without this, scrolling away from the focused cell recycles its
    // node and the browser drops focus to the document body — and the body is
    // one tab stop, so there would be nothing to return to.
    const focusIndex =
      focus && focus.rowId !== HEADER_ROW_ID ? m.rows.findIndex((r) => r.id === focus.rowId) : -1;
    const keeper =
      focusIndex >= 0 && (focusIndex < w.start || focusIndex >= w.end) ? m.rows[focusIndex] : undefined;
    const render = keeper ? [...visible, keeper] : visible;

    // ── recycle ─────────────────────────────────────────────────────────────
    while (pool.length > render.length) {
      const row = pool.pop();
      if (!row) break;
      observer?.unobserve(row);
      for (const cell of Array.from(row.children) as HTMLElement[]) {
        const r = mounted.get(cell);
        if (r) {
          r.unmount(cell);
          mounted.delete(cell);
        }
      }
      row.remove();
    }
    while (pool.length < render.length) {
      const row = buildRow(m.columns);
      pool.push(row);
      bodyGroup.append(row);
      observer?.observe(row);
    }

    const selected = new Set(m.selection);
    render.forEach((entry, i) => {
      const row = pool[i];
      if (row) bindRow(row, entry, m, selected, focus);
    });

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

  /** Scrolls a row fully into view. Keyboard focus must never land off-screen. */
  function scrollIntoView(index: number): void {
    const top = geometry.offsetOf(index);
    const bottom = top + geometry.heightOf(index);
    const height = viewport.clientHeight || 600;
    const start = viewport.scrollTop;
    let next = start;
    if (top < start) next = top;
    else if (bottom > start + height) next = bottom - height;
    if (next !== start) {
      suppressScroll = true;
      viewport.scrollTop = next;
      suppressScroll = false;
    }
  }

  function focusCell(target: FocusTarget): void {
    const rowSel = `[data-row-id="${CSS.escape(target.rowId)}"]`;
    const colSel = `[data-col-key="${CSS.escape(target.columnKey)}"]`;
    const el = grid.querySelector<HTMLElement>(`${rowSel} ${colSel}`);
    el?.focus();
  }

  function moveTo(next: FocusTarget): void {
    if (!current) return;
    options.onAction({ type: "focus/cell", rowId: next.rowId, columnKey: next.columnKey });
    current = { ...current, focus: next };
    if (next.rowId !== HEADER_ROW_ID) {
      const i = current.rows.findIndex((r) => r.id === next.rowId);
      if (i >= 0) scrollIntoView(i);
    } else {
      scrollIntoView(0);
    }
    paint(current);
    focusCell(next);
    announce(current, next);
  }

  function onScroll(): void {
    if (suppressScroll || !current) return;
    paint(current);
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
      e.preventDefault(); // at an edge too: never scroll the page instead
      const next = moveFocus(shapeOf(current), focus, move, pageRows);
      if (next && (next.rowId !== focus.rowId || next.columnKey !== focus.columnKey)) moveTo(next);
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

  function applyMeasurement(index: number, height: number): void {
    const anchor = geometry.indexAt(viewport.scrollTop);
    const delta = geometry.measure(index, height);
    if (delta === 0) return;
    const shift = geometry.anchorShift(anchor, index, delta);
    if (shift !== 0) {
      suppressScroll = true;
      viewport.scrollTop += shift;
      suppressScroll = false;
    }
    if (current) paint(current);
  }

  // Heights are measured by the renderer, not by the adapters. A row whose
  // content wraps to a second line changes height after paint, and the anchor
  // row must not move when it does.
  const observer =
    typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver((entries) => {
          for (const entry of entries) {
            const el = entry.target as HTMLElement;
            const index = Number(el.dataset["rowIndex"]);
            if (Number.isFinite(index)) applyMeasurement(index, el.getBoundingClientRect().height);
          }
        });

  grid.addEventListener("keydown", onKeyDown);
  grid.addEventListener("focusin", onFocusIn);
  viewport.addEventListener("scroll", onScroll);

  return {
    render(model) {
      paint(model);
    },

    measureRow: applyMeasurement,

    get element() {
      return root;
    },

    destroy() {
      grid.removeEventListener("keydown", onKeyDown);
      grid.removeEventListener("focusin", onFocusIn);
      viewport.removeEventListener("scroll", onScroll);
      observer?.disconnect();
      for (const [el, r] of mounted) r.unmount(el);
      mounted.clear();
      pool.length = 0;
      root.remove();
      current = null;
    },
  };
}
