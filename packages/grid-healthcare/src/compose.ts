/**
 * One call that applies a disclosure policy to everything downstream of it.
 *
 * ── WHY A FACADE, WHEN THE PIECES ALREADY EXISTED ───────────────────────────
 *
 * They did, and that was the problem. `resolveColumns`, `resolveRows` and
 * `policy.cell` are three separate calls a developer has to remember to make,
 * in the right order, for EVERY output — the renderer, the CSV, the XLSX, the
 * print sheet, the clipboard. Miss one and the value is disclosed through that
 * channel while looking correctly masked in the others.
 *
 * The README says the application remains responsible, and that is the right
 * boundary — the grid cannot know a ward's rules. But "responsible" should not
 * mean "must wire six things identically by hand", because the failure mode is
 * silent and the thing that leaks is a patient record.
 *
 * So: one call, and everything it hands back is already masked consistently.
 * The low-level functions remain exported for the cases this does not fit.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT DO ──────────────────────────────────────
 *
 * It does not import the renderer, the export writers or the clipboard. Domain
 * sits below plugins in the layer order (ADR 0006) and inverting that to make a
 * convenience would be a worse trade than the convenience is worth. Instead it
 * returns values shaped to what each of them takes, so the wiring is a spread
 * rather than a translation.
 */
import type { RowId } from "@oxygenui-design/grid-core";
import type { DisclosurePolicy, MaskReason, RestrictReason } from "./disclosure.js";
import { maskedCell } from "./cells.js";
import {
  resolveColumns, resolveRows, describeWithheld,
  type CellDisclosure, type PolicyColumn,
} from "./policy.js";

/** What a cell yields to an export writer. Structurally `ExportValue`. */
export type DisclosedValue =
  | { readonly kind: "value"; readonly value: string | number | boolean | null }
  | { readonly kind: "masked"; readonly reason: string };

export interface DiscloseOptions<TRow> {
  readonly columns: readonly PolicyColumn[];
  readonly rows: readonly TRow[];
  readonly rowKey: (row: TRow) => RowId;
  readonly policy: DisclosurePolicy;
  /** Reads a raw cell value. The same accessor the row model takes. */
  readonly get: (row: TRow, columnKey: string) => string | number | boolean | null | undefined;
}

export interface DisclosedGrid<TRow> {
  /** Columns the policy permits, in order. */
  readonly columns: readonly PolicyColumn[];
  /** Columns it withheld, for the sentence below. */
  readonly withheld: readonly PolicyColumn[];
  /** The sentence naming what is missing. Empty when nothing is. */
  readonly withheldNote: string;

  /** Rows, with restricted ones MARKED rather than dropped. */
  readonly rows: readonly TRow[];
  readonly restricted: ReadonlyMap<RowId, RestrictReason>;

  /** What the policy says about one cell. */
  cell(row: TRow, columnKey: string): CellDisclosure;

  /**
   * A renderer `fallback`. Masked cells render the mask's own sentence, which
   * is the same string `maskedCell.read` produces everywhere else.
   */
  fallback(row: TRow, columnKey: string): { readonly kind: "text"; readonly text: string };

  /**
   * Export columns. A masked cell yields `{ kind: "masked" }` — the reason
   * travels and the value never does — which is what every writer in
   * `grid-export` already knows how to render.
   */
  readonly exportColumns: readonly {
    readonly key: string;
    readonly header: string;
    value(row: TRow): DisclosedValue;
  }[];

  /** The policy in the shape the export and clipboard plugins take. */
  readonly channelPolicy: {
    mayExport(): boolean;
    mayPrint(): boolean;
    mayCopy(): boolean;
  };
}

const maskText = (reason: MaskReason): string =>
  maskedCell.read({ reason: reason.label, ...(reason.legal ? { legalBasis: reason.legal } : {}) });

/**
 * Applies a policy once, for every consumer of the result.
 *
 * A restricted ROW keeps its slot and is marked; it is not filtered out.
 * Removing it would change the row count, and a count that silently shrinks is
 * a coverage claim nobody made.
 */
export function discloseGrid<TRow>(options: DiscloseOptions<TRow>): DisclosedGrid<TRow> {
  const cols = resolveColumns(options.columns, options.policy);
  const rows = resolveRows(options.rows, options.rowKey, options.policy);

  const cell = (row: TRow, columnKey: string): CellDisclosure =>
    options.policy.cell(row, columnKey);

  const read = (row: TRow, columnKey: string): DisclosedValue => {
    const verdict = cell(row, columnKey);
    if (verdict !== "visible") return { kind: "masked", reason: maskText(verdict.masked) };
    const raw = options.get(row, columnKey);
    return { kind: "value", value: raw === undefined ? null : raw };
  };

  return {
    columns: cols.visible,
    withheld: cols.withheld,
    withheldNote: describeWithheld(cols),

    rows: rows.rows,
    restricted: rows.restricted,

    cell,

    fallback(row, columnKey) {
      const value = read(row, columnKey);
      return {
        kind: "text",
        text: value.kind === "masked" ? value.reason : value.value === null ? "" : String(value.value),
      };
    },

    exportColumns: cols.visible.map((column) => ({
      key: column.key,
      header: column.header,
      value: (row: TRow) => read(row, column.key),
    })),

    channelPolicy: {
      mayExport: () => options.policy.mayExport(),
      mayPrint: () => options.policy.mayPrint(),
      mayCopy: () => options.policy.mayCopy(),
    },
  };
}
