/**
 * `GridView` — a saved view, as a serialisable document.
 *
 * The fourteen clinical recipes are `GridView` documents plus column sets:
 * **data, not code**. That is what lets a product declare a caseload rather
 * than build one, and lets a designer edit one.
 *
 * ── VERSIONED FROM THE FIRST COMMIT ─────────────────────────────────────────
 * Saved views are where a schema mistake becomes a migration. The moment a
 * customer has a thousand personal views in a database, an unversioned document
 * is unfixable. `version` is required and a document from an unknown version is
 * **refused, not guessed at** — the same rule as an uncompilable filter.
 * ────────────────────────────────────────────────────────────────────────────
 */
import type { FilterNode } from "./filter.js";
import type { SortSpec } from "./query.js";
import type { GridState } from "./state.js";

export const VIEW_VERSION = 1 as const;

/**
 * Precedence, lowest to highest. A personal view beats a team view beats a role
 * view beats the product's default — because the person at the keyboard knows
 * their work better than the product does, and because a clinician who has
 * arranged their worklist should not have it rearranged by a deploy.
 */
export const SCOPE_ORDER = ["default", "role", "team", "personal"] as const;
export type ViewScope = (typeof SCOPE_ORDER)[number];

export interface ColumnView {
  readonly key: string;
  readonly hidden?: boolean;
  readonly width?: number;
  readonly pinned?: "start" | "end";
}

export interface GridView {
  readonly version: typeof VIEW_VERSION;
  readonly id: string;
  readonly label: string;
  readonly scope: ViewScope;
  readonly columns?: readonly ColumnView[];
  readonly sort?: readonly SortSpec[];
  readonly filter?: FilterNode | null;
  readonly pageSize?: number;
}

/** What the grid could not honour. Reported, never silently dropped. */
export type ViewProblem =
  | { readonly kind: "unknown-column"; readonly key: string; readonly viewId: string }
  | { readonly kind: "required-column-hidden"; readonly key: string; readonly viewId: string }
  | { readonly kind: "unsortable-column"; readonly key: string; readonly viewId: string };

export interface ViewContext {
  readonly columnKeys: readonly string[];
  /** Columns a view may never hide. The identity column, in a clinical recipe. */
  readonly requiredColumns?: readonly string[];
  readonly sortableKeys?: readonly string[];
}

export interface ViewResolution {
  readonly view: GridView;
  /** Which scopes actually contributed, lowest to highest. */
  readonly applied: readonly ViewScope[];
  readonly problems: readonly ViewProblem[];
}

export type ViewParse =
  | { readonly ok: true; readonly view: GridView }
  | { readonly ok: false; readonly reason: string };

const isScope = (v: unknown): v is ViewScope =>
  typeof v === "string" && (SCOPE_ORDER as readonly string[]).includes(v);

/**
 * Parses a stored view.
 *
 * A document from a future version is refused with its version named, rather
 * than partially applied. A view that silently loses its filter is a filtered
 * list claiming to be complete — the failure this library exists to prevent.
 */
export function parseView(input: string | unknown): ViewParse {
  let raw: unknown;
  if (typeof input === "string") {
    try {
      raw = JSON.parse(input);
    } catch {
      return { ok: false, reason: "not valid JSON" };
    }
  } else raw = input;

  if (raw === null || typeof raw !== "object") return { ok: false, reason: "not an object" };
  const v = raw as Record<string, unknown>;

  if (v["version"] !== VIEW_VERSION) {
    return {
      ok: false,
      reason: `unsupported view version ${String(v["version"])}; this build reads version ${VIEW_VERSION}`,
    };
  }
  if (typeof v["id"] !== "string" || v["id"] === "") return { ok: false, reason: "missing id" };
  if (typeof v["label"] !== "string") return { ok: false, reason: "missing label" };
  if (!isScope(v["scope"])) return { ok: false, reason: `unknown scope ${String(v["scope"])}` };

  return { ok: true, view: raw as GridView };
}

/**
 * Merges a stack of views by precedence and reports what it could not honour.
 *
 * Later scopes override earlier ones **field by field**, not wholesale: a
 * personal view that only reorders columns must not silently discard the team
 * view's filter.
 */
export function resolveViews(layers: readonly GridView[], ctx: ViewContext): ViewResolution {
  const known = new Set(ctx.columnKeys);
  const required = new Set(ctx.requiredColumns ?? []);
  const sortable = ctx.sortableKeys ? new Set(ctx.sortableKeys) : null;
  const problems: ViewProblem[] = [];
  const applied: ViewScope[] = [];

  const ordered = [...layers].sort(
    (a, b) => SCOPE_ORDER.indexOf(a.scope) - SCOPE_ORDER.indexOf(b.scope),
  );

  // Column state accumulates by key so a lower scope's width survives a higher
  // scope that only changed visibility.
  const columns = new Map<string, ColumnView>();
  let sort: readonly SortSpec[] | undefined;
  let filter: FilterNode | null | undefined;
  let pageSize: number | undefined;
  let id = "";
  let label = "";
  let scope: ViewScope = "default";

  for (const view of ordered) {
    applied.push(view.scope);
    id = view.id;
    label = view.label;
    scope = view.scope;

    for (const column of view.columns ?? []) {
      if (!known.has(column.key)) {
        // A view saved when this column existed, applied after it was removed.
        problems.push({ kind: "unknown-column", key: column.key, viewId: view.id });
        continue;
      }
      if (column.hidden && required.has(column.key)) {
        // A required column cannot be hidden by a saved view any more than by a
        // menu. Acting on the wrong row is the error this prevents.
        problems.push({ kind: "required-column-hidden", key: column.key, viewId: view.id });
        columns.set(column.key, { ...columns.get(column.key), ...column, hidden: false });
        continue;
      }
      columns.set(column.key, { ...columns.get(column.key), ...column });
    }

    if (view.sort !== undefined) {
      const usable = view.sort.filter((s) => {
        if (!known.has(s.key)) {
          problems.push({ kind: "unknown-column", key: s.key, viewId: view.id });
          return false;
        }
        if (sortable && !sortable.has(s.key)) {
          problems.push({ kind: "unsortable-column", key: s.key, viewId: view.id });
          return false;
        }
        return true;
      });
      sort = usable;
    }
    if (view.filter !== undefined) filter = view.filter;
    if (view.pageSize !== undefined) pageSize = view.pageSize;
  }

  const merged: GridView = {
    version: VIEW_VERSION,
    id,
    label,
    scope,
    ...(columns.size > 0 ? { columns: [...columns.values()] } : {}),
    ...(sort !== undefined ? { sort } : {}),
    ...(filter !== undefined ? { filter } : {}),
    ...(pageSize !== undefined ? { pageSize } : {}),
  };

  return { view: merged, applied, problems };
}

/** Projects a resolved view onto grid state. Everything not named by the view is left alone. */
export function applyView(view: GridView, base: GridState): GridState {
  const hidden = (view.columns ?? []).filter((c) => c.hidden).map((c) => c.key);
  const widths = { ...base.widths };
  for (const c of view.columns ?? []) if (c.width !== undefined) widths[c.key] = c.width;

  return {
    ...base,
    ...(view.sort !== undefined ? { sort: view.sort } : {}),
    ...(view.filter !== undefined ? { filter: view.filter } : {}),
    ...(view.pageSize !== undefined ? { pageSize: view.pageSize } : {}),
    hidden,
    widths,
    // A view change is a new query, so the position in the old one is
    // meaningless — an opaque cursor most obviously, and a page index for
    // exactly the same reason: page 7 of a different filter is not page 7.
    cursor: null,
    page: 0,
  };
}

/** The round-trip a saved view must survive: state -> document -> state. */
export function viewFromState(
  state: GridState,
  meta: { id: string; label: string; scope: ViewScope },
  columnKeys: readonly string[],
): GridView {
  return {
    version: VIEW_VERSION,
    id: meta.id,
    label: meta.label,
    scope: meta.scope,
    columns: columnKeys.map((key) => ({
      key,
      ...(state.hidden.includes(key) ? { hidden: true } : {}),
      ...(state.widths[key] !== undefined ? { width: state.widths[key] as number } : {}),
    })),
    sort: state.sort,
    filter: state.filter,
    pageSize: state.pageSize,
  };
}
