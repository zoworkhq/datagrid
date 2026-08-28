import { describe, expect, it, vi } from "vitest";
import type { GridError } from "@oxygenui-design/grid-core";
import type { DisclosureEvent, DisclosurePolicy } from "./disclosure.js";
import {
  describeWithheld, isValidReason, mayDisclose, requestBreakGlass, resolveColumns, resolveRows,
} from "./policy.js";

const columns = [
  { key: "identity", header: "Patient", required: true },
  { key: "ward", header: "Ward" },
  { key: "notes", header: "Notes" },
];

const policy = (over: Partial<DisclosurePolicy> = {}): DisclosurePolicy => ({
  column: () => "visible",
  cell: () => "visible",
  row: () => "visible",
  mayExport: () => true,
  mayPrint: () => true,
  mayCopy: () => true,
  ...over,
});

describe("columns", () => {
  it("STATES a withheld column rather than dropping it silently", () => {
    // A column that vanishes is indistinguishable from one that never existed,
    // and a reader cannot ask for what they cannot see is missing.
    const r = resolveColumns(columns, policy({ column: (k) => (k === "notes" ? "withheld" : "visible") }));
    expect(r.visible.map((c) => c.key)).toEqual(["identity", "ward"]);
    expect(describeWithheld(r)).toBe("1 column withheld: Notes");
  });

  it("never withholds a required column, and reports the policy error", () => {
    // Hiding the identity column is how a bulk action acts on the wrong person.
    const errors: GridError[] = [];
    const r = resolveColumns(columns, policy({ column: () => "withheld" }), (e) => errors.push(e));
    expect(r.visible.map((c) => c.key)).toEqual(["identity"]);
    expect(errors.map((e) => e.columnKey)).toEqual(["identity"]);
  });

  it("says nothing when nothing is withheld", () => {
    expect(describeWithheld(resolveColumns(columns, policy()))).toBe("");
  });
});

describe("rows", () => {
  const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
  it("MARKS a restricted row rather than filtering it out", () => {
    // Removing it changes the count, and a list that silently shrinks lies
    // about the population -- what coverage exists to prevent, one layer down.
    const r = resolveRows(rows, (x) => x.id, policy({
      row: (x) => ((x as { id: string }).id === "b" ? { restricted: { code: "p2", label: "Part 2" } } : "visible"),
    }));
    expect(r.rows).toHaveLength(3);
    expect(r.restrictedCount).toBe(1);
    expect(r.restricted.get("b")?.label).toBe("Part 2");
  });
});

describe("break-glass", () => {
  const req = { rowId: "a", columnKey: "notes", reason: "emergency-care", requestedAt: "09:12" };

  it("refuses a reason outside the closed set", () => {
    // Free text produces an audit log nobody can group or query.
    expect(isValidReason("because")).toBe(false);
    expect(isValidReason("emergency-care")).toBe(true);
  });

  it("does not call the server for an invalid reason", async () => {
    const request = vi.fn();
    const out = await requestBreakGlass({ ...req, reason: "because" }, { request });
    expect(request).not.toHaveBeenCalled();
    expect(out.granted).toBe(false);
  });

  it("NEVER grants — it asks, and the server decides", async () => {
    const request = vi.fn(async () => ({ granted: false as const, reason: "not on the care team" }));
    const out = await requestBreakGlass(req, { request });
    expect(request).toHaveBeenCalledOnce();
    expect(out).toEqual({ granted: false, reason: "not on the care team" });
  });

  it("emits the attempt even when it was refused", async () => {
    // A refused attempt is exactly the event a reviewer wants to see.
    const events: DisclosureEvent[] = [];
    await requestBreakGlass(req, {
      request: async () => ({ granted: false, reason: "no" }),
      onDisclosure: (e) => events.push(e),
    });
    expect(events).toEqual([{ kind: "inspect", columnKeys: ["notes"], rowCount: 1, at: "09:12" }]);
  });
});

describe("bulk disclosure", () => {
  it("refuses export, print or copy when the policy says no", () => {
    const p = policy({ mayExport: () => false, mayCopy: () => false });
    expect(mayDisclose("export", p)).toMatchObject({ allowed: false });
    expect(mayDisclose("copy", p)).toMatchObject({ allowed: false });
    expect(mayDisclose("print", p)).toEqual({ allowed: true });
    const r = mayDisclose("export", p);
    if (!r.allowed) expect(r.reason).toBe("The disclosure policy does not permit export.");
  });
});
