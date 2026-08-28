import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_CLIENT_ROW_CEILING,
  createClientRowModel,
  createServerRowModel,
  queryFrom,
} from "./row-model.js";
import { initialState } from "./state.js";
import type { GridDataSource, GridPage } from "./query.js";

interface P { readonly id: string; readonly name: string; readonly k: number | null }
const get = (row: P, key: string) => (row as unknown as Record<string, unknown>)[key];
const rowKey = (row: P) => row.id;

const rows: P[] = [
  { id: "1", name: "Okafor", k: 5.1 },
  { id: "2", name: "Müller", k: 3.7 },
  { id: "3", name: "Rahman", k: null },
];

describe("the client row model", () => {
  it("filters, then sorts, and numbers rows absolutely", () => {
    const m = createClientRowModel({ rows, rowKey, get });
    m.setState(initialState({ sort: [{ key: "name", direction: "asc" }] }));
    const r = m.result();
    expect(r.rows.map((x) => x.row.name)).toEqual(["Müller", "Okafor", "Rahman"]);
    expect(r.rows.map((x) => x.index)).toEqual([0, 1, 2]);
    expect(r.total).toBe(3);
  });

  it("does not sort a missing value to the top as though it were urgent", () => {
    const m = createClientRowModel({ rows, rowKey, get });
    m.setState(initialState({ sort: [{ key: "k", direction: "asc" }] }));
    const names = m.result().rows.map((x) => x.row.name);
    expect(names[0]).toBe("Müller"); // 3.7, the real minimum
    expect(names).toContain("Rahman"); // present, not dropped
  });

  it("applies a filter before the sort", () => {
    const m = createClientRowModel({ rows, rowKey, get });
    m.setState(
      initialState({
        filter: { kind: "number", key: "k", op: "notEmpty", value: 0 },
        sort: [{ key: "name", direction: "desc" }],
      }),
    );
    expect(m.result().rows.map((x) => x.row.name)).toEqual(["Okafor", "Müller"]);
  });

  it("refuses above the ceiling, with a reason, rather than sorting for four seconds", () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ id: String(i), name: `p${i}`, k: i }));
    const m = createClientRowModel({ rows: many, rowKey, get, maxRows: 10 });
    m.setState(initialState());
    const r = m.result();
    expect(r.rows).toEqual([]);
    expect(r.errors.map((e) => e.code)).toEqual(["client-mode-refused"]);
    // It still reports how many it refused: the caller needs the number to
    // decide whether to degrade to server mode.
    expect(r.total).toBe(11);
  });

  it("ships a documented DEFAULT, and the deployment overrides it", () => {
    // The number that matters is total retained heap on the target device, and
    // that varies by deployment more than it varies by grid. So this is a
    // default to override, not a measurement we owe anyone.
    expect(DEFAULT_CLIENT_ROW_CEILING).toBe(100_000);
    const m = createClientRowModel({ rows, rowKey, get, maxRows: 2 });
    m.setState(initialState());
    expect(m.result().errors.map((e) => e.code)).toEqual(["client-mode-refused"]);
  });

  it("memoises -- re-reading does not re-run the comparator", () => {
    const compare = vi.fn(() => 0);
    const m = createClientRowModel({ rows, rowKey, get, comparators: { name: compare } });
    m.setState(initialState({ sort: [{ key: "name", direction: "asc" }] }));
    m.result();
    const after = compare.mock.calls.length;
    m.result();
    m.result();
    expect(compare.mock.calls.length).toBe(after);
  });
});

const page = (over: Partial<GridPage<P>> = {}): GridPage<P> => ({
  rows,
  nextCursor: null,
  total: 3,
  appliedSort: [],
  ...over,
});

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("the server row model", () => {
  it("reports a sort the server silently ignored", async () => {
    const source: GridDataSource<P> = {
      getRows: async () => page({ appliedSort: [] }), // asked for name, applied nothing
    };
    const m = createServerRowModel({ dataSource: source, rowKey });
    m.setState(initialState({ sort: [{ key: "name", direction: "asc" }] }));
    await flush();
    expect(m.result().errors.map((e) => e.code)).toContain("sort-not-honoured");
  });

  it("refuses a sort key the source declares it cannot serve, before requesting", async () => {
    const getRows = vi.fn(async () => page({ appliedSort: [{ key: "name", direction: "asc" }] }));
    const source: GridDataSource<P> = {
      getRows,
      capabilities: { total: "none", paging: "cursor", sortableKeys: ["name"] },
    };
    const m = createServerRowModel({ dataSource: source, rowKey });
    m.setState(initialState({ sort: [{ key: "name", direction: "asc" }, { key: "k", direction: "asc" }] }));
    await flush();
    expect(m.result().errors.map((e) => e.code)).toContain("sort-not-honoured");
    expect(getRows.mock.calls[0]?.[0].sort).toEqual([{ key: "name", direction: "asc" }]);
  });

  it("reports a page the server shrank", async () => {
    const source: GridDataSource<P> = { getRows: async () => page({ appliedPageSize: 20 }) };
    const m = createServerRowModel({ dataSource: source, rowKey });
    m.setState(initialState({ pageSize: 50 }));
    await flush();
    expect(m.result().errors.map((e) => e.code)).toContain("page-size-reduced");
  });

  it("carries an unknown total through instead of inventing one", async () => {
    const source: GridDataSource<P> = { getRows: async () => page({ total: "unknown" }) };
    const m = createServerRowModel({ dataSource: source, rowKey });
    m.setState(initialState());
    await flush();
    expect(m.result().total).toBe("unknown");
  });

  it("renders the last answer, not the second-to-last, when queries overlap", async () => {
    // Without cancellation, fast typing renders whichever response lands last.
    let n = 0;
    const source: GridDataSource<P> = {
      getRows: async () => {
        const mine = ++n;
        await new Promise((r) => setTimeout(r, mine === 1 ? 30 : 0));
        return page({ rows: [{ id: `q${mine}`, name: `query ${mine}`, k: 0 }] });
      },
    };
    const m = createServerRowModel({ dataSource: source, rowKey });
    m.setState(initialState({ pageSize: 10 }));
    m.setState(initialState({ pageSize: 20 }));
    await new Promise((r) => setTimeout(r, 60));
    expect(m.result().rows.map((x) => x.row.name)).toEqual(["query 2"]);
  });

  it("appends across a cursor page and keeps indices absolute", async () => {
    let call = 0;
    const source: GridDataSource<P> = {
      getRows: async () =>
        ++call === 1
          ? page({ rows: [rows[0] as P, rows[1] as P], nextCursor: "c2", total: 3 })
          : page({ rows: [rows[2] as P], nextCursor: null, total: 3 }),
    };
    const m = createServerRowModel({ dataSource: source, rowKey });
    m.setState(initialState());
    await flush();
    m.setState(initialState({ cursor: "c2" }));
    await flush();
    const r = m.result();
    expect(r.rows.map((x) => x.id)).toEqual(["1", "2", "3"]);
    expect(r.rows.map((x) => x.index)).toEqual([0, 1, 2]);
  });

  it("reports a throwing source without carrying what it threw", async () => {
    const PHI = "Aurelia Marchetti-Okonkwo 4471-882";
    const source: GridDataSource<P> = {
      getRows: async () => {
        throw new Error(`upstream rejected ${PHI}`);
      },
    };
    const m = createServerRowModel({ dataSource: source, rowKey });
    m.setState(initialState());
    await flush();
    const r = m.result();
    expect(r.errors.map((e) => e.code)).toEqual(["source-threw"]);
    expect(JSON.stringify(r.errors)).not.toContain("Aurelia");
  });

  it("stops after destroy", async () => {
    const source: GridDataSource<P> = { getRows: async () => page() };
    const m = createServerRowModel({ dataSource: source, rowKey });
    m.destroy();
    m.setState(initialState());
    await flush();
    expect(m.result().rows).toEqual([]);
  });
});

describe("queryFrom", () => {
  it("defaults to cursor paging and does not invent an offset", () => {
    // Against FHIR there is no offset to choose (ADR 0005).
    const q = queryFrom(initialState({ cursor: "op4Ka", pageSize: 25 }), []);
    expect(q.cursor).toBe("op4Ka");
    expect(q.offset).toBeNull();
    expect(q.pageSize).toBe(25);
  });
});
