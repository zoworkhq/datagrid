/**
 * The ARIA contract, written once, below the adapters.
 *
 * This is the strongest argument for the whole framework-agnostic strategy:
 * the keyboard model, the ARIA contract and focus-under-virtualisation are
 * written a single time and are identical in React, Angular, Vue and vanilla.
 * Every library that puts accessibility in the adapters ends up with four
 * subtly different implementations, and the fourth is always the worst.
 */

/**
 * `-1` is the correct value when the source genuinely does not report a total,
 * per the ARIA specification. FHIR made this a real case rather than a
 * theoretical one.
 *
 * @see ../../../docs/decisions/0005-coverage-may-report-an-unknown-total.md
 */
export function ariaRowCount(total: number | "unknown"): number {
  return total === "unknown" ? -1 : total;
}

/**
 * Absolute, and 1-based, and including the header row — the defect that makes
 * so many virtualised grids announce "row 1 of 20" forever.
 */
export function ariaRowIndex(absoluteRowIndex: number, headerRows = 1): number {
  return absoluteRowIndex + headerRows + 1;
}

/**
 * The focused cell's identity is `{ rowId, columnKey }`, never a node
 * reference — because the node it was on may have been recycled into a
 * different row.
 */
export interface FocusTarget {
  readonly rowId: string;
  readonly columnKey: string;
}
