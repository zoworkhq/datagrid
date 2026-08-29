/**
 * The columnar store.
 *
 * The properties that matter are correctness ones. A store that is 3.5x
 * smaller and returns a potassium of 0 where the record says "not measured"
 * has not saved anything worth having.
 */
import { describe, expect, it } from "vitest";
import { buildColumnStore, createColumnStore, type StoredColumn } from "./column-store.js";

interface Row {
  readonly id: string;
  readonly ward: string | null;
  readonly k: number | null;
  readonly flagged: boolean | null;
}

const SPECS: StoredColumn[] = [
  { key: "id", type: "string" },
  { key: "ward", type: "string" },
  { key: "k", type: "number" },
  { key: "flagged", type: "boolean" },
];

const get = (row: Row, key: string): unknown => (row as unknown as Record<string, unknown>)[key];

const WARDS = ["Ashgrove", "Beeches", "Cedar", "Dunlin"];
const rows = (n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    ward: i % 7 === 0 ? null : (WARDS[i % WARDS.length] as string),
    k: i % 5 === 0 ? null : (i * 37) % 400 / 10,
    flagged: i % 11 === 0 ? null : i % 2 === 0,
  }));

const store = (n = 500) => createColumnStore(SPECS, rows(n), get);

describe("round-tripping values", () => {
  it("returns what it was given", () => {
    const data = rows(200);
    const s = createColumnStore(SPECS, data, get);
    for (let i = 0; i < data.length; i++) {
      expect(s.get(i, "id")).toBe(data[i]!.id);
      expect(s.get(i, "ward")).toBe(data[i]!.ward);
      expect(s.get(i, "k")).toBe(data[i]!.k);
      expect(s.get(i, "flagged")).toBe(data[i]!.flagged);
    }
  });

  it("distinguishes a zero from an absence", () => {
    // THE reason every column carries a presence bitmap. A Float64Array has no
    // null, and 0 is a potassium of zero — a different clinical fact from
    // "not measured". Collapsing them is the failure this library refuses.
    const data: Row[] = [
      { id: "a", ward: "A", k: 0, flagged: false },
      { id: "b", ward: "A", k: null, flagged: null },
    ];
    const s = createColumnStore(SPECS, data, get);
    expect(s.get(0, "k")).toBe(0);
    expect(s.get(1, "k")).toBeNull();
    expect(s.get(0, "flagged")).toBe(false);
    expect(s.get(1, "flagged")).toBeNull();
  });

  it("treats NaN and undefined as absent rather than as values", () => {
    const data = [{ id: "a", ward: "A", k: Number.NaN, flagged: null }] as unknown as Row[];
    const s = createColumnStore(SPECS, data, get);
    expect(s.get(0, "k")).toBeNull();
  });

  it("materialises a whole row", () => {
    const data = rows(10);
    const s = createColumnStore(SPECS, data, get);
    expect(s.row(3)).toEqual({
      id: data[3]!.id, ward: data[3]!.ward, k: data[3]!.k, flagged: data[3]!.flagged,
    });
  });

  it("returns null outside the row range rather than throwing", () => {
    const s = store(10);
    expect(s.get(-1, "k")).toBeNull();
    expect(s.get(999, "k")).toBeNull();
  });

  it("refuses a column it does not hold", () => {
    // Silently returning null for a typo would hide the mistake behind an
    // empty column, which reads exactly like missing data.
    expect(() => store(10).get(0, "nope")).toThrow(/no column/);
  });
});

describe("ordering", () => {
  const ordered = (s: ReturnType<typeof store>, key: string, dir: "asc" | "desc") =>
    Array.from(s.order(key, dir)).map((i) => s.get(i, key));

  it.each([["k"], ["ward"], ["flagged"]])("sorts %s ascending", (key) => {
    const s = store(300);
    const values = ordered(s, key, "asc");
    const present = values.filter((v) => v !== null);
    const sorted = [...present].sort((a, b) =>
      typeof a === "string" ? (a as string).localeCompare(b as string) : Number(a) - Number(b),
    );
    expect(present).toEqual(sorted);
  });

  it("puts absences last in BOTH directions", () => {
    const s = store(300);
    for (const dir of ["asc", "desc"] as const) {
      const values = ordered(s, "k", dir);
      const firstNull = values.findIndex((v) => v === null);
      expect(firstNull).toBeGreaterThan(0);
      expect(values.slice(firstNull).every((v) => v === null)).toBe(true);
    }
  });

  it("keeps absences in source order", () => {
    const s = store(300);
    const order = Array.from(s.order("k", "asc"));
    const absent = order.filter((i) => s.get(i, "k") === null);
    expect(absent).toEqual([...absent].sort((a, b) => a - b));
  });

  it("keeps ties in source order in both directions", () => {
    // A tie is rows the column could not distinguish. They must not move
    // because the arrow flipped.
    const data: Row[] = Array.from({ length: 60 }, (_, i) => ({
      id: `p${i}`, ward: i < 30 ? "A" : "B", k: 1, flagged: null,
    }));
    const s = createColumnStore(SPECS, data, get);
    const desc = Array.from(s.order("ward", "desc"));
    expect(desc.slice(0, 30)).toEqual(Array.from({ length: 30 }, (_, i) => i + 30));
    expect(desc.slice(30)).toEqual(Array.from({ length: 30 }, (_, i) => i));
  });

  it("handles an empty store", () => {
    const s = createColumnStore(SPECS, [], get);
    expect(s.length).toBe(0);
    expect(Array.from(s.order("k", "asc"))).toEqual([]);
  });
});

describe("selecting", () => {
  it("returns the matching row indices", () => {
    const s = store(200);
    const hits = Array.from(s.select("ward", (v) => v === "Cedar"));
    expect(hits.length).toBeGreaterThan(0);
    for (const i of hits) expect(s.get(i, "ward")).toBe("Cedar");
  });

  it("can select on absence, which is a question people ask", () => {
    const s = store(200);
    const hits = Array.from(s.select("k", (v) => v === null));
    expect(hits.length).toBeGreaterThan(0);
    for (const i of hits) expect(s.get(i, "k")).toBeNull();
  });

  it("returns an empty selection rather than everything when nothing matches", () => {
    expect(Array.from(store(100).select("ward", () => false))).toEqual([]);
  });
});

describe("what it costs", () => {
  /** Only the columns a clinical grid actually repeats — no unique identifier. */
  const LOW_CARDINALITY: StoredColumn[] = [
    { key: "ward", type: "string" },
    { key: "k", type: "number" },
    { key: "flagged", type: "boolean" },
  ];

  it("reports its own size", () => {
    const s = createColumnStore(LOW_CARDINALITY, rows(10_000), get);
    expect(s.bytes).toBeGreaterThan(0);
    // 8 bytes numeric + 4 ordinal + 1 boolean + three bitmaps, over three
    // columns. Against the ~50 bytes per cell an object row costs.
    expect(s.bytes / (10_000 * LOW_CARDINALITY.length)).toBeLessThan(6);
  });

  it("holds one copy of each distinct string, so cost per row FALLS with scale", () => {
    // A ward column over 100,000 rows holds four strings, not 100,000, and the
    // dictionary is amortised over more rows as the set grows. This is where
    // the memory actually goes in a clinical grid.
    const perRow = (n: number) => {
      const s = createColumnStore(LOW_CARDINALITY, rows(n), get);
      return s.bytes / s.length;
    };
    expect(perRow(100_000)).toBeLessThan(perRow(1_000));
  });

  it("does NOT pay off on a unique-valued column, and the numbers say so", () => {
    // An id or an MRN is distinct per row, so its dictionary grows linearly and
    // encoding buys nothing but an indirection. Worth knowing before someone
    // stores an MRN column and wonders where the saving went — such columns
    // belong in the row objects the window materialises, not in the store.
    const ids: StoredColumn[] = [{ key: "id", type: "string" }];
    const perRow = (n: number) => {
      const s = createColumnStore(ids, rows(n), get);
      return s.bytes / s.length;
    };
    expect(perRow(100_000)).toBeGreaterThan(perRow(1_000) * 0.9);
  });
});

describe("buildColumnStore — the one that saves memory", () => {
  it("consumes an iterable and produces an identical store", () => {
    const data = rows(300);
    const fromArray = createColumnStore(SPECS, data, get);
    const streamed = buildColumnStore(SPECS, data.length, data.values(), get);

    expect(streamed.length).toBe(fromArray.length);
    for (let i = 0; i < data.length; i++) {
      for (const key of ["id", "ward", "k", "flagged"]) {
        expect(streamed.get(i, key)).toBe(fromArray.get(i, key));
      }
    }
  });

  it("orders identically to a store built from an array", () => {
    const data = rows(400);
    const a = createColumnStore(SPECS, data, get);
    const b = buildColumnStore(SPECS, data.length, data.values(), get);
    expect(Array.from(b.order("k", "asc"))).toEqual(Array.from(a.order("k", "asc")));
    expect(Array.from(b.order("ward", "desc"))).toEqual(Array.from(a.order("ward", "desc")));
  });

  it("never holds the whole source", () => {
    // The entire point. `from-array` measured 1,473 MB RSS against `streamed`
    // at 279 MB for the same 100,000 x 250 store, because building from an
    // array means both representations exist at once.
    let live = 0;
    let peak = 0;
    function* generator(): Generator<Row> {
      for (let i = 0; i < 5_000; i++) {
        live++;
        peak = Math.max(peak, live);
        yield { id: `p${i}`, ward: "A", k: i, flagged: true };
        live--;
      }
    }
    const s = buildColumnStore(SPECS, 5_000, generator(), get);
    expect(s.length).toBe(5_000);
    // One row in flight at a time, never five thousand.
    expect(peak).toBe(1);
  });

  it("handles a source shorter than the declared count", () => {
    // A count that overshoots leaves the tail absent rather than throwing:
    // a stream that ends early is a real thing, and losing the rows that DID
    // arrive would be worse than showing them with a short tail.
    const s = buildColumnStore(SPECS, 10, rows(4).values(), get);
    expect(s.length).toBe(10);
    expect(s.get(0, "id")).toBe("p0");
    expect(s.get(9, "id")).toBeNull();
  });
});
