/**
 * Coverage — the claim about what the query reached.
 *
 * Required, no default, rendered in a fixed place, in words, and printed.
 * There is no `hideCoverage`: a component that lets you switch off its safety
 * claim does not have one.
 *
 * This amends Oxygen ADR 0011 in exactly one respect — `total` may be
 * `"unknown"`, because FHIR servers return opaque `link.next` URLs and
 * `Bundle.total` is optional. The obligation itself is unchanged.
 *
 * @see ../../../docs/decisions/0005-coverage-may-report-an-unknown-total.md
 */

export interface CoverageSource {
  readonly id: string;
  readonly label: string;
  /** Any status other than `ok` must carry a reason, and escalates to `role="alert"`. */
  readonly status: "ok" | "partial" | "unreachable" | "denied";
  readonly reason?: string;
}

export interface Coverage {
  /** A non-empty tuple, so an empty array cannot satisfy the type. */
  readonly sources: readonly [CoverageSource, ...CoverageSource[]];
  /**
   * `"unknown"` is a value, not an absent field. An absent field reads as
   * *we forgot*; `"unknown"` reads as *we asked and the server does not know*.
   * Only the second is a claim.
   */
  readonly total: number | "unknown";
  readonly loaded: number;
  readonly excluded?: readonly { readonly count: number; readonly reason: string }[];
  readonly asOf: string;
}

export interface CoverageProblem {
  readonly sourceId: string;
  readonly problem: string;
}

/** A source in a non-`ok` state without a reason is a defect, and is reported rather than rendered around. */
export function validateCoverage(coverage: Coverage): readonly CoverageProblem[] {
  return coverage.sources
    .filter((s) => s.status !== "ok" && !s.reason)
    .map((s) => ({ sourceId: s.id, problem: `status "${s.status}" without a reason` }));
}

export function hasFailedSource(coverage: Coverage): boolean {
  return coverage.sources.some((s) => s.status === "unreachable" || s.status === "denied");
}

/**
 * The one place the sentence is built, so the coverage bar, the print header,
 * the CSV header and the audit record all carry the same words.
 *
 * When the total is unknown the sentence states what is known and stops. Never
 * "of many", never "20+", never an estimate rendered as a count.
 */
export function describeCoverage(coverage: Coverage): string {
  const parts: string[] = [];

  parts.push(
    coverage.total === "unknown"
      ? `Showing ${coverage.loaded} loaded, more may be available`
      : `Showing ${coverage.loaded} of ${coverage.total}`,
  );

  for (const e of coverage.excluded ?? []) parts.push(`${e.count} excluded as ${e.reason}`);

  const failed = coverage.sources.filter((s) => s.status !== "ok");
  for (const s of failed) parts.push(`${s.label} ${s.reason ?? "returned a problem"}`);

  parts.push(`as of ${coverage.asOf}`);
  return parts.join("; ");
}
