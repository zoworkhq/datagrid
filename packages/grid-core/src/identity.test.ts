/**
 * Duplicate identities are found and reported, everywhere rows come in.
 *
 * Row identity is the axis everything else is addressed on: transactions patch
 * by id, selection holds ids, the renderer keeps a `Map<string, HTMLElement>`,
 * and row-level disclosure resolves by id. A duplicate does not fail loudly in
 * any of them — it silently redirects every one at whichever row registered
 * last, which is "an action aimed at one patient reached another".
 *
 * The case this is really for: merging two sources whose ids are unique per
 * source and not globally. Two patients with `id: "1042"` from two hospitals.
 */
import { describe, expect, it } from "vitest";
import { findDuplicateIds, duplicateIdError } from "./identity.js";
import { createClientRowModel, createServerRowModel } from "./row-model.js";
import { createBlockRowModel } from "./block-model.js";
import { arraySource, type GridDataSource, type GridPage, type GridQuery } from "./query.js";
import { initialState } from "./state.js";

interface P { readonly id: string; readonly name: string }

const rows = (...ids: string[]): P[] => ids.map((id, i) => ({ id, name: `Patient ${i}` }));
const settle = () => new Promise((r) => setTimeout(r, 0));
const codes = (errors: readonly { code: string }[]) => errors.map((e) => e.code);

describe("findDuplicateIds", () => {
  it("says nothing when every id is distinct", () => {
    expect(findDuplicateIds(rows("a", "b", "c"), (r) => r.id)).toBeNull();
  });

  it("reports the position of the first repeat, and how many repeated", () => {
    expect(findDuplicateIds(rows("a", "b", "a", "c", "b"), (r) => r.id)).toEqual({ firstAt: 2, count: 2 });
  });

  it("counts every repeat of the same id, not the distinct ids", () => {
    expect(findDuplicateIds(rows("a", "a", "a"), (r) => r.id)).toEqual({ firstAt: 1, count: 2 });
  });

  it("handles an empty set and a single row", () => {
    expect(findDuplicateIds([], (r: P) => r.id)).toBeNull();
    expect(findDuplicateIds(rows("a"), (r) => r.id)).toBeNull();
  });

  it("uses the KEY, so two identical rows with different keys are fine", () => {
    const same = [{ id: "a", name: "x" }, { id: "b", name: "x" }];
    expect(findDuplicateIds(same, (r) => r.id)).toBeNull();
  });
});

describe("the error it produces", () => {
  it("carries a position and never the id, because a row key is often an MRN", () => {
    const e = duplicateIdError({ firstAt: 7, count: 2 });
    expect(e.code).toBe("duplicate-row-id");
    expect(e.rowIndex).toBe(7);
    expect(Object.keys(e).sort()).toEqual(["code", "columnKey", "phase", "query", "rowIndex"]);
    expect(JSON.stringify(e)).not.toContain("MRN");
  });

  it("is JSON-safe and free of anything from the row", () => {
    const serialised = JSON.stringify(duplicateIdError({ firstAt: 0, count: 9 }));
    expect(serialised).not.toMatch(/name|Patient|Okafor/);
  });
});

describe("the client model", () => {
  const model = (ids: string[]) => {
    const m = createClientRowModel({
      rows: rows(...ids), rowKey: (r) => r.id, get: (r, k) => (r as never)[k], maxRows: 100,
    });
    m.setState(initialState());
    return m;
  };

  it("reports a duplicate", () => {
    expect(codes(model(["same", "same"]).result().errors)).toContain("duplicate-row-id");
  });

  it("reports nothing when ids are unique", () => {
    expect(model(["a", "b", "c"]).result().errors).toEqual([]);
  });

  it("still serves the rows, because rendering nothing is the worse failure", () => {
    const m = model(["same", "same", "other"]);
    expect(m.result().rows).toHaveLength(3);
    expect(m.result().total).toBe(3);
  });

  it("names the position of the first collision", () => {
    const e = model(["a", "b", "b"]).result().errors.find((x) => x.code === "duplicate-row-id");
    expect(e?.rowIndex).toBe(2);
  });
});

describe("the block model", () => {
  it("reports a duplicate the source handed over", async () => {
    const source = arraySource(rows("a", "same", "same", "d"));
    const m = createBlockRowModel<P>({ dataSource: source, rowKey: (r) => r.id, blockSize: 4 });
    m.setRange(0, 4);
    await settle();
    expect(codes(m.result().errors)).toContain("duplicate-row-id");
    m.destroy();
  });

  it("does not mistake its own loading placeholders for duplicates", async () => {
    // They are namespaced by index and cannot collide; a check that flagged
    // them would fire on every partially-loaded grid, which is most of them.
    const m = createBlockRowModel<P>({
      dataSource: arraySource(rows("a", "b", "c", "d", "e", "f")),
      rowKey: (r) => r.id, blockSize: 2, maxBlocks: 1,
    });
    m.setRange(0, 6);
    await settle();
    expect(codes(m.result().errors)).not.toContain("duplicate-row-id");
    m.destroy();
  });
});

describe("the server model", () => {
  /** Two pages, each internally unique, colliding across the boundary. */
  const twoPages = (first: string[], second: string[]): GridDataSource<P> => ({
    capabilities: { total: "unknown", paging: "forward-only" },
    async getRows(query: GridQuery): Promise<GridPage<P>> {
      const page = query.cursor === null ? first : second;
      return {
        rows: rows(...page),
        nextCursor: query.cursor === null ? "next" : null,
        total: "unknown",
        appliedSort: query.sort,
      };
    },
  });

  it("finds a duplicate that spans two pages, which a per-page check would miss", async () => {
    const m = createServerRowModel<P>({ dataSource: twoPages(["a", "b"], ["b", "c"]), rowKey: (r) => r.id });
    m.setState(initialState());
    await settle();
    expect(codes(m.result().errors)).not.toContain("duplicate-row-id");

    m.setState({ ...initialState(), cursor: "next" });
    await settle();
    expect(codes(m.result().errors)).toContain("duplicate-row-id");
    m.destroy();
  });

  it("says nothing when the pages are disjoint", async () => {
    const m = createServerRowModel<P>({ dataSource: twoPages(["a", "b"], ["c", "d"]), rowKey: (r) => r.id });
    m.setState(initialState());
    await settle();
    m.setState({ ...initialState(), cursor: "next" });
    await settle();
    expect(codes(m.result().errors)).not.toContain("duplicate-row-id");
    m.destroy();
  });
});

describe("the check does not cost the window its laziness", () => {
  /**
   * The client model exists so a caller can read thirty rows out of five
   * thousand without paying for the other 4,970. An eager duplicate check
   * calls `rowKey` once per row and would have quietly taken that away — the
   * first version of this fix did exactly that, and `row-model-indexed`
   * caught it.
   */
  it("does not call rowKey for the whole set when only a window is read", () => {
    let calls = 0;
    const m = createClientRowModel({
      rows: rows(...Array.from({ length: 5_000 }, (_, i) => `p${i}`)),
      rowKey: (r) => { calls++; return r.id; },
      get: (r, k) => (r as never)[k],
      maxRows: 1e7,
    });
    m.setState(initialState());
    m.result().rowsIn(0, 30);
    expect(calls).toBeLessThanOrEqual(60);
  });

  it("pays once, and only once, when errors ARE read", () => {
    let calls = 0;
    const m = createClientRowModel({
      rows: rows("a", "b", "b"),
      rowKey: (r) => { calls++; return r.id; },
      get: (r, k) => (r as never)[k],
      maxRows: 100,
    });
    m.setState(initialState());
    const result = m.result();
    expect(codes(result.errors)).toContain("duplicate-row-id");
    const afterFirst = calls;
    void result.errors;
    void result.errors;
    expect(calls).toBe(afterFirst);
  });
});

describe("what a duplicate would have done", () => {
  /**
   * The reason this is P1 rather than tidiness: a `Map` keyed on id keeps the
   * LAST writer, so a patch, a selection lookup or a disclosure decision aimed
   * at the first row silently reaches the second.
   */
  it("a Map keyed on a duplicated id keeps only the last row", () => {
    const byId = new Map(rows("same", "same").map((r) => [r.id, r]));
    expect(byId.size).toBe(1);
    expect(byId.get("same")?.name).toBe("Patient 1");
  });
});
