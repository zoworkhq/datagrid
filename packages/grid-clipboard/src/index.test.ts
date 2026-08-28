import { describe, expect, it } from "vitest";
import type { ExportValue } from "@oxygenui-design/grid-core";
import {
  copyRange, emptyUndo, invert, planPaste, rangeSize, record, redo, shapeOfRange, undo,
} from "./index.js";

const ORDER = ["name", "mrn", "ward", "notes"];
const rows = [
  { name: "A. Okafor", mrn: "MRN-1", ward: "Ashgrove", notes: "stable" },
  { name: "=cmd|' /C calc'!A0", mrn: "MRN-2", ward: "Beeches", notes: "SECRET" },
];
const rowAt = (i: number) => rows[i];
const valueAt = (row: (typeof rows)[number], key: string): ExportValue =>
  key === "notes" && row.notes === "SECRET"
    ? { kind: "masked", reason: "42 CFR Part 2" }
    : { kind: "value", value: row[key as keyof typeof row] };

describe("range selection", () => {
  it("normalises a right-to-left drag to the same block", () => {
    // Otherwise a copy pastes mirrored.
    const ltr = shapeOfRange({ anchor: { rowIndex: 0, columnKey: "name" }, focus: { rowIndex: 1, columnKey: "ward" } }, ORDER);
    const rtl = shapeOfRange({ anchor: { rowIndex: 1, columnKey: "ward" }, focus: { rowIndex: 0, columnKey: "name" } }, ORDER);
    expect(ltr).toEqual(rtl);
    expect(ltr.columns).toEqual(["name", "mrn", "ward"]);
    expect(rangeSize(ltr)).toBe(6);
  });
  it("is empty for a column that does not exist", () => {
    expect(shapeOfRange({ anchor: { rowIndex: 0, columnKey: "nope" }, focus: { rowIndex: 0, columnKey: "name" } }, ORDER))
      .toEqual({ rows: [], columns: [] });
  });
});

describe("copy", () => {
  const shape = { rows: [0, 1], columns: ["name", "notes"] };

  it("copies a MASKED cell masked", () => {
    // The clipboard is an export. Every argument for masking a file applies to
    // the thing a user pastes into an email thirty seconds later.
    const out = copyRange({ shape, rowAt, valueAt });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.text).toContain("[withheld: 42 CFR Part 2]");
      expect(out.text).not.toContain("SECRET");
      expect(out.masked).toBe(1);
    }
  });

  it("neutralises a formula payload", () => {
    // A clipboard payload pasted into a spreadsheet executes exactly like a
    // CSV one, and the same patient-supplied name is on the other end.
    const out = copyRange({ shape, rowAt, valueAt });
    if (out.ok) {
      expect(out.text).toContain("'=cmd|");
      expect(out.text).not.toMatch(/(^|\t)=cmd/m);
    }
  });

  it("refuses when the policy says no", () => {
    const out = copyRange({ shape, rowAt, valueAt, mayCopy: () => false });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.phase).toBe("copy");
  });

  it("omits headers unless asked", () => {
    const bare = copyRange({ shape, rowAt, valueAt });
    const withHeaders = copyRange({ shape, rowAt, valueAt, headers: { name: "Patient", notes: "Note" } });
    if (bare.ok && withHeaders.ok) {
      expect(bare.text.split("\n")).toHaveLength(2);
      expect(withHeaders.text.split("\n")[0]).toBe("Patient\tNote");
    }
  });
});

describe("paste", () => {
  it("plans rather than performs, and reports overflow", () => {
    // A paste that silently overwrote forty cells is the failure the
    // spreadsheet metaphor invites.
    const plan = planPaste("a\tb\nc\td\ne\tf", { rows: [0, 1], columns: ["x", "y"] });
    expect(plan.fits).toBe(false);
    expect(plan.overflow).toBe(2);
    expect(plan.rows).toHaveLength(3);
  });
  it("fits when it fits", () => {
    expect(planPaste("a\tb", { rows: [0], columns: ["x", "y"] })).toMatchObject({ fits: true, overflow: 0 });
  });
});

describe("undo", () => {
  it("refuses to invert what it cannot cleanly invert", () => {
    // The grid does not un-send a write: it has no idea whether the server
    // honoured it.
    expect(invert({ type: "page/next", cursor: "x" }, {})).toBeNull();
    expect(invert({ type: "rows/upsert", rows: [] }, {})).toBeNull();
    expect(invert({ type: "column/visibility", key: "k", visible: false }, {}))
      .toEqual({ type: "column/visibility", key: "k", visible: true });
  });

  it("walks back and forward", () => {
    const entry = {
      action: { type: "column/visibility", key: "k", visible: false } as const,
      inverse: { type: "column/visibility", key: "k", visible: true } as const,
    };
    let s = record(emptyUndo(), entry);
    const back = undo(s);
    expect(back.action).toEqual(entry.inverse);
    const forward = redo(back.stack);
    expect(forward.action).toEqual(entry.action);
  });

  it("clears the redo future when a new action lands", () => {
    // Branching histories are how undo stops being predictable.
    const e = (v: boolean) => ({
      action: { type: "column/visibility", key: "k", visible: v } as const,
      inverse: { type: "column/visibility", key: "k", visible: !v } as const,
    });
    const back = undo(record(emptyUndo(), e(false)));
    expect(back.stack.future).toHaveLength(1);
    expect(record(back.stack, e(true)).future).toHaveLength(0);
  });

  it("is a no-op at either end", () => {
    expect(undo(emptyUndo()).action).toBeNull();
    expect(redo(emptyUndo()).action).toBeNull();
  });
});
