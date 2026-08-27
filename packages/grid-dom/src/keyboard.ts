/**
 * Keyboard resolution: an event becomes a chord, a chord becomes a binding.
 *
 * Separated from the renderer so the keymap can be replaced (it is data in
 * `grid-core`) and so every binding can be exercised without dispatching a
 * DOM event. The keyboard tests never dispatch a pointer event — an operation
 * with no keyboard path fails there rather than in an audit.
 */
import type { KeyBinding, KeyContext } from "@oxygenui-design/grid-core";
import type { FocusMove } from "./focus.js";

export interface ChordSource {
  readonly key: string;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly shiftKey?: boolean;
  readonly altKey?: boolean;
}

/**
 * Modifier order is fixed — Control, Alt, Shift — so a keymap entry is a
 * string a person can read and a test can write literally.
 *
 * Meta is folded into Control so one keymap serves macOS and Windows. A
 * clinician moving between a ward workstation and their own laptop should not
 * meet two keymaps.
 */
export function chordOf(e: ChordSource): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("Control");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  parts.push(e.key);
  return parts.join("+");
}

export function resolveBinding(
  keymap: readonly KeyBinding[],
  context: Exclude<KeyContext, "any">,
  chord: string,
): KeyBinding | null {
  return (
    keymap.find((b) => b.keys === chord && b.context === context) ??
    keymap.find((b) => b.keys === chord && b.context === "any") ??
    null
  );
}

const MOVES: Readonly<Record<string, FocusMove>> = {
  "cell.left": "left",
  "cell.right": "right",
  "cell.up": "up",
  "cell.down": "down",
  "row.start": "rowStart",
  "row.end": "rowEnd",
  "grid.start": "gridStart",
  "grid.end": "gridEnd",
  "column.top": "columnTop",
  "column.bottom": "columnBottom",
  "page.up": "pageUp",
  "page.down": "pageDown",
};

/** `null` for a binding that is not a movement — selection, sort, edit. */
export function moveForBinding(binding: KeyBinding): FocusMove | null {
  return MOVES[binding.id] ?? null;
}
