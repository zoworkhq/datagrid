/**
 * The write path: explicit, serialisable, replayable.
 *
 * Writes go through actions because that is what makes behaviour replayable,
 * loggable and property-testable, and what lets the devtools panel show why a
 * grid is in the state it is in. Reads go through signals — see `grid-signals`.
 */
import type { FilterNode } from "./filter.js";
import type { SortSpec } from "./query.js";

export type RowId = string;

export type GridAction =
  | { readonly type: "sort/toggle"; readonly key: string; readonly additive: boolean }
  | { readonly type: "sort/set"; readonly sort: readonly SortSpec[] }
  | { readonly type: "filter/set"; readonly node: FilterNode | null }
  | { readonly type: "select/toggle"; readonly id: RowId }
  | { readonly type: "select/range"; readonly from: RowId; readonly to: RowId }
  | { readonly type: "select/clear" }
  | { readonly type: "page/next"; readonly cursor: string }
  | { readonly type: "page/size"; readonly size: number }
  | { readonly type: "focus/cell"; readonly rowId: RowId; readonly columnKey: string }
  | { readonly type: "column/resize"; readonly key: string; readonly width: number }
  | { readonly type: "column/reorder"; readonly key: string; readonly toIndex: number }
  | { readonly type: "column/visibility"; readonly key: string; readonly visible: boolean }
  /** Live updates are pushed in by the application. The grid has no socket. */
  | { readonly type: "rows/upsert"; readonly rows: readonly unknown[] }
  | { readonly type: "rows/remove"; readonly ids: readonly RowId[] };

/**
 * A plugin may observe or veto an action. A veto carries a reason the grid can
 * render — never a silent `false`, because when the disclosure policy blocks a
 * copy the user has to be told why.
 */
export type Veto = { readonly blocked: true; readonly reason: string } | { readonly blocked: false };
