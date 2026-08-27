/**
 * @oxygenui-design/grid-react — the React binding.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * AN ADAPTER HAS EXACTLY THREE JOBS. IF IT GROWS A FOURTH, THE STRATEGY HAS
 * FAILED AND SHOULD BE ABANDONED RATHER THAN NURSED.
 *
 *   1. Own the mount point.
 *   2. Marshal React components into `grid-dom`'s cell renderer interface.
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
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import type { GridAction, GridError } from "@oxygenui-design/grid-core";
import {
  createGridRenderer,
  type GridRenderer,
  type GridViewModel,
  type RendererOptions,
} from "@oxygenui-design/grid-dom";

export interface DataGridProps<TRow> {
  readonly model: GridViewModel<TRow>;
  /** The grid's accessible name. "Patient roster", not "grid". */
  readonly label: string;
  readonly onAction: (action: GridAction) => void;
  readonly onError?: (error: GridError) => void;
  readonly cells?: RendererOptions<TRow>["cells"];
  readonly fallback?: RendererOptions<TRow>["fallback"];
  readonly className?: string;
}

/**
 * Job 1 and 2: own the mount point, and hand the renderer stable callbacks.
 *
 * The renderer is created once. `onAction` and `onError` are read through a ref
 * so that an inline arrow function in the consumer's render does not tear the
 * grid down and rebuild it on every keystroke — which would also destroy focus,
 * and focus is the thing this library is most careful about.
 */
export function DataGrid<TRow>(props: DataGridProps<TRow>) {
  const host = useRef<HTMLDivElement | null>(null);
  const renderer = useRef<GridRenderer<TRow> | null>(null);
  const latest = useRef(props);
  latest.current = props;

  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    renderer.current = createGridRenderer<TRow>(el, {
      label: latest.current.label,
      onAction: (a) => latest.current.onAction(a),
      onError: (e) => latest.current.onError?.(e),
      ...(latest.current.cells ? { cells: latest.current.cells } : {}),
      ...(latest.current.fallback ? { fallback: latest.current.fallback } : {}),
    });
    return () => {
      renderer.current?.destroy();
      renderer.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    renderer.current?.render(props.model);
  }, [props.model]);

  return <div ref={host} className={props.className} />;
}

/**
 * Job 3: bridge a core signal to React, without React owning the value.
 *
 * `useSyncExternalStore` rather than `useState` + `useEffect`, so a read during
 * a concurrent render cannot tear — a grid that shows one row's data next to
 * another row's is the worst failure available here.
 */
export function useSignalValue<T>(read: () => T, subscribe: (onChange: () => void) => () => void): T {
  return useSyncExternalStore(subscribe, read, read);
}

/** Reports a grid error to the caller once per change. The grid never sends it anywhere. */
export function useGridErrors(onError: (e: GridError) => void): (e: GridError) => void {
  const ref = useRef(onError);
  useEffect(() => {
    ref.current = onError;
  }, [onError]);
  return (e) => ref.current(e);
}
