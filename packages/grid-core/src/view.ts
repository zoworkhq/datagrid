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
import { COLUMN_WIDTH, PAGE_SIZE, integerIn } from "./limits.js";
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

  // ── AND THE DOCUMENT, NOT JUST THE ENVELOPE ─────────────────────────────
  //
  // This used to validate the four fields above and then cast the rest. A view
  // arriving from storage, a URL, or another product could therefore carry
  // `pageSize: 0`, `width: -2`, a duplicate column or a sort direction of
  // "sideways", and every one of them passed the boundary that says it refuses
  // rather than guesses. They then reached offset arithmetic, geometry and CSS.
  const body = validateBody(v);
  if (body) return { ok: false, reason: body };

  return { ok: true, view: raw as GridView };
}

/** The first problem in a view's body, or `null`. */
function validateBody(v: Record<string, unknown>): string | null {
  if (v["pageSize"] !== undefined && integerIn(v["pageSize"], PAGE_SIZE) === null) {
    return `page size ${String(v["pageSize"])} is not between ${PAGE_SIZE.min} and ${PAGE_SIZE.max}`;
  }

  if (v["columns"] !== undefined) {
    if (!Array.isArray(v["columns"])) return "columns is not an array";
    const seen = new Set<string>();
    for (const [i, raw] of (v["columns"] as unknown[]).entries()) {
      if (raw === null || typeof raw !== "object") return `column ${i} is not an object`;
      const c = raw as Record<string, unknown>;
      if (typeof c["key"] !== "string" || c["key"] === "") return `column ${i} has no key`;
      if (seen.has(c["key"])) return `column "${c["key"]}" appears twice`;
      seen.add(c["key"]);
      if (c["hidden"] !== undefined && typeof c["hidden"] !== "boolean") {
        return `column "${c["key"]}" has a non-boolean hidden`;
      }
      if (c["pinned"] !== undefined && c["pinned"] !== "start" && c["pinned"] !== "end") {
        return `column "${c["key"]}" is pinned to ${String(c["pinned"])}`;
      }
      if (c["width"] !== undefined && integerIn(c["width"], COLUMN_WIDTH) === null) {
        return `column "${c["key"]}" has width ${String(c["width"])}, outside ${COLUMN_WIDTH.min}–${COLUMN_WIDTH.max}`;
      }
    }
  }

  if (v["sort"] !== undefined) {
    if (!Array.isArray(v["sort"])) return "sort is not an array";
    for (const [i, raw] of (v["sort"] as unknown[]).entries()) {
      if (raw === null || typeof raw !== "object") return `sort ${i} is not an object`;
      const spec = raw as Record<string, unknown>;
      if (typeof spec["key"] !== "string" || spec["key"] === "") return `sort ${i} has no key`;
      if (spec["direction"] !== "asc" && spec["direction"] !== "desc") {
        return `sort on "${String(spec["key"])}" has direction ${String(spec["direction"])}`;
      }
    }
  }

  if (v["filter"] !== undefined && v["filter"] !== null) {
    const problem = validateFilter(v["filter"], "filter");
    if (problem) return problem;
  }

  return null;
}

/** Filters nest, so this does too. Depth-limited: a cycle in JSON is a hostile input. */
function validateFilter(node: unknown, path: string, depth = 0): string | null {
  if (depth > 32) return `${path} nests deeper than 32 levels`;
  if (node === null || typeof node !== "object") return `${path} is not a filter`;
  const n = node as Record<string, unknown>;
  const kind = n["kind"];

  if (kind === "and" || kind === "or") {
    if (!Array.isArray(n["children"])) return `${path} has no children`;
    for (const [i, child] of (n["children"] as unknown[]).entries()) {
      const problem = validateFilter(child, `${path}.children[${i}]`, depth + 1);
      if (problem) return problem;
    }
    return null;
  }
  if (kind === "not") return validateFilter(n["child"], `${path}.child`, depth + 1);

  if (kind !== "text" && kind !== "number" && kind !== "date" && kind !== "enum") {
    return `${path} has unknown kind ${String(kind)}`;
  }
  if (typeof n["key"] !== "string" || n["key"] === "") return `${path} has no key`;
  if (typeof n["op"] !== "string") return `${path} has no operator`;
  return null;
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

/**
 * Projects a resolved view onto grid state.
 *
 * ── "EVERYTHING NOT NAMED BY THE VIEW IS LEFT ALONE" ────────────────────────
 *
 * That was the documented contract and `hidden` did not honour it. It was
 * recomputed from scratch — every column with `hidden: true` in the view, and
 * nothing else — and then REPLACED `base.hidden`. So a personal view that
 * changed one column's width unhid every column the base had hidden, silently,
 * including ones hidden by a policy layer. In healthcare that is a disclosure
 * footgun, not a layout bug.
 *
 * It also made `hidden: false` unexpressible: a view could not say "show this
 * one" without also saying "and show everything else".
 *
 * Visibility is merged BY KEY now:
 *
 *   · a key the view does not mention keeps whatever the base said
 *   · `hidden: true`  adds it
 *   · `hidden: false` removes it — which is the whole point of writing `false`
 *
 * Order is preserved from the base so a round trip is stable.
 */
export function applyView(view: GridView, base: GridState): GridState {
  const hidden = mergeHidden(base.hidden, view.columns ?? []);
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

/**
 * Merges a view's visibility onto the base, by key.
 *
 * `hidden: false` is meaningfully different from the field being absent, which
 * is why this cannot be a filter over the view alone.
 */
function mergeHidden(base: readonly string[], columns: readonly ColumnView[]): readonly string[] {
  const shown = new Set<string>();
  const added: string[] = [];
  for (const c of columns) {
    if (c.hidden === true) added.push(c.key);
    else if (c.hidden === false) shown.add(c.key);
  }

  const out = base.filter((key) => !shown.has(key));
  for (const key of added) if (!out.includes(key)) out.push(key);
  return out;
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
