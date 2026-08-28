/**
 * Compiling a `FilterNode` into FHIR search parameters — or refusing.
 *
 * ── THE RULE THAT MAKES THIS DIFFERENT ──────────────────────────────────────
 *
 * FHIR search cannot express nested boolean logic. There is no `OR` across
 * different parameters, no `NOT` of a group, and no parenthesised grouping:
 * parameters are ANDed, and that is all.
 *
 * So a filter tree that cannot be compiled is **REFUSED WITH A REASON**, never
 * approximated. This is the same rule as the natural-language bar and it exists
 * for the same reason: a silently narrowed cohort looks exactly like a correct
 * answer. A grid that quietly drops the `OR` from "diabetic OR hypertensive"
 * returns a real, plausible, wrong list of patients, and nobody can tell.
 *
 * Refusing is the feature. Approximating is the defect.
 * ────────────────────────────────────────────────────────────────────────────
 */
import type { Comparison, FilterNode } from "@oxygenui-design/grid-core";

export type Compiled =
  | { readonly ok: true; readonly params: Readonly<Record<string, string>> }
  | { readonly ok: false; readonly reason: string };

/** Maps a column key to the FHIR search parameter that stands for it. */
export type SearchParamMap = Readonly<Record<string, string>>;

const PREFIX: Readonly<Record<string, string>> = {
  gt: "gt",
  gte: "ge",
  lt: "lt",
  lte: "le",
  eq: "eq",
  neq: "ne",
};

function compileComparison(node: Comparison, map: SearchParamMap): Compiled {
  const param = map[node.key];
  if (!param) {
    return { ok: false, reason: `no FHIR search parameter is mapped for the column "${node.key}"` };
  }

  switch (node.kind) {
    case "text":
      switch (node.op) {
        case "eq":
          return { ok: true, params: { [param]: node.value } };
        case "contains":
          return { ok: true, params: { [`${param}:contains`]: node.value } };
        case "startsWith":
          // A plain string search is "starts with" in FHIR, which is why this
          // is the only text operator that maps without a modifier.
          return { ok: true, params: { [param]: node.value } };
        case "notEmpty":
          return { ok: true, params: { [`${param}:missing`]: "false" } };
        case "empty":
          return { ok: true, params: { [`${param}:missing`]: "true" } };
        default:
          return { ok: false, reason: `FHIR search cannot express "${node.op}" on ${node.key}` };
      }

    case "number":
    case "date": {
      if (node.op === "empty" || node.op === "notEmpty") {
        return { ok: true, params: { [`${param}:missing`]: node.op === "empty" ? "true" : "false" } };
      }
      if (node.op === "between") {
        const [lo, hi] = node.value as readonly [string | number, string | number];
        // Two prefixed values on one parameter are ANDed by the server, which
        // is exactly a range — the one compound case FHIR does support.
        return { ok: true, params: { [param]: `ge${String(lo)}`, [`${param}#2`]: `le${String(hi)}` } };
      }
      const prefix = PREFIX[node.op];
      if (!prefix) return { ok: false, reason: `FHIR search cannot express "${node.op}" on ${node.key}` };
      return { ok: true, params: { [param]: `${prefix}${String(node.value)}` } };
    }

    case "enum":
      if (node.op === "in") {
        // A comma-separated value list is an OR *within one parameter* — the
        // only OR FHIR has.
        return { ok: true, params: { [param]: node.value.join(",") } };
      }
      if (node.op === "notEmpty" || node.op === "empty") {
        return { ok: true, params: { [`${param}:missing`]: node.op === "empty" ? "true" : "false" } };
      }
      return { ok: false, reason: `FHIR search cannot express "not in" on ${node.key}` };
  }
}

/**
 * Compiles a filter tree, or refuses.
 *
 * Only a flat `AND` of comparisons compiles, because that is the whole of what
 * FHIR search is. `OR` across parameters and `NOT` of a group are refused by
 * name, so the message tells the reader which part of their filter the server
 * cannot answer rather than saying "invalid".
 */
export function compileFilter(node: FilterNode | null, map: SearchParamMap): Compiled {
  if (!node) return { ok: true, params: {} };

  if (node.kind === "or") {
    return {
      ok: false,
      reason:
        "FHIR search cannot express OR across different fields. Run the branches as separate queries, or filter on the client.",
    };
  }
  if (node.kind === "not") {
    return {
      ok: false,
      reason: "FHIR search cannot express NOT of a group. Invert the individual conditions instead.",
    };
  }

  if (node.kind === "and") {
    const params: Record<string, string> = {};
    for (const child of node.children) {
      if (child.kind === "and") {
        // Nested ANDs flatten; that is still just a conjunction.
        const inner = compileFilter(child, map);
        if (!inner.ok) return inner;
        Object.assign(params, inner.params);
        continue;
      }
      if (child.kind === "or" || child.kind === "not") return compileFilter(child, map);
      const compiled = compileComparison(child, map);
      if (!compiled.ok) return compiled;
      Object.assign(params, compiled.params);
    }
    return { ok: true, params };
  }

  return compileComparison(node, map);
}

/**
 * Strips the disambiguating suffix used to hold two prefixed values for one
 * parameter. Applied at the transport boundary, so `_lastUpdated#2` becomes a
 * second `_lastUpdated` value.
 */
export function expandParams(params: Readonly<Record<string, string>>): readonly (readonly [string, string])[] {
  return Object.entries(params).map(([key, value]) => [key.replace(/#\d+$/, ""), value] as const);
}
