/**
 * Precomputed sort keys.
 *
 * The property that matters is not speed, it is EQUIVALENCE: the indexed path
 * must produce the same order as the comparator path, including for the cases
 * the comparator path treats specially. A 50x sort that orders a worklist
 * differently is not an optimisation, it is a clinical incident.
 */
import { describe, expect, it } from "vitest";
import { buildSortKeys, createSortIndex, orderFromKeys, radixOrder } from "./sort-index.js";
import { sortRows } from "./sort.js";

interface Row { readonly id: string; readonly s: string | null; readonly n: number | null }

const get = (row: Row, key: string): unknown => (row as unknown as Record<string, unknown>)[key];

const rows = (n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `r${i}`,
    s: i % 11 === 0 ? null : `name ${(i * 7919) % n}`,
    n: i % 13 === 0 ? null : (i * 37) % 500,
  }));

/** The order the existing comparator path produces, as ids. */
const viaComparator = (data: Row[], key: "s" | "n", direction: "asc" | "desc"): string[] =>
  sortRows(data, [{ key, direction }], {
    [key]: (a: Row, b: Row) => {
      const x = get(a, key);
      const y = get(b, key);
      if (x === null || y === null) return x === y ? 0 : "incomparable";
      return typeof x === "string" ? x.localeCompare(y as string) : (x as number) - (y as number);
    },
  }).rows.map((r) => r.id);

const viaIndex = (data: Row[], key: "s" | "n", direction: "asc" | "desc"): string[] => {
  const order = createSortIndex(data, get).order(key, direction);
  if (!order) throw new Error("column was not indexable");
  return Array.from(order).map((i) => (data[i] as Row).id);
};

/** The same rows, with no absent values, so both paths define a total order. */
const dense = (n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `r${i}`, s: `name ${(i * 7919) % n}`, n: (i * 37) % 500,
  }));

describe("equivalence with the comparator path", () => {
  it.each([
    ["s", "asc"], ["s", "desc"], ["n", "asc"], ["n", "desc"],
  ] as const)("orders %s %s identically when every value is present", (key, direction) => {
    // Restricted to dense columns DELIBERATELY. Where a column has absent
    // values the two paths genuinely differ, and that divergence is documented
    // in its own test below rather than hidden by choosing easier data.
    const data = dense(2_000);
    expect(viaIndex(data, key, direction)).toEqual(viaComparator(data, key, direction));
  });

  it("diverges from the comparator path on absent values — deliberately", () => {
    // `sort.ts` DOCUMENTS "an incomparable pair sorts to the end in source
    // order". Its implementation does not do that: an incomparable pair falls
    // through to the source-order tiebreak, which leaves absent values
    // interleaved among present ones and — because that comparator is not a
    // total order — makes the result depend on the sort's pivot choices.
    //
    // The index implements the DOCUMENTED contract. This test exists so the
    // difference is a recorded decision rather than a surprise, and so that
    // reconciling the two is a visible piece of work.
    const data = rows(200);
    const indexed = viaIndex(data, "n", "asc").map((id) => data.find((r) => r.id === id) as Row);
    const firstAbsent = indexed.findIndex((r) => r.n === null);
    expect(indexed.slice(firstAbsent).every((r) => r.n === null)).toBe(true);

    const compared = viaComparator(data, "n", "asc").map((id) => data.find((r) => r.id === id) as Row);
    const comparedFirstAbsent = compared.findIndex((r) => r.n === null);
    // The comparator path does NOT group them at the end.
    expect(compared.slice(comparedFirstAbsent).every((r) => r.n === null)).toBe(false);
  });

  it("puts absent values last, in source order, both directions", () => {
    const data = rows(500);
    for (const direction of ["asc", "desc"] as const) {
      const ordered = viaIndex(data, "n", direction).map((id) =>
        data.find((r) => r.id === id) as Row,
      );
      const absentAt = ordered.findIndex((r) => r.n === null);
      // Absent is not "smallest". It is unordered against a present value, so
      // it lands at the end whichever way the column points.
      expect(absentAt).toBeGreaterThan(0);
      expect(ordered.slice(absentAt).every((r) => r.n === null)).toBe(true);
      // …and keeps source order there.
      const ids = ordered.slice(absentAt).map((r) => Number(r.id.slice(1)));
      expect(ids).toEqual([...ids].sort((a, b) => a - b));
    }
  });

  it("keeps ties in source order in BOTH directions", () => {
    // Reversing the result would reverse ties too, and a tie is rows the column
    // could not distinguish — they must not move because the arrow flipped.
    const data: Row[] = Array.from({ length: 100 }, (_, i) => ({
      id: `r${i}`, s: i < 50 ? "a" : "b", n: 0,
    }));
    const desc = viaIndex(data, "s", "desc");
    expect(desc.slice(0, 50)).toEqual(data.slice(50).map((r) => r.id));
    expect(desc.slice(50)).toEqual(data.slice(0, 50).map((r) => r.id));
  });
});

describe("what it refuses to index", () => {
  it("refuses a column of mixed types", () => {
    const mixed = [{ id: "a", v: 1 }, { id: "b", v: "two" }];
    expect(buildSortKeys(mixed, (r, k) => (r as never)[k], "v")).toBeNull();
  });

  it("refuses a column holding objects", () => {
    const objects = [{ id: "a", v: { x: 1 } }, { id: "b", v: { x: 2 } }];
    expect(buildSortKeys(objects, (r, k) => (r as never)[k], "v")).toBeNull();
  });

  it("indexes booleans", () => {
    const flags = [{ id: "a", v: true }, { id: "b", v: false }, { id: "c", v: true }];
    const keys = buildSortKeys(flags, (r, k) => (r as never)[k], "v");
    expect(keys).not.toBeNull();
    const order = Array.from(orderFromKeys(keys!, "asc")).map((i) => flags[i]!.id);
    expect(order).toEqual(["b", "a", "c"]);
  });

  it("treats NaN as absent rather than ordering it", () => {
    const data = [{ id: "a", v: 2 }, { id: "b", v: Number.NaN }, { id: "c", v: 1 }];
    const keys = buildSortKeys(data, (r, k) => (r as never)[k], "v");
    const order = Array.from(orderFromKeys(keys!, "asc")).map((i) => data[i]!.id);
    expect(order).toEqual(["c", "a", "b"]);
  });
});

describe("radixOrder", () => {
  it("is stable", () => {
    const keys = new Uint32Array([5, 1, 5, 1, 5]);
    expect(Array.from(radixOrder(keys))).toEqual([1, 3, 0, 2, 4]);
  });

  it("handles an empty and a single-element array", () => {
    expect(Array.from(radixOrder(new Uint32Array(0)))).toEqual([]);
    expect(Array.from(radixOrder(new Uint32Array([7])))).toEqual([0]);
  });

  it("sorts across the full 32-bit range", () => {
    const keys = new Uint32Array([0xffffffff, 0, 0x0000ffff, 0xffff0000, 1]);
    expect(Array.from(radixOrder(keys))).toEqual([1, 4, 2, 3, 0]);
  });
});

describe("the cache", () => {
  it("returns the same order on a second call", () => {
    const data = rows(300);
    const index = createSortIndex(data, get);
    expect(Array.from(index.order("s", "asc")!)).toEqual(Array.from(index.order("s", "asc")!));
  });

  it("rebuilds after invalidation", () => {
    const data = rows(300);
    const index = createSortIndex(data, get);
    const before = Array.from(index.order("n", "asc")!);
    index.invalidate("n");
    expect(Array.from(index.order("n", "asc")!)).toEqual(before);
  });

  it("caches the refusal too, rather than retrying every sort", () => {
    let calls = 0;
    const mixed = [{ id: "a", v: 1 }, { id: "b", v: "two" }];
    const index = createSortIndex(mixed, (r, k) => { calls++; return (r as never)[k]; });
    expect(index.order("v", "asc")).toBeNull();
    const after = calls;
    expect(index.order("v", "asc")).toBeNull();
    expect(calls).toBe(after);
  });
});
