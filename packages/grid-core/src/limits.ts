/**
 * One place that decides what a number is allowed to be.
 *
 * ── WHY THIS IS CENTRAL AND NOT PER-CALLER ──────────────────────────────────
 *
 * `initialState` spread its overrides without looking at them, `parseView`
 * validated the envelope of a saved view and then cast the body, and
 * `queryFrom` normalised the page and not the page size. So a stored view, a
 * URL, or a payload shared from another product could carry `pageSize: 0`,
 * `width: -2` or a non-finite page, and those values flowed into offset
 * arithmetic, geometry and CSS widths — past the "refused rather than guessed"
 * boundary the library advertises.
 *
 * Every consumer inventing its own normalisation is how two of them end up
 * disagreeing about whether zero is a page size. These are the ranges, once,
 * with the reason each bound exists.
 */

/** A page of zero rows never terminates; a page of a million is not paging. */
export const PAGE_SIZE = { min: 1, max: 10_000, fallback: 50 } as const;

/**
 * Column width, in CSS pixels.
 *
 * The floor is the same one the keyboard resize stops at: below it a column
 * can show that it has a value and not what the value is. The ceiling is
 * generous and exists only to keep a corrupt number out of a style attribute.
 */
export const COLUMN_WIDTH = { min: 56, max: 10_000 } as const;

/** Rows per page-down, and the overscan either side of the window. */
export const PAGE_ROWS = { min: 1, max: 1_000 } as const;
export const OVERSCAN = { min: 0, max: 200 } as const;

/** Row height in pixels. A zero-height row is the bug the renderer guards against. */
export const ROW_HEIGHT = { min: 1, max: 2_000 } as const;

export interface Range {
  readonly min: number;
  readonly max: number;
}

/**
 * A finite integer inside a range, or `null`.
 *
 * `null` rather than a clamp, because the caller is better placed to decide:
 * a parser refuses the document, a reducer keeps what it had. Clamping
 * everywhere silently converts "the file is corrupt" into "your layout moved".
 */
export function integerIn(value: unknown, range: Range): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const n = Math.trunc(value);
  return n >= range.min && n <= range.max ? n : null;
}

/** The same, clamped instead of refused. For values a caller must produce. */
export function clampInteger(value: unknown, range: Range, fallback: number): number {
  return integerIn(value, range) ?? Math.min(Math.max(fallback, range.min), range.max);
}

/** Whether every value in a width map is usable. */
export function invalidWidths(widths: Readonly<Record<string, unknown>>): readonly string[] {
  return Object.entries(widths)
    .filter(([, w]) => integerIn(w, COLUMN_WIDTH) === null)
    .map(([key]) => key);
}
