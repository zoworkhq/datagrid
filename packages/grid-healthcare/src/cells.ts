/**
 * The five cells that do not exist in `oxygenui` and that make no clinical
 * claim.
 *
 * Each renders an administrative state the application supplies. None derives
 * one, none reads a clock, and none applies a threshold — see ADR 0008 and the
 * purity assertion in `cell-contract.ts`.
 *
 * ── THE SIXTH IS DELIBERATELY ABSENT ────────────────────────────────────────
 *
 * `GridDoseCell` is NOT here. *Given*, *late*, *not given*, *held*, *refused*
 * and *no dose scheduled* are not six labels, they are six medico-legal facts
 * with different consequences, and the difference between "held" and "not
 * given" is a clinical judgement recorded by a clinician. It is named as
 * missing rather than quietly omitted, so its absence is a visible decision.
 *
 * @see ../../../docs/decisions/0008-what-a-cell-may-decide.md
 */
import type { ExportValue } from "@oxygenui-design/grid-core";
import { describeAbsence } from "./absence.js";
import {
  describeAsOf,
  isAbsent,
  VISIBLE,
  type AsOf,
  type CellHost,
  type CellValue,
  type MaskState,
} from "./cell-contract.js";

const width = (text: string, per = 7.2, pad = 16): number => Math.ceil(text.length * per) + pad;

const absentHostParts = <T>(value: CellValue<T>) =>
  isAbsent(value) ? { text: describeAbsence(value), absent: true as const } : null;

// ── 1 · resolution ──────────────────────────────────────────────────────────

/**
 * What is owed, by whom, by when.
 *
 * Nothing in the `oxygenui` catalogue expresses an obligation, and seven of the
 * fourteen recipes are built on one. The row in a work queue is not a patient —
 * it is a thing owed, so one person can legitimately appear three times.
 */
export interface Resolution {
  readonly what: string;
  readonly owner: string;
  /** A date the caller supplies. This cell does not decide it is overdue. */
  readonly due: string;
  /** The APPLICATION's judgement of lateness, never ours. */
  readonly overdue?: boolean;
}

export const resolutionCell: CellHost<CellValue<Resolution>> = {
  measure: (v) => ({ intrinsic: width(resolutionCell.read(v)), growable: true }),
  truncate: (v, available) => {
    const text = resolutionCell.read(v);
    const fits = Math.max(0, Math.floor((available - 16) / 7.2));
    return text.length <= fits
      ? { text, truncated: false }
      : { text: `${text.slice(0, Math.max(0, fits - 1))}…`, truncated: true };
  },
  focusable: () => true,
  read: (v) => {
    const absent = absentHostParts(v);
    if (absent) return absent.text;
    const r = v as Resolution;
    return `${r.what}, ${r.owner}, due ${r.due}${r.overdue ? ", overdue" : ""}`;
  },
  compare: (a, b) => {
    // An obligation with no due date cannot be ordered against one that has
    // one. Sorting it to the top would read as the most urgent.
    if (isAbsent(a) || isAbsent(b)) return "incomparable";
    return (a as Resolution).due.localeCompare((b as Resolution).due);
  },
  toExport: (v) => ({ kind: "value", value: resolutionCell.read(v) }),
  toPrint: (v) => resolutionCell.toExport(v),
  maskState: () => VISIBLE,
};

// ── 2 · chip overflow ───────────────────────────────────────────────────────

/**
 * Two chips and a counted, accessible remainder.
 *
 * Generalised over diagnoses, programmes, insurances, care team,
 * authorisations and appointment types — six places that would otherwise each
 * invent their own "+3 more".
 */
export interface ChipSet {
  readonly items: readonly string[];
  /** How many to show before the remainder. */
  readonly visible?: number;
}

export interface ChipOverflow {
  readonly shown: readonly string[];
  readonly remaining: number;
  /** What a screen reader says, because "+3" announces as "plus three". */
  readonly remainderLabel: string;
}

export function planChips(set: ChipSet): ChipOverflow {
  const visible = set.visible ?? 2;
  const shown = set.items.slice(0, visible);
  const remaining = Math.max(0, set.items.length - shown.length);
  return {
    shown,
    remaining,
    remainderLabel: remaining === 0 ? "" : `${remaining} more, ${set.items.slice(visible).join(", ")}`,
  };
}

export const chipOverflowCell: CellHost<CellValue<ChipSet>> = {
  measure: (v) => ({ intrinsic: width(chipOverflowCell.read(v), 8), growable: true }),
  truncate: (v) => ({ text: chipOverflowCell.read(v), truncated: false }),
  focusable: () => true,
  read: (v) => {
    const absent = absentHostParts(v);
    if (absent) return absent.text;
    const plan = planChips(v as ChipSet);
    // The full list is announced. A count alone tells a screen-reader user
    // there is something they cannot reach.
    return plan.remaining === 0 ? plan.shown.join(", ") : `${plan.shown.join(", ")}, and ${plan.remainderLabel}`;
  },
  compare: (a, b) =>
    isAbsent(a) || isAbsent(b) ? "incomparable" : (a as ChipSet).items.length - (b as ChipSet).items.length,
  // Export gets the WHOLE list, never the truncated view. A file that silently
  // drops three diagnoses is a worse artefact than a wide column.
  toExport: (v) =>
    isAbsent(v)
      ? { kind: "value", value: describeAbsence(v) }
      : { kind: "value", value: (v as ChipSet).items.join("; ") },
  toPrint: (v) => chipOverflowCell.toExport(v),
  maskState: () => VISIBLE,
};

// ── 3 · masked region ───────────────────────────────────────────────────────

/**
 * A mask, its reason, its legal basis, and how many columns it covers.
 *
 * Column spanning is here because our own mockup spanned a Part 2 notice
 * across three columns and the specification never described it.
 */
export interface MaskedRegion {
  readonly reason: string;
  readonly legalBasis?: string;
  /** Columns covered. The renderer clamps it; this is the request. */
  readonly span?: number;
  /** Whether a break-glass affordance is offered. The SERVER grants; we only ask. */
  readonly breakGlass?: boolean;
}

export const maskedCell: CellHost<MaskedRegion> = {
  measure: (v) => ({ intrinsic: width(maskedCell.read(v)), growable: true }),
  truncate: (v) => ({ text: maskedCell.read(v), truncated: false }),
  focusable: (v) => v.breakGlass === true,
  read: (v) =>
    v.legalBasis ? `Withheld — ${v.reason} (${v.legalBasis})` : `Withheld — ${v.reason}`,
  compare: () => "incomparable", // you cannot order what you cannot see
  toExport: (v): ExportValue => ({ kind: "masked", reason: v.reason }),
  toPrint: (v) => maskedCell.toExport(v),
  maskState: (v): MaskState => ({
    masked: true,
    reason: v.reason,
    ...(v.legalBasis !== undefined ? { legalBasis: v.legalBasis } : {}),
  }),
};

// ── 4 · eligibility ─────────────────────────────────────────────────────────

/**
 * A payer check that may not have answered.
 *
 * Three states the brief never covered, and the third is the one that matters:
 * a check that could not be reached is NOT a check that came back negative.
 */
export type Eligibility =
  | { readonly state: "verified"; readonly plan: string; readonly asOf: AsOf }
  | { readonly state: "not-covered"; readonly plan: string; readonly asOf: AsOf }
  /** The APPLICATION decided this is too old. This cell does not. */
  | { readonly state: "stale"; readonly plan: string; readonly asOf: AsOf }
  | { readonly state: "unreachable"; readonly payer: string; readonly asOf: AsOf };

export const eligibilityCell: CellHost<CellValue<Eligibility>> = {
  measure: (v) => ({ intrinsic: width(eligibilityCell.read(v)), growable: true }),
  truncate: (v) => ({ text: eligibilityCell.read(v), truncated: false }),
  focusable: () => false,
  read: (v) => {
    const absent = absentHostParts(v);
    if (absent) return absent.text;
    const e = v as Eligibility;
    const when = describeAsOf(e.asOf);
    switch (e.state) {
      case "verified":
        return `Verified, ${e.plan}, ${when}`;
      case "not-covered":
        return `Not covered, ${e.plan}, ${when}`;
      case "stale":
        return `${e.plan}, last verified ${e.asOf.at} — may be out of date`;
      case "unreachable":
        // Not "not covered". The difference is a bill sent to the wrong payer.
        return `${e.payer} could not be reached, ${when}`;
    }
  },
  compare: () => "incomparable",
  toExport: (v) => ({ kind: "value", value: eligibilityCell.read(v) }),
  toPrint: (v) => eligibilityCell.toExport(v),
  maskState: () => VISIBLE,
};

// ── 5 · ledger ──────────────────────────────────────────────────────────────

/**
 * An authorisation: units remaining, an expiry, a denial reason, an ageing
 * clock.
 *
 * Every field is supplied. This cell does not compute "expiring soon", because
 * soon is a policy the site sets.
 */
export interface Ledger {
  readonly unitsRemaining: number | "unknown";
  readonly expires?: string;
  readonly denialReason?: string;
  /** Days, from the caller. Not derived from a clock we do not own. */
  readonly ageDays?: number;
}

export const ledgerCell: CellHost<CellValue<Ledger>> = {
  measure: (v) => ({ intrinsic: width(ledgerCell.read(v)), growable: false }),
  truncate: (v) => ({ text: ledgerCell.read(v), truncated: false }),
  focusable: () => false,
  read: (v) => {
    const absent = absentHostParts(v);
    if (absent) return absent.text;
    const l = v as Ledger;
    if (l.denialReason) return `Denied — ${l.denialReason}`;
    const parts: string[] = [
      // "unknown" is a real answer: an authorisation whose balance the payer
      // did not return is not an authorisation with zero units left.
      l.unitsRemaining === "unknown" ? "units remaining unknown" : `${l.unitsRemaining} units remaining`,
    ];
    if (l.expires) parts.push(`expires ${l.expires}`);
    if (l.ageDays !== undefined) parts.push(`${l.ageDays} days old`);
    return parts.join(", ");
  },
  compare: (a, b) => {
    if (isAbsent(a) || isAbsent(b)) return "incomparable";
    const x = (a as Ledger).unitsRemaining;
    const y = (b as Ledger).unitsRemaining;
    // An unknown balance cannot be ordered against a known one.
    if (x === "unknown" || y === "unknown") return "incomparable";
    return x - y;
  },
  toExport: (v) => ({ kind: "value", value: ledgerCell.read(v) }),
  toPrint: (v) => ledgerCell.toExport(v),
  maskState: () => VISIBLE,
};

// ── the one that is not here ────────────────────────────────────────────────

/**
 * `GridDoseCell` awaits clinical review and is deliberately not implemented.
 *
 * Exported as a named absence so that a consumer looking for it finds this
 * rather than nothing, and so its absence shows up in the type system rather
 * than only in a document.
 */
export const AWAITING_CLINICAL_REVIEW = {
  doseCell:
    "GridDoseCell is not implemented. Given, late, not given, held, refused and " +
    "no-dose-scheduled are six medico-legal facts with different consequences, and " +
    "the difference between held and not given is a clinical judgement. It needs a " +
    "named clinician reviewer first — see docs/decisions/0008.",
} as const;
