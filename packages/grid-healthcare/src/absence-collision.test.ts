/**
 * An absence is a closed set of eight reasons, not "any object with a reason".
 *
 * `isAbsent` was `"reason" in v`, and `reason` is not a rare word.
 * `Medication.reason` is why a drug is held or stopped — "patient safety",
 * "pre-procedure" — so a valid held medication tested TRUE. Its comparator then
 * returned `"incomparable"` for a row against itself, while the text reader,
 * which does not use the guard, printed the medication happily. Sort semantics
 * and read semantics disagreed about the same value, which is the worst kind of
 * disagreement because neither side looks wrong on its own.
 */
import { describe, expect, it } from "vitest";
import { ABSENCE_REASONS, describeAbsence, isAbsenceReason, type Absent } from "./absence.js";
import { isAbsent } from "./cell-contract.js";
import { medicationCell, labResultCell, clinicalAlertCell, documentationCell } from "./clinical-cells-2.js";
import { carePlanCell } from "./clinical-cells.js";

const held = {
  drug: "Enoxaparin", dose: "40 mg", route: "subcutaneous",
  frequency: "once daily", state: "held" as const, reason: "patient safety",
};

describe("clinical values with a free-text `reason` are not absences", () => {
  it("a held medication is a medication", () => {
    expect(isAbsent(held)).toBe(false);
  });

  it("…and compares with itself rather than refusing", () => {
    expect(medicationCell.compare(held, held)).toBe(0);
  });

  it("…and reads as the medication, which is what it always did", () => {
    const text = medicationCell.read(held);
    expect(text).toContain("Enoxaparin");
    expect(text).toContain("patient safety");
  });

  it("read and compare now agree, which was the actual defect", () => {
    // Previously: read printed the drug, compare called it incomparable.
    const readable = medicationCell.read(held);
    const comparable = medicationCell.compare(held, held) !== "incomparable";
    expect(readable.length).toBeGreaterThan(0);
    expect(comparable).toBe(true);
  });

  /** Every clinical type in the package that has a free-text field named like this. */
  it("no clinical value with an open text field is mistaken for an absence", () => {
    const values: unknown[] = [
      held,
      { drug: "Aspirin", dose: "75 mg", route: "oral", frequency: "od", state: "stopped", reason: "bleeding risk" },
      { what: "Pulmonary rehab", status: { state: "denied", reason: "not medically necessary" } },
      { what: "Sepsis criteria met", severity: "critical", raisedAt: "06:48" },
      { kind: "Discharge summary", state: "pending-signature" },
      { analyte: "Potassium", value: 5.9, unit: "mmol/L" },
    ];
    for (const v of values) expect(isAbsent(v as never), JSON.stringify(v).slice(0, 60)).toBe(false);
  });

  it("a care plan denied with a reason still sorts", () => {
    const denied = { what: "Rehab", status: { state: "denied" as const, reason: "not covered" } };
    expect(carePlanCell.compare(denied, denied)).not.toBe("incomparable");
  });
});

describe("every real absence is still recognised", () => {
  const EXAMPLES: readonly Absent[] = [
    { reason: "not-ordered" },
    { reason: "not-resulted", orderedAt: "07:12" },
    { reason: "not-measured" },
    { reason: "not-applicable", because: "under 18" },
    { reason: "declined", by: "patient" },
    { reason: "specimen-problem", detail: "haemolysed" },
    { reason: "withheld", policy: "42 CFR Part 2" },
    { reason: "source-unreachable", source: "Northside" },
  ];

  it("recognises all eight", () => {
    for (const a of EXAMPLES) expect(isAbsent(a), a.reason).toBe(true);
  });

  it("covers every reason in the type, with no example missing", () => {
    expect(EXAMPLES.map((a) => a.reason).sort()).toEqual([...ABSENCE_REASONS].sort());
  });

  it("every cell still renders every absence", () => {
    for (const cell of [medicationCell, labResultCell, clinicalAlertCell, documentationCell, carePlanCell]) {
      for (const a of EXAMPLES) {
        expect(cell.read(a as never), `${a.reason}`).toBe(describeAbsence(a));
      }
    }
  });
});

describe("the reason list and the type cannot drift apart", () => {
  it("every listed reason is describable", () => {
    // `describeAbsence` switches exhaustively over the TYPE. If a ninth reason
    // were added to the type and not to this list, the list would be short; if
    // it were added here and not to the type, this would not compile.
    for (const reason of ABSENCE_REASONS) expect(isAbsenceReason(reason)).toBe(true);
    expect(ABSENCE_REASONS).toHaveLength(8);
  });

  it("rejects a plausible impostor", () => {
    for (const v of ["not ordered", "NOT-ORDERED", "unknown", "", "withheld ", 42, null, undefined]) {
      expect(isAbsenceReason(v), String(v)).toBe(false);
    }
  });
});
