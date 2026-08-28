/**
 * Selection — ids, or a predicate.
 *
 * ── WHY THIS IS NOT A SET OF IDS ────────────────────────────────────────────
 *
 * "Select all" means two different things and every grid conflates them:
 *
 *   ids        the 47 rows currently loaded. Finite, nameable, and what a
 *              reader means when they tick the header box on a short list.
 *   predicate  everyone matching the filter — which may be 12,000 rows, may
 *              span pages nobody has fetched, and whose size may be genuinely
 *              **unknown** against a source that does not report totals.
 *
 * A bulk action over the second is a different act from a bulk action over the
 * first, and the interface has to know which one it was given. Collapsing them
 * into a set of ids is how "reassign selected" quietly reassigns a page.
 *
 * The second half of this file is drift: rows leave the set between selecting
 * and confirming. That is not an edge case in a live clinical list, it is
 * Tuesday.
 */
import type { RowId } from "./actions.js";
import type { FilterNode } from "./filter.js";

export type Selection =
  | { readonly kind: "ids"; readonly ids: ReadonlySet<RowId> }
  /** Everyone matching `filter`, minus anyone explicitly unticked afterwards. */
  | {
      readonly kind: "predicate";
      readonly filter: FilterNode | null;
      readonly excluded: ReadonlySet<RowId>;
    };

export const emptySelection = (): Selection => ({ kind: "ids", ids: new Set() });

export const selectIds = (ids: Iterable<RowId>): Selection => ({ kind: "ids", ids: new Set(ids) });

export const selectMatching = (filter: FilterNode | null): Selection => ({
  kind: "predicate",
  filter,
  excluded: new Set(),
});

export function toggle(selection: Selection, id: RowId): Selection {
  if (selection.kind === "ids") {
    const ids = new Set(selection.ids);
    if (!ids.delete(id)) ids.add(id);
    return { kind: "ids", ids };
  }
  // Unticking one person out of "everyone matching" excludes them; it does not
  // collapse the selection into a list of ids, because the rest of the set is
  // still whoever matches.
  const excluded = new Set(selection.excluded);
  if (!excluded.delete(id)) excluded.add(id);
  return { ...selection, excluded };
}

export function isSelected(selection: Selection, id: RowId): boolean {
  return selection.kind === "ids" ? selection.ids.has(id) : !selection.excluded.has(id);
}

export interface ResolveContext {
  /** Ids of the rows actually loaded, in order. */
  readonly loadedIds: readonly RowId[];
  /**
   * How many rows the predicate covers in total, from the source.
   *
   * `"unknown"` is a real answer — a FHIR source that does not report a total
   * cannot tell you how many people a filter matches, and the selection must
   * survive that rather than guessing.
   */
  readonly matchingTotal?: number | "unknown";
}

export interface ResolvedSelection {
  readonly kind: Selection["kind"];
  /** Selected rows among those loaded. The only ones that can be named. */
  readonly ids: readonly RowId[];
  /** How many the selection really covers, loaded or not. */
  readonly total: number | "unknown";
  /**
   * Covered but not loaded, so not nameable. Non-zero means a bulk action
   * would touch people the reader has not seen.
   */
  readonly unnamed: number | "unknown";
}

export function resolveSelection(selection: Selection, ctx: ResolveContext): ResolvedSelection {
  if (selection.kind === "ids") {
    const loaded = new Set(ctx.loadedIds);
    const ids = [...selection.ids].filter((id) => loaded.has(id));
    // An id selection covers exactly what was ticked. Anything ticked and since
    // unloaded is still covered, and still nameable by id.
    return { kind: "ids", ids, total: selection.ids.size, unnamed: selection.ids.size - ids.length };
  }

  const ids = ctx.loadedIds.filter((id) => !selection.excluded.has(id));
  const matching = ctx.matchingTotal ?? "unknown";
  if (matching === "unknown") {
    return { kind: "predicate", ids, total: "unknown", unnamed: "unknown" };
  }
  const total = Math.max(0, matching - selection.excluded.size);
  return { kind: "predicate", ids, total, unnamed: Math.max(0, total - ids.length) };
}

export function selectionCount(resolved: ResolvedSelection): string {
  if (resolved.total === "unknown") {
    return `${resolved.ids.length} shown, and an unknown number not loaded`;
  }
  return resolved.unnamed === 0 || resolved.unnamed === "unknown"
    ? `${resolved.total}`
    : `${resolved.total} (${resolved.unnamed} not loaded)`;
}

// ── drift ───────────────────────────────────────────────────────────────────

export interface SelectionDrift {
  /** Still selected, and still in the set. Safe to act on. */
  readonly held: readonly RowId[];
  /** Was selected and reviewed; has since left the set. */
  readonly departed: readonly RowId[];
  /** Now matches the selection but was NOT in what the reader reviewed. */
  readonly arrived: readonly RowId[];
}

export const hasDrifted = (drift: SelectionDrift): boolean =>
  drift.departed.length > 0 || drift.arrived.length > 0;

/**
 * Compares what the reader reviewed against what the selection covers now.
 *
 * `arrived` matters as much as `departed`, and is the one every grid misses: a
 * predicate selection reviewed at 09:12 covers whoever matches at 09:14, so a
 * patient admitted in between is in the write without ever having been named.
 */
export function driftBetween(
  reviewed: readonly RowId[],
  current: readonly RowId[],
): SelectionDrift {
  const was = new Set(reviewed);
  const now = new Set(current);
  return {
    held: reviewed.filter((id) => now.has(id)),
    departed: reviewed.filter((id) => !now.has(id)),
    arrived: current.filter((id) => !was.has(id)),
  };
}

export function describeDrift(drift: SelectionDrift): string {
  const parts: string[] = [];
  if (drift.departed.length > 0) parts.push(`${drift.departed.length} no longer match`);
  if (drift.arrived.length > 0) parts.push(`${drift.arrived.length} now match and were not reviewed`);
  return parts.length === 0 ? "unchanged" : parts.join("; ");
}
