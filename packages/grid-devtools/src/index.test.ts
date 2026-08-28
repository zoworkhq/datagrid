import { describe, expect, it } from "vitest";
import { gridError, initialState, queryFrom } from "@oxygenui-design/grid-core";
import { createDevtools, explain } from "./index.js";

describe("the devtools panel", () => {
  it("records actions in order with timings", () => {
    const d = createDevtools({ now: () => 0 });
    d.action({ type: "sort/toggle", key: "k", additive: false }, 2.4);
    d.action({ type: "filter/set", node: null }, 1.1);
    const s = d.snapshot();
    expect(s.actions.map((a) => a.seq)).toEqual([0, 1]);
    expect(s.actions[0]?.ms).toBe(2.4);
  });

  it("records a plugin veto, so a blocked action is visible", () => {
    const d = createDevtools();
    d.action({ type: "select/clear" }, undefined, "disclosure");
    expect(d.snapshot().actions[0]?.vetoedBy).toBe("disclosure");
  });

  it("bounds what it retains", () => {
    // A ward workstation keeps one session for a fortnight; an unbounded log
    // is a slow memory leak with extra steps.
    const d = createDevtools({ limit: 10 });
    for (let i = 0; i < 100; i++) d.action({ type: "select/clear" });
    expect(d.snapshot().actions).toHaveLength(10);
    expect(d.snapshot().stats.actions).toBe(100); // the count is still true
  });

  it("reports p95 frame time and dropped frames", () => {
    const d = createDevtools();
    for (const ms of [8, 9, 8, 40, 9, 8, 9, 8, 9, 30]) d.frame(ms);
    const s = d.snapshot().stats;
    expect(s.droppedFrames).toBe(2);
    expect(s.p95FrameMs).toBeGreaterThan(16.7);
  });

  it("explains WHY the grid is in its state, not just what the state is", () => {
    const d = createDevtools();
    d.action({ type: "sort/toggle", key: "risk", additive: false });
    d.action({ type: "column/visibility", key: "mrn", visible: false });
    d.action({ type: "focus/cell", rowId: "p1", columnKey: "name" }); // not query-relevant
    expect(explain(d.snapshot())).toEqual([
      "#0 sorted by risk (replaced)",
      "#1 hid mrn",
    ]);
  });

  it("says so plainly when nothing has changed the query", () => {
    expect(explain(createDevtools().snapshot())[0]).toContain("Nothing has changed the query");
  });

  it("produces a report that carries coordinates only", () => {
    // The panel may hold values; a REPORT is pasted into an issue tracker.
    const d = createDevtools();
    d.error(gridError({ code: "renderer-threw", phase: "render", columnKey: "potassium", rowIndex: 418 }));
    d.query(queryFrom(initialState({ pageSize: 25 }), []));
    const report = d.report();
    expect(report).toContain("renderer-threw render col=potassium row=418");
    expect(report).toContain("pageSize=25");
    expect(report).not.toMatch(/mmol|patient/i);
  });

  it("clears without losing the running totals", () => {
    const d = createDevtools();
    d.action({ type: "select/clear" });
    d.clear();
    expect(d.snapshot().actions).toHaveLength(0);
    expect(d.snapshot().stats.actions).toBe(1);
  });
});
