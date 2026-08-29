/**
 * The clinical cell catalogue, phase two.
 *
 * Five more hosts, under the same rule as the first five and for the same
 * reason: **a cell renders a state the application supplies, it never derives
 * one** (ADR 0008). Nothing here reads a clock, applies a threshold, or decides
 * that a value is abnormal. Each of those is a clinical judgement that varies
 * by site, by patient and by field, and a grid that made them would be making
 * them for every deployment at once.
 *
 * These five were chosen because they are structurally different, not because
 * a catalogue looks better with ten entries in it. A coded term is a two-part
 * identity where one part is authoritative; an allergy is a three-state
 * question where the empty state is the dangerous one; a trend is a series
 * against a band; a risk score is a number that must carry where it came from;
 * a care-plan status is a lifecycle. Five chips would have been one cell.
 */
import {
  VISIBLE, isAbsent,
  type CellHost, type CellValue, type MaskState,
} from "./cell-contract.js";
import { describeAbsence } from "./absence.js";

/** Rough advance width at the grid's body size. Same basis as the first five. */
const width = (text: string): number => Math.ceil(text.length * 7.2) + 16;

const absentParts = <T>(v: CellValue<T>): { text: string } | null =>
  isAbsent(v) ? { text: describeAbsence(v) } : null;

const truncateAt = (text: string, available: number): { text: string; truncated: boolean } => {
  const fits = Math.max(0, Math.floor((available - 16) / 7.2));
  return text.length <= fits
    ? { text, truncated: false }
    : { text: `${text.slice(0, Math.max(0, fits - 1))}…`, truncated: true };
};

// ── 6 · coded terms: ICD-10, CPT, SNOMED ────────────────────────────────────

/**
 * A code and its display text.
 *
 * ── THE RULE THIS CELL EXISTS TO ENFORCE ────────────────────────────────────
 *
 * **The code is authoritative; the display is a convenience.** They can drift:
 * a display cached from a 2019 code set against a code that has since been
 * revised is a mismatch nobody notices, because the display is the part people
 * read. So the code always travels — on screen, in the announcement, in the
 * export and on paper.
 *
 * `system` is not decoration either. "E11.9" is diabetes in ICD-10 and a
 * different thing entirely elsewhere, and a code without its system is not an
 * identifier, it is a string that looks like one.
 */
export interface CodedTerm {
  readonly system: "ICD-10" | "CPT" | "SNOMED" | "LOINC" | "RxNorm";
  readonly code: string;
  /** What the code means, as the SOURCE renders it. Never looked up here. */
  readonly display: string;
}

export const codedTermCell: CellHost<CellValue<CodedTerm>> = {
  measure: (v) => ({ intrinsic: width(codedTermCell.read(v)), growable: true }),
  truncate: (v, available) => {
    const absent = absentParts(v);
    if (absent) return truncateAt(absent.text, available);
    const t = v as CodedTerm;
    const full = `${t.display} (${t.code})`;
    const fits = Math.max(0, Math.floor((available - 16) / 7.2));
    if (full.length <= fits) return { text: full, truncated: false };
    // The DISPLAY is what gets clipped, never the code — a truncated code is
    // a different code, and it looks like a real one.
    const room = Math.max(0, fits - t.code.length - 4);
    return {
      text: `${t.display.slice(0, Math.max(0, room - 1))}… (${t.code})`,
      truncated: true,
    };
  },
  focusable: () => false,
  read: (v) => {
    const absent = absentParts(v);
    if (absent) return absent.text;
    const t = v as CodedTerm;
    return `${t.display}, ${t.system} ${t.code}`;
  },
  compare: (a, b) => {
    if (isAbsent(a) || isAbsent(b)) return "incomparable";
    const x = a as CodedTerm;
    const y = b as CodedTerm;
    // Codes from different systems are not on one scale. E11.9 does not sit
    // before or after 99213; they are answers to different questions.
    if (x.system !== y.system) return "incomparable";
    return x.code.localeCompare(y.code);
  },
  toExport: (v) => {
    const absent = absentParts(v);
    if (absent) return { kind: "value", value: absent.text };
    const t = v as CodedTerm;
    // Both parts, always. A spreadsheet column of display text alone cannot be
    // rejoined to a code set, which is most of what people export these for.
    return { kind: "value", value: `${t.system} ${t.code} — ${t.display}` };
  },
  toPrint: (v) => codedTermCell.toExport(v),
  maskState: () => VISIBLE,
};

// ── 7 · allergies, where the empty state is the dangerous one ───────────────

/**
 * ── THREE STATES, AND TWO OF THEM LOOK THE SAME ─────────────────────────────
 *
 * "No known allergies" and "nobody has asked" are the same empty row and
 * completely different clinical facts. One is a cleared checklist; the other
 * is an open question in front of a prescription. Every allergy field in
 * every system gets this wrong at least once, and it is the reason this cell
 * has an explicit `none` variant rather than an empty list.
 *
 * Severity is supplied. This cell does not decide that anaphylaxis outranks a
 * rash — it is told, because the ranking belongs to the source's terminology.
 */
export type AllergyStatus =
  | { readonly known: "none" }
  | {
      readonly known: "some";
      readonly entries: readonly {
        readonly substance: string;
        /** The SOURCE's severity, never inferred from the reaction text. */
        readonly severity: "mild" | "moderate" | "severe" | "unknown";
        readonly reaction?: string;
      }[];
    };

const SEVERITY_RANK: Record<string, number> = { severe: 3, moderate: 2, mild: 1, unknown: 0 };

/** The worst severity present. Reads, never decides — the ranks are the source's. */
const worstSeverity = (s: AllergyStatus): number =>
  s.known === "none"
    ? -1
    : s.entries.reduce((worst, e) => Math.max(worst, SEVERITY_RANK[e.severity] ?? 0), 0);

export const allergyCell: CellHost<CellValue<AllergyStatus>> = {
  measure: (v) => ({ intrinsic: width(allergyCell.read(v)), growable: true }),
  truncate: (v, available) => truncateAt(allergyCell.read(v), available),
  focusable: (v) => !isAbsent(v) && (v as AllergyStatus).known === "some",
  read: (v) => {
    const absent = absentParts(v);
    // "Not asked" arrives as an Absent and reads as itself. It is NOT "none".
    if (absent) return absent.text;
    const s = v as AllergyStatus;
    if (s.known === "none") return "No known allergies";
    return s.entries
      .map((e) => `${e.substance}, ${e.severity}${e.reaction ? `, ${e.reaction}` : ""}`)
      .join("; ");
  },
  compare: (a, b) => {
    // An unasked allergy history cannot be ordered against a cleared one.
    // Sorting "not asked" among "none" is how an open question disappears.
    if (isAbsent(a) || isAbsent(b)) return "incomparable";
    return worstSeverity(a as AllergyStatus) - worstSeverity(b as AllergyStatus);
  },
  toExport: (v) => ({ kind: "value", value: allergyCell.read(v) }),
  toPrint: (v) => allergyCell.toExport(v),
  maskState: () => VISIBLE,
};

// ── 8 · a vitals trend, against a band ──────────────────────────────────────

/**
 * A short series with a reference band.
 *
 * The band is supplied. A reference range depends on age, sex, pregnancy,
 * assay and site, and a grid that carried its own would be wrong for most
 * patients most of the time. The cell renders the band it is handed and says
 * so when it is handed none — a sparkline with no reference is a shape, not a
 * finding, and it should not imply otherwise.
 */
export interface VitalsTrend {
  readonly label: string;
  readonly unit: string;
  /** Oldest to newest. The cell does not sort them; order is meaning here. */
  readonly points: readonly number[];
  /** The SOURCE's reference range for THIS patient, when it has one. */
  readonly band?: { readonly low: number; readonly high: number };
}

export const vitalsTrendCell: CellHost<CellValue<VitalsTrend>> = {
  measure: () => ({ intrinsic: 120, growable: false }),
  truncate: (v, available) => truncateAt(vitalsTrendCell.read(v), available),
  focusable: () => true,
  read: (v) => {
    const absent = absentParts(v);
    if (absent) return absent.text;
    const t = v as VitalsTrend;
    if (t.points.length === 0) return `${t.label}, no readings`;
    const latest = t.points[t.points.length - 1] as number;
    const first = t.points[0] as number;
    // Direction is arithmetic over supplied points, not a clinical judgement:
    // "rising" is a fact about the numbers. Whether rising is BAD is not, and
    // this cell does not say.
    const direction = latest > first ? "rising" : latest < first ? "falling" : "level";
    const band = t.band
      ? `, reference ${t.band.low} to ${t.band.high}`
      : ", no reference range supplied";
    return `${t.label} ${latest} ${t.unit}, ${direction} over ${t.points.length} readings${band}`;
  },
  compare: (a, b) => {
    if (isAbsent(a) || isAbsent(b)) return "incomparable";
    const x = a as VitalsTrend;
    const y = b as VitalsTrend;
    // Different measurements are not comparable, and neither is an empty
    // series against a populated one.
    if (x.unit !== y.unit) return "incomparable";
    if (x.points.length === 0 || y.points.length === 0) return "incomparable";
    return (x.points[x.points.length - 1] as number) - (y.points[y.points.length - 1] as number);
  },
  toExport: (v) => {
    const absent = absentParts(v);
    if (absent) return { kind: "value", value: absent.text };
    const t = v as VitalsTrend;
    const latest = t.points[t.points.length - 1];
    // The latest value as a NUMBER, so a spreadsheet can compute with it. The
    // series does not survive a single cell, and pretending otherwise by
    // joining it with commas produces a string nobody can use.
    return latest === undefined
      ? { kind: "value", value: null }
      : { kind: "value", value: latest };
  },
  toPrint: (v) => ({ kind: "value", value: vitalsTrendCell.read(v) }),
  maskState: () => VISIBLE,
};

// ── 9 · a risk score, carrying where it came from ───────────────────────────

/**
 * A number a model produced, and the provenance that makes it readable.
 *
 * A risk score with no provenance is a number with the authority of a
 * measurement and none of the basis. So the model, its version and the
 * population it was VALIDATED on travel with the value — the population it was
 * validated on, not the one it is being applied to, because the gap between
 * those two is where these scores go wrong.
 *
 * Sorting is offered and it is a triage decision. That is the application's to
 * make; what this cell refuses is ordering a model output against a measured
 * value, which are not on one scale.
 */
export interface RiskScore {
  readonly value: number;
  readonly scale: string;
  readonly model: { readonly name: string; readonly version: string; readonly validatedOn: string };
  /** 0–1, when the model reports one. Absent is normal and not an error. */
  readonly confidence?: number;
}

export const riskScoreCell: CellHost<CellValue<RiskScore>> = {
  measure: (v) => ({ intrinsic: width(riskScoreCell.read(v)), growable: false }),
  truncate: (v, available) => truncateAt(riskScoreCell.read(v), available),
  focusable: () => true,
  read: (v) => {
    const absent = absentParts(v);
    if (absent) return absent.text;
    const r = v as RiskScore;
    const confidence = r.confidence === undefined ? "" : `, confidence ${r.confidence}`;
    return (
      `${r.value} on ${r.scale}${confidence}, from ${r.model.name} ${r.model.version}, ` +
      `validated on ${r.model.validatedOn}`
    );
  },
  compare: (a, b) => {
    if (isAbsent(a) || isAbsent(b)) return "incomparable";
    const x = a as RiskScore;
    const y = b as RiskScore;
    // Two scores from different models, or on different scales, do not rank
    // against each other however similar the numbers look.
    if (x.scale !== y.scale || x.model.name !== y.model.name) return "incomparable";
    return x.value - y.value;
  },
  toExport: (v) => {
    const absent = absentParts(v);
    if (absent) return { kind: "value", value: absent.text };
    const r = v as RiskScore;
    // The provenance does not fit in a cell, so the export carries the value
    // WITH its model — a bare number in a spreadsheet is indistinguishable
    // from something somebody measured.
    return { kind: "value", value: `${r.value} (${r.model.name} ${r.model.version})` };
  },
  toPrint: (v) => ({ kind: "value", value: riskScoreCell.read(v) }),
  maskState: () => VISIBLE,
};

// ── 10 · care-plan and authorisation status ─────────────────────────────────

/**
 * A lifecycle with a decision attached.
 *
 * Covers care plans, prior authorisations and referrals — three workflows with
 * the same shape: a state, who owns it, and a date that the APPLICATION has
 * judged. `overdue` is supplied for the same reason it is on `resolutionCell`:
 * lateness needs a clock, and a cell that reads one is a cell that renders
 * differently in a test than in a ward.
 *
 * `denied` carries its reason. A denial with no reason cannot be appealed, and
 * an unappealable denial in a grid is a dead end for a real person.
 */
export type PlanStatus =
  | { readonly state: "draft" | "active" | "completed" | "cancelled" }
  | { readonly state: "pending"; readonly submitted: string; readonly overdue?: boolean }
  | { readonly state: "denied"; readonly reason: string; readonly appealBy?: string };

export interface CarePlanEntry {
  readonly what: string;
  readonly status: PlanStatus;
  readonly owner?: string;
}

/** Lifecycle order, so sorting groups the ones that need action together. */
const STATE_RANK: Record<string, number> = {
  denied: 0, pending: 1, draft: 2, active: 3, completed: 4, cancelled: 5,
};

export const carePlanCell: CellHost<CellValue<CarePlanEntry>> = {
  measure: (v) => ({ intrinsic: width(carePlanCell.read(v)), growable: true }),
  truncate: (v, available) => truncateAt(carePlanCell.read(v), available),
  focusable: () => true,
  read: (v) => {
    const absent = absentParts(v);
    if (absent) return absent.text;
    const e = v as CarePlanEntry;
    const owner = e.owner ? `, ${e.owner}` : "";
    const s = e.status;
    if (s.state === "denied") {
      const appeal = s.appealBy ? `, appeal by ${s.appealBy}` : "";
      return `${e.what}, denied — ${s.reason}${appeal}${owner}`;
    }
    if (s.state === "pending") {
      return `${e.what}, pending since ${s.submitted}${s.overdue ? ", overdue" : ""}${owner}`;
    }
    return `${e.what}, ${s.state}${owner}`;
  },
  compare: (a, b) => {
    if (isAbsent(a) || isAbsent(b)) return "incomparable";
    const x = (a as CarePlanEntry).status.state;
    const y = (b as CarePlanEntry).status.state;
    return (STATE_RANK[x] ?? 9) - (STATE_RANK[y] ?? 9);
  },
  toExport: (v) => ({ kind: "value", value: carePlanCell.read(v) }),
  toPrint: (v) => carePlanCell.toExport(v),
  maskState: (v): MaskState => {
    // A denial reason is often the most sensitive thing on the row — it can
    // carry a diagnosis by implication. The cell does not decide that; it
    // reports the state so a policy CAN.
    void v;
    return VISIBLE;
  },
};

/** Everything this module adds, for a registry to mount in one call. */
export const CLINICAL_CELLS = {
  codedTerm: codedTermCell,
  allergy: allergyCell,
  vitalsTrend: vitalsTrendCell,
  riskScore: riskScoreCell,
  carePlan: carePlanCell,
} as const;
