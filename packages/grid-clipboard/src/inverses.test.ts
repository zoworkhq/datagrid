/**
 * An inverse restores the prior state, or there isn't one.
 *
 * ── WHAT THIS USED TO GUESS ─────────────────────────────────────────────────
 *
 * `invert` claimed only cleanly invertible actions were undoable. Three of the
 * five were not clean, and none announced itself:
 *
 *   · `sort/set` always inverted to an EMPTY sort, so undoing a sort change
 *     removed sorting rather than restoring the previous one.
 *   · `filter/set` always inverted to a NULL filter, with the same result.
 *   · `select/clear` rebuilt a `select/range` from the first and last id of the
 *     old selection, so undoing a clear over a NON-CONTIGUOUS selection handed
 *     back a larger contiguous one — and the next bulk action then targeted
 *     rows the user never picked.
 *
 * Undo appeared to work and changed the state, which is worse than an undo that
 * is greyed out.
 *
 * The load-bearing test here is the last one: apply an action, apply its
 * inverse, and require every field of the state to come back.
 */
import { describe, expect, it } from "vitest";
import { invert, type UndoContext } from "./index.js";
import {
  initialState, reduce, type FilterNode, type GridAction, type GridState,
} from "@oxygenui-design/grid-core";

const CTX = { rowIds: ["a", "b", "c", "d", "e", "f"] };
const apply = (s: GridState, a: GridAction): GridState => reduce(s, a, CTX);

const contextOf = (s: GridState): UndoContext => ({
  selection: s.selection,
  sort: s.sort,
  filter: s.filter,
});

const FILTER: FilterNode = { kind: "text", key: "name", op: "contains", value: "Okafor" };
const OTHER: FilterNode = { kind: "text", key: "ward", op: "eq", value: "Cedar" };

describe("sort", () => {
  it("restores the previous sort, not an empty one", () => {
    const before = { ...initialState(), sort: [{ key: "name", direction: "asc" as const }] };
    const inverse = invert({ type: "sort/set", sort: [{ key: "k", direction: "desc" }] }, contextOf(before));
    expect(inverse).toEqual({ type: "sort/set", sort: before.sort });
  });

  it("inverts a toggle to the sort that preceded it", () => {
    const before = { ...initialState(), sort: [{ key: "ward", direction: "desc" as const }] };
    const inverse = invert({ type: "sort/toggle", key: "name", additive: false }, contextOf(before));
    expect(inverse).toEqual({ type: "sort/set", sort: before.sort });
  });

  it("refuses when the caller did not record the prior sort", () => {
    expect(invert({ type: "sort/set", sort: [] }, {})).toBeNull();
  });
});

describe("filter", () => {
  it("restores the previous filter", () => {
    const inverse = invert({ type: "filter/set", node: OTHER }, { filter: FILTER });
    expect(inverse).toEqual({ type: "filter/set", node: FILTER });
  });

  it("treats a prior filter of null as recorded, not as missing", () => {
    // `filter: null` means "there was no filter"; omitting the key means "I did
    // not record it". Conflating them is how the old version always undid to
    // null and looked correct on the one case where null was right.
    expect(invert({ type: "filter/set", node: FILTER }, { filter: null }))
      .toEqual({ type: "filter/set", node: null });
    expect(invert({ type: "filter/set", node: FILTER }, {})).toBeNull();
  });
});

describe("selection", () => {
  it("restores a non-contiguous selection exactly", () => {
    const inverse = invert({ type: "select/clear" }, { selection: ["a", "c", "f"] });
    expect(inverse).toEqual({ type: "select/set", ids: ["a", "c", "f"] });
  });

  it("does not turn three scattered rows into six", () => {
    // The exact old defect: a range from "a" to "f" over the row order.
    const before = { ...initialState(), selection: ["a", "c", "f"] };
    const cleared = apply(before, { type: "select/clear" });
    const restored = apply(cleared, invert({ type: "select/clear" }, contextOf(before)) as GridAction);
    expect(restored.selection).toEqual(["a", "c", "f"]);
  });

  it("inverts select/all to what was selected, not to a clear", () => {
    const before = { ...initialState(), selection: ["b"] };
    const inverse = invert({ type: "select/all" }, contextOf(before));
    expect(inverse).toEqual({ type: "select/set", ids: ["b"] });
  });

  it("inverts an additive range to what was selected", () => {
    const before = { ...initialState(), selection: ["a"] };
    const inverse = invert({ type: "select/range", from: "b", to: "e" }, contextOf(before));
    expect(inverse).toEqual({ type: "select/set", ids: ["a"] });
  });

  it("restores toggle by set when the prior selection is known", () => {
    // Toggling twice restores MEMBERSHIP and not ORDER — the id returns at the
    // end of the list. Order is observable: `row.selectExtend` anchors on the
    // last selected row, so a toggle-and-undo would move where the next
    // Shift+Space range starts from. The property test found this.
    const a: GridAction = { type: "select/toggle", id: "c" };
    expect(invert(a, { selection: ["a", "c", "f"] }))
      .toEqual({ type: "select/set", ids: ["a", "c", "f"] });
  });

  it("falls back to toggling back when the prior selection is not known", () => {
    // Membership-correct, which is the best available answer and better than
    // refusing an undo people expect to work.
    const a: GridAction = { type: "select/toggle", id: "c" };
    expect(invert(a, {})).toEqual(a);
  });

  it("refuses when the prior selection was not recorded", () => {
    expect(invert({ type: "select/clear" }, {})).toBeNull();
  });

  it("deduplicates on the way back in, because a selection is a set", () => {
    const out = apply(initialState(), { type: "select/set", ids: ["a", "a", "b"] });
    expect(out.selection).toEqual(["a", "b"]);
  });
});

describe("the property that matters", () => {
  /**
   * Apply an action, apply its inverse, and every relevant field comes back.
   * This is the test the review asked for, and the one that would have caught
   * all three defects at once.
   */
  const START: GridState = {
    ...initialState(),
    sort: [{ key: "ward", direction: "desc" }],
    filter: FILTER,
    selection: ["a", "c", "f"],
    hidden: ["mrn"],
  };

  const ACTIONS: GridAction[] = [
    { type: "sort/set", sort: [{ key: "name", direction: "asc" }] },
    { type: "sort/toggle", key: "name", additive: false },
    { type: "sort/toggle", key: "ward", additive: true },
    { type: "filter/set", node: OTHER },
    { type: "filter/set", node: null },
    { type: "select/clear" },
    { type: "select/all" },
    { type: "select/range", from: "b", to: "d" },
    { type: "select/toggle", id: "b" },
    { type: "select/toggle", id: "a" },
    { type: "column/visibility", key: "notes", visible: false },
  ];

  for (const action of ACTIONS) {
    it(`${action.type} — ${JSON.stringify(action).slice(0, 52)}`, () => {
      const inverse = invert(action, contextOf(START));
      expect(inverse, "no inverse offered for an action that should have one").not.toBeNull();

      const after = apply(START, action);
      const back = apply(after, inverse as GridAction);

      for (const field of ["sort", "filter", "selection", "hidden"] as const) {
        expect(back[field], `${action.type} did not restore ${field}`).toEqual(START[field]);
      }
    });
  }

  it("offers no inverse for anything that reached a server", () => {
    for (const a of [
      { type: "page/next", cursor: "x" },
      { type: "page/goto", page: 3 },
      { type: "rows/upsert", rows: [] },
      { type: "rows/remove", ids: ["a"] },
      { type: "focus/cell", rowId: "a", columnKey: "k" },
      { type: "edit/begin", rowId: "a", columnKey: "k" },
    ] as GridAction[]) {
      expect(invert(a, contextOf(START)), a.type).toBeNull();
    }
  });
});
