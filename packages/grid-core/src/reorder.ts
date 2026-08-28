/**
 * Row and column reordering, and keymap overrides.
 *
 * Reordering is grouped with the keymap here for one reason: WCAG 2.2 SC 2.5.7
 * makes a drag-only reorder a failure, so a reorder that exists without a
 * keyboard path is not a feature, it is a defect. The two ship together or not
 * at all.
 */
import type { RowId } from "./actions.js";
import type { KeyBinding } from "./keymap.js";

// ── reordering ──────────────────────────────────────────────────────────────

/** Moves one item to an index. Pure, and clamped rather than throwing. */
export function moveTo<T>(items: readonly T[], from: number, to: number): readonly T[] {
  if (from < 0 || from >= items.length) return items;
  const target = Math.max(0, Math.min(to, items.length - 1));
  if (target === from) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return items;
  next.splice(target, 0, moved);
  return next;
}

export function moveRow<TRow>(
  rows: readonly TRow[],
  rowKey: (row: TRow) => RowId,
  id: RowId,
  to: number,
): readonly TRow[] {
  return moveTo(rows, rows.findIndex((r) => rowKey(r) === id), to);
}

/**
 * The keyboard path a drag must also have.
 *
 * `Control+Shift+Arrow` moves the focused row or column one step. Announced by
 * the live region, because a move nobody can hear is a move a screen-reader
 * user cannot verify.
 */
export function describeMove(what: string, from: number, to: number, total: number): string {
  return `${what} moved from position ${from + 1} to ${to + 1} of ${total}`;
}

// ── keymap overrides ────────────────────────────────────────────────────────

/**
 * A user's remapping, as a serialisable document.
 *
 * A clinician with nine years of muscle memory in one EHR has something worth
 * more than our defaults. The keymap has always been data; this is what makes
 * a *replacement* storable, shareable and checkable.
 */
export interface KeymapOverride {
  readonly id: string;
  /** binding id → chord. A chord of `null` unbinds it. */
  readonly bindings: Readonly<Record<string, string | null>>;
}

export interface KeymapProblem {
  readonly kind: "unknown-binding" | "conflict";
  readonly bindingId: string;
  readonly detail: string;
}

export interface ResolvedKeymap {
  readonly keymap: readonly KeyBinding[];
  readonly problems: readonly KeymapProblem[];
}

/**
 * Applies an override, and reports what it could not honour.
 *
 * A conflict is REPORTED, not resolved by precedence. Two bindings on one
 * chord means one of them silently stops working, and the user who remapped it
 * is the last person who would notice.
 */
export function applyKeymapOverride(
  base: readonly KeyBinding[],
  override: KeymapOverride,
): ResolvedKeymap {
  const problems: KeymapProblem[] = [];
  const known = new Set(base.map((b) => b.id));

  for (const id of Object.keys(override.bindings)) {
    if (!known.has(id)) {
      problems.push({
        kind: "unknown-binding",
        bindingId: id,
        detail: `"${id}" is not a binding in this build`,
      });
    }
  }

  const remapped = base
    .map((b) => {
      if (!(b.id in override.bindings)) return b;
      const chord = override.bindings[b.id];
      return chord === null ? null : { ...b, keys: chord };
    })
    .filter((b): b is KeyBinding => b !== null);

  const seen = new Map<string, string>();
  for (const b of remapped) {
    const slot = `${b.context}:${b.keys}`;
    const existing = seen.get(slot);
    if (existing) {
      problems.push({
        kind: "conflict",
        bindingId: b.id,
        detail: `${b.keys} in ${b.context} is already bound to "${existing}"`,
      });
    } else seen.set(slot, b.id);
  }

  return { keymap: remapped, problems };
}

/** Round-trips through storage. A remapping nobody can save is a remapping nobody keeps. */
export function parseKeymapOverride(input: string | unknown): KeymapOverride | null {
  let raw: unknown = input;
  if (typeof input === "string") {
    try {
      raw = JSON.parse(input);
    } catch {
      return null;
    }
  }
  if (raw === null || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  if (typeof v["id"] !== "string" || typeof v["bindings"] !== "object" || v["bindings"] === null) return null;
  return raw as KeymapOverride;
}
