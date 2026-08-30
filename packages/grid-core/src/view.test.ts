import { describe, expect, it } from "vitest";
import { initialState } from "./state.js";
import {
  applyView,
  parseView,
  resolveViews,
  VIEW_VERSION,
  viewFromState,
  type GridView,
  type ViewContext,
} from "./view.js";

const ctx: ViewContext = {
  columnKeys: ["identity", "ward", "k", "risk"],
  requiredColumns: ["identity"],
};

const view = (over: Partial<GridView> & Pick<GridView, "id" | "scope">): GridView => ({
  version: VIEW_VERSION,
  label: over.label ?? over.id,
  ...over,
});

describe("parsing a stored view", () => {
  it("round-trips through JSON", () => {
    const v = viewFromState(
      initialState({ sort: [{ key: "k", direction: "desc" }], hidden: ["ward"], widths: { k: 120 } }),
      { id: "v1", label: "My caseload", scope: "personal" },
      ctx.columnKeys,
    );
    const parsed = parseView(JSON.stringify(v));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.view).toEqual(v);
  });

  it("refuses a document from an unknown version rather than guessing", () => {
    // A partially-applied view is a filtered list claiming to be complete.
    const r = parseView(JSON.stringify({ ...view({ id: "v", scope: "personal" }), version: 2 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("unsupported view version 2");
  });

  it("refuses malformed input with a reason", () => {
    for (const [input, reason] of [
      ["{not json", "not valid JSON"],
      ["null", "not an object"],
      [JSON.stringify({ version: 1, label: "x", scope: "personal" }), "missing id"],
      [JSON.stringify({ version: 1, id: "a", label: "x", scope: "nope" }), "unknown scope"],
    ] as const) {
      const r = parseView(input);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toContain(reason);
    }
  });
});

describe("precedence", () => {
  it("applies default, then role, then team, then personal", () => {
    const r = resolveViews(
      [
        view({ id: "p", scope: "personal", pageSize: 100 }),
        view({ id: "d", scope: "default", pageSize: 25, sort: [{ key: "ward", direction: "asc" }] }),
        view({ id: "t", scope: "team", pageSize: 50 }),
      ],
      ctx,
    );
    expect(r.applied).toEqual(["default", "team", "personal"]);
    expect(r.view.pageSize).toBe(100); // personal wins
    expect(r.view.sort).toEqual([{ key: "ward", direction: "asc" }]); // default survives
  });

  it("merges field by field, so a higher scope does not discard what it did not mention", () => {
    // A personal view that only reorders columns must not silently drop the
    // team's filter -- that would be a narrowed cohort nobody asked for, or a
    // widened one nobody noticed.
    const teamFilter = { kind: "enum", key: "ward", op: "in", value: ["A"] } as const;
    const r = resolveViews(
      [
        view({ id: "t", scope: "team", filter: teamFilter }),
        view({ id: "p", scope: "personal", columns: [{ key: "k", width: 140 }] }),
      ],
      ctx,
    );
    expect(r.view.filter).toEqual(teamFilter);
    expect(r.view.columns).toEqual([{ key: "k", width: 140 }]);
  });

  it("merges column state by key across scopes", () => {
    const r = resolveViews(
      [
        view({ id: "t", scope: "team", columns: [{ key: "k", width: 140 }] }),
        view({ id: "p", scope: "personal", columns: [{ key: "k", pinned: "start" }] }),
      ],
      ctx,
    );
    // The team's width survives a personal view that only pinned the column.
    expect(r.view.columns).toEqual([{ key: "k", width: 140, pinned: "start" }]);
  });
});

describe("what a view is not allowed to do", () => {
  it("cannot hide a required column, and says so", () => {
    const r = resolveViews(
      [view({ id: "p", scope: "personal", columns: [{ key: "identity", hidden: true }] })],
      ctx,
    );
    expect(r.problems).toEqual([{ kind: "required-column-hidden", key: "identity", viewId: "p" }]);
    expect(r.view.columns?.find((c) => c.key === "identity")?.hidden).toBe(false);
  });

  it("reports a column that no longer exists rather than dropping it silently", () => {
    // A view saved when the column existed, applied after it was removed. A
    // silent drop is the same lie one layer further down.
    const r = resolveViews(
      [view({ id: "p", scope: "personal", columns: [{ key: "gone", width: 90 }] })],
      ctx,
    );
    expect(r.problems).toEqual([{ kind: "unknown-column", key: "gone", viewId: "p" }]);
    expect(r.view.columns ?? []).toEqual([]);
  });

  it("reports a sort the source cannot serve", () => {
    const r = resolveViews([view({ id: "p", scope: "personal", sort: [{ key: "risk", direction: "desc" }] })], {
      ...ctx,
      sortableKeys: ["ward", "k"],
    });
    expect(r.problems).toEqual([{ kind: "unsortable-column", key: "risk", viewId: "p" }]);
    expect(r.view.sort).toEqual([]);
  });
});

describe("applying a view to state", () => {
  it("sets sort, filter, hidden columns and widths", () => {
    const next = applyView(
      view({ id: "p", scope: "personal", sort: [{ key: "k", direction: "asc" }], columns: [{ key: "ward", hidden: true }, { key: "k", width: 120 }] }),
      initialState(),
    );
    expect(next.sort).toEqual([{ key: "k", direction: "asc" }]);
    expect(next.hidden).toEqual(["ward"]);
    expect(next.widths).toEqual({ k: 120 });
  });

  it("leaves state the view did not mention alone", () => {
    const base = initialState({ pageSize: 75, filter: { kind: "text", key: "ward", op: "eq", value: "A" } });
    const next = applyView(view({ id: "p", scope: "personal", sort: [] }), base);
    expect(next.pageSize).toBe(75);
    expect(next.filter).toEqual(base.filter);
  });

  it("clears the cursor, because a view change is a new query", () => {
    const next = applyView(view({ id: "p", scope: "personal" }), initialState({ cursor: "op4Ka" }));
    expect(next.cursor).toBeNull();
  });
});

describe("applyView merges visibility rather than replacing it", () => {
  /**
   * `applyView` documented "everything not named by the view is left alone" and
   * `hidden` did not honour it: it was recomputed from the view's `hidden:true`
   * columns and then replaced the base outright. A personal view that changed
   * one column's width unhid every column the base had hidden — including ones
   * hidden by a policy layer.
   */
  const base = (hidden: string[]) => ({ ...initialState(), hidden });
  const view = (columns: { key: string; hidden?: boolean; width?: number }[]): GridView => ({
    version: 1, id: "v", label: "v", scope: "personal", columns,
  });

  it("leaves a hidden column alone when the view does not mention it", () => {
    expect(applyView(view([{ key: "a", width: 200 }]), base(["secret"])).hidden).toEqual(["secret"]);
  });

  it("unhides only the column the view explicitly names false", () => {
    expect(applyView(view([{ key: "a", hidden: false }]), base(["a", "b"])).hidden).toEqual(["b"]);
  });

  it("adds a column the view hides", () => {
    expect(applyView(view([{ key: "b", hidden: true }]), base(["a"])).hidden).toEqual(["a", "b"]);
  });

  it("does both at once, and does not duplicate", () => {
    const out = applyView(
      view([{ key: "a", hidden: false }, { key: "b", hidden: true }, { key: "c", hidden: true }]),
      base(["a", "c"]),
    );
    expect(out.hidden).toEqual(["c", "b"]);
  });

  it("treats an absent `hidden` as 'no opinion', not as false", () => {
    // This is the whole reason the merge cannot be a filter over the view.
    expect(applyView(view([{ key: "a" }]), base(["a"])).hidden).toEqual(["a"]);
  });

  it("keeps a view with no columns from touching visibility at all", () => {
    const v: GridView = { version: 1, id: "v", label: "v", scope: "personal", sort: [] };
    expect(applyView(v, base(["a", "b"])).hidden).toEqual(["a", "b"]);
  });

  it("is stable across a repeated application", () => {
    const v = view([{ key: "a", hidden: false }, { key: "b", hidden: true }]);
    const once = applyView(v, base(["a", "c"]));
    expect(applyView(v, once).hidden).toEqual(once.hidden);
  });

  it("still applies widths, sort and page size beside the merge", () => {
    const out = applyView(
      { version: 1, id: "v", label: "v", scope: "personal",
        columns: [{ key: "a", width: 240, hidden: false }], sort: [{ key: "a", direction: "desc" }], pageSize: 40 },
      base(["a", "b"]),
    );
    expect(out.hidden).toEqual(["b"]);
    expect(out.widths["a"]).toBe(240);
    expect(out.sort).toEqual([{ key: "a", direction: "desc" }]);
    expect(out.pageSize).toBe(40);
  });
});
