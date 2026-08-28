/**
 * Lazily-loaded branches, for the server-side row model.
 *
 * Expanding a group at 500,000 rows cannot mean fetching 500,000 rows, so a
 * branch is fetched when it opens. That introduces three states a flat grid
 * never has, and the whole value of this file is refusing to collapse them
 * into one:
 *
 *   unresolved  not fetched. NOT the same as empty.
 *   loading     in flight.
 *   failed      the request failed. Also NOT the same as empty, and it
 *               escalates into coverage as `source-unreachable`, because a
 *               branch nobody could read is part of what the query did not
 *               reach.
 *   resolved    fetched, and possibly genuinely empty — which is a real answer
 *               and looks different from all three above.
 *
 * Every grid that renders a failed fetch as an empty branch tells the reader a
 * plan has no goals when in fact the request timed out.
 */
import { gridError, sanitiseError, type GridError } from "./errors.js";
import type { RowId } from "./actions.js";

export type BranchState<TRow> =
  | { readonly status: "unresolved" }
  | { readonly status: "loading" }
  | { readonly status: "resolved"; readonly rows: readonly TRow[] }
  | { readonly status: "failed"; readonly error: GridError };

export interface BranchSource<TRow> {
  /** Fetches the children of one branch. The `AbortSignal` is the store's. */
  getChildren(path: string, signal: AbortSignal): Promise<readonly TRow[]>;
}

export interface BranchStore<TRow> {
  state(path: string): BranchState<TRow>;
  /** Fetches if needed. Safe to call on every render; in-flight paths are not refetched. */
  request(path: string): void;
  /** Drops a branch, so reopening it fetches fresh. */
  invalidate(path: string): void;
  invalidateAll(): void;
  /** Paths that failed. These escalate into coverage. */
  failures(): readonly string[];
  destroy(): void;
}

const UNRESOLVED: BranchState<never> = { status: "unresolved" };

export interface BranchStoreOptions<TRow> {
  readonly source: BranchSource<TRow>;
  readonly onChange?: () => void;
}

export function createBranchStore<TRow>(options: BranchStoreOptions<TRow>): BranchStore<TRow> {
  const states = new Map<string, BranchState<TRow>>();
  const inflight = new Map<string, AbortController>();
  let destroyed = false;

  const set = (path: string, state: BranchState<TRow>): void => {
    states.set(path, state);
    options.onChange?.();
  };

  return {
    state(path) {
      return states.get(path) ?? (UNRESOLVED as BranchState<TRow>);
    },

    request(path) {
      if (destroyed) return;
      const current = states.get(path);
      // Already loading, already loaded, or already known to have failed.
      // Retrying a failure automatically would hammer a struggling server and
      // hide the failure from the reader; `invalidate` is the retry.
      if (current && current.status !== "unresolved") return;

      const controller = new AbortController();
      inflight.set(path, controller);
      set(path, { status: "loading" });

      options.source
        .getChildren(path, controller.signal)
        .then((rows) => {
          if (destroyed || controller.signal.aborted) return;
          inflight.delete(path);
          // A genuinely empty branch is a real answer, and it is stored as
          // resolved-with-nothing rather than left unresolved.
          set(path, { status: "resolved", rows });
        })
        .catch((thrown: unknown) => {
          if (destroyed || controller.signal.aborted) return;
          inflight.delete(path);
          set(path, {
            status: "failed",
            error: sanitiseError(thrown, { code: "source-unreachable", phase: "query" }),
          });
        });
    },

    invalidate(path) {
      inflight.get(path)?.abort();
      inflight.delete(path);
      states.delete(path);
      options.onChange?.();
    },

    invalidateAll() {
      for (const controller of inflight.values()) controller.abort();
      inflight.clear();
      states.clear();
      options.onChange?.();
    },

    failures() {
      return [...states].filter(([, s]) => s.status === "failed").map(([path]) => path);
    },

    destroy() {
      destroyed = true;
      for (const controller of inflight.values()) controller.abort();
      inflight.clear();
      states.clear();
    },
  };
}

/**
 * The error a caller folds into coverage when branches failed.
 *
 * A failed branch is not a rendering problem, it is a gap in what the query
 * reached — the same escalation the `source-unreachable` absence reason makes
 * for a single cell.
 */
export function coverageErrorFor(failed: readonly string[]): GridError | null {
  return failed.length === 0
    ? null
    : gridError({ code: "source-unreachable", phase: "query", columnKey: null, rowIndex: null });
}

/** Children of a branch for flattening: the rows, or a marker to render instead. */
export type BranchChildren<TRow> =
  | { readonly kind: "rows"; readonly rows: readonly TRow[] }
  | { readonly kind: "marker"; readonly state: "unresolved" | "loading" | "failed" };

export function childrenOf<TRow>(state: BranchState<TRow>): BranchChildren<TRow> {
  switch (state.status) {
    case "resolved":
      return { kind: "rows", rows: state.rows };
    case "loading":
      return { kind: "marker", state: "loading" };
    case "failed":
      return { kind: "marker", state: "failed" };
    case "unresolved":
      return { kind: "marker", state: "unresolved" };
  }
}

/** A stable path for a nested group, so expansion survives a sort or a refetch. */
export function branchPath(parent: string, columnKey: string, value: unknown): string {
  const segment = `${columnKey}=${String(value)}`;
  return parent === "" ? segment : `${parent}/${segment}`;
}

/** Row identity within a lazily-loaded tree, so selection survives a refetch. */
export function branchRowId(path: string, id: RowId): string {
  return `${path}#${id}`;
}
