/**
 * The reduced state.
 *
 * Every mutation is an action, so the state is reconstructable from the action
 * log — which is what makes behaviour replayable, what lets the devtools panel
 * show why a grid is in the state it is in, and what makes a plugin's veto
 * observable.
 */
import type { GridAction, RowId } from "./actions.js";
import type { FilterNode } from "./filter.js";
import { COLUMN_WIDTH, PAGE_SIZE, clampInteger, integerIn } from "./limits.js";
import type { SortSpec } from "./query.js";
import { toggleSort } from "./sort.js";

export interface FocusTarget {
  readonly rowId: RowId;
  readonly columnKey: string;
}

export interface GridState {
  readonly sort: readonly SortSpec[];
  readonly filter: FilterNode | null;
  readonly selection: readonly RowId[];
  /** Identity, never a node reference — the node may be recycled into another row. */
  readonly focus: FocusTarget | null;
  readonly pageSize: number;
  readonly cursor: string | null;
  /**
   * Which page, 0-based, for a source that can seek.
   *
   * `cursor` and `page` are alternatives, not companions: an opaque cursor is
   * meaningful only against the query that produced it, and an offset is
   * meaningful only against a source that has one. Every action that sets one
   * clears the other, and everything that changes the QUERY resets both —
   * page 7 of a different filter is not page 7.
   */
  readonly page: number;
  readonly hidden: readonly string[];
  readonly widths: Readonly<Record<string, number>>;
}

/** The row order the reducer needs to resolve a range selection. */
export interface ReduceContext {
  readonly rowIds: readonly RowId[];
  /** Columns that may not be hidden. An identity column is `required` in a clinical recipe. */
  readonly requiredColumns?: readonly string[];
}

/**
 * A starting state, with its numbers normalised.
 *
 * ── WHY THE OVERRIDES ARE NOT TAKEN ON TRUST ────────────────────────────────
 *
 * This used to spread them without looking. A state restored from storage, a
 * URL or another product could carry `pageSize: 0` — which makes a paging loop
 * that never terminates — or `page: NaN`, which becomes a NaN offset and either
 * a 400 from the server or a parameter it quietly ignores.
 *
 * CLAMPED here rather than refused, deliberately, and it is the one place in
 * the library that clamps. `initialState` has no way to report a problem: it
 * returns a state, not a result. `parseView` is the boundary that refuses,
 * because it CAN — it hands back `{ ok: false, reason }`. Two different jobs,
 * and conflating them is how a corrupt file becomes a silently moved layout.
 */
export function initialState(overrides: Partial<GridState> = {}): GridState {
  const merged = {
    sort: [],
    filter: null,
    selection: [],
    focus: null,
    pageSize: PAGE_SIZE.fallback,
    cursor: null,
    page: 0,
    hidden: [],
    widths: {},
    ...overrides,
  };

  return {
    ...merged,
    pageSize: clampInteger(merged.pageSize, PAGE_SIZE, PAGE_SIZE.fallback),
    page: clampInteger(merged.page, { min: 0, max: Number.MAX_SAFE_INTEGER }, 0),
    // A width outside the range is dropped rather than clamped: an unusable
    // number is not evidence of an intent worth approximating, and the column
    // falls back to its declared width, which is a defined answer.
    widths: Object.fromEntries(
      Object.entries(merged.widths).filter(([, w]) => integerIn(w, COLUMN_WIDTH) !== null),
    ),
  };
}

function range(rowIds: readonly RowId[], from: RowId, to: RowId): readonly RowId[] {
  const a = rowIds.indexOf(from);
  const b = rowIds.indexOf(to);
  if (a === -1 || b === -1) return [];
  return rowIds.slice(Math.min(a, b), Math.max(a, b) + 1);
}

export function reduce(state: GridState, action: GridAction, ctx: ReduceContext): GridState {
  switch (action.type) {
    case "sort/toggle":
      return { ...state, sort: toggleSort(state.sort, action.key, action.additive), cursor: null, page: 0 };

    case "sort/set":
      return { ...state, sort: action.sort, cursor: null, page: 0 };

    case "filter/set":
      // A new predicate invalidates the cursor: an opaque cursor is only
      // meaningful against the query that produced it.
      return { ...state, filter: action.node, cursor: null, page: 0 };

    case "select/toggle": {
      const has = state.selection.includes(action.id);
      return {
        ...state,
        selection: has ? state.selection.filter((id) => id !== action.id) : [...state.selection, action.id],
      };
    }

    case "select/range": {
      const span = range(ctx.rowIds, action.from, action.to);
      const merged = [...state.selection];
      for (const id of span) if (!merged.includes(id)) merged.push(id);
      return { ...state, selection: merged };
    }

    case "select/clear":
      return { ...state, selection: [] };

    case "page/next":
      // Cursor paging: the server hands over the next cursor and the page
      // index stops meaning anything, because you cannot count opaque strings.
      return { ...state, cursor: action.cursor, page: 0 };

    case "page/goto":
      // Offset paging: an index the caller can compute, for a source that says
      // it can seek. Clamped at zero rather than throwing — a pagination
      // control that has drifted one below the start is not an error worth
      // taking a grid down for.
      return { ...state, page: Math.max(0, Math.floor(action.page)), cursor: null };

    case "page/size":
      return { ...state, pageSize: action.size, cursor: null, page: 0 };

    case "focus/cell":
      return { ...state, focus: { rowId: action.rowId, columnKey: action.columnKey } };

    case "column/resize":
      return { ...state, widths: { ...state.widths, [action.key]: action.width } };

    case "column/visibility": {
      // A required column cannot be hidden. In a clinical recipe the identity
      // column is required, and hiding it is how a bulk action acts on the
      // wrong person.
      if (!action.visible && ctx.requiredColumns?.includes(action.key)) return state;
      const hidden = action.visible
        ? state.hidden.filter((k) => k !== action.key)
        : state.hidden.includes(action.key)
          ? state.hidden
          : [...state.hidden, action.key];
      return { ...state, hidden };
    }

    case "select/set":
      // Deduplicated, because a selection is a SET and a caller replaying an
      // undo entry should not be able to make it stop being one.
      return { ...state, selection: [...new Set(action.ids)] };

    case "select/all":
      // Every row the CONTEXT knows about — the filtered set under a client
      // model, the loaded rows under a paged one. Deduplicated against nothing,
      // because `rowIds` is already the row order and already unique.
      return { ...state, selection: [...ctx.rowIds] };

    case "column/reorder":
    case "rows/upsert":
      return state; // owned by the column model and the row store respectively

    case "column/menu":
    case "edit/begin":
      // Owned by the application. A menu is chrome and an edit is a session
      // that can fail; neither is grid state, and holding a half of either
      // here would mean two places disagreeing about whether one is open.
      return state;

    case "rows/remove": {
      const gone = new Set(action.ids);
      const selection = state.selection.filter((id) => !gone.has(id));
      const focus = state.focus && gone.has(state.focus.rowId) ? null : state.focus;
      return { ...state, selection, focus };
    }
  }
}
