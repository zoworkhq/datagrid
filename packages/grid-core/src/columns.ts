/**
 * Column layout — sizing, pinning and spanning.
 *
 * Pure arithmetic, like the row geometry: `grid-dom` measures intrinsic widths
 * and this file decides what they become. That keeps auto-sizing testable at a
 * hundred columns with no renderer, and it is the same split that makes the row
 * virtualiser property-testable.
 *
 * Column spanning is here because the architecture review found it in our own
 * mockup and nowhere in the specification: the masking figure spans a Part 2
 * notice across three columns. A capability we had already drawn and never
 * described is exactly the kind that gets implemented four times, differently.
 */
import type { RowId } from "./actions.js";

export interface ColumnSpec {
  readonly key: string;
  /** A fixed width always wins. Nothing redistributes it. */
  readonly width?: number;
  readonly minWidth?: number;
  readonly maxWidth?: number;
  /** Share of the leftover space, flex-style. `0` or absent means no growth. */
  readonly grow?: number;
  readonly pinned?: "start" | "end";
}

export interface ColumnLayout {
  readonly key: string;
  readonly width: number;
  /** Pixel offset in visual order: pinned-start first, then scrollable, then pinned-end. */
  readonly offset: number;
  readonly pinned: "start" | "end" | null;
}

export interface LayoutOptions {
  /** Viewport width. Leftover space is shared among growable columns. */
  readonly available?: number;
  /** Measured intrinsic widths from `grid-dom`, keyed by column. */
  readonly intrinsic?: Readonly<Record<string, number>>;
  readonly defaultWidth?: number;
  readonly minWidth?: number;
}

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(n, hi));

/**
 * Visual order: pinned-start, scrollable, pinned-end.
 *
 * Order within each band is the caller's, so a pinned identity column stays
 * where the recipe put it rather than being sorted by pin state.
 */
export function visualOrder(specs: readonly ColumnSpec[]): readonly ColumnSpec[] {
  return [
    ...specs.filter((c) => c.pinned === "start"),
    ...specs.filter((c) => c.pinned === undefined),
    ...specs.filter((c) => c.pinned === "end"),
  ];
}

export function layoutColumns(
  specs: readonly ColumnSpec[],
  options: LayoutOptions = {},
): readonly ColumnLayout[] {
  const defaultWidth = options.defaultWidth ?? 140;
  const floor = options.minWidth ?? 48;
  const ordered = visualOrder(specs);

  // Pass one: the width each column wants, before any growth.
  const base = ordered.map((spec) => {
    const lo = Math.max(spec.minWidth ?? floor, floor);
    const hi = spec.maxWidth ?? Number.POSITIVE_INFINITY;
    if (spec.width !== undefined) return clamp(spec.width, lo, hi);
    const measured = options.intrinsic?.[spec.key];
    return clamp(measured ?? defaultWidth, lo, hi);
  });

  // Pass two: share what is left among the growable columns, by weight. A fixed
  // width never participates — that is what "fixed" means, and a grid that
  // quietly stretches a 60px status column is a grid nobody trusts with widths.
  const widths = [...base];
  const available = options.available;
  if (available !== undefined) {
    const used = widths.reduce((a, b) => a + b, 0);
    const slack = available - used;
    const growable = ordered
      .map((spec, i) => ({ i, spec, grow: spec.width === undefined ? (spec.grow ?? 0) : 0 }))
      .filter((c) => c.grow > 0);
    const totalGrow = growable.reduce((a, c) => a + c.grow, 0);

    if (slack > 0 && totalGrow > 0) {
      for (const { i, spec, grow } of growable) {
        const hi = spec.maxWidth ?? Number.POSITIVE_INFINITY;
        widths[i] = clamp((widths[i] as number) + (slack * grow) / totalGrow, floor, hi);
      }
    }
  }

  let offset = 0;
  return ordered.map((spec, i) => {
    const width = widths[i] as number;
    const layout: ColumnLayout = { key: spec.key, width, offset, pinned: spec.pinned ?? null };
    offset += width;
    return layout;
  });
}

/** Total width of a layout, for the canvas and for horizontal virtualisation. */
export function totalWidth(layout: readonly ColumnLayout[]): number {
  return layout.reduce((n, c) => n + c.width, 0);
}

// ── spanning ────────────────────────────────────────────────────────────────

/**
 * How many columns a cell covers, starting at its own.
 *
 * A span of 3 on a masked region lets one "withheld under 42 CFR Part 2"
 * notice cover three columns instead of repeating in each — which is what our
 * own mockup drew and the specification never described.
 */
export type SpanFn<TRow> = (row: TRow, columnKey: string) => number;

export interface SpanPlan {
  /** Column keys that render, in order, with the span each one carries. */
  readonly cells: readonly { readonly key: string; readonly span: number }[];
  /** Column keys covered by a preceding span, which must NOT render a cell. */
  readonly covered: ReadonlySet<string>;
}

/**
 * Resolves a row's spans into what actually renders.
 *
 * A span is clamped to the columns that remain, so a span of 9 near the right
 * edge covers what is there rather than producing a colspan that overflows the
 * row — an invalid `aria-colspan` breaks the whole row's announcement, not just
 * that cell's.
 */
export function planSpans<TRow>(
  row: TRow,
  columnKeys: readonly string[],
  span: SpanFn<TRow> | undefined,
): SpanPlan {
  if (!span) {
    return { cells: columnKeys.map((key) => ({ key, span: 1 })), covered: new Set() };
  }

  const cells: { key: string; span: number }[] = [];
  const covered = new Set<string>();

  for (let i = 0; i < columnKeys.length; i++) {
    const key = columnKeys[i] as string;
    if (covered.has(key)) continue;
    const wanted = Math.max(1, Math.floor(span(row, key) || 1));
    const actual = Math.min(wanted, columnKeys.length - i);
    cells.push({ key, span: actual });
    for (let k = 1; k < actual; k++) covered.add(columnKeys[i + k] as string);
  }

  return { cells, covered };
}

// ── row pinning ─────────────────────────────────────────────────────────────

export interface PinnedRowSets {
  readonly top?: ReadonlySet<RowId>;
  readonly bottom?: ReadonlySet<RowId>;
}

export interface PartitionedRows<TRow> {
  readonly top: readonly TRow[];
  readonly scrollable: readonly TRow[];
  readonly bottom: readonly TRow[];
}

/**
 * Splits rows into pinned and scrollable bands.
 *
 * Pinned rows are always rendered and never virtualised — that is the point of
 * pinning — so a caller that pins a thousand rows has asked for a thousand
 * rendered rows, and the count is theirs to keep sane.
 */
export function partitionPinned<TRow>(
  rows: readonly TRow[],
  rowKey: (row: TRow) => RowId,
  pinned: PinnedRowSets = {},
): PartitionedRows<TRow> {
  const top: TRow[] = [];
  const bottom: TRow[] = [];
  const scrollable: TRow[] = [];

  for (const row of rows) {
    const id = rowKey(row);
    if (pinned.top?.has(id)) top.push(row);
    else if (pinned.bottom?.has(id)) bottom.push(row);
    else scrollable.push(row);
  }
  return { top, scrollable, bottom };
}
