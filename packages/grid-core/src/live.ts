/**
 * Live updates that do not move under the hand.
 *
 * ── THE RULE THAT MAKES THIS DIFFERENT ──────────────────────────────────────
 *
 * Standard grids re-sort on change. In a census that is a wrong-patient
 * generator: you aim at row four, an admission inserts at row two, and you
 * click the person who moved into your target.
 *
 * So while a pointer or keyboard focus is inside the body, the list is
 * **frozen**:
 *
 *   - a new row does not appear — it queues behind a divider, and only a
 *     counter moves;
 *   - an existing row still updates its VALUES in place, because stale data is
 *     its own hazard — but it never changes position;
 *   - a row that leaves the set is MARKED as departed and keeps its slot,
 *     because removing it shifts every row below it.
 *
 * Nothing is dropped and nothing is hidden. Everything that happened is
 * visible, and the reader chooses when the list reorders.
 *
 * This is pure state, so the property that matters — an update never changes
 * the index of the row under the pointer — is testable without a renderer.
 * ────────────────────────────────────────────────────────────────────────────
 */
import type { RowId } from "./actions.js";

export interface LiveState<TRow> {
  /** The displayed order. While frozen, positions in here never change. */
  readonly rows: readonly TRow[];
  /** Arrivals waiting behind the divider. */
  readonly queued: readonly TRow[];
  /** Rows that left the set while frozen. They keep their slot, marked. */
  readonly departed: ReadonlySet<RowId>;
  readonly frozen: boolean;
}

export interface LiveOptions<TRow> {
  readonly rowKey: (row: TRow) => RowId;
}

export function createLiveState<TRow>(rows: readonly TRow[] = []): LiveState<TRow> {
  return { rows, queued: [], departed: new Set(), frozen: false };
}

/** Called when a pointer enters the body, or focus moves into it. */
export function freeze<TRow>(state: LiveState<TRow>): LiveState<TRow> {
  return state.frozen ? state : { ...state, frozen: true };
}

/**
 * Called when the pointer leaves and focus is elsewhere.
 *
 * Thawing does NOT release the queue. The reader asked for nothing; releasing
 * here would move the list at the moment they looked away, which is the same
 * failure one step removed.
 */
export function thaw<TRow>(state: LiveState<TRow>): LiveState<TRow> {
  return state.frozen ? { ...state, frozen: false } : state;
}

/**
 * Applies pushed rows.
 *
 * An existing row is updated in place at its current index. A new row is
 * appended when thawed, and queued when frozen.
 */
export function upsert<TRow>(
  state: LiveState<TRow>,
  incoming: readonly TRow[],
  { rowKey }: LiveOptions<TRow>,
): LiveState<TRow> {
  if (incoming.length === 0) return state;

  const index = new Map<RowId, number>();
  state.rows.forEach((row, i) => index.set(rowKey(row), i));
  const queuedIndex = new Map<RowId, number>();
  state.queued.forEach((row, i) => queuedIndex.set(rowKey(row), i));

  let rows: TRow[] | null = null;
  let queued: TRow[] | null = null;
  let departed: Set<RowId> | null = null;

  for (const row of incoming) {
    const id = rowKey(row);
    const at = index.get(id);

    if (at !== undefined) {
      // Update in place. The value changes; the position does not.
      rows ??= [...state.rows];
      rows[at] = row;
      // A row that comes back after leaving is no longer departed.
      if (state.departed.has(id)) {
        departed ??= new Set(state.departed);
        departed.delete(id);
      }
      continue;
    }

    const queuedAt = queuedIndex.get(id);
    if (queuedAt !== undefined) {
      queued ??= [...state.queued];
      queued[queuedAt] = row;
      continue;
    }

    if (state.frozen) {
      queued ??= [...state.queued];
      queuedIndex.set(id, queued.length);
      queued.push(row);
    } else {
      rows ??= [...state.rows];
      index.set(id, rows.length);
      rows.push(row);
    }
  }

  return {
    rows: rows ?? state.rows,
    queued: queued ?? state.queued,
    departed: departed ?? state.departed,
    frozen: state.frozen,
  };
}

/**
 * Removes rows.
 *
 * While frozen the row keeps its slot and is marked departed, because deleting
 * it shifts every row below — including the one under the pointer.
 */
export function remove<TRow>(
  state: LiveState<TRow>,
  ids: readonly RowId[],
  { rowKey }: LiveOptions<TRow>,
): LiveState<TRow> {
  if (ids.length === 0) return state;
  const gone = new Set(ids);

  if (state.frozen) {
    const departed = new Set(state.departed);
    for (const id of ids) if (state.rows.some((r) => rowKey(r) === id)) departed.add(id);
    return {
      ...state,
      departed,
      queued: state.queued.filter((r) => !gone.has(rowKey(r))),
    };
  }

  const departed = new Set(state.departed);
  for (const id of ids) departed.delete(id);
  return {
    ...state,
    rows: state.rows.filter((r) => !gone.has(rowKey(r))),
    queued: state.queued.filter((r) => !gone.has(rowKey(r))),
    departed,
  };
}

/**
 * Releases the queue — the reader asked for it, by pressing the arrivals bar.
 *
 * Departed rows are dropped here and arrivals are appended. The caller re-sorts
 * afterwards; this function deliberately does not, because sorting is the
 * caller's policy and doing it here would hide a reorder inside a release.
 */
export function release<TRow>(
  state: LiveState<TRow>,
  { rowKey }: LiveOptions<TRow>,
): LiveState<TRow> {
  if (state.queued.length === 0 && state.departed.size === 0) return state;
  return {
    rows: [...state.rows.filter((r) => !state.departed.has(rowKey(r))), ...state.queued],
    queued: [],
    departed: new Set(),
    frozen: state.frozen,
  };
}

/** What the arrivals bar shows. The only thing that moves at 1,000 updates a second. */
export function arrivalCount<TRow>(state: LiveState<TRow>): number {
  return state.queued.length;
}

/** Whether a row is still in the set. A departed row is shown, and marked. */
export function hasDeparted<TRow>(state: LiveState<TRow>, id: RowId): boolean {
  return state.departed.has(id);
}
