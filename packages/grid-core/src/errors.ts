/**
 * The PHI-safe error and event contract.
 *
 * Every object the grid hands to the caller carries *coordinates*, never
 * *content*. There is no `value` field, no `row` field, and no `cause` carrying
 * either — and there is no way to add one that does not fail the test in
 * `errors.test.ts`.
 *
 * @see ../../../docs/decisions/0002-the-grid-emits-events-not-telemetry.md
 */

export type GridErrorCode =
  | "renderer-threw"
  | "renderer-returned-markup"
  | "comparator-threw"
  | "incomparable-values"
  | "source-threw"
  | "source-unreachable"
  | "sort-not-honoured"
  | "page-size-reduced"
  | "filter-not-compilable"
  | "export-refused"
  | "disclosure-refused"
  | "client-mode-refused";

/** Where it happened. Not a stack trace — a stack trace can carry a value. */
export type GridPhase =
  | "query"
  | "reduce"
  | "measure"
  | "render"
  | "compare"
  | "export"
  | "print"
  | "copy";

/**
 * `rowIndex`, deliberately, and never `rowId`.
 *
 * A `rowKey` in this library is very often an MRN, an NHS number or an account
 * number, because that is what the application already has. An index is
 * positional and meaningless outside the current query; an identifier is a
 * direct identifier. That distinction is the whole point of this field.
 */
export interface GridError {
  readonly code: GridErrorCode;
  readonly phase: GridPhase;
  readonly columnKey: string | null;
  readonly rowIndex: number | null;
  /** The serialised query, so the row is reproducible after a re-sort. Coordinates only. */
  readonly query: string | null;
}

export interface GridErrorInit {
  code: GridErrorCode;
  phase: GridPhase;
  columnKey?: string | null;
  rowIndex?: number | null;
  query?: string | null;
}

export function gridError(init: GridErrorInit): GridError {
  return Object.freeze({
    code: init.code,
    phase: init.phase,
    columnKey: init.columnKey ?? null,
    rowIndex: init.rowIndex ?? null,
    query: init.query ?? null,
  });
}

/**
 * The only bridge from a thrown value to a `GridError`.
 *
 * The original error's `message`, `stack` and `cause` are discarded here and
 * are never carried onward — a renderer's exception conventionally contains
 * the value that caused it. The discarded original is available only through
 * the devtools panel, which runs in the developer's own browser and has no
 * transport (ADR 0001).
 */
export function sanitiseError(_thrown: unknown, init: GridErrorInit): GridError {
  return gridError(init);
}
