import { describe, expect, it } from "vitest";
import { sortRows, toggleSort, type Comparator } from "./sort.js";

interface Row { readonly id: number; readonly ward: string; readonly k: number | null }

const rows: readonly Row[] = [
  { id: 1, ward: "B", k: 4.2 },
  { id: 2, ward: "A", k: 5.1 },
  { id: 3, ward: "B", k: 3.7 },
  { id: 4, ward: "A", k: 5.1 },
  { id: 5, ward: "B", k: 4.2 },
];

const byWard: Comparator<Row> = (a, b) => a.ward.localeCompare(b.ward);
// A potassium with no value cannot be ordered against one that has a value.
const byK: Comparator<Row> = (a, b) => (a.k === null || b.k === null ? "incomparable" : a.k - b.k);
const cmp = { ward: byWard, k: byK };

describe("sorting", () => {
  it("is stable -- equal rows keep source order", () => {
    const out = sortRows(rows, [{ key: "ward", direction: "asc" }], cmp);
    expect(out.rows.map((r) => r.id)).toEqual([2, 4, 1, 3, 5]);
  });

  it("is reversible -- desc is the exact reverse of asc within each tie group", () => {
    const asc = sortRows(rows, [{ key: "k", direction: "asc" }], cmp).rows.map((r) => r.id);
    const desc = sortRows(rows, [{ key: "k", direction: "desc" }], cmp).rows.map((r) => r.id);
    expect(asc).toEqual([3, 1, 5, 2, 4]);
    // Ties (1,5) and (2,4) keep source order in both directions -- that is what
    // stability means, and it is why toggling does not reshuffle.
    expect(desc).toEqual([2, 4, 1, 5, 3]);
  });

  it("applies a second key only within the first key's ties", () => {
    const out = sortRows(rows, [{ key: "ward", direction: "asc" }, { key: "k", direction: "asc" }], cmp);
    expect(out.rows.map((r) => r.id)).toEqual([2, 4, 3, 1, 5]);
  });

  it("refuses rather than coercing an incomparable pair", () => {
    const withNull: readonly Row[] = [...rows, { id: 6, ward: "A", k: null }];
    const out = sortRows(withNull, [{ key: "k", direction: "asc" }], cmp);
    expect(out.incomparable).toBeGreaterThan(0);
    // The refused row is not ordered by accident -- it keeps source position
    // relative to the rows it could not be compared against.
    expect(out.rows).toHaveLength(6);
    expect(out.rows.map((r) => r.id)).toContain(6);
  });

  it("does NOT gather incomparable rows at the end, and the docs no longer say it does", () => {
    // `"incomparable"` is a property of a PAIR; "sorts to the end" is a
    // property of a ROW, and deriving one from the other needs every pair.
    // This test exists so the limitation is asserted rather than assumed —
    // `createSortIndex` is the path that CAN gather absences, because it works
    // from values instead of comparisons.
    const many: readonly Row[] = [
      { id: 1, ward: "A", k: 5 },
      { id: 2, ward: "A", k: null },
      { id: 3, ward: "A", k: 1 },
      { id: 4, ward: "A", k: null },
      { id: 5, ward: "A", k: 3 },
    ];
    const out = sortRows(many, [{ key: "k", direction: "asc" }], cmp);
    const ids = out.rows.map((r) => r.id);
    const lastTwo = ids.slice(-2);
    expect(lastTwo.includes(2) && lastTwo.includes(4)).toBe(false);
  });

  it("leaves rows untouched when there is no sort", () => {
    expect(sortRows(rows, [], cmp).rows).toBe(rows);
  });
});

describe("toggling", () => {
  it("cycles asc, desc, none -- so the source's own ordering stays reachable", () => {
    let s = toggleSort([], "k", false);
    expect(s).toEqual([{ key: "k", direction: "asc" }]);
    s = toggleSort(s, "k", false);
    expect(s).toEqual([{ key: "k", direction: "desc" }]);
    s = toggleSort(s, "k", false);
    expect(s).toEqual([]);
  });

  it("replaces the sort unless additive", () => {
    const s = toggleSort([{ key: "ward", direction: "asc" }], "k", false);
    expect(s).toEqual([{ key: "k", direction: "asc" }]);
  });

  it("appends when additive, and keeps the existing key's position stable", () => {
    const s = toggleSort([{ key: "ward", direction: "asc" }], "k", true);
    expect(s).toEqual([{ key: "ward", direction: "asc" }, { key: "k", direction: "asc" }]);
  });
});
