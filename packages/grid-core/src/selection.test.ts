import { describe, expect, it } from "vitest";
import { openReview, confirmReview, describeReview } from "./bulk.js";
import {
  describeDrift,
  driftBetween,
  hasDrifted,
  isSelected,
  resolveSelection,
  selectIds,
  selectMatching,
  selectionCount,
  toggle,
} from "./selection.js";

const loaded = ["a", "b", "c", "d"];
const ctx = (over: Partial<Parameters<typeof resolveSelection>[1]> = {}) => ({
  loadedIds: loaded,
  ...over,
});

describe("the two select-alls are different acts", () => {
  it("an id selection covers exactly what was ticked", () => {
    const r = resolveSelection(selectIds(["a", "c"]), ctx());
    expect(r).toMatchObject({ kind: "ids", ids: ["a", "c"], total: 2, unnamed: 0 });
  });

  it("a predicate selection covers everyone matching, loaded or not", () => {
    // 12,000 people match; four are on screen. Acting on "selected" is not
    // acting on four.
    const r = resolveSelection(selectMatching(null), ctx({ matchingTotal: 12_000 }));
    expect(r).toMatchObject({ kind: "predicate", total: 12_000, unnamed: 11_996 });
    expect(r.ids).toEqual(loaded);
  });

  it("carries an unknown total through instead of guessing", () => {
    // A source that does not report totals cannot say how many a filter matches.
    const r = resolveSelection(selectMatching(null), ctx({ matchingTotal: "unknown" }));
    expect(r.total).toBe("unknown");
    expect(r.unnamed).toBe("unknown");
    expect(selectionCount(r)).toBe("4 shown, and an unknown number not loaded");
  });

  it("counts an id selection whose rows have scrolled out of the page", () => {
    const r = resolveSelection(selectIds(["a", "zz"]), ctx());
    expect(r).toMatchObject({ total: 2, unnamed: 1 });
    expect(selectionCount(r)).toBe("2 (1 not loaded)");
  });
});

describe("unticking inside a predicate selection", () => {
  it("excludes one person without collapsing the selection into a list", () => {
    // The rest of the set is still whoever matches, including rows nobody has
    // loaded yet.
    const s = toggle(selectMatching(null), "b");
    expect(isSelected(s, "b")).toBe(false);
    expect(isSelected(s, "zz")).toBe(true);
    const r = resolveSelection(s, ctx({ matchingTotal: 100 }));
    expect(r.total).toBe(99);
    expect(r.ids).toEqual(["a", "c", "d"]);
  });

  it("toggles back", () => {
    const s = toggle(toggle(selectMatching(null), "b"), "b");
    expect(isSelected(s, "b")).toBe(true);
  });
});

describe("drift", () => {
  it("reports rows that left the set", () => {
    const d = driftBetween(["a", "b", "c"], ["a", "c"]);
    expect(d).toEqual({ held: ["a", "c"], departed: ["b"], arrived: [] });
    expect(hasDrifted(d)).toBe(true);
  });

  it("reports rows that ARRIVED and were never reviewed", () => {
    // The one every grid misses: a predicate reviewed at 09:12 covers whoever
    // matches at 09:14, so a patient admitted in between is in the write
    // without ever having been named.
    const d = driftBetween(["a", "b"], ["a", "b", "z"]);
    expect(d.arrived).toEqual(["z"]);
    expect(describeDrift(d)).toBe("1 now match and were not reviewed");
  });

  it("is quiet when nothing moved", () => {
    const d = driftBetween(["a", "b"], ["a", "b"]);
    expect(hasDrifted(d)).toBe(false);
    expect(describeDrift(d)).toBe("unchanged");
  });
});

// ── bulk review ─────────────────────────────────────────────────────────────

interface P { readonly id: string; readonly name: string }
const rows: Record<string, P> = {
  a: { id: "a", name: "Okafor" },
  b: { id: "b", name: "Lindqvist" },
  c: { id: "c", name: "Rahman" },
  d: { id: "d", name: "Müller" },
};
const rowsById = (id: string) => rows[id];

describe("bulk review names the people", () => {
  it("returns names, not a count", () => {
    // "Reassign 12 patients" is not reviewable. Twelve names are.
    const review = openReview({
      selection: selectIds(["a", "c"]),
      context: ctx(),
      rowsById,
      takenAt: "09:12",
    });
    expect(review.named.map((r) => r.row.name)).toEqual(["Okafor", "Rahman"]);
    expect(describeReview(review)).toBe("2 named");
  });

  it("says how many it could not name", () => {
    const review = openReview({
      selection: selectMatching(null),
      context: ctx({ matchingTotal: 12_000 }),
      rowsById,
      takenAt: "09:12",
    });
    expect(describeReview(review)).toBe("4 named, 11996 not loaded");
  });
});

describe("confirmation", () => {
  const review = () =>
    openReview({ selection: selectIds(["a", "b"]), context: ctx(), rowsById, takenAt: "09:12" });

  it("releases the ids when nothing moved", () => {
    expect(confirmReview(review(), { context: ctx() })).toEqual({ ok: true, ids: ["a", "b"] });
  });

  it("REFUSES when a row left the set between review and confirmation", () => {
    // The discharged patient. Silently dropping them is how a bulk action does
    // something nobody reviewed.
    const r = confirmReview(review(), { context: ctx({ loadedIds: ["a", "c", "d"] }) });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain("changed since it was reviewed at 09:12");
      expect(r.drift?.departed).toEqual(["b"]);
    }
  });

  it("REFUSES when a row arrived that nobody reviewed", () => {
    const wide = openReview({
      selection: selectMatching(null),
      context: ctx({ loadedIds: ["a", "b"], matchingTotal: 2 }),
      rowsById,
      takenAt: "09:12",
    });
    const r = confirmReview(wide, { context: ctx({ loadedIds: ["a", "b", "z"], matchingTotal: 3 }) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.drift?.arrived).toEqual(["z"]);
  });

  it("refuses to act on people who were never shown", () => {
    const wide = openReview({
      selection: selectMatching(null),
      context: ctx({ matchingTotal: 12_000 }),
      rowsById,
      takenAt: "09:12",
    });
    const r = confirmReview(wide, { context: ctx({ matchingTotal: 12_000 }) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("11996 rows that were never shown");
  });

  it("refuses an unknown number of unseen rows just as firmly", () => {
    const wide = openReview({
      selection: selectMatching(null),
      context: ctx({ matchingTotal: "unknown" }),
      rowsById,
      takenAt: "09:12",
    });
    const r = confirmReview(wide, { context: ctx({ matchingTotal: "unknown" }) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("an unknown number of rows that were never shown");
  });

  it("proceeds only when the caller opts in explicitly", () => {
    const wide = openReview({
      selection: selectMatching(null),
      context: ctx({ matchingTotal: 12_000 }),
      rowsById,
      takenAt: "09:12",
    });
    const r = confirmReview(wide, { context: ctx({ matchingTotal: 12_000 }), allowUnnamed: true });
    expect(r).toEqual({ ok: true, ids: ["a", "b", "c", "d"] });
  });

  it("carries no row content in the refusal it emits", () => {
    const r = confirmReview(review(), { context: ctx({ loadedIds: ["a"] }) });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(Object.keys(r.error).sort()).toEqual(["code", "columnKey", "phase", "query", "rowIndex"]);
      expect(JSON.stringify(r.error)).not.toContain("Lindqvist");
    }
  });
});
