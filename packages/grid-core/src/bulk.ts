/**
 * Bulk review — naming the people before the write runs.
 *
 * ── THE RULE ────────────────────────────────────────────────────────────────
 *
 * A bulk action over a clinical list is an identity-carrying operation, not a
 * list operation. So:
 *
 *   1. The reader is shown **who**, by name, not a count. "Reassign 12
 *      patients" is not reviewable; twelve names are.
 *   2. If the selection covers people who are not loaded, the review says how
 *      many are **unnamed**, and confirming refuses unless the caller has
 *      explicitly opted into acting on people nobody saw.
 *   3. Confirmation **re-resolves** and refuses if the set drifted. It does not
 *      quietly act on the new set. A patient discharged between review and
 *      confirmation must not be silently dropped, and one admitted in between
 *      must not be silently included.
 *
 * The grid does not perform the write. It produces a reviewed, confirmed set of
 * ids and hands them to the caller — the same boundary as everything else here.
 */
import type { RowId } from "./actions.js";
import { gridError, type GridError } from "./errors.js";
import {
  describeDrift,
  driftBetween,
  hasDrifted,
  resolveSelection,
  type ResolveContext,
  type Selection,
  type SelectionDrift,
} from "./selection.js";

export interface ReviewedRow<TRow> {
  readonly id: RowId;
  readonly row: TRow;
}

export interface BulkReview<TRow> {
  /** The rows the reader actually saw, by name. */
  readonly named: readonly ReviewedRow<TRow>[];
  /** Covered by the selection but not loaded, so never shown to anyone. */
  readonly unnamed: number | "unknown";
  readonly total: number | "unknown";
  /** When the set was captured, so the confirmation can say how stale it is. */
  readonly takenAt: string;
  readonly selection: Selection;
}

export interface OpenReviewOptions<TRow> {
  readonly selection: Selection;
  readonly context: ResolveContext;
  readonly rowsById: (id: RowId) => TRow | undefined;
  /** Caller-supplied, because the grid does not read a clock it does not own. */
  readonly takenAt: string;
}

export function openReview<TRow>(options: OpenReviewOptions<TRow>): BulkReview<TRow> {
  const resolved = resolveSelection(options.selection, options.context);
  const named: ReviewedRow<TRow>[] = [];
  for (const id of resolved.ids) {
    const row = options.rowsById(id);
    if (row !== undefined) named.push({ id, row });
  }
  return {
    named,
    unnamed: resolved.unnamed,
    total: resolved.total,
    takenAt: options.takenAt,
    selection: options.selection,
  };
}

export type ConfirmResult =
  | { readonly ok: true; readonly ids: readonly RowId[] }
  | {
      readonly ok: false;
      readonly reason: string;
      readonly drift?: SelectionDrift;
      readonly error: GridError;
    };

export interface ConfirmOptions {
  /** The state of the world NOW, not when the review opened. */
  readonly context: ResolveContext;
  /**
   * Permit acting on people the reader was never shown.
   *
   * Off by default and deliberately awkward to switch on: it is the difference
   * between "reassign these twelve" and "reassign everyone matching, including
   * the ones you cannot see".
   */
  readonly allowUnnamed?: boolean;
}

/**
 * Re-resolves the selection and either releases the ids or refuses with a
 * reason the grid can render.
 */
export function confirmReview<TRow>(
  review: BulkReview<TRow>,
  options: ConfirmOptions,
): ConfirmResult {
  const now = resolveSelection(review.selection, options.context);
  const reviewedIds = review.named.map((r) => r.id);
  const drift = driftBetween(reviewedIds, now.ids);

  if (hasDrifted(drift)) {
    return {
      ok: false,
      reason: `The set changed since it was reviewed at ${review.takenAt}: ${describeDrift(drift)}.`,
      drift,
      error: gridError({ code: "bulk-refused", phase: "reduce" }),
    };
  }

  const unnamed = now.unnamed;
  const hasUnnamed = unnamed === "unknown" || unnamed > 0;
  if (hasUnnamed && options.allowUnnamed !== true) {
    const many = unnamed === "unknown" ? "an unknown number of" : `${unnamed}`;
    return {
      ok: false,
      reason: `This would act on ${many} rows that were never shown. Load them, narrow the selection, or confirm explicitly.`,
      error: gridError({ code: "bulk-refused", phase: "reduce" }),
    };
  }

  return { ok: true, ids: drift.held };
}

/** The sentence the review step shows above the names. */
export function describeReview<TRow>(review: BulkReview<TRow>): string {
  const named = `${review.named.length} named`;
  if (review.unnamed === "unknown") return `${named}, and an unknown number not loaded`;
  if (review.unnamed > 0) return `${named}, ${review.unnamed} not loaded`;
  return named;
}
