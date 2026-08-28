/**
 * @oxygenui-design/grid-clipboard — range selection, clipboard and undo.
 *
 * ── OFF BY DEFAULT, AND THAT IS THE POINT ───────────────────────────────────
 *
 * A spreadsheet metaphor invites bulk paste into fields with clinical
 * consequence. So this is a plugin a consumer imports deliberately, the
 * clinical recipes do not register it, and paste is separately gated from copy
 * — a worklist that may be copied out is not automatically a worklist that may
 * be pasted into.
 *
 * Two rules the writer enforces and cannot be asked not to:
 *
 *   1. **A masked cell copies masked.** The clipboard is an export. Every
 *      argument for masking a file applies to the thing a user pastes into an
 *      email thirty seconds later.
 *   2. **Formula injection is neutralised.** A clipboard payload pasted into a
 *      spreadsheet is executed exactly like a CSV one, and the same
 *      patient-supplied name is on the other end of it.
 */
import { gridError, type ExportValue, type GridAction, type GridError, type RowId } from "@oxygenui-design/grid-core";

// ── range selection ─────────────────────────────────────────────────────────

export interface CellRef {
  readonly rowIndex: number;
  readonly columnKey: string;
}

export interface Range {
  readonly anchor: CellRef;
  readonly focus: CellRef;
}

export interface RangeShape {
  readonly rows: readonly number[];
  readonly columns: readonly string[];
}

/**
 * Normalises a range into the cells it covers.
 *
 * Column order comes from the grid, not from the drag direction: selecting
 * right-to-left must yield the same block as left-to-right, or a copy pastes
 * mirrored.
 */
export function shapeOfRange(range: Range, columnOrder: readonly string[]): RangeShape {
  const lo = Math.min(range.anchor.rowIndex, range.focus.rowIndex);
  const hi = Math.max(range.anchor.rowIndex, range.focus.rowIndex);
  const a = columnOrder.indexOf(range.anchor.columnKey);
  const b = columnOrder.indexOf(range.focus.columnKey);
  if (a === -1 || b === -1) return { rows: [], columns: [] };

  return {
    rows: Array.from({ length: hi - lo + 1 }, (_, i) => lo + i),
    columns: columnOrder.slice(Math.min(a, b), Math.max(a, b) + 1),
  };
}

export const rangeSize = (shape: RangeShape): number => shape.rows.length * shape.columns.length;

// ── the clipboard writer ────────────────────────────────────────────────────

/** Same danger set as the export writer, and for the same reason. */
const DANGEROUS = new Set(["=", "+", "-", "@", "\t", "\r", "＝", "＋", "－", "＠"]);

function neutralise(value: string): string {
  if (value === "") return value;
  if (DANGEROUS.has(value.charAt(0))) return `'${value}`;
  const trimmed = value.replace(/^[  ﻿]+/, "");
  return trimmed !== "" && DANGEROUS.has(trimmed.charAt(0)) ? `'${value}` : value;
}

/** TSV, because that is what a spreadsheet expects from a clipboard. */
function field(v: ExportValue): string {
  // A masked cell copies masked. The clipboard is an export.
  const raw = v.kind === "masked" ? `[withheld: ${v.reason}]` : v.value === null ? "" : String(v.value);
  const safe = neutralise(raw);
  return /[\t\r\n"]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export interface CopyRequest<TRow> {
  readonly shape: RangeShape;
  readonly rowAt: (index: number) => TRow | undefined;
  readonly valueAt: (row: TRow, columnKey: string) => ExportValue;
  /** Column headers, when the caller wants them. Off by default. */
  readonly headers?: Readonly<Record<string, string>>;
  readonly mayCopy?: () => boolean;
}

export type CopyResult =
  | { readonly ok: true; readonly text: string; readonly cells: number; readonly masked: number }
  | { readonly ok: false; readonly reason: string; readonly error: GridError };

export function copyRange<TRow>(request: CopyRequest<TRow>): CopyResult {
  if (request.mayCopy && !request.mayCopy()) {
    return {
      ok: false,
      reason: "The disclosure policy does not permit copy.",
      error: gridError({ code: "disclosure-refused", phase: "copy" }),
    };
  }

  const lines: string[] = [];
  let masked = 0;

  if (request.headers) {
    lines.push(request.shape.columns.map((k) => field({ kind: "value", value: request.headers?.[k] ?? k })).join("\t"));
  }

  for (const rowIndex of request.shape.rows) {
    const row = request.rowAt(rowIndex);
    if (row === undefined) continue;
    lines.push(
      request.shape.columns
        .map((key) => {
          const v = request.valueAt(row, key);
          if (v.kind === "masked") masked++;
          return field(v);
        })
        .join("\t"),
    );
  }

  return { ok: true, text: lines.join("\n"), cells: rangeSize(request.shape), masked };
}

// ── paste ───────────────────────────────────────────────────────────────────

export interface PastePlan {
  readonly rows: readonly (readonly string[])[];
  readonly fits: boolean;
  /** Cells the target range cannot hold. Reported, never silently dropped. */
  readonly overflow: number;
}

/**
 * Plans a paste. It does not perform one.
 *
 * Deliberately returns a plan the caller must confirm: a paste that silently
 * overwrote forty cells is the failure the spreadsheet metaphor invites, and
 * the point of gating it is that somebody sees the number first.
 */
export function planPaste(text: string, target: RangeShape): PastePlan {
  const rows = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((l, i, all) => l !== "" || i < all.length - 1)
    .map((line) => line.split("\t"));

  const capacity = rangeSize(target);
  const incoming = rows.reduce((n, r) => n + r.length, 0);
  return { rows, fits: incoming <= capacity, overflow: Math.max(0, incoming - capacity) };
}

// ── undo ────────────────────────────────────────────────────────────────────

/**
 * Undo over the action log.
 *
 * Only actions that are cleanly invertible are undoable. A page fetch is not,
 * and neither is anything that reached a server — the grid does not un-send a
 * write, because it has no idea whether the server honoured it.
 */
export interface UndoEntry {
  readonly action: GridAction;
  readonly inverse: GridAction;
}

export interface UndoStack {
  readonly past: readonly UndoEntry[];
  readonly future: readonly UndoEntry[];
}

export const emptyUndo = (): UndoStack => ({ past: [], future: [] });

/** `null` when an action cannot be undone. Guessing an inverse is worse than refusing. */
export function invert(action: GridAction, before: { readonly selection?: readonly RowId[] }): GridAction | null {
  switch (action.type) {
    case "select/toggle":
      return action; // its own inverse
    case "select/clear":
      return { type: "select/range", from: before.selection?.[0] ?? "", to: before.selection?.at(-1) ?? "" };
    case "sort/set":
      return { type: "sort/set", sort: [] };
    case "filter/set":
      return { type: "filter/set", node: null };
    case "column/visibility":
      return { ...action, visible: !action.visible };
    default:
      // page/next, rows/upsert, focus/cell and anything that touched a server.
      return null;
  }
}

export function record(stack: UndoStack, entry: UndoEntry): UndoStack {
  // A new action clears the redo future: branching histories are how undo
  // stops being predictable.
  return { past: [...stack.past, entry], future: [] };
}

export function undo(stack: UndoStack): { readonly stack: UndoStack; readonly action: GridAction | null } {
  const entry = stack.past.at(-1);
  if (!entry) return { stack, action: null };
  return {
    stack: { past: stack.past.slice(0, -1), future: [entry, ...stack.future] },
    action: entry.inverse,
  };
}

export function redo(stack: UndoStack): { readonly stack: UndoStack; readonly action: GridAction | null } {
  const entry = stack.future[0];
  if (!entry) return { stack, action: null };
  return {
    stack: { past: [...stack.past, entry], future: stack.future.slice(1) },
    action: entry.action,
  };
}
