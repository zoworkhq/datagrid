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
  type RowId,
  type SpanFn,
  partitionPinned,
  planSpans,
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
import { moveFocus, type GridShape } from "./focus.js";

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
  /**
   * Rows held out of the scrolling band. Always rendered, never virtualised —
   * that is what pinning means, so a caller who pins a thousand rows has asked
   * for a thousand rendered rows.
   */
  readonly pinned?: { readonly top?: ReadonlySet<RowId>; readonly bottom?: ReadonlySet<RowId> };
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
  /**
   * How many columns a cell covers. Used by the masked-region case, where one
   * "withheld under 42 CFR Part 2" notice spans three columns rather than
   * repeating in each.
   */
  readonly span?: SpanFn<TRow>;
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

  // ── phase 2 of the SSR boundary ─────────────────────────────────────────
  // If the server rendered a first page into this host, ADOPT those nodes
  // rather than clearing and rebuilding. Replacing them is what produces the
  // flash, the lost scroll position and the hydration warning that make teams
  // wrap a grid in a dynamic import and stop trusting it. See ssr.ts.
  // `:not([data-oxg-live])` matters: only *server* markup may be adopted. A
  // root that a live renderer already owns is never adopted, because two
  // renderers sharing one DOM tree would recycle each other's rows.
  const existing = host.querySelector<HTMLElement>(":scope > .oxg-root:not([data-oxg-live])");
  const hydrating = existing !== null;

  const make = (tag: string, cls: string, from: HTMLElement | null): HTMLElement => {
    const el = from ?? doc.createElement(tag);
    el.className = cls;
    return el;
  };
  const within = (parent: HTMLElement | null, selector: string): HTMLElement | null =>
    hydrating && parent ? parent.querySelector<HTMLElement>(selector) : null;

  const root = make("div", "oxg-root", existing);

  // The live region is a SIBLING of the grid, not a child of it: role="grid"
  // owns its children and admits only rowgroup and row. axe flags a role=status
  // inside it as a critical violation, and it is right to.
  const grid = make("div", "oxg", within(root, ':scope > [role="grid"]'));
  grid.setAttribute("role", "grid");
  grid.setAttribute("aria-label", options.label);

  const headGroup = make("div", "oxg-head", within(grid, ':scope > .oxg-head'));
  headGroup.setAttribute("role", "rowgroup");

  // The scroller and the canvas carry role="presentation" so they do not appear
  // between role="grid" and its rowgroups in the accessibility tree. Without
  // that, the required-children rule fails — the same defect as the live region.
  const viewport = make("div", "oxg-viewport", within(grid, ":scope > .oxg-viewport"));
  viewport.setAttribute("role", "presentation");
  viewport.style.cssText = "overflow-y:auto;overflow-x:hidden;position:relative";

  const canvas = make("div", "oxg-canvas", within(viewport, ":scope > .oxg-canvas"));
  canvas.setAttribute("role", "presentation");
  if (!hydrating) canvas.style.cssText = "position:relative;width:100%";

  const bodyGroup = make("div", "oxg-body", within(canvas, ":scope > .oxg-body"));
  bodyGroup.setAttribute("role", "rowgroup");

  const live = make("div", "oxg-live", within(root, ":scope > .oxg-live"));
  live.setAttribute("role", "status");
  live.setAttribute("aria-live", "polite");
  live.style.cssText =
    "position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap";

  if (!hydrating) {
    canvas.append(bodyGroup);
    viewport.append(canvas);
    grid.append(headGroup, viewport);
    root.append(grid, live);
    host.append(root);
  }
  root.dataset["oxgLive"] = "1";

  const geometry: Geometry = createGeometry(0, estimate);

  let current: GridViewModel<TRow> | null = null;
  let columnSignature = "";
  /** Recycled row nodes, in DOM order. Never destroyed while the grid lives. */
  const pool: HTMLElement[] = [];

  if (hydrating) {
    // Take the server's rows into the recycling pool, and derive the column
    // signature the same way paint does — so a matching header is not rebuilt.
    pool.push(...(Array.from(bodyGroup.children) as HTMLElement[]));
    columnSignature = Array.from(headGroup.querySelectorAll<HTMLElement>('[role="columnheader"]'))
      .map((th) => `${th.dataset["colKey"] ?? ""}:${th.textContent ?? ""}`)
      .join("|");
  }
  const mounted = new Map<HTMLElement, CellRenderer<TRow>>();
  let suppressScroll = false;

  /**
   * Band split and row index, memoised on the model.
   *
   * `paint` runs on every scroll frame. Partitioning 100,000 rows and scanning
   * for the focused row there made scroll cost O(rows) — the browser harness
   * measured p95 frame time going 9.7 ms at 10k to 30 ms at 100k, with every
   * frame dropped. Scroll must be O(window); only a model change is O(rows).
   */
  let bandsCache: {
    rows: unknown;
    pinned: unknown;
    bands: { top: RenderRow<TRow>[]; scrollable: readonly RenderRow<TRow>[]; bottom: RenderRow<TRow>[] };
    indexById: Map<string, number>;
    allIds: Set<string>;
  } | null = null;

  function bandsOf(m: GridViewModel<TRow>): NonNullable<typeof bandsCache> {
    const pinned = m.pinned ?? null;
    if (bandsCache && bandsCache.rows === m.rows && bandsCache.pinned === pinned) return bandsCache;

    const hasPins = (pinned?.top?.size ?? 0) > 0 || (pinned?.bottom?.size ?? 0) > 0;
    const split = hasPins
      ? partitionPinned(m.rows, (r) => r.id, pinned ?? {})
      : { top: [] as RenderRow<TRow>[], scrollable: m.rows, bottom: [] as RenderRow<TRow>[] };

    const indexById = new Map<string, number>();
    split.scrollable.forEach((r, i) => indexById.set(r.id, i));
    const allIds = new Set<string>();
    for (const r of m.rows) allIds.add(r.id);

    bandsCache = {
      rows: m.rows,
      pinned,
      bands: { top: [...split.top], scrollable: split.scrollable, bottom: [...split.bottom] },
      indexById,
      allIds,
    };
    return bandsCache;
  }

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

  /** An empty row shell. Cells are attached per bind, because spans vary by row. */
  function buildRow(): HTMLElement {
    const row = doc.createElement("div");
    row.setAttribute("role", "row");
    row.style.cssText = "position:absolute;left:0;right:0";
    return row;
  }

  function bindRow(
    row: HTMLElement,
    entry: RenderRow<TRow>,
    m: GridViewModel<TRow>,
    selected: ReadonlySet<string>,
    focus: FocusTarget | null,
    /** Where to put it: a geometry offset, or a sticky band. */
    place: { readonly kind: "flow"; readonly top: number } | { readonly kind: "pinned"; readonly edge: "start" | "end" },
  ): void {
    // Absolute, so a screen reader announces "row 19,998" and not the position
    // within a rendered window of fifteen. Pinning does not change which row
    // this is, only where it sits.
    row.setAttribute("aria-rowindex", String(ariaRowIndex(entry.index)));
    row.dataset["rowId"] = entry.id;
    row.dataset["rowIndex"] = String(entry.index);
    if (selected.has(entry.id)) row.setAttribute("aria-selected", "true");
    else row.removeAttribute("aria-selected");

    if (place.kind === "pinned") {
      row.dataset["pinned"] = place.edge;
      row.style.position = "sticky";
      row.style.top = place.edge === "start" ? "0px" : "";
      row.style.bottom = place.edge === "end" ? "0px" : "";
      row.style.zIndex = "1";
    } else {
      delete row.dataset["pinned"];
      row.style.position = "absolute";
      row.style.top = `${place.top}px`;
      row.style.bottom = "";
      row.style.zIndex = "";
    }

    const columnKeys = m.columns.map((c) => c.key);
    const plan = planSpans(entry.row, columnKeys, options.span);

    // The cell set changes with the span, so reconcile length first and then
    // rebind. A recycled row that spanned three columns must not leave two
    // orphaned cells behind.
    while (row.childElementCount > plan.cells.length) {
      const last = row.lastElementChild as HTMLElement | null;
      if (!last) break;
      const r = mounted.get(last);
      if (r) {
        r.unmount(last);
        mounted.delete(last);
      }
      last.remove();
    }
    while (row.childElementCount < plan.cells.length) {
      const cell = doc.createElement("div");
      cell.setAttribute("role", "gridcell");
      row.append(cell);
    }

    plan.cells.forEach((planned, i) => {
      const cell = row.children[i] as HTMLElement | undefined;
      if (!cell) return;
      const column = m.columns.find((c) => c.key === planned.key);
      if (!column) return;

      cell.setAttribute("aria-colindex", String(columnKeys.indexOf(planned.key) + 1));
      if (planned.span > 1) cell.setAttribute("aria-colspan", String(planned.span));
      else cell.removeAttribute("aria-colspan");
      cell.dataset["colKey"] = planned.key;

      const isFocus = focus?.rowId === entry.id && focus.columnKey === planned.key;
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

    // Pinned rows leave the scrolling band entirely: geometry covers only what
    // actually scrolls, so pinning a summary row does not shift every offset.
    const cached = bandsOf(m);
    const bands = cached.bands;
    geometry.setRowCount(bands.scrollable.length);

    // Resolved against the memoised id set rather than by rebuilding the whole
    // rowId array — `shapeOf` is O(rows) and this runs on every scroll frame.
    // Same semantics as `resolveFocus`: an unusable target falls back to the
    // header's first column, so the body always has exactly one tab stop.
    const columnKeys = m.columns.map((c) => c.key);
    const firstCell: FocusTarget | null =
      columnKeys.length > 0 ? { rowId: HEADER_ROW_ID, columnKey: columnKeys[0] as string } : null;
    const wanted = m.focus;
    const focus: FocusTarget | null =
      wanted &&
      firstCell &&
      (wanted.rowId === HEADER_ROW_ID || cached.allIds.has(wanted.rowId)) &&
      columnKeys.includes(wanted.columnKey)
        ? wanted
        : firstCell;

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
      // Column identity changed, so every pooled row's cells are stale. The
      // pool itself is kept; bindRow reconciles cell counts per row, which it
      // has to do anyway because spans vary from row to row.
      for (const [el, r] of mounted) r.unmount(el);
      mounted.clear();
      for (const row of pool) row.textContent = "";
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

    const visible = bands.scrollable.slice(w.start, w.end);
    // Keep the focused row rendered even when it has scrolled out of the
    // window. Without this, scrolling away from the focused cell recycles its
    // node and the browser drops focus to the document body — and the body is
    // one tab stop, so there would be nothing to return to. A pinned row is
    // always rendered, so it never needs keeping.
    const focusIndex =
      focus && focus.rowId !== HEADER_ROW_ID ? (cached.indexById.get(focus.rowId) ?? -1) : -1;
    const keeper =
      focusIndex >= 0 && (focusIndex < w.start || focusIndex >= w.end)
        ? bands.scrollable[focusIndex]
        : undefined;

    /** What renders, and where each one goes. Pinned bands bracket the window. */
    const render: {
      entry: RenderRow<TRow>;
      place: { kind: "flow"; top: number } | { kind: "pinned"; edge: "start" | "end" };
    }[] = [
      ...bands.top.map((entry) => ({ entry, place: { kind: "pinned" as const, edge: "start" as const } })),
      ...visible.map((entry, i) => ({
        entry,
        place: { kind: "flow" as const, top: geometry.offsetOf(w.start + i) },
      })),
      ...(keeper
        ? [{ entry: keeper, place: { kind: "flow" as const, top: geometry.offsetOf(focusIndex) } }]
        : []),
      ...bands.bottom.map((entry) => ({ entry, place: { kind: "pinned" as const, edge: "end" as const } })),
    ];

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
      const row = buildRow();
      pool.push(row);
      bodyGroup.append(row);
      observer?.observe(row);
    }

    const selected = new Set(m.selection);
    render.forEach((item, i) => {
      const row = pool[i];
      if (row) bindRow(row, item.entry, m, selected, focus, item.place);
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
      // Index within the scrolling band: a pinned row is always visible, so
      // scrolling to it would move the viewport for no reason.
      const i = bandsOf(current).indexById.get(next.rowId) ?? -1;
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

  /**
   * Pointer sorting.
   *
   * The keymap has always bound Enter on a header, so sorting was reachable by
   * keyboard from the first commit — and only by keyboard, which the playground
   * exposed immediately. Shift-click adds to the sort rather than replacing it,
   * matching `sort.additive`.
   *
   * A column that is not `sortable` does nothing, rather than emitting an
   * action the caller has to know to ignore.
   */
  function onHeaderClick(e: MouseEvent): void {
    if (!current) return;
    const th = (e.target as HTMLElement | null)?.closest<HTMLElement>('[role="columnheader"]');
    if (!th) return;
    const key = th.dataset["colKey"];
    if (!key) return;
    if (current.columns.find((c) => c.key === key)?.sortable !== true) return;

    e.preventDefault();
    options.onAction({ type: "sort/toggle", key, additive: e.shiftKey });
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

  if (observer) for (const row of pool) observer.observe(row);

  grid.addEventListener("keydown", onKeyDown);
  grid.addEventListener("focusin", onFocusIn);
  headGroup.addEventListener("click", onHeaderClick);
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
      headGroup.removeEventListener("click", onHeaderClick);
      viewport.removeEventListener("scroll", onScroll);
      observer?.disconnect();
      for (const [el, r] of mounted) r.unmount(el);
      mounted.clear();
      pool.length = 0;
      bandsCache = null;
      root.remove();
      current = null;
    },
  };
}
