/**
 * The typed absence taxonomy.
 *
 * Eight reasons a cell is empty, eight different next actions. A blank cell is
 * indistinguishable from a rendering bug, and "no result" read as "normal" is
 * the failure this taxonomy exists to prevent — the literature's own term for
 * it is *informative missingness*: a NULL read as a negative.
 */

export type Absent =
  | { readonly reason: "not-ordered" }
  | { readonly reason: "not-resulted"; readonly orderedAt: string }
  | { readonly reason: "not-measured" }
  | { readonly reason: "not-applicable"; readonly because: string }
  | { readonly reason: "declined"; readonly by: "patient" | "clinician" }
  | { readonly reason: "specimen-problem"; readonly detail: string }
  | { readonly reason: "withheld"; readonly policy: string; readonly legal?: string }
  /**
   * The eighth, added by the architecture review, so that a per-cell failure
   * escalates into coverage rather than rendering as an ordinary blank.
   */
  | { readonly reason: "source-unreachable"; readonly source: string };

export type AbsenceReason = Absent["reason"];

/** A source that could not be reached makes the whole coverage claim conditional. */
export function escalatesToCoverage(absent: Absent): boolean {
  return absent.reason === "source-unreachable";
}

export function describeAbsence(absent: Absent): string {
  switch (absent.reason) {
    case "not-ordered":
      return "Not ordered";
    case "not-resulted":
      return `Ordered ${absent.orderedAt}, not yet resulted`;
    case "not-measured":
      return "Not measured";
    case "not-applicable":
      return `Not applicable — ${absent.because}`;
    case "declined":
      return `Declined by ${absent.by}`;
    case "specimen-problem":
      return `Specimen problem — ${absent.detail}`;
    case "withheld":
      return absent.legal ? `Withheld — ${absent.policy} (${absent.legal})` : `Withheld — ${absent.policy}`;
    case "source-unreachable":
      return `${absent.source} could not be reached`;
  }
}
