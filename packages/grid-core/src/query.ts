import type { GridErrorCode } from "./errors.js";
/**
 * The data contract.
 *
 * `grid-core` defines the *shape* of a request and never issues one. There is
 * no `fetch`, no base URL and no socket anywhere in this repository; the
 * application supplies a `GridDataSource` and pushes live updates in.
 *
 * @see ../../../docs/decisions/0001-the-grid-never-performs-network-io.md
 * @see ../../../docs/decisions/0005-coverage-may-report-an-unknown-total.md
 */
import type { FilterNode } from "./filter.js";

export type SortDirection = "asc" | "desc";

export interface SortSpec {
  readonly key: string;
  readonly direction: SortDirection;
}

/**
 * What a source can actually do — declared by the source, not assumed by the
 * grid.
 *
 * Without this the grid has to guess, and guessing is how a sorted header ends
 * up over an unsorted list. Every field here exists because a real FHIR server
 * behaves this way: `_count` is capped, `_sort` support is server-dependent
 * and silently ignored by some servers, `Bundle.total` is optional, and Azure
 * Health Data Services returns only `next`.
 */
export interface SourceCapabilities {
  /** `"estimate"` is rendered with its uncertainty in words, or not at all. Never as a count. */
  readonly total: "exact" | "estimate" | "none";
  readonly paging: "offset" | "cursor" | "forward-only";
  /** When present, a sort outside this set is refused with a reason rather than requested. */
  readonly sortableKeys?: readonly string[];
  /** `_count` is commonly capped at 100. The page size is negotiated, not chosen. */
  readonly maxPageSize?: number;
}

export interface GridQuery {
  readonly sort: readonly SortSpec[];
  readonly filter: FilterNode | null;
  readonly pageSize: number;
  /** Opaque. The grid never constructs, parses or increments one. */
  readonly cursor: string | null;
  /** The special case, for non-FHIR sources that support it. */
  readonly offset: number | null;
}

export interface GridPage<TRow> {
  readonly rows: readonly TRow[];
  /** Opaque, from the source. `null` means there is no next page. */
  readonly nextCursor: string | null;
  /**
   * `"unknown"` is a value, not an absent field. An absent field reads as
   * *we forgot to ask*; `"unknown"` reads as *we asked and the server does not
   * know*. Only the second is a claim.
   */
  readonly total: number | "unknown";
  /**
   * What the source actually sorted by — which may not be what was asked.
   * A discrepancy is a `sort-not-honoured` error, not a silent re-render.
   */
  readonly appliedSort: readonly SortSpec[];
  /** What the source actually returned, when it capped the request. */
  readonly appliedPageSize?: number;
}

export interface UpdateParams<TRow> {
  readonly row: TRow;
  readonly columnKey: string;
  readonly next: unknown;
}

/**
 * A refusal a source can name without the model having to guess.
 *
 * ── WHY A SOURCE NEEDS THIS ─────────────────────────────────────────────────
 *
 * `fhirSource` throws `FilterNotCompilable` when a query cannot be expressed as
 * FHIR search, and it emits `filter-not-compilable` on its own error channel.
 * The row model caught the throw and reported `source-threw` — so a developer
 * wiring only the model could not tell "this query is unsupported" from "the
 * network failed" or "the token expired". That difference decides between
 * narrowing the query and retrying, and generic retry logic against an
 * unsupported query is exactly the approximation the FHIR adapter exists to
 * prevent.
 *
 * So a thrown error may CARRY a code. Only the code crosses the boundary:
 * message, stack and cause are still discarded by `sanitiseError`.
 */
export interface CodedSourceError {
  readonly gridErrorCode: GridErrorCode;
}

/** Whether a thrown value named its own refusal. */
export const isCodedSourceError = (thrown: unknown): thrown is CodedSourceError =>
  typeof thrown === "object" &&
  thrown !== null &&
  typeof (thrown as CodedSourceError).gridErrorCode === "string";

export interface GridDataSource<TRow> {
  /** The `AbortSignal` is the grid's — cancellation is a row-model correctness property. */
  getRows(query: GridQuery, signal: AbortSignal): Promise<GridPage<TRow>>;
  updateRow?(params: UpdateParams<TRow>): Promise<TRow>;
  readonly capabilities?: SourceCapabilities;
}

/** The client-mode case: a pure function over an array the caller already has. */
export function arraySource<TRow>(rows: readonly TRow[]): GridDataSource<TRow> {
  return {
    capabilities: { total: "exact", paging: "offset" },
    async getRows(query: GridQuery): Promise<GridPage<TRow>> {
      const start = query.offset ?? 0;
      return {
        rows: rows.slice(start, start + query.pageSize),
        nextCursor: null,
        total: rows.length,
        appliedSort: query.sort,
      };
    },
  };
}
