/**
 * Filter evaluation, for client mode.
 *
 * Server mode does not use this — it compiles the same AST into a query, and
 * **refuses with a reason** when it cannot. That is the important asymmetry:
 * client mode can always evaluate a tree, a server often cannot, and a filter
 * that is silently narrowed looks exactly like a correct answer.
 */
import type { Comparison, FilterNode } from "./filter.js";

export type Accessor<TRow> = (row: TRow, key: string) => unknown;

const asText = (v: unknown): string | null =>
  v === null || v === undefined ? null : typeof v === "string" ? v : String(v);

const asNumber = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isNaN(v) ? null : v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  }
  return null;
};

const asTime = (v: unknown): number | null => {
  if (v instanceof Date) return v.getTime();
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }
  return null;
};

const isEmpty = (v: unknown): boolean =>
  v === null || v === undefined || (typeof v === "string" && v.trim() === "");

/** Case- and accent-insensitive, because a name filter that misses "Müller" is a bug. */
const fold = (s: string): string =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase();

function compareOrdered(op: string, actual: number | null, expected: number | readonly number[]): boolean {
  if (actual === null) return false;
  if (op === "between") {
    const [lo, hi] = expected as readonly number[];
    if (lo === undefined || hi === undefined) return false;
    return actual >= Math.min(lo, hi) && actual <= Math.max(lo, hi);
  }
  const e = expected as number;
  switch (op) {
    case "eq": return actual === e;
    case "neq": return actual !== e;
    case "gt": return actual > e;
    case "gte": return actual >= e;
    case "lt": return actual < e;
    case "lte": return actual <= e;
    default: return false;
  }
}

function evaluateComparison<TRow>(node: Comparison, row: TRow, get: Accessor<TRow>): boolean {
  const raw = get(row, node.key);

  if (node.op === "empty") return isEmpty(raw);
  if (node.op === "notEmpty") return !isEmpty(raw);

  switch (node.kind) {
    case "text": {
      const a = asText(raw);
      if (a === null) return false;
      const x = fold(a);
      const y = fold(node.value);
      switch (node.op) {
        case "eq": return x === y;
        case "neq": return x !== y;
        case "contains": return x.includes(y);
        case "startsWith": return x.startsWith(y);
        case "endsWith": return x.endsWith(y);
        default: return false;
      }
    }
    case "number":
      return compareOrdered(node.op, asNumber(raw), node.value as number | readonly number[]);
    case "date": {
      const actual = asTime(raw);
      const v = node.value;
      const expected = Array.isArray(v)
        ? (v.map(asTime).filter((t): t is number => t !== null) as readonly number[])
        : asTime(v as string);
      if (expected === null) return false;
      return compareOrdered(node.op, actual, expected);
    }
    case "enum": {
      const a = asText(raw);
      if (a === null) return false;
      const inSet = node.value.includes(a);
      return node.op === "in" ? inSet : !inSet;
    }
  }
}

export function evaluateFilter<TRow>(
  node: FilterNode | null,
  row: TRow,
  get: Accessor<TRow>,
): boolean {
  if (!node) return true;
  switch (node.kind) {
    // An empty `and` matches everything and an empty `or` matches nothing —
    // the identity of each operator, and the answer that composes correctly
    // when a builder removes the last condition from a group.
    case "and": return node.children.every((c) => evaluateFilter(c, row, get));
    case "or": return node.children.some((c) => evaluateFilter(c, row, get));
    case "not": return !evaluateFilter(node.child, row, get);
    default: return evaluateComparison(node, row, get);
  }
}
