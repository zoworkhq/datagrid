/**
 * @oxygenui-design/grid-element — `<ox-data-grid>`.
 *
 * ── THE SAME THREE JOBS AS EVERY ADAPTER ────────────────────────────────────
 *
 *   1. Own the mount point.
 *   2. Marshal cell renderers into `grid-dom`'s interface.
 *   3. Bridge reactivity — here, property setters, because a custom element's
 *      reactivity system is "someone assigned a property".
 *
 * No grid logic. Sorting, filtering, ARIA, focus, virtualisation and recycling
 * all live in `grid-core` and `grid-dom`, written once. This package exists to
 * prove that: it is the second adapter, and the cross-adapter parity test
 * asserts it produces an accessibility tree identical to React's.
 *
 * ── LIGHT DOM, DELIBERATELY ─────────────────────────────────────────────────
 *
 * No shadow root. A shadow boundary cuts the design-token cascade and breaks
 * forced-colors inheritance, and both matter more here than encapsulation does:
 * a clinical surface has to honour a user's high-contrast mode, and it has to
 * inherit the host application's tokens rather than carrying its own.
 *
 * This is also the answer for Svelte, Qwik, Solid and vanilla — one package
 * rather than one per framework, which is where a two-person team draws the
 * line.
 */
import type { GridAction, GridError } from "@oxygenui-design/grid-core";
import {
  createGridRenderer,
  type CellRenderer,
  type GridRenderer,
  type GridViewModel,
} from "@oxygenui-design/grid-dom";

export interface OxDataGridProps<TRow> {
  model: GridViewModel<TRow> | null;
  label: string;
  cells?: Readonly<Record<string, CellRenderer<TRow>>>;
  fallback?: (row: TRow, columnKey: string) => { kind: "text"; text: string };
  rowHeight?: number;
}

/**
 * Events, because that is a custom element's outward channel.
 *
 * They carry the same coordinate-only payloads as every other surface: an
 * action, or a `GridError` with `{ code, phase, columnKey, rowIndex }` and
 * never a value (ADR 0002).
 */
export interface OxDataGridEventMap {
  "ox-action": CustomEvent<GridAction>;
  "ox-error": CustomEvent<GridError>;
}

export class OxDataGridElement<TRow = unknown> extends HTMLElement {
  #renderer: GridRenderer<TRow> | null = null;
  #model: GridViewModel<TRow> | null = null;
  // `exactOptionalPropertyTypes` is on, so these hold explicit `| undefined`
  // rather than being optional — a setter really can be handed undefined.
  #props: {
    label?: string | undefined;
    cells?: Readonly<Record<string, CellRenderer<TRow>>> | undefined;
    fallback?: OxDataGridProps<TRow>["fallback"] | undefined;
    rowHeight?: number | undefined;
  } = {};

  static get observedAttributes(): readonly string[] {
    return ["label", "row-height"];
  }

  /** The grid's accessible name. "Patient roster", not "grid". */
  get label(): string {
    return this.#props.label ?? this.getAttribute("label") ?? "Data grid";
  }
  set label(value: string) {
    this.#props.label = value;
    this.#remount();
  }

  get model(): GridViewModel<TRow> | null {
    return this.#model;
  }
  set model(value: GridViewModel<TRow> | null) {
    this.#model = value;
    if (value && this.#renderer) this.#renderer.render(value);
  }

  set cells(value: Readonly<Record<string, CellRenderer<TRow>>> | undefined) {
    this.#props.cells = value;
    this.#remount();
  }

  set fallback(value: OxDataGridProps<TRow>["fallback"]) {
    this.#props.fallback = value;
    this.#remount();
  }

  set rowHeight(value: number) {
    this.#props.rowHeight = value;
    this.#remount();
  }

  connectedCallback(): void {
    this.#mount();
  }

  disconnectedCallback(): void {
    // Every adapter tears down completely. The memory gate asserts this shape
    // for the renderer; an adapter that forgets it leaks a grid per navigation.
    this.#renderer?.destroy();
    this.#renderer = null;
  }

  attributeChangedCallback(): void {
    if (this.#renderer) this.#remount();
  }

  #mount(): void {
    if (this.#renderer) return;
    const attr = Number(this.getAttribute("row-height"));
    const rowHeight = this.#props.rowHeight ?? (Number.isFinite(attr) && attr > 0 ? attr : undefined);

    this.#renderer = createGridRenderer<TRow>(this, {
      label: this.label,
      onAction: (action) => {
        this.dispatchEvent(new CustomEvent("ox-action", { detail: action, bubbles: true }));
      },
      onError: (error) => {
        this.dispatchEvent(new CustomEvent("ox-error", { detail: error, bubbles: true }));
      },
      ...(this.#props.cells ? { cells: this.#props.cells } : {}),
      ...(this.#props.fallback ? { fallback: this.#props.fallback } : {}),
      ...(rowHeight !== undefined ? { rowHeight } : {}),
    });
    if (this.#model) this.#renderer.render(this.#model);
  }

  #remount(): void {
    if (!this.isConnected) return;
    this.#renderer?.destroy();
    this.#renderer = null;
    this.#mount();
  }
}

/**
 * Registers the element. Idempotent, and never throws on a double define —
 * two bundles on one page is a normal state, not an error.
 */
export function defineDataGrid(tag = "ox-data-grid"): void {
  if (typeof customElements === "undefined") return;
  if (customElements.get(tag)) return;
  customElements.define(tag, OxDataGridElement);
}
