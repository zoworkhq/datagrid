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
  readonly hidden: readonly string[];
  readonly widths: Readonly<Record<string, number>>;
}

/** The row order the reducer needs to resolve a range selection. */
export interface ReduceContext {
  readonly rowIds: readonly RowId[];
  /** Columns that may not be hidden. An identity column is `required` in a clinical recipe. */
  readonly requiredColumns?: readonly string[];
}

export function initialState(overrides: Partial<GridState> = {}): GridState {
  return {
    sort: [],
    filter: null,
    selection: [],
    focus: null,
    pageSize: 50,
    cursor: null,
    hidden: [],
    widths: {},
    ...overrides,
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
      return { ...state, sort: toggleSort(state.sort, action.key, action.additive), cursor: null };

    case "sort/set":
      return { ...state, sort: action.sort, cursor: null };

    case "filter/set":
      // A new predicate invalidates the cursor: an opaque cursor is only
      // meaningful against the query that produced it.
      return { ...state, filter: action.node, cursor: null };

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
      return { ...state, cursor: action.cursor };

    case "page/size":
      return { ...state, pageSize: action.size, cursor: null };

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

    case "column/reorder":
    case "rows/upsert":
      return state; // owned by the column model and the row store respectively

    case "rows/remove": {
      const gone = new Set(action.ids);
      const selection = state.selection.filter((id) => !gone.has(id));
      const focus = state.focus && gone.has(state.focus.rowId) ? null : state.focus;
      return { ...state, selection, focus };
    }
  }
}
