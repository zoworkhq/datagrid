/**
 * @oxygenui-design/grid-react — the React binding.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * AN ADAPTER HAS EXACTLY THREE JOBS. IF IT GROWS A FOURTH, THE STRATEGY HAS
 * FAILED AND SHOULD BE ABANDONED RATHER THAN NURSED.
 *
 *   1. Own the mount point.
 *   2. Marshal React components into `grid-dom`'s cell renderer interface,
 *      keeping portal identity stable across node recycling so React does not
 *      remount on every scroll frame.
 *   3. Bridge React's reactivity to core signals.
 *
 * No grid logic. No sorting, no filtering, no ARIA, no keyboard handling — all
 * of that lives in `grid-core` and `grid-dom`, written once for every adapter.
 * The cross-adapter accessibility-tree assertion is what makes that statement
 * enforceable rather than aspirational, from the day the second adapter exists.
 *
 * The budget is 4 KB. At the end of wave 4, if the Angular adapter is larger
 * than ~8 KB or contains any logic this one also contains, the abstraction is
 * in the wrong place.
 *
 * @see ../../../docs/decisions/0006-the-grids-layers-are-named-not-numbered.md
 * ────────────────────────────────────────────────────────────────────────────
 */
import { useSyncExternalStore } from "react";
import type { GridAction, GridDataSource, ColumnDef } from "@oxygenui-design/grid-core";

export interface DataGridProps<TRow> {
  readonly columns: readonly ColumnDef<TRow>[];
  readonly dataSource: GridDataSource<TRow>;
  readonly rowKey: keyof TRow & string;
  readonly onAction?: (action: GridAction) => void;
}

/** Job 3: bridge a core signal to React, without React owning the value. */
export function useSignalValue<T>(read: () => T, subscribe: (onChange: () => void) => () => void): T {
  return useSyncExternalStore(subscribe, read, read);
}
