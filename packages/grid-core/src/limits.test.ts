/**
 * Numbers are checked at a boundary, and the boundary decides how to fail.
 *
 * `initialState` spread its overrides without looking, `parseView` validated a
 * view's envelope and cast the body, and `queryFrom` normalised the page and
 * not the page size. So a stored view, a URL, or a payload shared from another
 * product could carry `pageSize: 0`, `width: -2` or a non-finite page, and
 * those reached offset arithmetic, geometry and CSS widths — past the boundary
 * that advertises refusing rather than guessing.
 *
 * The split that matters: `parseView` REFUSES, because it returns a result and
 * can say why. `initialState` CLAMPS, because it returns a state and has no
 * channel to report a problem. Conflating the two turns "this file is corrupt"
 * into "your layout moved and nobody said so".
 */
import { describe, expect, it } from "vitest";
import { COLUMN_WIDTH, PAGE_SIZE, clampInteger, integerIn, invalidWidths } from "./limits.js";
import { initialState } from "./state.js";
import { parseView } from "./view.js";

const view = (over: Record<string, unknown>) =>
  parseView(JSON.stringify({ version: 1, id: "v", label: "v", scope: "personal", ...over }));

describe("integerIn", () => {
  it("accepts an integer inside the range", () => {
    expect(integerIn(50, PAGE_SIZE)).toBe(50);
  });

  it("truncates rather than rounding, so 2.9 pages is 2", () => {
    expect(integerIn(2.9, { min: 0, max: 10 })).toBe(2);
  });

  it("refuses everything that is not a finite number", () => {
    for (const v of [NaN, Infinity, -Infinity, "50", null, undefined, {}, []]) {
      expect(integerIn(v, PAGE_SIZE), String(v)).toBeNull();
    }
  });

  it("refuses outside the range at both ends", () => {
    expect(integerIn(0, PAGE_SIZE)).toBeNull();
    expect(integerIn(PAGE_SIZE.max + 1, PAGE_SIZE)).toBeNull();
  });

  it("finds every unusable width in a map", () => {
    expect(invalidWidths({ a: 100, b: -2, c: NaN, d: 200 })).toEqual(["b", "c"]);
  });
});

describe("initialState clamps, because it cannot refuse", () => {
  it("replaces a page size of zero, which never terminates a paging loop", () => {
    expect(initialState({ pageSize: 0 }).pageSize).toBe(PAGE_SIZE.fallback);
  });

  it("replaces a non-finite page, which becomes a NaN offset", () => {
    expect(initialState({ page: Number.NaN }).page).toBe(0);
    expect(initialState({ page: -5 }).page).toBe(0);
  });

  it("drops an unusable width rather than clamping it", () => {
    // An unusable number is not evidence of an intent worth approximating. The
    // column falls back to its declared width, which is a defined answer.
    const widths = initialState({ widths: { a: 200, b: -2, c: Number.NaN } }).widths;
    expect(widths).toEqual({ a: 200 });
  });

  it("leaves a valid override exactly alone", () => {
    const s = initialState({ pageSize: 25, page: 3, widths: { a: 180 } });
    expect(s).toMatchObject({ pageSize: 25, page: 3, widths: { a: 180 } });
  });

  it("still defaults everything nobody supplied", () => {
    expect(initialState()).toMatchObject({
      sort: [], filter: null, selection: [], focus: null, cursor: null, page: 0, hidden: [], widths: {},
    });
  });
});

describe("parseView refuses, because it can say why", () => {
  it("refuses a page size outside the range", () => {
    const out = view({ pageSize: 0 });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toMatch(/page size 0/);
  });

  it("refuses a negative column width", () => {
    const out = view({ columns: [{ key: "a", width: -2 }] });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toMatch(/width -2/);
  });

  it("refuses a duplicate column, which would make the merge order-dependent", () => {
    const out = view({ columns: [{ key: "a" }, { key: "a" }] });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toMatch(/appears twice/);
  });

  it("refuses a sort direction that is not a direction", () => {
    const out = view({ sort: [{ key: "n", direction: "sideways" }] });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toMatch(/sideways/);
  });

  it("refuses a pinned edge that is not an edge", () => {
    const out = view({ columns: [{ key: "a", pinned: "middle" }] });
    expect(out.ok).toBe(false);
  });

  it("refuses a column with no key, and a non-boolean hidden", () => {
    expect(view({ columns: [{ width: 100 }] }).ok).toBe(false);
    expect(view({ columns: [{ key: "a", hidden: "yes" }] }).ok).toBe(false);
  });

  it("names the offending field, so the reason is actionable", () => {
    const out = view({ columns: [{ key: "potassium", width: 99_999 }] });
    if (!out.ok) expect(out.reason).toContain("potassium");
  });

  describe("filters, which nest", () => {
    it("accepts a well-formed nested filter", () => {
      expect(view({ filter: { kind: "and", children: [
        { kind: "text", key: "name", op: "contains", value: "x" },
        { kind: "not", child: { kind: "number", key: "k", op: "gt", value: 5 } },
      ] } }).ok).toBe(true);
    });

    it("refuses an unknown kind, however deep", () => {
      const out = view({ filter: { kind: "and", children: [
        { kind: "text", key: "a", op: "eq", value: "1" },
        { kind: "teleport", key: "b" },
      ] } });
      expect(out.ok).toBe(false);
      if (!out.ok) expect(out.reason).toMatch(/children\[1\]/);
    });

    it("refuses a comparison with no key", () => {
      expect(view({ filter: { kind: "text", op: "eq", value: "x" } }).ok).toBe(false);
    });

    it("refuses an and with no children array", () => {
      expect(view({ filter: { kind: "and" } }).ok).toBe(false);
    });

    it("refuses a filter nested beyond any sane depth, rather than recursing forever", () => {
      let node: unknown = { kind: "text", key: "a", op: "eq", value: "1" };
      for (let i = 0; i < 40; i++) node = { kind: "not", child: node };
      const out = view({ filter: node });
      expect(out.ok).toBe(false);
      if (!out.ok) expect(out.reason).toMatch(/nests deeper/);
    });

    it("accepts an explicitly null filter, which means 'no filter'", () => {
      expect(view({ filter: null }).ok).toBe(true);
    });
  });

  it("still accepts a view that is simply valid", () => {
    expect(view({
      pageSize: 25,
      columns: [{ key: "a", width: 200, hidden: false, pinned: "start" }, { key: "b", hidden: true }],
      sort: [{ key: "a", direction: "desc" }],
    }).ok).toBe(true);
  });

  it("still refuses the envelope problems it always did", () => {
    expect(parseView("not json").ok).toBe(false);
    expect(parseView({ version: 99, id: "v", label: "v", scope: "personal" }).ok).toBe(false);
    expect(parseView({ version: 1, id: "", label: "v", scope: "personal" }).ok).toBe(false);
  });
});

describe("clampInteger", () => {
  it("falls back for anything unusable, and clamps the fallback into range", () => {
    expect(clampInteger(NaN, PAGE_SIZE, 50)).toBe(50);
    expect(clampInteger("x", COLUMN_WIDTH, 0)).toBe(COLUMN_WIDTH.min);
  });
});
