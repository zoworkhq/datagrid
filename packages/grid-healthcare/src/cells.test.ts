import { describe, expect, it } from "vitest";
import { assertPure, isAbsent, type CellHost } from "./cell-contract.js";
import {
  AWAITING_CLINICAL_REVIEW,
  chipOverflowCell,
  eligibilityCell,
  ledgerCell,
  maskedCell,
  planChips,
  resolutionCell,
} from "./cells.js";
import type { Absent } from "./absence.js";

const notOrdered: Absent = { reason: "not-ordered" };

describe("resolution — what is owed, by whom, by when", () => {
  const r = { what: "PHQ-9 due", owner: "J. Rahman", due: "2026-09-02" };
  it("reads the obligation, not the person", () => {
    expect(resolutionCell.read(r)).toBe("PHQ-9 due, J. Rahman, due 2026-09-02");
  });
  it("renders a typed absence rather than a blank", () => {
    expect(resolutionCell.read(notOrdered)).toBe("Not ordered");
  });
  it("refuses to order an obligation with no due date", () => {
    // Sorting it to the top would read as the most urgent.
    expect(resolutionCell.compare(r, notOrdered)).toBe("incomparable");
  });
  it("does not decide lateness itself", () => {
    expect(resolutionCell.read({ ...r, overdue: true })).toContain("overdue");
    expect(resolutionCell.read(r)).not.toContain("overdue");
  });
});

describe("chip overflow", () => {
  const set = { items: ["Diabetes", "Hypertension", "COPD", "CKD"] };
  it("shows two and counts the rest", () => {
    expect(planChips(set)).toMatchObject({ shown: ["Diabetes", "Hypertension"], remaining: 2 });
  });
  it("announces the remainder in full, not as a number", () => {
    // "+2" tells a screen-reader user there is something they cannot reach.
    expect(chipOverflowCell.read(set)).toBe("Diabetes, Hypertension, and 2 more, COPD, CKD");
  });
  it("exports the WHOLE list, never the truncated view", () => {
    // A file that silently drops two diagnoses is worse than a wide column.
    expect(chipOverflowCell.toExport(set)).toEqual({
      kind: "value",
      value: "Diabetes; Hypertension; COPD; CKD",
    });
  });
});

describe("masked region", () => {
  const m = { reason: "42 CFR Part 2", legalBasis: "42 CFR §2.31", span: 3 };
  it("states the reason and the legal basis", () => {
    expect(maskedCell.read(m)).toBe("Withheld — 42 CFR Part 2 (42 CFR §2.31)");
  });
  it("declares mask state BEFORE the writer asks for a value", () => {
    // So a mask cannot be defeated by a writer that forgets to check the
    // returned variant.
    expect(maskedCell.maskState(m)).toMatchObject({ masked: true, reason: "42 CFR Part 2" });
    expect(maskedCell.toExport(m)).toEqual({ kind: "masked", reason: "42 CFR Part 2" });
  });
  it("cannot be ordered — you cannot sort what you cannot see", () => {
    expect(maskedCell.compare(m, m)).toBe("incomparable");
  });
  it("is focusable only when break-glass is offered", () => {
    expect(maskedCell.focusable(m)).toBe(false);
    expect(maskedCell.focusable({ ...m, breakGlass: true })).toBe(true);
  });
});

describe("eligibility", () => {
  const asOf = { at: "09:12" };
  it("separates unreachable from not-covered", () => {
    // The difference is a bill sent to the wrong payer.
    expect(eligibilityCell.read({ state: "unreachable", payer: "Northside", asOf })).toBe(
      "Northside could not be reached, as of 09:12",
    );
    expect(eligibilityCell.read({ state: "not-covered", plan: "Plan A", asOf })).toContain("Not covered");
  });
  it("reports staleness only when the application says so", () => {
    expect(eligibilityCell.read({ state: "stale", plan: "Plan A", asOf })).toContain("may be out of date");
    expect(eligibilityCell.read({ state: "verified", plan: "Plan A", asOf: { at: "09:12", stale: true } }))
      .toContain("stale");
  });
});

describe("ledger", () => {
  it("distinguishes an unknown balance from zero", () => {
    // An authorisation whose balance the payer did not return is not an
    // authorisation with no units left.
    expect(ledgerCell.read({ unitsRemaining: "unknown" })).toContain("units remaining unknown");
    expect(ledgerCell.read({ unitsRemaining: 0 })).toContain("0 units remaining");
  });
  it("refuses to order an unknown balance against a known one", () => {
    expect(ledgerCell.compare({ unitsRemaining: "unknown" }, { unitsRemaining: 4 })).toBe("incomparable");
    expect(ledgerCell.compare({ unitsRemaining: 2 }, { unitsRemaining: 4 })).toBe(-2);
  });
  it("leads with a denial when there is one", () => {
    expect(ledgerCell.read({ unitsRemaining: 6, denialReason: "not medically necessary" })).toBe(
      "Denied — not medically necessary",
    );
  });
});

describe("ADR 0008 — a cell renders a state, it never derives one", () => {
  const samples: [CellHost<never>, unknown[]][] = [
    [resolutionCell as CellHost<never>, [{ what: "x", owner: "y", due: "2026-01-01" }, notOrdered]],
    [chipOverflowCell as CellHost<never>, [{ items: ["a", "b", "c"] }, notOrdered]],
    [maskedCell as CellHost<never>, [{ reason: "Part 2" }]],
    [eligibilityCell as CellHost<never>, [{ state: "verified", plan: "P", asOf: { at: "09:12" } }, notOrdered]],
    [ledgerCell as CellHost<never>, [{ unitsRemaining: 3 }, notOrdered]],
  ];

  it("every shipped cell is a pure function of its input", () => {
    // A cell that starts deriving clinical state usually starts by reading a
    // clock or applying a threshold, and both make it impure.
    for (const [host, values] of samples) {
      const out = assertPure(host, values as never[]);
      expect(out.impure, JSON.stringify(out.impure)).toEqual([]);
      expect(out.pure).toBe(true);
    }
  });

  it("names the cell it is not shipping, rather than omitting it quietly", () => {
    expect(AWAITING_CLINICAL_REVIEW.doseCell).toContain("GridDoseCell is not implemented");
    expect(AWAITING_CLINICAL_REVIEW.doseCell).toContain("clinician reviewer");
  });

  it("every cell accepts a typed absence", () => {
    for (const host of [resolutionCell, chipOverflowCell, eligibilityCell, ledgerCell]) {
      expect(host.read(notOrdered as never)).toBe("Not ordered");
      expect(isAbsent(notOrdered)).toBe(true);
    }
  });
});
