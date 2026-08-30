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
  /**
   * Every row the grid HAS, which is not always every row that matches.
   *
   * The reducer resolves this against `ctx.rowIds`, so under a client model it
   * is the whole filtered set and under a paged model it is what has loaded.
   * That difference is real and is not papered over: an application that means
   * "everything matching, including rows nobody has seen" wants
   * `selectMatching` and the bulk-review path, which counts the unnamed rows
   * and refuses rather than guessing.
   */
  | { readonly type: "select/all" }
  /**
   * The exact set, replacing whatever was selected.
   *
   * Added for undo. `select/clear` used to invert to a `select/range` built
   * from the first and last ids of the old selection, which turns a
   * non-contiguous selection into a larger contiguous one — and the next bulk
   * action then targets rows the user never picked.
   */
  | { readonly type: "select/set"; readonly ids: readonly RowId[] }
  | { readonly type: "page/next"; readonly cursor: string }
  /**
   * Jump to a page, for a source whose capabilities say `paging: "offset"`.
   *
   * A cursor source cannot serve this and should not be sent it: `queryFrom`
   * only emits an offset when the source declared it can seek, so a grid wired
   * to a pagination control against a FHIR endpoint asks for page 0 forever
   * rather than asking for something the server will quietly ignore.
   */
  | { readonly type: "page/goto"; readonly page: number }
  | { readonly type: "page/size"; readonly size: number }
  | { readonly type: "focus/cell"; readonly rowId: RowId; readonly columnKey: string }
  | { readonly type: "column/resize"; readonly key: string; readonly width: number }
  | { readonly type: "column/reorder"; readonly key: string; readonly toIndex: number }
  | { readonly type: "column/visibility"; readonly key: string; readonly visible: boolean }
  /**
   * The column menu was asked for. The grid does not own the menu.
   *
   * Sorting, hiding, pinning and filtering all already have their own actions;
   * a menu is the chrome that collects them, and chrome belongs to the
   * application — the same reason the grid emits events rather than rendering
   * a toolbar.
   */
  | { readonly type: "column/menu"; readonly key: string }
  /**
   * F2 on a cell. The grid does not own the editor either.
   *
   * `beginEdit` returns a SESSION the application holds, because a commit can
   * fail and the failure belongs to whoever made the request. The renderer's
   * job is to say which cell, and to say it in the one place that knows where
   * focus is.
   */
  | { readonly type: "edit/begin"; readonly rowId: RowId; readonly columnKey: string }
  /** Live updates are pushed in by the application. The grid has no socket. */
  | { readonly type: "rows/upsert"; readonly rows: readonly unknown[] }
  | { readonly type: "rows/remove"; readonly ids: readonly RowId[] };

/**
 * A plugin may observe or veto an action. A veto carries a reason the grid can
 * render — never a silent `false`, because when the disclosure policy blocks a
 * copy the user has to be told why.
 */
export type Veto = { readonly blocked: true; readonly reason: string } | { readonly blocked: false };
