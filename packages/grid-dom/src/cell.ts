/**
 * The cell renderer contract — and the renderer safety contract.
 *
 * Every competitor lets a custom cell return arbitrary markup. A cell rendering
 * a note excerpt is rendering attacker-influenced content, so here raw HTML is
 * a *type error* rather than something discouraged in prose: a renderer returns
 * text, a token, or a component, and there is no variant that carries a markup
 * string.
 *
 * Eight obligations, not seven. The eighth is mask state — a cell that returns
 * only a flat value cannot tell the export writer that the value must not
 * leave.
 */
import type { ExportValue, GridError, PrintValue } from "@oxygenui-design/grid-core";

/** The only three things a cell may produce. Note the absence of an `html` variant. */
export type CellContent =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "token"; readonly token: string; readonly label: string }
  /** A framework component. Opaque here; the adapter marshals it in. */
  | { readonly kind: "component"; readonly node: unknown };

export const text = (value: string): CellContent => ({ kind: "text", text: value });

// ExportValue and PrintValue are engine contracts, re-exported here because
// they are part of the cell contract. The export plugin reads them from
// grid-core without depending on the render layer.
export type { ExportValue, PrintValue } from "@oxygenui-design/grid-core";

export interface CellContext<TRow> {
  readonly row: TRow;
  readonly columnKey: string;
  /** Absolute, under virtualisation. Not the index within the rendered window. */
  readonly rowIndex: number;
  readonly onError: (error: GridError) => void;
}

export interface CellRenderer<TRow> {
  mount(el: HTMLElement, ctx: CellContext<TRow>): void;
  /** Recycling calls this, not `mount`. A recycled node keeps its identity. */
  update(el: HTMLElement, ctx: CellContext<TRow>): void;
  unmount(el: HTMLElement): void;

  measure(ctx: CellContext<TRow>): { readonly intrinsic: number; readonly growable: boolean };
  /** What the live region announces. */
  read(ctx: CellContext<TRow>): string;
  compare(a: TRow, b: TRow): number | "incomparable";
  toExport(ctx: CellContext<TRow>): ExportValue;
  toPrint(ctx: CellContext<TRow>): PrintValue;
}

/**
 * The only way content reaches the DOM in this package.
 *
 * `textContent`, never `innerHTML`. Oxygen ADR 0009 forbids
 * `dangerouslySetInnerHTML`; this is the same rule one layer down, where the
 * grid actually writes to a node.
 */
export function setCellContent(el: HTMLElement, content: CellContent): void {
  switch (content.kind) {
    case "text":
      el.textContent = content.text;
      return;
    case "token":
      el.textContent = content.label;
      el.dataset["token"] = content.token;
      return;
    case "component":
      // The adapter owns this node. grid-dom does not write into it.
      return;
  }
}
