/**
 * The cell host contract.
 *
 * The grid **hosts** clinical cells; it does not own them. Eight components
 * already ship at Stable in `oxygenui`, and building a second set inside the
 * grid would be the worst outcome available: two implementations of "is this
 * result critical" that can disagree.
 *
 * So the healthcare layer's real job is not a cell catalogue. It is the
 * contract that lets an existing catalogue live inside a virtualised,
 * exportable, printable, screen-reader-navigable grid without being rewritten.
 *
 * ── EIGHT OBLIGATIONS, NOT SEVEN ────────────────────────────────────────────
 *
 * The brief listed seven: measure, truncate, focus, read, sort, export, print.
 * The eighth is **mask state**, and adding it is what makes mask-preserving
 * export possible at all — a cell that returns only a flat value cannot tell
 * the export writer that the value must not leave.
 *
 * ── AND ONE RULE ABOVE THEM ─────────────────────────────────────────────────
 *
 * A cell renders a state the application supplies. It never derives one. No
 * cell here computes whether a result is critical, whether a value is
 * abnormal, or whether something is too old to trust — it is told, and it
 * renders what it is told, including telling the reader when it was told
 * nothing.
 *
 * @see ../../../docs/decisions/0008-what-a-cell-may-decide.md
 */
import type { ExportValue, PrintValue } from "@oxygenui-design/grid-core";
import { isAbsenceReason, type Absent } from "./absence.js";

/** What a host cell must be able to answer about itself. */
export interface CellHost<TValue> {
  /** 1 · Intrinsic width, so column auto-sizing has something to work from. */
  measure(value: TValue): { readonly intrinsic: number; readonly growable: boolean };

  /** 2 · How it truncates. A cell that clips silently is a cell that lies by omission. */
  truncate(value: TValue, available: number): { readonly text: string; readonly truncated: boolean };

  /** 3 · Whether focus enters the cell or stops at it. A chip group takes focus; a number does not. */
  focusable(value: TValue): boolean;

  /** 4 · What the live region announces. Not the same as what is painted. */
  read(value: TValue): string;

  /**
   * 5 · Ordering. `"incomparable"` is a real answer: a quantity with no unit,
   * or a value against an absence, cannot be ordered and must not be guessed.
   */
  compare(a: TValue, b: TValue): number | "incomparable";

  /** 6 · What leaves in a file. Carries mask state — the eighth obligation. */
  toExport(value: TValue): ExportValue;

  /** 7 · What leaves on paper. */
  toPrint(value: TValue): PrintValue;

  /**
   * 8 · Whether this value may leave at all, and why not.
   *
   * Separate from `toExport` on purpose: the writer needs to know a value is
   * masked *before* it asks for it, so a mask can never be defeated by a
   * writer that forgets to look at the returned variant.
   */
  maskState(value: TValue): MaskState;
}

export type MaskState =
  | { readonly masked: false }
  | { readonly masked: true; readonly reason: string; readonly legalBasis?: string };

export const VISIBLE: MaskState = { masked: false };

/**
 * A value a cell may be given: something, or a typed reason there is nothing.
 *
 * Every cell in this package accepts this shape, which is what makes "a blank
 * cell is indistinguishable from a rendering bug" impossible to express.
 */
export type CellValue<T> = T | Absent;

/**
 * Whether a cell value is an absence.
 *
 * ── WHY IT CHECKS THE VALUE AND NOT JUST THE KEY ────────────────────────────
 *
 * This used to be `"reason" in v`, and `reason` is not a rare word.
 * `Medication.reason` is the reason a drug is held or stopped — "patient
 * safety", "pre-procedure" — so a valid held medication tested TRUE here. Its
 * comparator then returned `"incomparable"` for a row against itself while the
 * text reader, which does not use this guard, printed the medication happily.
 * Sort semantics and read semantics disagreed about the same value.
 *
 * The absence reasons are a closed set of eight literals, so membership is the
 * discriminant rather than the key's presence. That is narrower than the
 * `{ kind: "absent" }` shape the review suggested, and deliberately: it needs
 * no change at any of the several hundred construction sites, and it survives
 * JSON — a symbol brand would not, and these values come off the wire.
 *
 * An open business field can still collide, but only by holding one of the
 * eight exact tokens, and "not-ordered" is not a reason anyone gives for
 * holding a drug.
 */
export const isAbsent = <T>(v: CellValue<T>): v is Absent =>
  typeof v === "object" &&
  v !== null &&
  isAbsenceReason((v as { reason?: unknown }).reason);

/**
 * When the caller says the value was current. Never computed.
 *
 * A cell does not decide that forty minutes is too old, because that threshold
 * is clinical, and it varies by field, by site and by patient.
 */
export interface AsOf {
  readonly at: string;
  /** The APPLICATION's judgement, not ours. */
  readonly stale?: boolean;
}

export function describeAsOf(asOf: AsOf | undefined): string {
  if (!asOf) return "";
  return asOf.stale ? `as of ${asOf.at}, stale` : `as of ${asOf.at}`;
}

/**
 * Asserts a host is a pure renderer: same input, same output, every time.
 *
 * Exported so `grid-testing` and a consumer's own suite can run it. A cell that
 * starts deriving clinical state usually starts by reading a clock or a
 * threshold, and both make it impure.
 */
export function assertPure<TValue>(
  host: CellHost<TValue>,
  samples: readonly TValue[],
): { readonly pure: boolean; readonly impure: readonly string[] } {
  const impure: string[] = [];

  // ── ALL EIGHT, NOT FIVE ───────────────────────────────────────────────────
  //
  // The contract names eight obligations and this probed five, so `measure`,
  // `truncate` and `compare` could read a clock, a random number or a mutable
  // module-level cache and pass. `measure` decides a column's intrinsic width
  // and `compare` decides row order — an impure one there is a grid that lays
  // out or sorts differently on two renders of the same data, which is the
  // hardest kind of bug to believe.
  //
  // `truncate` takes a second argument and `compare` takes two values, so they
  // cannot share the one-argument probe; each gets a call shape that matches
  // its signature.
  const single: (keyof CellHost<TValue>)[] = ["read", "toExport", "toPrint", "maskState", "focusable", "measure"];

  const twice = (probe: string, call: () => unknown): void => {
    let a: string;
    let b: string;
    try {
      a = JSON.stringify(call());
      b = JSON.stringify(call());
    } catch {
      // A throwing obligation is not a purity finding — it is a different
      // defect, and reporting it here would hide the one this looks for.
      return;
    }
    if (a !== b && !impure.includes(probe)) impure.push(probe);
  };

  for (const value of samples) {
    for (const probe of single) {
      twice(probe, () => (host[probe] as (v: TValue) => unknown)(value));
    }
    // A width the caller might plausibly have, and a very narrow one, because
    // a truncation that is stable at 200px can still be unstable at 20.
    for (const available of [200, 20]) {
      twice("truncate", () => host.truncate(value, available));
    }
    // Against itself, and against every other sample: a comparator that is
    // unstable only across DIFFERENT values passes a self-comparison.
    for (const other of samples) {
      twice("compare", () => host.compare(value, other));
    }
  }
  return { pure: impure.length === 0, impure };
}
