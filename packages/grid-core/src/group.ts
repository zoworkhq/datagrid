/**
 * Grouping and tree data.
 *
 * Both produce the same thing: a hierarchy that is flattened into the ordered
 * list of visible entries the renderer walks. Doing it once means expansion,
 * counting and aggregation behave identically whether the hierarchy came from
 * grouping a flat set or from a tree the source supplied.
 *
 * ── THE RULE THAT MAKES THIS DIFFERENT ──────────────────────────────────────
 *
 * A branch whose children have not been fetched renders as **unresolved**, not
 * as empty. A node with unknown children is not a node with no children, and
 * every grid that conflates the two tells the reader a plan has no goals when
 * in fact the request timed out.
 * ────────────────────────────────────────────────────────────────────────────
 */
import { aggregate, type AggregateKind, type AggregateResult, type Measured } from "./aggregate.js";
import type { RowId } from "./actions.js";

export interface GroupNode {
  readonly kind: "group";
  /** Stable across re-renders, so expansion survives a sort or a live update. */
  readonly path: string;
  readonly columnKey: string;
  readonly label: string;
  readonly depth: number;
  /** Leaf rows beneath, at any depth. `"unresolved"` when the branch is unfetched. */
  readonly count: number | "unresolved";
  readonly expanded: boolean;
  readonly aggregates: Readonly<Record<string, AggregateResult>>;
}

export interface LeafNode<TRow> {
  readonly kind: "row";
  readonly id: RowId;
  readonly row: TRow;
  readonly depth: number;
}

/** A branch the source has not supplied yet. Never rendered as "no children". */
export interface UnresolvedNode {
  readonly kind: "unresolved";
  readonly path: string;
  readonly depth: number;
}

export type GroupEntry<TRow> = GroupNode | LeafNode<TRow> | UnresolvedNode;

export interface AggregateSpec<TRow> {
  readonly columnKey: string;
  readonly kind: AggregateKind;
  readonly value: (row: TRow) => Measured | null | undefined;
}

export interface GroupOptions<TRow> {
  readonly by: readonly string[];
  readonly rowKey: (row: TRow) => RowId;
  readonly get: (row: TRow, key: string) => unknown;
  /** Expanded group paths. Absent means collapsed, so a deep tree opens closed. */
  readonly expanded: ReadonlySet<string>;
  readonly aggregates?: readonly AggregateSpec<TRow>[];
  readonly label?: (columnKey: string, value: unknown) => string;
}

const defaultLabel = (_columnKey: string, value: unknown): string =>
  value === null || value === undefined || value === "" ? "(none)" : String(value);

function aggregatesFor<TRow>(
  rows: readonly TRow[],
  specs: readonly AggregateSpec<TRow>[] | undefined,
): Record<string, AggregateResult> {
  const out: Record<string, AggregateResult> = {};
  for (const spec of specs ?? []) {
    out[spec.columnKey] = aggregate(spec.kind, rows.map(spec.value));
  }
  return out;
}

/**
 * Groups a flat set and flattens the result into visible entries.
 *
 * Only expanded branches contribute their children, so a collapsed group of
 * 40,000 rows costs one entry — which is what makes grouping usable at all at
 * the sizes this grid targets.
 */
export function groupRows<TRow>(
  rows: readonly TRow[],
  options: GroupOptions<TRow>,
): readonly GroupEntry<TRow>[] {
  const { by, expanded, rowKey, get } = options;
  const label = options.label ?? defaultLabel;

  if (by.length === 0) {
    return rows.map((row) => ({ kind: "row", id: rowKey(row), row, depth: 0 }));
  }

  const out: GroupEntry<TRow>[] = [];

  const walk = (subset: readonly TRow[], level: number, parentPath: string): void => {
    const key = by[level];
    if (key === undefined) {
      for (const row of subset) out.push({ kind: "row", id: rowKey(row), row, depth: level });
      return;
    }

    // A Map preserves first-seen order, so groups appear in the order the sort
    // put them in rather than in an arbitrary or alphabetical one.
    const buckets = new Map<string, { value: unknown; rows: TRow[] }>();
    for (const row of subset) {
      const value = get(row, key);
      const bucketKey = String(value);
      const existing = buckets.get(bucketKey);
      if (existing) existing.rows.push(row);
      else buckets.set(bucketKey, { value, rows: [row] });
    }

    for (const [bucketKey, bucket] of buckets) {
      const path = parentPath === "" ? `${key}=${bucketKey}` : `${parentPath}/${key}=${bucketKey}`;
      const isExpanded = expanded.has(path);
      out.push({
        kind: "group",
        path,
        columnKey: key,
        label: label(key, bucket.value),
        depth: level,
        count: bucket.rows.length,
        expanded: isExpanded,
        aggregates: aggregatesFor(bucket.rows, options.aggregates),
      });
      if (isExpanded) walk(bucket.rows, level + 1, path);
    }
  };

  walk(rows, 0, "");
  return out;
}

export interface TreeOptions<TRow> {
  readonly rowKey: (row: TRow) => RowId;
  /**
   * The children of a row, or `"unresolved"` when they have not been fetched.
   *
   * `"unresolved"` is not `[]`. A node with unknown children is not a node with
   * no children, and the difference is the whole point of this signature.
   */
  readonly childrenOf: (row: TRow) => readonly TRow[] | "unresolved";
  readonly expanded: ReadonlySet<RowId>;
}

/** Flattens a tree into visible entries, expanded branches only. */
export function flattenTree<TRow>(
  roots: readonly TRow[],
  options: TreeOptions<TRow>,
): readonly GroupEntry<TRow>[] {
  const out: GroupEntry<TRow>[] = [];

  const walk = (rows: readonly TRow[], depth: number): void => {
    for (const row of rows) {
      const id = options.rowKey(row);
      out.push({ kind: "row", id, row, depth });
      if (!options.expanded.has(id)) continue;

      const children = options.childrenOf(row);
      if (children === "unresolved") {
        // Rendered as an unresolved branch, never as a leaf. The reader must be
        // able to tell "not fetched" from "nothing here".
        out.push({ kind: "unresolved", path: id, depth: depth + 1 });
        continue;
      }
      walk(children, depth + 1);
    }
  };

  walk(roots, 0);
  return out;
}

/** Toggles a path in an expansion set, returning a new set. */
export function toggleExpanded(expanded: ReadonlySet<string>, path: string): ReadonlySet<string> {
  const next = new Set(expanded);
  if (!next.delete(path)) next.add(path);
  return next;
}

/** How many leaf rows a flattened list actually shows. Groups are not rows. */
export function countLeaves<TRow>(entries: readonly GroupEntry<TRow>[]): number {
  return entries.reduce((n, e) => n + (e.kind === "row" ? 1 : 0), 0);
}
