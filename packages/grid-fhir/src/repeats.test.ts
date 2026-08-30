/**
 * Repeated search parameters survive a conjunction.
 *
 * `compileFilter` merged an AND's children with `Object.assign`, so two
 * conditions on the same parameter collided and the second replaced the first.
 * `risk ge 5 AND risk le 10` — the ordinary way to express a bounded cohort —
 * went out as `risk=le10`. A one-sided range, no error, and a registry quietly
 * showing the wrong patients.
 */
import { describe, expect, it } from "vitest";
import { compileFilter, expandParams } from "./compile.js";
import type { FilterNode } from "@oxygenui-design/grid-core";

const MAP = { risk: "risk", name: "name", born: "birthdate" };

const compile = (node: FilterNode) => compileFilter(node, MAP);
const pairs = (node: FilterNode): readonly (readonly [string, string])[] => {
  const c = compile(node);
  if (!c.ok) throw new Error(`refused: ${c.reason}`);
  return expandParams(c.params);
};

const and = (...children: FilterNode[]): FilterNode => ({ kind: "and", children });
const num = (key: string, op: "gte" | "lte" | "gt" | "lt" | "eq", value: number): FilterNode =>
  ({ kind: "number", key, op, value }) as FilterNode;

describe("a bounded range", () => {
  it("keeps both ends", () => {
    expect(pairs(and(num("risk", "gte", 5), num("risk", "lte", 10)))).toEqual([
      ["risk", "ge5"],
      ["risk", "le10"],
    ]);
  });

  it("keeps them in the order they were written", () => {
    expect(pairs(and(num("risk", "lte", 10), num("risk", "gte", 5)))).toEqual([
      ["risk", "le10"],
      ["risk", "ge5"],
    ]);
  });

  it("keeps three conditions on one parameter", () => {
    const out = pairs(and(num("risk", "gte", 1), num("risk", "lte", 9), num("risk", "gt", 3)));
    expect(out).toHaveLength(3);
    expect(out.every(([k]) => k === "risk")).toBe(true);
    expect(out.map(([, v]) => v)).toEqual(["ge1", "le9", "gt3"]);
  });
});

describe("a `between`, which already carried a suffix", () => {
  it("expands to two pairs on its own", () => {
    const out = pairs({ kind: "number", key: "risk", op: "between", value: [2, 8] } as FilterNode);
    expect(out).toEqual([["risk", "ge2"], ["risk", "le8"]]);
  });

  it("does not collide with a third condition on the same parameter", () => {
    // The `between` arrives already holding `risk` and `risk#2`. A third
    // condition must land at `#3` rather than overwriting either.
    const out = pairs(and(
      { kind: "number", key: "risk", op: "between", value: [2, 8] } as FilterNode,
      num("risk", "gt", 3),
    ));
    expect(out).toHaveLength(3);
    expect(out.map(([, v]) => v)).toEqual(["ge2", "le8", "gt3"]);
  });
});

describe("conjunctions that are not repeats", () => {
  it("keeps different parameters side by side", () => {
    const out = pairs(and(num("risk", "gte", 5), { kind: "text", key: "name", op: "contains", value: "Okafor" }));
    expect(out).toEqual([["risk", "ge5"], ["name:contains", "Okafor"]]);
  });

  it("flattens a nested AND without losing a repeat inside it", () => {
    const out = pairs(and(num("risk", "gte", 5), and(num("risk", "lte", 10), num("risk", "lt", 9))));
    expect(out.map(([, v]) => v)).toEqual(["ge5", "le10", "lt9"]);
  });

  it("still refuses what FHIR cannot express", () => {
    const or = compileFilter(
      { kind: "or", children: [num("risk", "gte", 5), num("risk", "lte", 1)] } as FilterNode,
      MAP,
    );
    expect(or.ok).toBe(false);
  });

  it("still refuses a column with no mapped parameter", () => {
    const out = compileFilter(num("potassium", "gt", 5), MAP);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toMatch(/potassium/);
  });
});

describe("the transport boundary", () => {
  it("emits a suffix nowhere in the request", () => {
    const out = pairs(and(num("risk", "gte", 5), num("risk", "lte", 10)));
    expect(out.some(([k]) => /#\d/.test(k))).toBe(false);
  });

  it("survives a round trip through URLSearchParams, which is how it is sent", () => {
    const params = new URLSearchParams();
    for (const [k, v] of pairs(and(num("risk", "gte", 5), num("risk", "lte", 10)))) params.append(k, v);
    expect(params.toString()).toBe("risk=ge5&risk=le10");
    expect(params.getAll("risk")).toEqual(["ge5", "le10"]);
  });
});
