/**
 * The smallest thing that makes a demo grid respond to a keyboard.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * Eleven of the fourteen grids in this playground were built with
 * `onAction: () => {}`. A renderer that emits into nothing has no focus: the
 * model's `focus` is always `null`, so every paint resolves it to the header's
 * first column and the single tab stop never leaves the header row. Arrowing
 * down did nothing, selecting did nothing, and the keyboard story the library
 * is most careful about was invisible in almost every panel demonstrating it.
 *
 * It was found by pressing ArrowRight forty-five times in the 250-column panel
 * and noticing the focused element was still a `columnheader`.
 *
 * This is what a host has to do, and all it has to do: hold the state, hand it
 * back in the view model, and repaint. The reducer is the library's own, so a
 * panel wired through this exercises the real thing rather than a demo-shaped
 * imitation of it.
 */
import {
  initialState, reduce,
  type FocusTarget, type GridAction, type GridState, type RowId, type SortSpec,
} from "@oxygenui-design/grid-core";

export interface Live {
  /** Hand this to the renderer. */
  readonly onAction: (action: GridAction) => void;
  readonly focus: FocusTarget | null;
  readonly selection: readonly RowId[];
  readonly sort: readonly SortSpec[];
  readonly state: GridState;
  /** For a panel that wants to preset one, e.g. an initial sort. */
  set(next: Partial<GridState>): void;
}

export interface LiveOptions {
  /** Called after any action that changed the state. */
  readonly repaint: () => void;
  /** Row ids in view order, for `select/range` and `select/all`. */
  readonly rowIds: () => readonly RowId[];
}

export function liveState(options: LiveOptions): Live {
  let state = initialState();

  const live: Live = {
    onAction(action) {
      const before = state;
      state = reduce(state, action, { rowIds: options.rowIds() });
      if (state !== before) options.repaint();
    },
    get focus() {
      return state.focus;
    },
    get selection() {
      return state.selection;
    },
    get sort() {
      return state.sort;
    },
    get state() {
      return state;
    },
    set(next) {
      state = { ...state, ...next };
      options.repaint();
    },
  };
  return live;
}
