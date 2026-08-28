/**
 * Inline editing, with a commit phase.
 *
 * ── THE RULE ────────────────────────────────────────────────────────────────
 *
 * An optimistic update that fails must **restore the previous value and say
 * so**. Never silently, and never by leaving the new value on screen.
 *
 * That sounds obvious and almost every grid gets it wrong in the same way: the
 * cell shows what the user typed, the request fails, a toast appears somewhere
 * else, and the row now displays a value the server does not have. In a chart
 * the difference is a dose that was never recorded reading as though it was.
 *
 * So a commit has four states and the failed one is not terminal — the draft
 * survives, so the user can retry or copy it out rather than retyping from
 * memory.
 */
import type { RowId } from "./actions.js";
import { gridError, sanitiseError, type GridError } from "./errors.js";

export type EditStatus = "editing" | "committing" | "committed" | "failed";

export interface EditSession<TRow> {
  readonly rowId: RowId;
  readonly columnKey: string;
  readonly status: EditStatus;
  /** What the user has typed. Survives a failure, so nobody retypes from memory. */
  readonly draft: unknown;
  /** What was there before, so a failure can restore it exactly. */
  readonly original: unknown;
  /** The row as it was when editing began, for the rollback. */
  readonly snapshot: TRow;
  readonly error?: GridError;
}

export interface EditContext<TRow> {
  readonly rowId: RowId;
  readonly columnKey: string;
  readonly row: TRow;
  readonly value: unknown;
}

export function beginEdit<TRow>(ctx: EditContext<TRow>): EditSession<TRow> {
  return {
    rowId: ctx.rowId,
    columnKey: ctx.columnKey,
    status: "editing",
    draft: ctx.value,
    original: ctx.value,
    snapshot: ctx.row,
  };
}

export function updateDraft<TRow>(session: EditSession<TRow>, draft: unknown): EditSession<TRow> {
  // A draft can be edited again after a failure. The failure is information,
  // not a dead end — so the error is dropped rather than set to undefined,
  // which `exactOptionalPropertyTypes` rightly distinguishes.
  const { error: _dropped, ...rest } = session;
  return { ...rest, draft, status: "editing" };
}

/** True when the draft differs from what was there. A no-op commit is not sent. */
export function isDirty<TRow>(session: EditSession<TRow>): boolean {
  return !Object.is(session.draft, session.original);
}

export interface CommitOptions<TRow> {
  /** Applies the draft to a row optimistically. Pure — the caller owns the store. */
  readonly apply: (row: TRow, columnKey: string, value: unknown) => TRow;
  /** Writes. The grid performs no network I/O; this is the caller's (ADR 0001). */
  readonly write: (params: { row: TRow; columnKey: string; value: unknown }) => Promise<TRow>;
  readonly onError?: (error: GridError) => void;
}

export type CommitOutcome<TRow> =
  | { readonly ok: true; readonly row: TRow; readonly session: EditSession<TRow> }
  /** The row is the ORIGINAL, restored. The session keeps the draft. */
  | { readonly ok: false; readonly row: TRow; readonly session: EditSession<TRow>; readonly error: GridError };

/**
 * Commits a draft.
 *
 * Optimistic: the caller may render `optimistic` immediately. If the write
 * fails, the returned row is the untouched snapshot — not the optimistic one,
 * and not a partially-applied one.
 */
export async function commitEdit<TRow>(
  session: EditSession<TRow>,
  options: CommitOptions<TRow>,
): Promise<CommitOutcome<TRow>> {
  if (!isDirty(session)) {
    // Nothing changed. Sending it anyway would put a write in the audit log
    // that the user did not make.
    return { ok: true, row: session.snapshot, session: { ...session, status: "committed" } };
  }

  const optimistic = options.apply(session.snapshot, session.columnKey, session.draft);

  try {
    const written = await options.write({
      row: optimistic,
      columnKey: session.columnKey,
      value: session.draft,
    });
    return { ok: true, row: written, session: { ...session, status: "committed" } };
  } catch (thrown) {
    // Restore exactly what was there. The draft stays in the session so the
    // user can retry or copy it, and the error names coordinates only.
    const error = sanitiseError(thrown, {
      code: "source-threw",
      phase: "reduce",
      columnKey: session.columnKey,
    });
    options.onError?.(error);
    return {
      ok: false,
      row: session.snapshot,
      session: { ...session, status: "failed", error },
      error,
    };
  }
}

/** Abandons an edit. The row is restored; nothing is written. */
export function cancelEdit<TRow>(session: EditSession<TRow>): TRow {
  return session.snapshot;
}

/**
 * Whether a column may be edited at all.
 *
 * A derived column is not editable: writing to a model output would silently
 * detach the value from the model that produced it, and the provenance in the
 * header would then be a lie.
 */
export function isEditable(column: { readonly derived?: boolean; readonly editable?: boolean }): boolean {
  if (column.derived === true) return false;
  return column.editable === true;
}

/** The refusal a caller renders when an edit is attempted on a derived column. */
export const notEditable = (columnKey: string): GridError =>
  gridError({ code: "disclosure-refused", phase: "reduce", columnKey });
