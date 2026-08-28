/**
 * The inspector.
 *
 * ── THE RULE ────────────────────────────────────────────────────────────────
 *
 * **The grid keeps its focus context. The panel takes the detail. One URL.**
 *
 * Opening a detail panel is the moment most grids quietly lose the reader's
 * place: focus jumps into the panel, the selection is replaced by "the
 * inspected row", and closing it returns you to the top of the list. In a
 * worklist that is not an annoyance, it is a re-orientation cost paid on every
 * single row, all shift.
 *
 * So opening the inspector changes exactly one thing — what is inspected. It
 * does not move focus, does not touch the selection, and does not re-query.
 * Those are separate actions a caller may still dispatch; they are simply not
 * implied by inspecting.
 *
 * ── AND ONE URL ─────────────────────────────────────────────────────────────
 *
 * What is inspected belongs in the address bar with the query that produced the
 * list, so a clinician can send a colleague *this row, in this list*, rather
 * than "the third one down after you filter by ward". A detail view that cannot
 * be linked is a detail view that gets described over the phone.
 */
import type { RowId } from "./actions.js";

export interface InspectorState {
  readonly rowId: RowId | null;
  /** Which section of the panel is showing, so a link can reach it. */
  readonly section?: string;
}

export const closedInspector = (): InspectorState => ({ rowId: null });

export const isOpen = (state: InspectorState): boolean => state.rowId !== null;

/**
 * Opens the inspector on a row.
 *
 * Deliberately takes and returns only inspector state: it has no access to
 * focus or selection, so it cannot disturb them even by mistake. The rule is
 * enforced by the signature, not by remembering.
 */
export function inspect(rowId: RowId, section?: string): InspectorState {
  return section === undefined ? { rowId } : { rowId, section };
}

export const closeInspector = (): InspectorState => closedInspector();

// ── linkability ─────────────────────────────────────────────────────────────

export interface LinkableState {
  readonly inspector: InspectorState;
  /** The serialised query, so the link reproduces the LIST, not just the row. */
  readonly query?: string;
}

const PARAM = { row: "row", section: "section", query: "q" } as const;

/**
 * Writes inspector state into URL parameters.
 *
 * The query travels with it. A link to a row without the list it came from
 * drops the reader into a different set from the one the sender was looking at,
 * which is the same class of failure `coverage` exists to prevent — a view that
 * looks complete and is not the one being discussed.
 */
export function toSearchParams(state: LinkableState, base?: URLSearchParams): URLSearchParams {
  const params = new URLSearchParams(base);
  if (state.inspector.rowId === null) {
    params.delete(PARAM.row);
    params.delete(PARAM.section);
  } else {
    params.set(PARAM.row, state.inspector.rowId);
    if (state.inspector.section !== undefined) params.set(PARAM.section, state.inspector.section);
    else params.delete(PARAM.section);
  }
  if (state.query !== undefined) params.set(PARAM.query, state.query);
  return params;
}

export function fromSearchParams(params: URLSearchParams): LinkableState {
  const rowId = params.get(PARAM.row);
  const section = params.get(PARAM.section);
  const query = params.get(PARAM.query);
  return {
    inspector:
      rowId === null
        ? closedInspector()
        : section === null
          ? { rowId }
          : { rowId, section },
    ...(query === null ? {} : { query }),
  };
}

// ── what inspecting discloses ───────────────────────────────────────────────

/**
 * Opening the inspector is a disclosure.
 *
 * It shows more of a record than the list did, so it is an access event in its
 * own right — the same as an expand or an export. Emitted for the caller to
 * forward; the grid records nothing.
 */
export interface InspectionEvent {
  readonly kind: "inspect";
  readonly columnKeys: readonly string[];
  readonly rowCount: 1;
  readonly at: string;
  readonly rowId: RowId;
}

export function inspectionEvent(
  rowId: RowId,
  columnKeys: readonly string[],
  at: string,
): InspectionEvent {
  // Structurally a DisclosureEvent, without the engine importing the domain
  // layer to say so — grid-healthcare widens it, grid-core does not know it.
  return { kind: "inspect", columnKeys, rowCount: 1, at, rowId };
}
