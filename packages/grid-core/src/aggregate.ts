/**
 * Aggregation, and the refusal.
 *
 * ── THE RULE THAT MAKES THIS DIFFERENT ──────────────────────────────────────
 *
 * Aggregating across incompatible units **refuses rather than coercing**. Every
 * other grid sums the numbers and shows a total, because to the summing code 5
 * and 5 are both 5 — regardless of whether one was mg and the other mL.
 *
 * A refusal carries a reason the grid can render, so the reader sees *why*
 * there is no number rather than seeing a number that is wrong.
 *
 * The second rule is quieter and matters as much: **an aggregate reports how
 * many rows it could not use.** A mean over three of ten rows, displayed as
 * "the mean", is a claim about ten rows. `n` and `missing` travel with the
 * result so a renderer can say "4.2 mmol/L (7 not included)".
 *
 * No clinical vocabulary lives here. A unit is a tag — mg, mL, GBP, bytes — and
 * this file does not know which of them are clinical.
 * ────────────────────────────────────────────────────────────────────────────
 */

/** A number that knows what it is measured in. An absent `unit` is dimensionless. */
export interface Measured {
  readonly value: number;
  readonly unit?: string;
}

export type AggregateResult =
  | {
      readonly kind: "value";
      readonly value: number;
      readonly unit?: string;
      /** How many rows contributed. */
      readonly n: number;
      /** How many rows were present but unusable — absent, or not a number. */
      readonly missing: number;
    }
  | { readonly kind: "refused"; readonly reason: string; readonly units: readonly string[] }
  /** No usable rows at all. Distinct from a refusal, and distinct from zero. */
  | { readonly kind: "empty" };

export type AggregateKind = "sum" | "mean" | "min" | "max" | "count";

/** `null` is dimensionless — a real state, not a missing one, so it is not a sentinel string. */
type Unit = string | null;

const show = (u: Unit): string => u ?? "no unit";

function collect(values: readonly (Measured | null | undefined)[]): {
  readonly usable: number[];
  readonly missing: number;
  readonly units: Unit[];
} {
  const usable: number[] = [];
  const units = new Set<Unit>();
  let missing = 0;

  for (const v of values) {
    if (v === null || v === undefined || !Number.isFinite(v.value)) {
      missing++;
      continue;
    }
    usable.push(v.value);
    units.add(v.unit ?? null);
  }
  return { usable, missing, units: [...units] };
}

export function aggregate(
  kind: AggregateKind,
  values: readonly (Measured | null | undefined)[],
): AggregateResult {
  if (kind === "count") {
    // Counting rows does not depend on what they measure, so it never refuses.
    const n = values.filter((v) => v !== null && v !== undefined).length;
    return { kind: "value", value: n, n, missing: values.length - n };
  }

  const { usable, missing, units } = collect(values);
  if (usable.length === 0) return { kind: "empty" };

  if (units.length > 1) {
    // The refusal. A reason the grid can render, and the units it saw, so the
    // reader can tell which two things were about to be added together.
    const named = units.map(show);
    return { kind: "refused", reason: `cannot combine ${named.join(" and ")}`, units: named };
  }

  const only = units[0] ?? null;
  const n = usable.length;
  const base = { kind: "value" as const, n, missing, ...(only !== null ? { unit: only } : {}) };

  switch (kind) {
    case "sum":
      return { ...base, value: usable.reduce((a, b) => a + b, 0) };
    case "mean":
      return { ...base, value: usable.reduce((a, b) => a + b, 0) / n };
    case "min":
      return { ...base, value: Math.min(...usable) };
    case "max":
      return { ...base, value: Math.max(...usable) };
  }
}

/**
 * The sentence a renderer shows, so the group row, the export and the print
 * sheet cannot disagree about what an aggregate says.
 */
export function describeAggregate(result: AggregateResult): string {
  switch (result.kind) {
    case "empty":
      return "no values";
    case "refused":
      return result.reason;
    case "value": {
      const value = `${result.value}${result.unit ? ` ${result.unit}` : ""}`;
      // An aggregate over only some of the rows says so. Otherwise it reads as
      // a claim about all of them.
      return result.missing > 0 ? `${value} (${result.missing} not included)` : value;
    }
  }
}
