/**
 * Offset paging, and the line between it and cursor paging.
 *
 * `queryFrom` sent `offset: null` unconditionally, with a comment saying the
 * pagination control would arrive in wave 2. So `page/next` existed, the
 * reducer handled it, `arraySource` declared `paging: "offset"` — and the
 * server row model could only ever fetch the first page, because it never sent
 * an offset and a cursor it did not have.
 *
 * The rule these tests exist to hold: an offset goes ONLY to a source that
 * declared it can seek. Sending one to a FHIR endpoint gets it silently
 * ignored, which is the worst outcome available — the grid then renders page 1
 * believing it is page 7, and nothing anywhere says otherwise.
 */
import { describe, expect, it, vi } from "vitest";
import { initialState, reduce, type GridState } from "./state.js";
import { queryFrom, createServerRowModel } from "./row-model.js";
import { arraySource, type GridDataSource, type GridPage, type GridQuery } from "./query.js";
import { applyView, viewFromState } from "./view.js";

interface P { readonly id: string; readonly n: number }

const rows = (n: number): P[] => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, n: i }));
const ctx = { rowIds: [] as string[] };
const apply = (state: GridState, ...actions: Parameters<typeof reduce>[1][]): GridState =>
  actions.reduce((s, a) => reduce(s, a, ctx), state);

const OFFSET = { total: "exact", paging: "offset" } as const;
const CURSOR = { total: "unknown", paging: "forward-only" } as const;

describe("queryFrom decides between an offset and a cursor", () => {
  it("sends an offset only when the source says it can seek", () => {
    const state = apply(initialState({ pageSize: 25 }), { type: "page/goto", page: 3 });
    expect(queryFrom(state, [], OFFSET).offset).toBe(75);
    expect(queryFrom(state, [], CURSOR).offset).toBeNull();
  });

  it("treats an unknown source as cursor-only, which is the safe reading", () => {
    const state = apply(initialState({ pageSize: 10 }), { type: "page/goto", page: 5 });
    expect(queryFrom(state, []).offset).toBeNull();
  });

  it("never sends both, because they are alternatives", () => {
    const withCursor = apply(initialState(), { type: "page/next", cursor: "abc" });
    for (const caps of [OFFSET, CURSOR, undefined]) {
      const q = queryFrom(withCursor, [], caps);
      expect(q.offset === null || q.cursor === null).toBe(true);
    }
  });

  it("sends no cursor to a seekable source, even if one is somehow in state", () => {
    // A cursor is meaningful only against the query that produced it. Handing
    // one to an offset source alongside an offset invites the server to honour
    // whichever it prefers.
    const odd: GridState = { ...initialState({ pageSize: 20 }), cursor: "stale", page: 2 };
    const q = queryFrom(odd, [], OFFSET);
    expect(q.cursor).toBeNull();
    expect(q.offset).toBe(40);
  });

  it("computes the offset from the page size in force", () => {
    for (const [pageSize, page, offset] of [[10, 0, 0], [10, 1, 10], [25, 4, 100], [100, 9, 900]] as const) {
      const state = apply(initialState({ pageSize }), { type: "page/goto", page });
      expect(queryFrom(state, [], OFFSET).offset).toBe(offset);
    }
  });
});

describe("the reducer keeps the position honest", () => {
  it("clamps a page below the start rather than throwing", () => {
    // A pagination control that has drifted one below zero is not an error
    // worth taking a grid down for.
    expect(apply(initialState(), { type: "page/goto", page: -3 }).page).toBe(0);
    expect(apply(initialState(), { type: "page/goto", page: 2.7 }).page).toBe(2);
  });

  it("clears the cursor when it goes to a page, and the page when it takes a cursor", () => {
    const paged = apply(initialState(), { type: "page/next", cursor: "abc" }, { type: "page/goto", page: 4 });
    expect(paged).toMatchObject({ page: 4, cursor: null });
    const cursored = apply(paged, { type: "page/next", cursor: "def" });
    expect(cursored).toMatchObject({ page: 0, cursor: "def" });
  });

  it("resets the position when the QUERY changes, because page 7 of a different filter is not page 7", () => {
    const at7 = apply(initialState(), { type: "page/goto", page: 7 });
    expect(at7.page).toBe(7);

    for (const action of [
      { type: "sort/toggle", key: "name", additive: false },
      { type: "sort/set", sort: [{ key: "n", direction: "asc" }] },
      { type: "filter/set", node: null },
      { type: "page/size", size: 100 },
    ] as Parameters<typeof reduce>[1][]) {
      const after = apply(at7, action);
      expect(after.page, `${action.type} left the grid on page ${after.page}`).toBe(0);
      expect(after.cursor).toBeNull();
    }
  });

  it("leaves the position alone for everything that does not change the query", () => {
    const at3 = apply(initialState(), { type: "page/goto", page: 3 });
    for (const action of [
      { type: "select/toggle", id: "p1" },
      { type: "select/clear" },
      { type: "focus/cell", rowId: "p1", columnKey: "n" },
      { type: "column/resize", key: "n", width: 200 },
      { type: "column/visibility", key: "n", visible: false },
    ] as Parameters<typeof reduce>[1][]) {
      expect(apply(at3, action).page, action.type).toBe(3);
    }
  });

  it("starts on page 0", () => {
    expect(initialState().page).toBe(0);
  });
});

describe("the server row model actually pages now", () => {
  const settle = () => new Promise((r) => setTimeout(r, 0));

  it("walks a seekable source page by page", async () => {
    const all = rows(97);
    const asked: (number | null)[] = [];
    const source: GridDataSource<P> = {
      capabilities: OFFSET,
      async getRows(query: GridQuery): Promise<GridPage<P>> {
        asked.push(query.offset);
        const start = query.offset ?? 0;
        return {
          rows: all.slice(start, start + query.pageSize),
          nextCursor: null,
          total: all.length,
          appliedSort: query.sort,
        };
      },
    };

    const model = createServerRowModel<P>({ dataSource: source, rowKey: (r) => r.id });
    let state = initialState({ pageSize: 25 });
    const seen: string[] = [];

    for (let page = 0; page < 4; page++) {
      state = apply(state, { type: "page/goto", page });
      model.setState(state);
      await settle();
      seen.push(model.result().rows[0]?.id ?? "(none)");
    }
    model.destroy();

    expect(asked).toEqual([0, 25, 50, 75]);
    // Each page starts where the last one ended — the thing that was broken.
    expect(seen).toEqual(["p0", "p25", "p50", "p75"]);
  });

  it("serves a short last page without inventing rows", async () => {
    const all = rows(97);
    const model = createServerRowModel<P>({ dataSource: arraySource(all), rowKey: (r) => r.id });
    const state = apply(initialState({ pageSize: 25 }), { type: "page/goto", page: 3 });
    model.setState(state);
    await settle();
    expect(model.result().rows).toHaveLength(97 - 75);
    expect(model.result().total).toBe(97);
    model.destroy();
  });

  it("returns nothing, and does not throw, past the end", async () => {
    const model = createServerRowModel<P>({ dataSource: arraySource(rows(30)), rowKey: (r) => r.id });
    model.setState(apply(initialState({ pageSize: 25 }), { type: "page/goto", page: 99 }));
    await settle();
    expect(model.result().rows).toEqual([]);
    expect(model.result().total).toBe(30);
    model.destroy();
  });

  it("never sends an offset to a cursor source, however the state got set", async () => {
    const asked: GridQuery[] = [];
    const source: GridDataSource<P> = {
      capabilities: CURSOR,
      async getRows(query: GridQuery): Promise<GridPage<P>> {
        asked.push(query);
        return { rows: rows(10), nextCursor: "next", total: "unknown", appliedSort: query.sort };
      },
    };
    const model = createServerRowModel<P>({ dataSource: source, rowKey: (r) => r.id });
    model.setState(apply(initialState({ pageSize: 10 }), { type: "page/goto", page: 6 }));
    await settle();
    model.destroy();

    expect(asked).toHaveLength(1);
    expect(asked[0]?.offset).toBeNull();
  });

  it("cancels the previous page when a new one is asked for", async () => {
    // Without cancellation, paging quickly renders the second-to-last answer.
    const aborted: boolean[] = [];
    const source: GridDataSource<P> = {
      capabilities: OFFSET,
      async getRows(query: GridQuery, signal?: AbortSignal): Promise<GridPage<P>> {
        await new Promise((r) => setTimeout(r, 5));
        aborted.push(signal?.aborted === true);
        return {
          rows: rows(5).map((r) => ({ ...r, id: `${query.offset}-${r.id}` })),
          nextCursor: null,
          total: 100,
          appliedSort: query.sort,
        };
      },
    };
    const model = createServerRowModel<P>({ dataSource: source, rowKey: (r) => r.id });
    let state = initialState({ pageSize: 10 });
    for (const page of [1, 2, 3]) {
      state = apply(state, { type: "page/goto", page });
      model.setState(state);
    }
    await new Promise((r) => setTimeout(r, 40));
    // The last page asked for is the one on screen.
    expect(model.result().rows[0]?.id).toBe("30-p0");
    model.destroy();
    expect(aborted.some(Boolean)).toBe(true);
  });

  it("reports a page size the server reduced rather than pretending it got one", async () => {
    const onCap: GridDataSource<P> = {
      capabilities: { ...OFFSET, maxPageSize: 10 },
      async getRows(query: GridQuery): Promise<GridPage<P>> {
        const size = Math.min(query.pageSize, 10);
        return {
          rows: rows(size),
          nextCursor: null,
          total: 100,
          appliedSort: query.sort,
          appliedPageSize: size,
        };
      },
    };
    const model = createServerRowModel<P>({ dataSource: onCap, rowKey: (r) => r.id });
    model.setState(initialState({ pageSize: 50 }));
    await settle();
    expect(model.result().errors.map((e) => e.code)).toContain("page-size-reduced");
    model.destroy();
  });
});

describe("a pagination control can be built from this", () => {
  /**
   * The shape a control needs: how many pages, which one is current, and
   * whether the arrows are live. All of it derives from state plus the total,
   * with no new API.
   */
  const pagesFor = (total: number | "unknown", pageSize: number): number | "unknown" =>
    total === "unknown" ? "unknown" : Math.max(1, Math.ceil(total / pageSize));

  it("counts pages from an exact total", () => {
    expect(pagesFor(97, 25)).toBe(4);
    expect(pagesFor(100, 25)).toBe(4);
    expect(pagesFor(0, 25)).toBe(1);
  });

  it("cannot count pages against an unknown total, and says so", () => {
    // This is why a FHIR grid gets "next" and not "page 7 of 12": the server
    // never said how many there are.
    expect(pagesFor("unknown", 25)).toBe("unknown");
  });

  it("round-trips a page through the reducer", () => {
    let state = initialState({ pageSize: 20 });
    for (const page of [0, 1, 2, 5, 0]) {
      state = apply(state, { type: "page/goto", page });
      expect(queryFrom(state, [], OFFSET).offset).toBe(page * 20);
    }
  });
});

describe("the view layer resets the position too", () => {
  it("applyView puts the grid back on page 0", () => {
    const at7 = apply(initialState({ pageSize: 25 }), { type: "page/goto", page: 7 });
    const applied = applyView(
      { version: 1, id: "v", label: "V", scope: "personal", sort: [{ key: "n", direction: "asc" }] },
      at7,
    );
    expect(applied.page).toBe(0);
    expect(applied.cursor).toBeNull();
  });

  it("viewFromState does not carry a page into a saved view", () => {
    // A view is a shape, not a scroll position. Saving "page 7" into a view
    // that other people load drops them somewhere arbitrary in their own data.
    const at7 = apply(initialState({ pageSize: 25 }), { type: "page/goto", page: 7 });
    const view = viewFromState(at7, { id: "v", label: "V", scope: "personal" }, ["n"]);
    expect(JSON.stringify(view)).not.toContain('"page"');
  });
});

describe("the devtools and view layers keep working", () => {
  it("survives a state that predates the page field", () => {
    // A view saved before `page` existed deserialises without it. The reducer
    // must not produce `NaN` offsets from `undefined * pageSize`.
    const old = { ...initialState({ pageSize: 25 }) } as Record<string, unknown>;
    delete old["page"];
    const q = queryFrom(old as unknown as GridState, [], OFFSET);
    expect(Number.isFinite(q.offset)).toBe(true);
    expect(q.offset).toBe(0);
  });
});

vi.restoreAllMocks();
