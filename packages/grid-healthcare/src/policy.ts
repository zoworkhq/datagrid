/**
 * Applying a disclosure policy.
 *
 * ── WHY THIS IS NOT BLOCKED ON A CLINICIAN ──────────────────────────────────
 *
 * By ADR 0008's rule, the grid renders a state the application supplies and
 * never derives one. A disclosure policy is supplied whole: the application
 * decides who may see what, and this file only asks it and renders the answer.
 * It contains no clinical judgement, so it needs no clinical review — the
 * policy itself does, and the policy is the application's.
 *
 * Three consequences follow, and they are what makes this different from every
 * competitor's "hide the column" flag:
 *
 *   1. A withheld column is STATED, never silently dropped. A column that
 *      vanishes is indistinguishable from a column that never existed, and a
 *      reader cannot ask for what they cannot see is missing.
 *   2. A restricted row discloses its COUNT — and whether the count itself is
 *      disclosable is the application's call, because in a small programme a
 *      count can identify.
 *   3. Break-glass RENDERS a prompt and EMITS a request. It never grants. The
 *      grid must never be the thing that grants access.
 *
 * @see ../../../docs/decisions/0008-what-a-cell-may-decide.md
 */
import { gridError, type GridError, type RowId } from "@oxygenui-design/grid-core";
import type {
  DisclosureEvent, DisclosureKind, DisclosureOutcome, DisclosurePolicy, MaskReason, RestrictReason,
} from "./disclosure.js";

export interface PolicyColumn {
  readonly key: string;
  readonly header: string;
  /** An identity column may not be hidden by anything, policy included. */
  readonly required?: boolean;
}

export interface ResolvedColumns {
  readonly visible: readonly PolicyColumn[];
  /** Named, so the grid can say "2 columns withheld" rather than showing fewer. */
  readonly withheld: readonly PolicyColumn[];
}

/**
 * Resolves which columns a viewer may see.
 *
 * A required column is never withheld: if the policy says otherwise, that is a
 * policy error, reported rather than obeyed. Hiding the identity column is how
 * a bulk action acts on the wrong person.
 */
export function resolveColumns(
  columns: readonly PolicyColumn[],
  policy: DisclosurePolicy,
  onError?: (e: GridError) => void,
): ResolvedColumns {
  const visible: PolicyColumn[] = [];
  const withheld: PolicyColumn[] = [];

  for (const column of columns) {
    if (policy.column(column.key) === "visible") {
      visible.push(column);
      continue;
    }
    if (column.required) {
      onError?.(gridError({ code: "disclosure-refused", phase: "render", columnKey: column.key }));
      visible.push(column);
      continue;
    }
    withheld.push(column);
  }
  return { visible, withheld };
}

/** The sentence the grid shows in place of the columns a viewer may not have. */
export function describeWithheld(resolved: ResolvedColumns): string {
  const n = resolved.withheld.length;
  if (n === 0) return "";
  const names = resolved.withheld.map((c) => c.header).join(", ");
  return n === 1 ? `1 column withheld: ${names}` : `${n} columns withheld: ${names}`;
}

export type CellDisclosure = "visible" | { readonly masked: MaskReason };
export type RowDisclosure = "visible" | { readonly restricted: RestrictReason };

export interface ResolvedRows<TRow> {
  readonly rows: readonly TRow[];
  /** Restricted rows keep their slot and are marked; they are not removed. */
  readonly restricted: ReadonlyMap<RowId, RestrictReason>;
  readonly restrictedCount: number;
}

/**
 * Resolves row-level restriction.
 *
 * A restricted row is NOT filtered out. Removing it changes the count, and a
 * list that silently shrinks is a list that lies about the population — the
 * same failure `coverage` exists to prevent, one layer down.
 */
export function resolveRows<TRow>(
  rows: readonly TRow[],
  rowKey: (row: TRow) => RowId,
  policy: DisclosurePolicy,
): ResolvedRows<TRow> {
  const restricted = new Map<RowId, RestrictReason>();
  for (const row of rows) {
    const verdict = policy.row(row);
    if (verdict !== "visible") restricted.set(rowKey(row), verdict.restricted);
  }
  return { rows, restricted, restrictedCount: restricted.size };
}

// ── break-glass ─────────────────────────────────────────────────────────────

/**
 * A request to see something the policy withholds.
 *
 * The grid captures a structured reason and emits this. **It never grants.**
 * The server decides, and the server records — a client that grants its own
 * access is a client that can grant it silently.
 */
export interface BreakGlassRequest {
  readonly rowId: RowId;
  readonly columnKey: string | null;
  /** Structured, not free text: a reason nobody can audit is not a reason. */
  readonly reason: string;
  readonly requestedAt: string;
}

export type BreakGlassOutcome =
  | { readonly granted: true; readonly expiresAt: string }
  | { readonly granted: false; readonly reason: string };

export interface BreakGlassOptions {
  /** The application asks the server. The grid performs no network I/O (ADR 0001). */
  readonly request: (req: BreakGlassRequest) => Promise<BreakGlassOutcome>;
  readonly onDisclosure?: (event: DisclosureEvent) => void;
}

/** Reasons must come from a closed set, so an audit can group them. */
export const BREAK_GLASS_REASONS = [
  "emergency-care",
  "continuity-of-care",
  "patient-request",
  "quality-review",
] as const;
export type BreakGlassReason = (typeof BREAK_GLASS_REASONS)[number];

export function isValidReason(reason: string): reason is BreakGlassReason {
  return (BREAK_GLASS_REASONS as readonly string[]).includes(reason);
}

export async function requestBreakGlass(
  req: BreakGlassRequest,
  options: BreakGlassOptions,
): Promise<BreakGlassOutcome> {
  if (!isValidReason(req.reason)) {
    // Free text here would produce an audit log nobody can group or query.
    return { granted: false, reason: `"${req.reason}" is not a recognised reason` };
  }

  // ── FOUR OUTCOMES, NOT TWO ────────────────────────────────────────────────
  //
  // The event was emitted after the promise RESOLVED, so a request that failed
  // in transit produced no event at all — even though an attempt was made, and
  // an attempted break-glass is precisely the thing an audit pipeline exists to
  // see. A reviewer could not distinguish "nobody asked" from "somebody asked
  // and the network ate it".
  //
  // The attempt is now recorded whatever happens, and the outcome says which of
  // the four it was. No free text and no PHI: `outcome` is a closed set, which
  // is what makes an audit log groupable.
  const emit = (outcome: DisclosureOutcome): void => {
    options.onDisclosure?.({
      kind: "inspect",
      columnKeys: req.columnKey ? [req.columnKey] : [],
      rowCount: 1,
      at: req.requestedAt,
      outcome,
    });
  };

  let result: BreakGlassOutcome;
  try {
    result = await options.request(req);
  } catch {
    // The reason is deliberately dropped: a transport error's message can carry
    // a URL, a token or a patient identifier, and none of those belong in an
    // audit event. That it FAILED is the fact worth recording.
    emit("failed");
    return { granted: false, reason: "The break-glass request could not be delivered." };
  }

  emit(result.granted ? "granted" : "refused");
  return result;
}

// ── disclosure events ───────────────────────────────────────────────────────

export interface DisclosureSink {
  emit(event: DisclosureEvent): void;
}

/**
 * Builds the events the application forwards to its audit store.
 *
 * The grid emits; the server records. A client that keeps its own access log
 * is a client that can choose not to.
 */
export function disclosureEvent(
  kind: DisclosureKind,
  columnKeys: readonly string[],
  rowCount: number,
  at: string,
): DisclosureEvent {
  return { kind, columnKeys, rowCount, at };
}

/** Checks a bulk disclosure against the policy before it happens. */
export function mayDisclose(
  kind: DisclosureKind,
  policy: DisclosurePolicy,
): { readonly allowed: true } | { readonly allowed: false; readonly reason: string } {
  const ok =
    kind === "export"
      ? policy.mayExport()
      : kind === "print"
        ? policy.mayPrint()
        : kind === "copy"
          ? policy.mayCopy()
          : true;
  return ok
    ? { allowed: true }
    : { allowed: false, reason: `The disclosure policy does not permit ${kind}.` };
}
