/**
 * The clinical cell catalogue, phase three.
 *
 * Every cell here had an obvious shortcut — compare the value to the range and
 * colour it red, compare the due date to now and mark it late, read the
 * severity out of the reaction text. Each shortcut is a clinical judgement
 * made once, in a library, for every deployment at once. These tests are
 * mostly about the shortcuts NOT being taken.
 */
import { describe, expect, it } from "vitest";
import {
  aiSummaryCell, appointmentCell, assessmentCell, careTeamCell, clinicalAlertCell,
  documentationCell, labResultCell, medicationCell, CLINICAL_CELLS_2,
  type AiSummary, type Appointment, type Assessment, type CareTeam,
  type ClinicalAlert, type Documentation, type LabResult, type Medication,
} from "./clinical-cells-2.js";
import { assertPure } from "./cell-contract.js";
import type { Absent } from "./absence.js";

const NOT_ASKED: Absent = { reason: "not-ordered" };

describe("lab results", () => {
  const k: LabResult = { analyte: "Potassium", value: 5.4, unit: "mmol/L",
    range: { low: 3.5, high: 5.1 }, interpretation: "high" };

  it("takes the interpretation from the source, never from the range", () => {
    // 5.4 is unremarkable on dialysis and an emergency in a marathon runner.
    // A range depends on age, sex, pregnancy, assay and site.
    const noFlag: LabResult = { ...k, interpretation: undefined };
    expect(labResultCell.read(k)).toContain("high");
    expect(labResultCell.read(noFlag)).not.toContain("high");
  });

  it("says when it was given no reference range", () => {
    expect(labResultCell.read({ ...k, range: undefined })).toContain("no reference range");
  });

  it("refuses to order different analytes or units", () => {
    expect(labResultCell.compare(k, { ...k, analyte: "Sodium" })).toBe("incomparable");
    expect(labResultCell.compare(k, { ...k, unit: "mEq/L" })).toBe("incomparable");
  });

  it("exports a number a spreadsheet can compute with", () => {
    expect(labResultCell.toExport(k)).toEqual({ kind: "value", value: 5.4 });
  });
});

describe("medications", () => {
  it("keeps held, stopped and never-prescribed distinct", () => {
    // All three look like "no dose today" on a chart, and they are three
    // different clinical situations.
    const base: Medication = { drug: "Warfarin", dose: "5mg", route: "PO",
      frequency: "daily", state: "active" };
    expect(medicationCell.read({ ...base, state: "held", reason: "pre-op" }))
      .toContain("held");
    expect(medicationCell.read({ ...base, state: "stopped" })).toContain("stopped");
    expect(medicationCell.read(NOT_ASKED)).not.toContain("held");
  });

  it("carries the reason a medication is not running", () => {
    const held: Medication = { drug: "Warfarin", dose: "5mg", route: "PO",
      frequency: "daily", state: "held", reason: "pre-op" };
    // A state with no reason cannot be questioned.
    expect(medicationCell.read(held)).toContain("pre-op");
  });
});

describe("appointments", () => {
  const base: Appointment = { at: "09:00", kind: "Follow-up", state: "scheduled" };

  it("keeps no-show and cancelled distinct", () => {
    // A cancellation freed the slot; a no-show did not. Collapsing them loses
    // the thing a scheduling team is looking at.
    expect(appointmentCell.read({ ...base, state: "no-show" })).toContain("no-show");
    expect(appointmentCell.read({ ...base, state: "cancelled" })).toContain("cancelled");
    expect(appointmentCell.compare({ ...base, state: "no-show" }, { ...base, state: "cancelled" }))
      .not.toBe(0);
  });

  it("sorts by what needs attention now", () => {
    expect(appointmentCell.compare({ ...base, state: "in-progress" }, { ...base, state: "completed" }))
      .toBeLessThan(0);
  });
});

describe("the care team", () => {
  it("does not invent a primary when the source named none", () => {
    // "Who do I call" is the question this answers, and picking the first
    // entry answers it wrongly with total confidence.
    const team: CareTeam = { members: [{ name: "A", role: "RN" }, { name: "B", role: "MD" }] };
    expect(careTeamCell.read(team)).toContain("no primary designated");
    expect(careTeamCell.read(team)).not.toContain("A (RN), primary");
  });

  it("leads with the primary when there is one", () => {
    const team: CareTeam = {
      members: [{ name: "A", role: "RN" }, { name: "B", role: "MD", primary: true }],
    };
    expect(careTeamCell.read(team)).toContain("B (MD), primary");
    expect(careTeamCell.read(team)).toContain("+1 more");
  });

  it("says so when there is no team recorded", () => {
    expect(careTeamCell.read({ members: [] })).toBe("No care team recorded");
  });
});

describe("clinical alerts", () => {
  const alert: ClinicalAlert = { what: "Sepsis criteria met", severity: "critical", raisedAt: "08:12" };

  it("states loudly when nobody has acknowledged it", () => {
    expect(clinicalAlertCell.read(alert)).toContain("NOT acknowledged");
  });

  it("names who acknowledged it and when", () => {
    // An alert acknowledged by nobody in particular is an alert nobody is
    // accountable for, which is how alert fatigue kills people.
    const acked: ClinicalAlert = { ...alert, acknowledged: { by: "Dr Okafor", at: "08:15" } };
    expect(clinicalAlertCell.read(acked)).toContain("Dr Okafor");
    expect(clinicalAlertCell.read(acked)).toContain("08:15");
  });

  it("sorts unacknowledged before acknowledged at equal severity", () => {
    const acked: ClinicalAlert = { ...alert, acknowledged: { by: "X", at: "08:15" } };
    expect(clinicalAlertCell.compare(alert, acked)).toBeLessThan(0);
  });

  it("sorts critical above warning above info", () => {
    expect(clinicalAlertCell.compare(alert, { ...alert, severity: "warning" })).toBeLessThan(0);
    expect(clinicalAlertCell.compare({ ...alert, severity: "warning" }, { ...alert, severity: "info" }))
      .toBeLessThan(0);
  });
});

describe("documentation", () => {
  it("takes lateness from the application rather than a clock", () => {
    const doc: Documentation = { kind: "Progress note", state: "draft" };
    expect(documentationCell.read(doc)).not.toContain("overdue");
    expect(documentationCell.read({ ...doc, overdue: true })).toContain("overdue");
  });

  it("sorts unstarted work first and signed work last", () => {
    const a: Documentation = { kind: "N", state: "not-started" };
    const b: Documentation = { kind: "N", state: "signed" };
    expect(documentationCell.compare(a, b)).toBeLessThan(0);
  });
});

describe("behavioural-health assessments", () => {
  const phq: Assessment = { instrument: "PHQ-9", score: 15, administeredAt: "2026-08-01",
    severity: "moderately severe" };

  it("refuses to rank scores from different instruments", () => {
    // 15 is moderate depression on the PHQ-9 and severe anxiety on the GAD-7.
    const gad: Assessment = { ...phq, instrument: "GAD-7" };
    expect(assessmentCell.compare(phq, gad)).toBe("incomparable");
  });

  it("uses the instrument's own banding, supplied", () => {
    expect(assessmentCell.read(phq)).toContain("moderately severe");
    expect(assessmentCell.read({ ...phq, severity: undefined })).not.toContain("moderately");
  });

  it("describes a change only when the source computed one", () => {
    expect(assessmentCell.read(phq)).not.toContain("up");
    expect(assessmentCell.read({ ...phq, change: 4 })).toContain("up 4");
    expect(assessmentCell.read({ ...phq, change: -3 })).toContain("down 3");
  });
});

describe("AI summaries — the one that refuses to export", () => {
  const draft: AiSummary = {
    text: "Patient reports improved sleep.",
    model: { name: "SummaryNet", version: "2.1" },
    generatedAt: "09:00",
  };

  it("masks an unreviewed summary rather than exporting it", () => {
    // Unreviewed model text in a CSV arrives looking exactly like a
    // clinician's note, and there is no way back from that.
    expect(aiSummaryCell.maskState(draft)).toMatchObject({ masked: true });
    expect(aiSummaryCell.toExport(draft)).toMatchObject({ kind: "masked" });
    expect(JSON.stringify(aiSummaryCell.toExport(draft))).not.toContain("improved sleep");
  });

  it("exports once a person has reviewed it", () => {
    const reviewed: AiSummary = { ...draft, reviewedBy: "Dr Okafor" };
    expect(aiSummaryCell.maskState(reviewed)).toMatchObject({ masked: false });
    expect(aiSummaryCell.toExport(reviewed)).toEqual({
      kind: "value", value: "Patient reports improved sleep.",
    });
  });

  it("says on screen that it has not been reviewed", () => {
    expect(aiSummaryCell.read(draft)).toContain("NOT reviewed");
    expect(aiSummaryCell.read(draft)).toContain("SummaryNet");
  });

  it("refuses to sort by generated prose", () => {
    // Sorting by a summary ranks patients by a model's writing.
    expect(aiSummaryCell.compare(draft, { ...draft, text: "z" })).toBe("incomparable");
  });
});

describe("every cell in phase three", () => {
  const entries = Object.entries(CLINICAL_CELLS_2);
  const SAMPLE: Record<string, unknown> = {
    labResult: { analyte: "K", value: 1, unit: "mmol/L" },
    medication: { drug: "D", dose: "1mg", route: "PO", frequency: "daily", state: "active" },
    appointment: { at: "09:00", kind: "F", state: "scheduled" },
    careTeam: { members: [{ name: "A", role: "RN" }] },
    clinicalAlert: { what: "W", severity: "info", raisedAt: "08:00" },
    documentation: { kind: "N", state: "draft" },
    assessment: { instrument: "PHQ-9", score: 1, administeredAt: "2026-08-01" },
    aiSummary: { text: "T", model: { name: "M", version: "1" }, generatedAt: "09:00" },
  };

  it.each(entries)("%s answers all eight obligations", (_n, cell) => {
    for (const m of ["measure", "truncate", "focusable", "read", "compare", "toExport", "toPrint", "maskState"]) {
      expect(typeof (cell as unknown as Record<string, unknown>)[m]).toBe("function");
    }
  });

  it.each(entries)("%s renders an absence as its reason, never as blank", (_n, cell) => {
    const text = (cell as { read(v: unknown): string }).read(NOT_ASKED);
    expect(text.trim().length).toBeGreaterThan(0);
  });

  it.each(entries)("%s refuses to order against an absence", (_n, cell) => {
    expect((cell as { compare(a: unknown, b: unknown): unknown }).compare(NOT_ASKED, NOT_ASKED))
      .toBe("incomparable");
  });

  it.each(entries)("%s is PURE — same input, same output", (name, cell) => {
    // A cell that starts deriving clinical state usually starts by reading a
    // clock or applying a threshold, and both make it impure.
    const out = assertPure(cell as never, [SAMPLE[name], NOT_ASKED] as never[]);
    expect(out.impure).toEqual([]);
  });

  it.each(entries)("%s truncates without losing the whole answer", (name, cell) => {
    const out = (cell as { truncate(v: unknown, w: number): { text: string } }).truncate(SAMPLE[name], 120);
    expect(out.text.length).toBeGreaterThan(0);
  });
});
