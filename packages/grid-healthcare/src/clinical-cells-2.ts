/**
 * The clinical cell catalogue, phase three.
 *
 * Eight more, taking the set to eighteen. Same rule as the first ten and for
 * the same reason: **a cell renders a state the application supplies, it never
 * derives one** (ADR 0008). Nothing here reads a clock, applies a threshold, or
 * decides that a value is abnormal.
 *
 * That constraint is what makes this catalogue slow to grow and worth having.
 * Every cell below had an obvious shortcut — compare the value to the range and
 * colour it red, compare the due date to now and mark it late, read the
 * severity out of the reaction text — and each of those shortcuts is a clinical
 * judgement made once, in a library, for every deployment at once.
 */
import {
  VISIBLE, isAbsent,
  type CellHost, type CellValue, type MaskState,
} from "./cell-contract.js";
import { describeAbsence } from "./absence.js";

const width = (text: string): number => Math.ceil(text.length * 7.2) + 16;

const absentParts = <T>(v: CellValue<T>): { text: string } | null =>
  isAbsent(v) ? { text: describeAbsence(v) } : null;

const truncateAt = (text: string, available: number): { text: string; truncated: boolean } => {
  const fits = Math.max(0, Math.floor((available - 16) / 7.2));
  return text.length <= fits
    ? { text, truncated: false }
    : { text: `${text.slice(0, Math.max(0, fits - 1))}…`, truncated: true };
};

/** The eight obligations, for a cell whose whole answer is one sentence. */
function textHost<T>(
  read: (value: T) => string,
  extra: Partial<CellHost<CellValue<T>>> = {},
): CellHost<CellValue<T>> {
  const host: CellHost<CellValue<T>> = {
    measure: (v) => ({ intrinsic: width(host.read(v)), growable: true }),
    truncate: (v, available) => truncateAt(host.read(v), available),
    focusable: () => false,
    read: (v) => absentParts(v)?.text ?? read(v as T),
    compare: (a, b) =>
      isAbsent(a) || isAbsent(b) ? "incomparable" : host.read(a).localeCompare(host.read(b)),
    toExport: (v) => ({ kind: "value", value: host.read(v) }),
    toPrint: (v) => host.toExport(v),
    maskState: () => VISIBLE,
    ...extra,
  };
  return host;
}

// ── 11 · a lab result against its reference range ───────────────────────────

/**
 * ── THE SHORTCUT THIS CELL REFUSES ──────────────────────────────────────────
 *
 * Comparing `value` to `range` and calling the result abnormal is two lines,
 * and it is wrong. A potassium of 5.4 is unremarkable on dialysis and an
 * emergency in a marathon runner; a reference range depends on age, sex,
 * pregnancy, assay and site. `interpretation` is therefore supplied by the
 * source — usually as an HL7 abnormal flag, which the lab produced with
 * knowledge this cell does not have.
 *
 * The range still travels, because a number without one is not readable.
 */
export interface LabResult {
  readonly analyte: string;
  readonly value: number;
  readonly unit: string;
  /** The SOURCE's range for THIS patient, when it has one. */
  readonly range?: { readonly low: number; readonly high: number };
  /** The SOURCE's interpretation. Never computed from `value` and `range`. */
  readonly interpretation?: "normal" | "low" | "high" | "critical-low" | "critical-high";
  readonly collectedAt?: string;
}

export const labResultCell: CellHost<CellValue<LabResult>> = {
  ...textHost<LabResult>((r) => {
    const range = r.range ? `, reference ${r.range.low}–${r.range.high}` : ", no reference range";
    const flag = r.interpretation ? `, ${r.interpretation}` : "";
    const when = r.collectedAt ? `, collected ${r.collectedAt}` : "";
    return `${r.analyte} ${r.value} ${r.unit}${range}${flag}${when}`;
  }),
  focusable: () => true,
  compare: (a, b) => {
    if (isAbsent(a) || isAbsent(b)) return "incomparable";
    const x = a as LabResult;
    const y = b as LabResult;
    // Two analytes are not on one scale, and neither are two units.
    if (x.analyte !== y.analyte || x.unit !== y.unit) return "incomparable";
    return x.value - y.value;
  },
  // A NUMBER, so a spreadsheet can compute with it. The unit belongs in the
  // column header, where it is stated once instead of per row.
  toExport: (v) =>
    isAbsent(v)
      ? { kind: "value", value: describeAbsence(v) }
      : { kind: "value", value: (v as LabResult).value },
};

// ── 12 · a medication order ─────────────────────────────────────────────────

/**
 * Drug, dose, route, frequency — and whether it is actually running.
 *
 * `held` is its own state rather than an absence: a held medication is
 * prescribed and deliberately not being given, which is different from one
 * that was never prescribed and different again from one that was stopped. All
 * three look like "no dose today" on a chart.
 */
export interface Medication {
  readonly drug: string;
  readonly dose: string;
  readonly route: string;
  readonly frequency: string;
  readonly state: "active" | "held" | "stopped" | "completed";
  /** Why it is held or stopped. A state with no reason cannot be questioned. */
  readonly reason?: string;
}

export const medicationCell: CellHost<CellValue<Medication>> = {
  ...textHost<Medication>((m) => {
    const reason = m.reason ? ` — ${m.reason}` : "";
    return `${m.drug} ${m.dose} ${m.route} ${m.frequency}, ${m.state}${reason}`;
  }),
  focusable: () => true,
  compare: (a, b) =>
    isAbsent(a) || isAbsent(b)
      ? "incomparable"
      : (a as Medication).drug.localeCompare((b as Medication).drug),
};

// ── 13 · an appointment ─────────────────────────────────────────────────────

/**
 * `noShow` and `cancelled` are distinct states, deliberately.
 *
 * Collapsing them loses the thing a scheduling team is actually looking at: a
 * cancellation freed the slot, a no-show did not.
 */
export interface Appointment {
  readonly at: string;
  readonly kind: string;
  readonly state: "scheduled" | "arrived" | "in-progress" | "completed" | "cancelled" | "no-show";
  readonly location?: string;
  readonly provider?: string;
}

const APPOINTMENT_RANK: Record<string, number> = {
  "in-progress": 0, arrived: 1, scheduled: 2, "no-show": 3, cancelled: 4, completed: 5,
};

export const appointmentCell: CellHost<CellValue<Appointment>> = {
  ...textHost<Appointment>((a) => {
    const where = a.location ? `, ${a.location}` : "";
    const who = a.provider ? `, ${a.provider}` : "";
    return `${a.at}, ${a.kind}, ${a.state}${where}${who}`;
  }),
  focusable: () => true,
  compare: (a, b) => {
    if (isAbsent(a) || isAbsent(b)) return "incomparable";
    // By state first — a clinic list is read by what needs attention now.
    const byState =
      (APPOINTMENT_RANK[(a as Appointment).state] ?? 9) -
      (APPOINTMENT_RANK[(b as Appointment).state] ?? 9);
    return byState !== 0 ? byState : (a as Appointment).at.localeCompare((b as Appointment).at);
  },
};

// ── 14 · the care team ──────────────────────────────────────────────────────

/**
 * People and their roles, with the responsible one marked.
 *
 * "Who do I call" is the question this answers, and a list with no primary
 * marked does not answer it. When the source names none, the cell says the
 * source named none rather than picking the first.
 */
export interface CareTeam {
  readonly members: readonly {
    readonly name: string;
    readonly role: string;
    /** The SOURCE's designation. Never the first entry by default. */
    readonly primary?: boolean;
  }[];
}

export const careTeamCell: CellHost<CellValue<CareTeam>> = {
  ...textHost<CareTeam>((t) => {
    if (t.members.length === 0) return "No care team recorded";
    const primary = t.members.find((m) => m.primary);
    const rest = t.members.filter((m) => !m.primary).length;
    if (!primary) {
      return `${t.members.length} members, no primary designated`;
    }
    return `${primary.name} (${primary.role}), primary${rest > 0 ? `, +${rest} more` : ""}`;
  }),
  focusable: (v) => !isAbsent(v) && (v as CareTeam).members.length > 0,
  compare: (a, b) =>
    isAbsent(a) || isAbsent(b)
      ? "incomparable"
      : (a as CareTeam).members.length - (b as CareTeam).members.length,
};

// ── 15 · a clinical alert ───────────────────────────────────────────────────

/**
 * An alert, and whether anybody has actually looked at it.
 *
 * `acknowledged` carries WHO and WHEN. An alert acknowledged by nobody in
 * particular is an alert nobody is accountable for, and alert fatigue is
 * exactly the failure that produces.
 */
export interface ClinicalAlert {
  readonly what: string;
  /** The SOURCE's severity. This cell does not rank the text. */
  readonly severity: "info" | "warning" | "critical";
  readonly raisedAt: string;
  readonly acknowledged?: { readonly by: string; readonly at: string };
}

const ALERT_RANK: Record<string, number> = { critical: 0, warning: 1, info: 2 };

export const clinicalAlertCell: CellHost<CellValue<ClinicalAlert>> = {
  ...textHost<ClinicalAlert>((a) => {
    const ack = a.acknowledged
      ? `, acknowledged by ${a.acknowledged.by} at ${a.acknowledged.at}`
      : ", NOT acknowledged";
    return `${a.severity}: ${a.what}, raised ${a.raisedAt}${ack}`;
  }),
  focusable: () => true,
  compare: (a, b) => {
    if (isAbsent(a) || isAbsent(b)) return "incomparable";
    const x = a as ClinicalAlert;
    const y = b as ClinicalAlert;
    const bySeverity = (ALERT_RANK[x.severity] ?? 9) - (ALERT_RANK[y.severity] ?? 9);
    if (bySeverity !== 0) return bySeverity;
    // Unacknowledged before acknowledged, at equal severity.
    const ackDiff = Number(Boolean(x.acknowledged)) - Number(Boolean(y.acknowledged));
    return ackDiff !== 0 ? ackDiff : x.raisedAt.localeCompare(y.raisedAt);
  },
};

// ── 16 · documentation status ───────────────────────────────────────────────

/**
 * Whether a note exists, and whether anybody signed it.
 *
 * An unsigned note is not a note yet. Lateness is supplied, as everywhere
 * else — a cell that reads a clock renders differently in a test than on a
 * ward.
 */
export interface Documentation {
  readonly kind: string;
  readonly state: "not-started" | "draft" | "pending-signature" | "signed" | "amended";
  readonly author?: string;
  readonly signedAt?: string;
  /** The APPLICATION's judgement, never a clock read here. */
  readonly overdue?: boolean;
}

const DOC_RANK: Record<string, number> = {
  "not-started": 0, draft: 1, "pending-signature": 2, amended: 3, signed: 4,
};

export const documentationCell: CellHost<CellValue<Documentation>> = {
  ...textHost<Documentation>((d) => {
    const who = d.author ? `, ${d.author}` : "";
    const when = d.signedAt ? `, signed ${d.signedAt}` : "";
    return `${d.kind}, ${d.state}${who}${when}${d.overdue ? ", overdue" : ""}`;
  }),
  focusable: () => true,
  compare: (a, b) =>
    isAbsent(a) || isAbsent(b)
      ? "incomparable"
      : (DOC_RANK[(a as Documentation).state] ?? 9) - (DOC_RANK[(b as Documentation).state] ?? 9),
};

// ── 17 · a behavioural-health assessment ────────────────────────────────────

/**
 * A score is meaningless without its instrument.
 *
 * A 15 is moderate depression on the PHQ-9 and severe anxiety on the GAD-7,
 * and the two do not compare. `severity` is the instrument's own banding,
 * supplied — this cell does not carry scoring tables for every instrument in
 * behavioural health, and one that did would be wrong the first time a
 * threshold was revised.
 */
export interface Assessment {
  readonly instrument: string;
  readonly score: number;
  readonly administeredAt: string;
  /** The INSTRUMENT's banding for this score, from the source. */
  readonly severity?: string;
  /** Change since last administration, when the source computed one. */
  readonly change?: number;
}

export const assessmentCell: CellHost<CellValue<Assessment>> = {
  ...textHost<Assessment>((a) => {
    const band = a.severity ? `, ${a.severity}` : "";
    const change =
      a.change === undefined
        ? ""
        : `, ${a.change > 0 ? "up" : a.change < 0 ? "down" : "unchanged"} ${Math.abs(a.change)}`;
    return `${a.instrument} ${a.score}${band}${change}, ${a.administeredAt}`;
  }),
  focusable: () => true,
  compare: (a, b) => {
    if (isAbsent(a) || isAbsent(b)) return "incomparable";
    const x = a as Assessment;
    const y = b as Assessment;
    // A PHQ-9 does not rank against a GAD-7 however similar the numbers look.
    if (x.instrument !== y.instrument) return "incomparable";
    return x.score - y.score;
  },
  toExport: (v) =>
    isAbsent(v)
      ? { kind: "value", value: describeAbsence(v) }
      : { kind: "value", value: (v as Assessment).score },
};

// ── 18 · an AI-generated summary ────────────────────────────────────────────

/**
 * Text a model produced, and whether a person has checked it.
 *
 * ── WHY THIS IS MASKED UNTIL REVIEWED ───────────────────────────────────────
 *
 * An unreviewed model summary that leaves in a CSV loses every signal that it
 * was generated. It arrives in a spreadsheet looking exactly like a clinician's
 * note, and there is no way back from that. So `maskState` withholds it until
 * `reviewedBy` is set, and the export carries the refusal rather than the text.
 *
 * This is the one cell in the catalogue that refuses to export by default, and
 * it is deliberate.
 */
export interface AiSummary {
  readonly text: string;
  readonly model: { readonly name: string; readonly version: string };
  readonly generatedAt: string;
  /** Who checked it. Until this is set, the text does not leave. */
  readonly reviewedBy?: string;
}

export const aiSummaryCell: CellHost<CellValue<AiSummary>> = {
  ...textHost<AiSummary>((s) => {
    const review = s.reviewedBy ? `, reviewed by ${s.reviewedBy}` : ", NOT reviewed";
    return `${s.text} — generated by ${s.model.name} ${s.model.version} at ${s.generatedAt}${review}`;
  }),
  focusable: () => true,
  compare: () =>
    // Two generated summaries have no ordering. Sorting by them would rank
    // patients by a model's prose.
    "incomparable",
  maskState: (v): MaskState =>
    isAbsent(v) || (v as AiSummary).reviewedBy !== undefined
      ? VISIBLE
      : {
          masked: true,
          reason: "AI-generated and not yet reviewed by a person",
        },
  toExport: (v) =>
    isAbsent(v)
      ? { kind: "value", value: describeAbsence(v) }
      : (v as AiSummary).reviewedBy === undefined
        ? { kind: "masked", reason: "AI-generated and not yet reviewed by a person" }
        : { kind: "value", value: (v as AiSummary).text },
};

/** Everything phase three adds. */
export const CLINICAL_CELLS_2 = {
  labResult: labResultCell,
  medication: medicationCell,
  appointment: appointmentCell,
  careTeam: careTeamCell,
  clinicalAlert: clinicalAlertCell,
  documentation: documentationCell,
  assessment: assessmentCell,
  aiSummary: aiSummaryCell,
} as const;
