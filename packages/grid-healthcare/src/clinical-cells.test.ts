/**
 * The clinical cell catalogue, phase two.
 *
 * Every test here is about a distinction that is easy to collapse and
 * dangerous to collapse — not about rendering. The rule under all of them is
 * ADR 0008: a cell renders a state the application supplies, it never derives
 * one.
 */
import { describe, expect, it } from "vitest";
import {
  allergyCell, carePlanCell, codedTermCell, riskScoreCell, vitalsTrendCell,
  CLINICAL_CELLS,
  type AllergyStatus, type CarePlanEntry, type CodedTerm, type RiskScore, type VitalsTrend,
} from "./clinical-cells.js";
import { assertPure } from "./cell-contract.js";
import type { Absent } from "./absence.js";

const NOT_ASKED: Absent = { reason: "not-ordered" };

describe("coded terms", () => {
  const icd: CodedTerm = { system: "ICD-10", code: "E11.9", display: "Type 2 diabetes" };

  it("always carries the code, never the display alone", () => {
    // A display cached from an old code set against a revised code is a
    // mismatch nobody notices, because the display is the part people read.
    expect(codedTermCell.read(icd)).toContain("E11.9");
    expect(codedTermCell.toExport(icd)).toEqual({
      kind: "value", value: "ICD-10 E11.9 — Type 2 diabetes",
    });
  });

  it("names the system, because a code without one is not an identifier", () => {
    // "E11.9" means diabetes in ICD-10 and something else elsewhere.
    expect(codedTermCell.read(icd)).toContain("ICD-10");
  });

  it("clips the display and never the code", () => {
    const long: CodedTerm = { ...icd, display: "A very long clinical description indeed" };
    const out = codedTermCell.truncate(long, 140);
    expect(out.truncated).toBe(true);
    // A truncated code is a DIFFERENT code, and it looks like a real one.
    expect(out.text).toContain("E11.9");
  });

  it("refuses to order codes from different systems", () => {
    const cpt: CodedTerm = { system: "CPT", code: "99213", display: "Office visit" };
    expect(codedTermCell.compare(icd, cpt)).toBe("incomparable");
  });

  it("refuses to order a code against an absence", () => {
    expect(codedTermCell.compare(icd, NOT_ASKED)).toBe("incomparable");
  });
});

describe("allergies — the three-state question", () => {
  const none: AllergyStatus = { known: "none" };
  const some: AllergyStatus = {
    known: "some",
    entries: [{ substance: "Penicillin", severity: "severe", reaction: "anaphylaxis" }],
  };

  it("distinguishes 'no known allergies' from 'nobody asked'", () => {
    // THE distinction this cell exists for. One is a cleared checklist; the
    // other is an open question in front of a prescription.
    expect(allergyCell.read(none)).toBe("No known allergies");
    expect(allergyCell.read(NOT_ASKED)).not.toBe("No known allergies");
    expect(allergyCell.read(NOT_ASKED)).not.toBe("");
  });

  it("refuses to order an unasked history against a cleared one", () => {
    // Sorting "not asked" among "none" is how an open question disappears.
    expect(allergyCell.compare(none, NOT_ASKED)).toBe("incomparable");
  });

  it("ranks by the SOURCE's severity, not by reading the reaction text", () => {
    const mild: AllergyStatus = {
      known: "some",
      // The reaction says anaphylaxis; the source says mild. The cell does not
      // second-guess the terminology it was given.
      entries: [{ substance: "X", severity: "mild", reaction: "anaphylaxis" }],
    };
    expect(allergyCell.compare(some, mild)).toBeGreaterThan(0);
  });

  it("sorts a cleared history below any recorded allergy", () => {
    expect(allergyCell.compare(none, some)).toBeLessThan(0);
  });

  it("takes focus only when there is something to enter", () => {
    expect(allergyCell.focusable(some)).toBe(true);
    expect(allergyCell.focusable(none)).toBe(false);
  });
});

describe("vitals trends", () => {
  const bp: VitalsTrend = {
    label: "Systolic", unit: "mmHg", points: [118, 124, 131], band: { low: 90, high: 120 },
  };

  it("says when it was given no reference range", () => {
    // A sparkline with no reference is a shape, not a finding.
    const noBand: VitalsTrend = { ...bp, band: undefined };
    expect(vitalsTrendCell.read(noBand)).toContain("no reference range supplied");
    expect(vitalsTrendCell.read(bp)).toContain("reference 90 to 120");
  });

  it("describes direction as arithmetic, never as a judgement", () => {
    // "Rising" is a fact about the numbers. Whether rising is BAD is clinical,
    // and this cell does not say.
    expect(vitalsTrendCell.read(bp)).toContain("rising");
    expect(vitalsTrendCell.read({ ...bp, points: [131, 124, 118] })).toContain("falling");
    expect(vitalsTrendCell.read({ ...bp, points: [120, 120] })).toContain("level");
  });

  it("says so when there are no readings, rather than rendering empty", () => {
    expect(vitalsTrendCell.read({ ...bp, points: [] })).toContain("no readings");
  });

  it("refuses to order different units", () => {
    const temp: VitalsTrend = { label: "Temp", unit: "°C", points: [37.1] };
    expect(vitalsTrendCell.compare(bp, temp)).toBe("incomparable");
  });

  it("refuses to order an empty series against a populated one", () => {
    expect(vitalsTrendCell.compare(bp, { ...bp, points: [] })).toBe("incomparable");
  });

  it("exports the latest value as a NUMBER a spreadsheet can compute with", () => {
    expect(vitalsTrendCell.toExport(bp)).toEqual({ kind: "value", value: 131 });
  });
});

describe("risk scores", () => {
  const risk: RiskScore = {
    value: 8, scale: "0-10 deterioration",
    model: { name: "RiskNet", version: "3.4", validatedOn: "adult inpatients, 2019–2023" },
    confidence: 0.82,
  };

  it("carries the model, its version and the population it was validated on", () => {
    // A score with no provenance has the authority of a measurement and none
    // of the basis.
    const text = riskScoreCell.read(risk);
    expect(text).toContain("RiskNet");
    expect(text).toContain("3.4");
    expect(text).toContain("adult inpatients");
  });

  it("keeps the model on the exported value", () => {
    // A bare number in a spreadsheet is indistinguishable from something
    // somebody measured.
    expect(riskScoreCell.toExport(risk)).toEqual({
      kind: "value", value: "8 (RiskNet 3.4)",
    });
  });

  it("refuses to order scores from different models or scales", () => {
    const other: RiskScore = { ...risk, model: { ...risk.model, name: "OtherNet" } };
    expect(riskScoreCell.compare(risk, other)).toBe("incomparable");
    expect(riskScoreCell.compare(risk, { ...risk, scale: "0-100" })).toBe("incomparable");
  });

  it("orders two scores from the same model", () => {
    expect(riskScoreCell.compare(risk, { ...risk, value: 3 })).toBeGreaterThan(0);
  });

  it("treats a missing confidence as normal, not as an error", () => {
    const bare: RiskScore = { ...risk, confidence: undefined };
    expect(() => riskScoreCell.read(bare)).not.toThrow();
    expect(riskScoreCell.read(bare)).not.toContain("confidence");
  });
});

describe("care plans and authorisations", () => {
  const denied: CarePlanEntry = {
    what: "MRI lumbar spine",
    status: { state: "denied", reason: "not medically necessary", appealBy: "2026-09-15" },
  };

  it("carries the reason on a denial", () => {
    // A denial with no reason cannot be appealed, and an unappealable denial
    // in a grid is a dead end for a real person.
    const text = carePlanCell.read(denied);
    expect(text).toContain("not medically necessary");
    expect(text).toContain("appeal by 2026-09-15");
  });

  it("takes lateness from the application rather than reading a clock", () => {
    const pending: CarePlanEntry = {
      what: "Prior auth", status: { state: "pending", submitted: "2026-08-01" },
    };
    expect(carePlanCell.read(pending)).not.toContain("overdue");
    expect(
      carePlanCell.read({ ...pending, status: { state: "pending", submitted: "2026-08-01", overdue: true } }),
    ).toContain("overdue");
  });

  it("sorts the states that need action first", () => {
    const active: CarePlanEntry = { what: "Plan", status: { state: "active" } };
    expect(carePlanCell.compare(denied, active)).toBeLessThan(0);
  });
});

describe("every cell in the catalogue", () => {
  const entries = Object.entries(CLINICAL_CELLS);

  it.each(entries)("%s answers all eight obligations", (_name, cell) => {
    for (const method of [
      "measure", "truncate", "focusable", "read", "compare", "toExport", "toPrint", "maskState",
    ]) {
      expect(typeof (cell as unknown as Record<string, unknown>)[method]).toBe("function");
    }
  });

  it.each(entries)("%s renders an absence as its reason, never as blank", (_name, cell) => {
    // The single rule that makes "a blank cell is indistinguishable from a
    // rendering bug" impossible to express in this package.
    const text = (cell as { read(v: unknown): string }).read(NOT_ASKED);
    expect(text.length).toBeGreaterThan(0);
    expect(text.trim()).not.toBe("");
  });

  it.each(entries)("%s refuses to order anything against an absence", (_name, cell) => {
    const compare = (cell as { compare(a: unknown, b: unknown): number | "incomparable" }).compare;
    expect(compare(NOT_ASKED, NOT_ASKED)).toBe("incomparable");
  });

  /** A well-formed value per cell, carrying hostile text in its free fields. */
  const HOSTILE: Record<string, unknown> = {
    codedTerm: { system: "ICD-10", code: "E11.9", display: '<img src=x onerror="alert(1)">' },
    allergy: { known: "some", entries: [{ substance: "<script>", severity: "mild" }] },
    vitalsTrend: { label: "<b>BP</b>", unit: "mmHg", points: [120] },
    riskScore: {
      value: 1, scale: "<i>x</i>",
      model: { name: "<script>", version: "1", validatedOn: "<b>" },
    },
    carePlan: { what: "<img onerror=x>", status: { state: "active" } },
  };

  it.each(entries)("%s returns hostile input as text, not as markup", (name, cell) => {
    // Cells return TEXT. The renderer writes it with `textContent`, and a cell
    // that built markup instead would defeat that one layer up — the same
    // defect the export writers neutralise on the way out.
    const value = HOSTILE[name];
    const text = (cell as { read(v: unknown): string }).read(value);
    expect(typeof text).toBe("string");
    expect(text).toContain("<");      // it survived verbatim…
    expect(text).not.toContain(">>");  // …and was not assembled into anything
  });

  it.each(entries)("%s is PURE — same input, same output", (name, cell) => {
    // The harness ADR 0008 is enforced by. A cell that starts deriving clinical
    // state usually starts by reading a clock or applying a threshold, and both
    // make it impure. Run twice over the same value; any difference is a
    // dependency on something outside the value.
    const samples = [HOSTILE[name], NOT_ASKED];
    const out = assertPure(cell as never, samples as never[]);
    expect(out.impure).toEqual([]);
    expect(out.pure).toBe(true);
  });
});
