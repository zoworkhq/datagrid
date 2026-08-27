import { describe, expect, it } from "vitest";
import { initialState, reduce, type ReduceContext } from "./state.js";

const ctx: ReduceContext = { rowIds: ["a", "b", "c", "d"], requiredColumns: ["identity"] };

describe("the reducer", () => {
  it("selects a contiguous range regardless of direction", () => {
    const s = reduce(initialState(), { type: "select/range", from: "c", to: "a" }, ctx);
    expect(s.selection).toEqual(["a", "b", "c"]);
  });

  it("refuses to hide a required column", () => {
    // In a clinical recipe the identity column is required. Hiding it is how a
    // bulk action acts on the wrong person.
    const s = reduce(initialState(), { type: "column/visibility", key: "identity", visible: false }, ctx);
    expect(s.hidden).toEqual([]);
  });

  it("hides an ordinary column, once", () => {
    let s = reduce(initialState(), { type: "column/visibility", key: "mrn", visible: false }, ctx);
    s = reduce(s, { type: "column/visibility", key: "mrn", visible: false }, ctx);
    expect(s.hidden).toEqual(["mrn"]);
  });

  it("invalidates the cursor whenever the query changes", () => {
    // An opaque cursor is only meaningful against the query that produced it.
    const paged = reduce(initialState(), { type: "page/next", cursor: "op4Ka" }, ctx);
    expect(paged.cursor).toBe("op4Ka");
    expect(reduce(paged, { type: "filter/set", node: null }, ctx).cursor).toBeNull();
    expect(reduce(paged, { type: "sort/toggle", key: "k", additive: false }, ctx).cursor).toBeNull();
  });

  it("drops removed rows from selection and releases focus that was on one", () => {
    let s = reduce(initialState(), { type: "select/range", from: "a", to: "c" }, ctx);
    s = reduce(s, { type: "focus/cell", rowId: "b", columnKey: "name" }, ctx);
    s = reduce(s, { type: "rows/remove", ids: ["b"] }, ctx);
    expect(s.selection).toEqual(["a", "c"]);
    expect(s.focus).toBeNull();
  });

  it("keeps focus when an unrelated row is removed", () => {
    let s = reduce(initialState(), { type: "focus/cell", rowId: "b", columnKey: "name" }, ctx);
    s = reduce(s, { type: "rows/remove", ids: ["d"] }, ctx);
    expect(s.focus).toEqual({ rowId: "b", columnKey: "name" });
  });

  it("ignores a range whose endpoints are not in view", () => {
    const s = reduce(initialState(), { type: "select/range", from: "a", to: "zzz" }, ctx);
    expect(s.selection).toEqual([]);
  });
});
