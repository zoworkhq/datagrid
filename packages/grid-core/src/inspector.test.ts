import { describe, expect, it } from "vitest";
import { initialState, reduce } from "./state.js";
import {
  closeInspector, closedInspector, fromSearchParams, inspect, inspectionEvent, isOpen, toSearchParams,
} from "./inspector.js";

const ctx = { rowIds: ["a", "b", "c"] };

describe("inspecting does not disturb the grid", () => {
  it("cannot touch focus or selection, by signature", () => {
    // Most grids lose the reader's place here: focus jumps into the panel and
    // the selection is replaced by "the inspected row". In a worklist that is
    // a re-orientation cost paid on every row, all shift.
    let state = reduce(initialState(), { type: "select/range", from: "a", to: "b" }, ctx);
    state = reduce(state, { type: "focus/cell", rowId: "c", columnKey: "name" }, ctx);

    const inspector = inspect("a");

    expect(isOpen(inspector)).toBe(true);
    // The grid state object is untouched — nothing in the inspector API can
    // reach it.
    expect(state.selection).toEqual(["a", "b"]);
    expect(state.focus).toEqual({ rowId: "c", columnKey: "name" });
  });

  it("opens, and closes back to nothing", () => {
    expect(inspect("a")).toEqual({ rowId: "a" });
    expect(inspect("a", "meds")).toEqual({ rowId: "a", section: "meds" });
    expect(isOpen(closeInspector())).toBe(false);
    expect(closedInspector()).toEqual({ rowId: null });
  });
});

describe("one URL", () => {
  it("carries the row AND the query that produced the list", () => {
    // A link to a row without its list drops the reader into a different set
    // from the one the sender was looking at.
    const params = toSearchParams({ inspector: inspect("p42", "labs"), query: "ward=A&sort=risk" });
    expect(params.get("row")).toBe("p42");
    expect(params.get("section")).toBe("labs");
    expect(params.get("q")).toBe("ward=A&sort=risk");
  });

  it("round-trips", () => {
    const before = { inspector: inspect("p42", "labs"), query: "ward=A" };
    expect(fromSearchParams(toSearchParams(before))).toEqual(before);
  });

  it("clears its own parameters when closed, and leaves others alone", () => {
    const existing = new URLSearchParams("row=p1&section=labs&theme=dark");
    const params = toSearchParams({ inspector: closedInspector() }, existing);
    expect(params.get("row")).toBeNull();
    expect(params.get("section")).toBeNull();
    expect(params.get("theme")).toBe("dark");
  });

  it("reads a bare link with no section", () => {
    expect(fromSearchParams(new URLSearchParams("row=p9"))).toEqual({ inspector: { rowId: "p9" } });
    expect(fromSearchParams(new URLSearchParams(""))).toEqual({ inspector: { rowId: null } });
  });
});

describe("inspecting is a disclosure", () => {
  it("emits an access event, because it shows more than the list did", () => {
    expect(inspectionEvent("p1", ["notes", "meds"], "09:12")).toEqual({
      kind: "inspect", columnKeys: ["notes", "meds"], rowCount: 1, at: "09:12", rowId: "p1",
    });
  });
});
