/**
 * The block row model.
 *
 * Three properties: memory stays constant however large the set, an
 * unavailable row says so rather than rendering blank, and a source that
 * cannot random-access says WHICH row it could not reach instead of pretending.
 */
import { describe, expect, it, vi } from "vitest";
import { createBlockRowModel, isLoadingRow } from "./block-model.js";
import { initialState } from "./state.js";
import type { GridDataSource, GridPage, SourceCapabilities } from "./query.js";

interface Row { readonly id: string; readonly n: number }

const TOTAL = 1_000_000;

function source(
  capabilities: SourceCapabilities,
  onQuery?: (offset: number | null, cursor: string | null) => void,
): GridDataSource<Row> & { calls: number } {
  const s = {
    calls: 0,
    capabilities,
    async getRows(query): Promise<GridPage<Row>> {
      s.calls++;
      onQuery?.(query.offset, query.cursor);
      const start = query.offset ?? (query.cursor ? Number(query.cursor) : 0);
      const rows = Array.from({ length: query.pageSize }, (_, i) => ({
        id: `r${start + i}`, n: start + i,
      }));
      return {
        rows,
        nextCursor: String(start + query.pageSize),
        total: TOTAL,
        appliedSort: query.sort,
      };
    },
  } as GridDataSource<Row> & { calls: number };
  return s;
}

const settle = () => new Promise((r) => setTimeout(r, 0));

const OFFSET: SourceCapabilities = { total: "exact", paging: "offset" };
const CURSOR: SourceCapabilities = { total: "exact", paging: "cursor" };

describe("windowed loading", () => {
  it("fetches only the blocks the viewport asked for", async () => {
    const s = source(OFFSET);
    const model = createBlockRowModel({ dataSource: s, rowKey: (r) => r.id, blockSize: 100 });
    model.setState(initialState());
    model.setRange(0, 50);
    await settle();

    // One block for fifty rows out of a million.
    expect(s.calls).toBe(1);
    expect(model.result().rows).toHaveLength(50);
    expect(model.result().rows[0]?.row.id).toBe("r0");
  });

  it("reports the source's total, not what it holds", async () => {
    const s = source(OFFSET);
    const model = createBlockRowModel({ dataSource: s, rowKey: (r) => r.id });
    model.setState(initialState());
    model.setRange(0, 20);
    await settle();
    expect(model.result().total).toBe(TOTAL);
  });

  it("jumps straight to a distant block when the source has offsets", async () => {
    const seen: (number | null)[] = [];
    const s = source(OFFSET, (offset) => seen.push(offset));
    const model = createBlockRowModel({ dataSource: s, rowKey: (r) => r.id, blockSize: 100 });
    model.setState(initialState());
    model.setRange(500_000, 500_020);
    await settle();

    // One request, not five thousand.
    expect(s.calls).toBe(1);
    expect(seen).toEqual([500_000]);
    expect(model.result().rows[0]?.row.n).toBe(500_000);
  });

  it("spans blocks when the window straddles a boundary", async () => {
    const s = source(OFFSET);
    const model = createBlockRowModel({ dataSource: s, rowKey: (r) => r.id, blockSize: 100 });
    model.setState(initialState());
    model.setRange(90, 210);
    await settle();
    expect(s.calls).toBe(3);
    expect(model.result().rows.every((r) => !isLoadingRow(r.row))).toBe(true);
  });
});

describe("memory stays constant", () => {
  it("evicts the least recently used blocks", async () => {
    const s = source(OFFSET);
    const model = createBlockRowModel({
      dataSource: s, rowKey: (r) => r.id, blockSize: 100, maxBlocks: 5,
    });
    model.setState(initialState());
    for (let i = 0; i < 40; i++) {
      model.setRange(i * 100, i * 100 + 50);
      await settle();
    }
    // Forty windows walked across a million rows; five blocks resident.
    expect(model.resident).toBeLessThanOrEqual(5);
  });

  it("never evicts a block the viewport is looking at", async () => {
    const s = source(OFFSET);
    const model = createBlockRowModel({
      dataSource: s, rowKey: (r) => r.id, blockSize: 10, maxBlocks: 2,
    });
    model.setState(initialState());
    // A window spanning four blocks with a cap of two: the cap must lose.
    model.setRange(0, 40);
    await settle();
    expect(model.result().rows.every((r) => !isLoadingRow(r.row))).toBe(true);
  });
});

describe("a row that has not arrived", () => {
  it("announces itself rather than rendering blank", async () => {
    const s = source(OFFSET);
    const model = createBlockRowModel({ dataSource: s, rowKey: (r) => r.id, blockSize: 100 });
    model.setState(initialState());
    model.setRange(0, 20);

    // Before the fetch settles: placeholders, and they SAY they are loading.
    // An empty row reads as a row with no data, which is a different and much
    // worse claim in a clinical list.
    const before = model.result().rows;
    expect(before.length).toBeGreaterThan(0);
    expect(before.every((r) => isLoadingRow(r.row))).toBe(true);
    expect(model.result().loading).toBe(true);

    await settle();
    expect(model.result().rows.every((r) => !isLoadingRow(r.row))).toBe(true);
    expect(model.result().loading).toBe(false);
  });

  it("gives placeholders distinct ids, so recycling cannot confuse them", async () => {
    const s = source(OFFSET);
    const model = createBlockRowModel({ dataSource: s, rowKey: (r) => r.id, blockSize: 100 });
    model.setState(initialState());
    model.setRange(0, 20);
    const ids = model.result().rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("cursor sources, and what they cannot do", () => {
  it("walks forward one block at a time", async () => {
    const s = source(CURSOR);
    const model = createBlockRowModel({ dataSource: s, rowKey: (r) => r.id, blockSize: 100 });
    model.setState(initialState());
    model.setRange(0, 50);
    await settle();
    model.setRange(100, 150);
    await settle();
    expect(model.result().rows[0]?.row.n).toBe(100);
  });

  it("refuses a jump it cannot reach, and says which row", async () => {
    const s = source(CURSOR);
    const model = createBlockRowModel({ dataSource: s, rowKey: (r) => r.id, blockSize: 100 });
    model.setState(initialState());
    model.setRange(500_000, 500_020);
    await settle();

    // NOT five thousand requests, and NOT silently showing somewhere else.
    expect(s.calls).toBe(0);
    const error = model.result().errors[0];
    expect(error?.code).toBe("cursor-jump-unsupported");
    expect(error?.rowIndex).toBe(500_000);
  });

  it("carries no row data in the refusal", async () => {
    const s = source(CURSOR);
    const model = createBlockRowModel({ dataSource: s, rowKey: (r) => r.id, blockSize: 100 });
    model.setState(initialState());
    model.setRange(500_000, 500_020);
    await settle();
    // Coordinates only: an error is a thing that gets logged.
    expect(JSON.stringify(model.result().errors)).not.toContain("r500");
  });
});

describe("state changes", () => {
  it("drops every block when the sort changes", async () => {
    const s = source(OFFSET);
    const model = createBlockRowModel({ dataSource: s, rowKey: (r) => r.id, blockSize: 100 });
    model.setState(initialState());
    model.setRange(0, 50);
    await settle();
    expect(model.resident).toBe(1);

    // Blocks describe a query. Keeping them would show yesterday's ordering
    // under today's header.
    model.setState({ ...initialState(), sort: [{ key: "n", direction: "desc" }] });
    expect(model.resident).toBe(0);
  });

  it("negotiates block size down to the source's cap", async () => {
    const seen: number[] = [];
    const capped: GridDataSource<Row> = {
      capabilities: { total: "exact", paging: "offset", maxPageSize: 25 },
      async getRows(query) {
        seen.push(query.pageSize);
        return { rows: [], nextCursor: null, total: 0, appliedSort: [] };
      },
    };
    const model = createBlockRowModel({ dataSource: capped, rowKey: (r) => r.id, blockSize: 500 });
    model.setState(initialState());
    model.setRange(0, 10);
    await settle();
    // `_count` is commonly capped; asking for 500 gets you 25 with no error.
    expect(seen[0]).toBe(25);
  });

  it("reports a sort the source did not honour", async () => {
    const ignoring: GridDataSource<Row> = {
      capabilities: OFFSET,
      async getRows() {
        // The server silently ignored `_sort`, which is a real FHIR behaviour.
        return { rows: [{ id: "a", n: 1 }], nextCursor: null, total: 1, appliedSort: [] };
      },
    };
    const model = createBlockRowModel({ dataSource: ignoring, rowKey: (r) => r.id });
    model.setState({ ...initialState(), sort: [{ key: "n", direction: "asc" }] });
    model.setRange(0, 1);
    await settle();
    expect(model.result().errors.some((e) => e.code === "sort-not-honoured")).toBe(true);
  });

  it("aborts in-flight requests on destroy", async () => {
    const aborted = vi.fn();
    const slow: GridDataSource<Row> = {
      capabilities: OFFSET,
      getRows(_q, signal) {
        signal.addEventListener("abort", aborted);
        return new Promise(() => {});
      },
    };
    const model = createBlockRowModel({ dataSource: slow, rowKey: (r) => r.id });
    model.setState(initialState());
    model.setRange(0, 10);
    model.destroy();
    expect(aborted).toHaveBeenCalled();
  });

  it("surfaces a source failure without leaking what it was fetching", async () => {
    const failing: GridDataSource<Row> = {
      capabilities: OFFSET,
      async getRows() { throw new Error("connection to patients-db failed"); },
    };
    const model = createBlockRowModel({ dataSource: failing, rowKey: (r) => r.id });
    model.setState(initialState());
    model.setRange(0, 10);
    await settle();
    const errors = model.result().errors;
    expect(errors.some((e) => e.code === "source-threw")).toBe(true);
    expect(JSON.stringify(errors)).not.toContain("patients-db");
  });
});
