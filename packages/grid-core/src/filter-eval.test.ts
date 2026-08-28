import { describe, expect, it } from "vitest";
import { and, not, or } from "./filter.js";
import { evaluateFilter } from "./filter-eval.js";

interface P { name: string; k: number | null; seen: string | null; ward: string }
const get = (row: P, key: string) => (row as unknown as Record<string, unknown>)[key];

const rows: P[] = [
  { name: "Müller", k: 3.7, seen: "2026-08-01", ward: "A" },
  { name: "okafor", k: 5.1, seen: null, ward: "B" },
  { name: "Rahman", k: null, seen: "2026-08-20", ward: "A" },
];
const keep = (node: Parameters<typeof evaluateFilter<P>>[0]) =>
  rows.filter((r) => evaluateFilter(node, r, get)).map((r) => r.name);

describe("filter evaluation", () => {
  it("matches text case- and accent-insensitively", () => {
    // A name filter that misses "Müller" when you type "muller" is a bug the
    // user reads as "this patient is not in the system".
    expect(keep({ kind: "text", key: "name", op: "contains", value: "MULL" })).toEqual(["Müller"]);
    expect(keep({ kind: "text", key: "name", op: "startsWith", value: "OKA" })).toEqual(["okafor"]);
  });

  it("orders numbers and handles between in either direction", () => {
    expect(keep({ kind: "number", key: "k", op: "gt", value: 4 })).toEqual(["okafor"]);
    expect(keep({ kind: "number", key: "k", op: "between", value: [5.5, 3.5] })).toEqual(["Müller", "okafor"]);
  });

  it("never matches an ordered comparison against a missing value", () => {
    // `k: null` is unknown, not zero, and not "less than 4".
    expect(keep({ kind: "number", key: "k", op: "lt", value: 4 })).toEqual(["Müller"]);
    expect(keep({ kind: "number", key: "k", op: "gte", value: 0 })).toEqual(["Müller", "okafor"]);
  });

  it("separates empty from a value, in both directions", () => {
    expect(keep({ kind: "date", key: "seen", op: "empty", value: "" })).toEqual(["okafor"]);
    expect(keep({ kind: "date", key: "seen", op: "notEmpty", value: "" })).toEqual(["Müller", "Rahman"]);
  });

  it("compares dates as instants, not as strings", () => {
    expect(keep({ kind: "date", key: "seen", op: "gt", value: "2026-08-10" })).toEqual(["Rahman"]);
  });

  it("handles enum membership", () => {
    expect(keep({ kind: "enum", key: "ward", op: "in", value: ["A"] })).toEqual(["Müller", "Rahman"]);
    expect(keep({ kind: "enum", key: "ward", op: "notIn", value: ["A"] })).toEqual(["okafor"]);
  });

  it("composes and / or / not", () => {
    const node = and(
      { kind: "enum", key: "ward", op: "in", value: ["A"] },
      not({ kind: "text", key: "name", op: "contains", value: "rahman" }),
    );
    expect(keep(node)).toEqual(["Müller"]);
    expect(keep(or({ kind: "text", key: "name", op: "eq", value: "okafor" }, node))).toEqual(["Müller", "okafor"]);
  });

  it("uses each operator's identity for an empty group", () => {
    // So that removing the last condition from a group in a builder composes
    // correctly instead of emptying the grid.
    expect(keep(and())).toEqual(["Müller", "okafor", "Rahman"]);
    expect(keep(or())).toEqual([]);
    expect(keep(null)).toEqual(["Müller", "okafor", "Rahman"]);
  });
});
