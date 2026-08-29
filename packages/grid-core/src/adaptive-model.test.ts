/**
 * Choosing a row model.
 *
 * The value here is not the choice, it is that the choice is EXPLAINED. A grid
 * that silently paged, or silently refused, or silently held a gigabyte, would
 * be doing the right thing for reasons nobody could reconstruct from a bug
 * report. Every test below checks the reason as well as the strategy.
 */
import { describe, expect, it } from "vitest";
import { createAdaptiveRowModel } from "./adaptive-model.js";
import { initialState } from "./state.js";
import type { GridDataSource } from "./query.js";
import type { StoredColumn } from "./column-store.js";

interface Row { readonly id: string; readonly ward: string; readonly k: number | null }

const get = (row: Row, key: string): unknown => (row as unknown as Record<string, unknown>)[key];
const rowKey = (row: Row): string => row.id;
const COLUMNS: StoredColumn[] = [
  { key: "ward", type: "string" },
  { key: "k", type: "number" },
];

const rows = (n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i}`, ward: ["A", "B", "C", "D"][i % 4] as string, k: i % 7 === 0 ? null : i % 400,
  }));

const source: GridDataSource<Row> = {
  capabilities: { total: "exact", paging: "offset" },
  async getRows(query) {
    return {
      rows: Array.from({ length: query.pageSize }, (_, i) => ({
        id: `s${i}`, ward: "A", k: i,
      })),
      nextCursor: null, total: 5_000_000, appliedSort: query.sort,
    };
  },
};

describe("choosing", () => {
  it("stays in client mode for a small set", () => {
    const m = createAdaptiveRowModel({ rows: rows(1_000), rowKey, get });
    expect(m.choice.strategy).toBe("client");
    expect(m.choice.because).toContain("fits comfortably");
    expect(m.store).toBeNull();
  });

  it("escalates to columnar when the set is large AND types were supplied", () => {
    const m = createAdaptiveRowModel({
      rows: rows(60_000), rowKey, get, columns: COLUMNS, columnarAbove: 50_000,
    });
    expect(m.choice.strategy).toBe("columnar");
    expect(m.choice.storeBytes).toBeGreaterThan(0);
    expect(m.store).not.toBeNull();
  });

  it("does NOT escalate to columnar without column types, and says why", () => {
    // Inferring types from the first row is how a column of mostly-numbers
    // containing one "N/A" becomes silently unsortable.
    const m = createAdaptiveRowModel({ rows: rows(60_000), rowKey, get, columnarAbove: 50_000 });
    expect(m.choice.strategy).toBe("client");
    expect(m.choice.because).toContain("no column types were supplied");
  });

  it("takes the block model when a data source is supplied", () => {
    const m = createAdaptiveRowModel({ dataSource: source, rowKey, get });
    expect(m.choice.strategy).toBe("block");
    expect(m.choice.because).toContain("paged");
  });

  it("prefers a data source over any local rows", () => {
    // A source is the only strategy with no ceiling, and supplying one is the
    // application saying it accepts paging.
    const m = createAdaptiveRowModel({ rows: rows(10), dataSource: source, rowKey, get });
    expect(m.choice.strategy).toBe("block");
  });
});

describe("the refusal is not routed around", () => {
  it("still refuses above the ceiling when nothing else was enabled", () => {
    const m = createAdaptiveRowModel({ rows: rows(500), rowKey, get, maxRows: 100 });
    m.setState(initialState());
    expect(m.choice.strategy).toBe("client");
    // Escalating to a strategy the caller did not enable would be deciding for
    // them, and paging changes semantics rather than only performance.
    expect(m.result().errors[0]?.code).toBe("client-mode-refused");
    expect(m.choice.because).toContain("will refuse");
  });

  it("lifts the ceiling when it DID escalate, because the store carries the set", () => {
    const m = createAdaptiveRowModel({
      rows: rows(60_000), rowKey, get, columns: COLUMNS,
      columnarAbove: 50_000, maxRows: 10_000,
    });
    m.setState(initialState());
    expect(m.result().errors).toHaveLength(0);
    expect(m.result().length).toBe(60_000);
  });
});

describe("the model it returns is a real model", () => {
  it("sorts and filters like the one underneath", () => {
    const m = createAdaptiveRowModel({ rows: rows(200), rowKey, get });
    m.setState({ ...initialState(), sort: [{ key: "ward", direction: "asc" }] });
    const wards = m.result().rows.map((r) => r.row.ward);
    expect(wards).toEqual([...wards].sort());
  });

  it("supports windowed reads", () => {
    const m = createAdaptiveRowModel({ rows: rows(5_000), rowKey, get });
    m.setState(initialState());
    expect(m.result().rowsIn(10, 20)).toHaveLength(10);
  });

  it("is destroyable", () => {
    const m = createAdaptiveRowModel({ rows: rows(10), rowKey, get });
    expect(() => m.destroy()).not.toThrow();
  });

  it("reports a byte count a caller can act on", () => {
    const m = createAdaptiveRowModel({
      rows: rows(60_000), rowKey, get, columns: COLUMNS, columnarAbove: 50_000,
    });
    // 60,000 rows x (8 bytes numeric + 4 ordinal) plus bitmaps and a
    // four-entry dictionary. Under a megabyte, against roughly 6 MB of objects.
    expect(m.choice.storeBytes).toBeLessThan(2_000_000);
  });
});
