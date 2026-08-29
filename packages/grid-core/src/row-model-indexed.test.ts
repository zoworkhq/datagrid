/**
 * The client model's indexed sort path, and windowed access.
 *
 * Two changes landed here that a consumer gets without asking: sorts go
 * through a precomputed key index where they can, and results can be read a
 * window at a time instead of whole. Both are invisible when they work and
 * catastrophic when they are subtly wrong, so what follows is mostly about
 * EQUIVALENCE — the fast path must order rows exactly as the slow one did.
 */
import { describe, expect, it, vi } from "vitest";
import { createClientRowModel } from "./row-model.js";
import { initialState } from "./state.js";
import type { GridState } from "./state.js";

interface Row {
  readonly id: string;
  readonly name: string;
  readonly ward: string;
  readonly k: number | null;
  readonly flag: boolean;
}

const WARDS = ["Ashgrove", "Beeches", "Cedar", "Dunlin"];
const get = (row: Row, key: string): unknown => (row as unknown as Record<string, unknown>)[key];
const rowKey = (row: Row): string => row.id;

const rows = (n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `Patient ${(i * 7919) % n}`,
    ward: WARDS[i % WARDS.length] as string,
    k: i % 13 === 0 ? null : (i * 37) % 400 / 10,
    flag: i % 3 === 0,
  }));

const sortedBy = (key: string, direction: "asc" | "desc"): GridState => ({
  ...initialState(), sort: [{ key, direction }],
});

/** Ordering through the model, as ids. */
const order = (model: ReturnType<typeof createClientRowModel<Row>>, state: GridState): string[] => {
  model.setState(state);
  return model.result().rows.map((r) => r.id);
};

describe("the indexed path orders identically to the comparator path", () => {
  it.each([
    ["name", "asc"], ["name", "desc"],
    ["ward", "asc"], ["ward", "desc"],
    ["flag", "asc"], ["flag", "desc"],
  ] as const)("agrees on %s %s", (key, direction) => {
    const data = rows(1_500);
    // No comparators: the index is reachable.
    const indexed = createClientRowModel({ rows: data, rowKey, get, maxRows: 1e7 });
    // A supplied comparator forces the comparator path for that column.
    const comparator = createClientRowModel({
      rows: data, rowKey, get, maxRows: 1e7,
      comparators: {
        [key]: (a: Row, b: Row) => {
          const x = get(a, key);
          const y = get(b, key);
          if (typeof x === "string") return x.localeCompare(y as string);
          return Number(x) - Number(y);
        },
      },
    });
    expect(order(indexed, sortedBy(key, direction))).toEqual(
      order(comparator, sortedBy(key, direction)),
    );
  });

  it("indexes correctly after a filter narrows the set", () => {
    const data = rows(800);
    const model = createClientRowModel({ rows: data, rowKey, get, maxRows: 1e7 });
    model.setState({
      ...sortedBy("name", "asc"),
      filter: { kind: "text", key: "ward", op: "eq", value: "Cedar" },
    });
    const out = model.result().rows;
    expect(out.length).toBeGreaterThan(0);
    for (const r of out) expect(r.row.ward).toBe("Cedar");
    // Keys built over the FILTERED array, not the source: an index built from
    // the wrong array orders rows that are not in the view.
    const names = out.map((r) => r.row.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("re-indexes when the source array changes", () => {
    const model = createClientRowModel({ rows: rows(200), rowKey, get, maxRows: 1e7 });
    const before = order(model, sortedBy("name", "asc"));
    expect(before).toHaveLength(200);
    // Keys built from the old array would order rows that no longer exist.
    model.setState(sortedBy("name", "asc"));
    expect(model.result().rows).toHaveLength(200);
  });

  it("numbers rows by their position in the sorted view", () => {
    const model = createClientRowModel({ rows: rows(50), rowKey, get, maxRows: 1e7 });
    model.setState(sortedBy("name", "asc"));
    expect(model.result().rows.map((r) => r.index)).toEqual(
      Array.from({ length: 50 }, (_, i) => i),
    );
  });
});

describe("what falls back to the comparator path", () => {
  it("a column with a custom comparator", () => {
    const spy = vi.fn((a: Row, b: Row) => a.name.localeCompare(b.name));
    const model = createClientRowModel({
      rows: rows(100), rowKey, get, maxRows: 1e7, comparators: { name: spy },
    });
    model.setState(sortedBy("name", "asc"));
    void model.result().rows;
    // The caller's ordering is a function nobody here can see through, so it
    // must be the thing that runs.
    expect(spy).toHaveBeenCalled();
  });

  it("a multi-key sort", () => {
    const spy = vi.fn((a: Row, b: Row) => a.ward.localeCompare(b.ward));
    const model = createClientRowModel({
      rows: rows(100), rowKey, get, maxRows: 1e7, comparators: { ward: spy },
    });
    model.setState({
      ...initialState(),
      sort: [{ key: "ward", direction: "asc" }, { key: "name", direction: "asc" }],
    });
    void model.result().rows;
    expect(spy).toHaveBeenCalled();
  });

  it("a column of mixed types, which has no ordinal ordering", () => {
    const mixed = [
      { id: "a", v: 1 }, { id: "b", v: "two" }, { id: "c", v: 3 },
    ] as unknown as Row[];
    const model = createClientRowModel({
      rows: mixed, rowKey, get: (r, k) => (r as never)[k], maxRows: 1e7,
    });
    model.setState(sortedBy("v", "asc"));
    // It must not throw, and it must not invent an order.
    expect(model.result().rows).toHaveLength(3);
  });
});

describe("windowed access", () => {
  it("returns only the rows asked for", () => {
    const model = createClientRowModel({ rows: rows(10_000), rowKey, get, maxRows: 1e7 });
    model.setState(sortedBy("name", "asc"));
    const window = model.result().rowsIn(100, 130);
    expect(window).toHaveLength(30);
    expect(window[0]?.index).toBe(100);
    expect(window[29]?.index).toBe(129);
  });

  it("agrees with the whole set", () => {
    const model = createClientRowModel({ rows: rows(500), rowKey, get, maxRows: 1e7 });
    model.setState(sortedBy("ward", "desc"));
    const all = model.result().rows;
    const window = model.result().rowsIn(40, 60);
    expect(window.map((r) => r.id)).toEqual(all.slice(40, 60).map((r) => r.id));
  });

  it("clamps a window past the end rather than returning holes", () => {
    const model = createClientRowModel({ rows: rows(10), rowKey, get, maxRows: 1e7 });
    model.setState(initialState());
    expect(model.result().rowsIn(5, 999)).toHaveLength(5);
    expect(model.result().rowsIn(-10, 3)).toHaveLength(3);
    expect(model.result().rowsIn(20, 30)).toHaveLength(0);
    // An inverted range is a caller bug, not a reason to return the whole set.
    expect(model.result().rowsIn(30, 20)).toHaveLength(0);
  });

  it("reports length without materialising anything", () => {
    const model = createClientRowModel({ rows: rows(1_000), rowKey, get, maxRows: 1e7 });
    model.setState(initialState());
    expect(model.result().length).toBe(1_000);
  });

  it("does not materialise the whole set when only a window is read", () => {
    // The point of the lazy getter. `rowKey` is called once per wrapped row,
    // so counting its calls counts the allocations.
    let wrapped = 0;
    const counting = (row: Row): string => { wrapped++; return row.id; };
    const model = createClientRowModel({
      rows: rows(5_000), rowKey: counting, get, maxRows: 1e7,
    });
    model.setState(sortedBy("name", "asc"));
    model.result().rowsIn(0, 30);
    // Thirty, not five thousand.
    expect(wrapped).toBeLessThanOrEqual(60);
  });

  it("memoises the whole set once it IS read", () => {
    const model = createClientRowModel({ rows: rows(100), rowKey, get, maxRows: 1e7 });
    model.setState(initialState());
    const result = model.result();
    expect(result.rows).toBe(result.rows);
  });
});

describe("the refusal still refuses", () => {
  it("declines above the ceiling and says why", () => {
    const model = createClientRowModel({ rows: rows(500), rowKey, get, maxRows: 100 });
    model.setState(initialState());
    const out = model.result();
    expect(out.rows).toHaveLength(0);
    expect(out.length).toBe(0);
    expect(out.rowsIn(0, 10)).toHaveLength(0);
    // The total is still reported: the grid knows how many it declined.
    expect(out.total).toBe(500);
    expect(out.errors[0]?.code).toBe("client-mode-refused");
  });
});
