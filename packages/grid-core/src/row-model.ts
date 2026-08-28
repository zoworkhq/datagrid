/**
 * The row models.
 *
 * Reads go through signals, so a hover does not re-run filtering and a filter
 * does not re-run sorting. This is where TanStack measured +79% row processing
 * and −86% retained heap moving from an observer layer to signals, and it is
 * the difference between a grid that is usable at 100,000 rows and one that is
 * not.
 *
 *   source → filtered → sorted → result
 *
 * Grouping sits between sorted and result in wave 3; disclosure sits after it
 * in wave 4, before geometry — a masked row must be masked before it is
 * measured. Windowing is wave 2 and consumes `result`.
 */
import { computed, signal, type ReadSignal } from "@oxygenui-design/grid-signals";
import { gridError, sanitiseError, type GridError } from "./errors.js";
import { evaluateFilter, type Accessor } from "./filter-eval.js";
import type { GridDataSource, GridQuery, SortSpec } from "./query.js";
import { sortRows, type Comparator } from "./sort.js";
import type { GridState } from "./state.js";

export interface ModelRow<TRow> {
  readonly id: string;
  readonly row: TRow;
  /** Absolute position in the whole result set, 0-based. */
  readonly index: number;
}

export interface RowModelResult<TRow> {
  readonly rows: readonly ModelRow<TRow>[];
  readonly total: number | "unknown";
  readonly loading: boolean;
  /** Emitted to the caller, never sent anywhere. Coordinates only. */
  readonly errors: readonly GridError[];
}

export interface RowModel<TRow> {
  readonly result: ReadSignal<RowModelResult<TRow>>;
  setState(state: GridState): void;
  destroy(): void;
}

/**
 * ── PROVISIONAL. NOT YET MEASURED. ──────────────────────────────────────────
 *
 * The real constant is measured on the CI machine at the density where the
 * budget breaks, and is blocked on the wave 2 benchmark. This placeholder comes
 * from the published ceiling in the architecture review (~100k), NOT from our
 * own measurement, and it must not be cited as though it were.
 *
 * For scale: TanStack Table v9 — the best-measured engine in the category —
 * retains 380 MB for one million rows by eight columns. A clinical grid has
 * forty, on a shared workstation with 4 GB and an EHR already open.
 */
export const PROVISIONAL_CLIENT_ROW_CEILING = 100_000;

export interface ClientRowModelOptions<TRow> {
  readonly rows: readonly TRow[];
  readonly rowKey: (row: TRow) => string;
  readonly get: Accessor<TRow>;
  readonly comparators?: Readonly<Record<string, Comparator<TRow>>>;
  readonly maxRows?: number;
}

/** Ordering for a column with no explicit comparator. Refuses what it cannot order. */
function defaultComparator<TRow>(get: Accessor<TRow>, key: string): Comparator<TRow> {
  return (a, b) => {
    const x = get(a, key);
    const y = get(b, key);
    // A missing value is not "smallest" — it is unordered against a present
    // one, and pretending otherwise is how an empty cell sorts to the top of a
    // worklist as though it were the most urgent.
    if (x === null || x === undefined || y === null || y === undefined) {
      return x === y ? 0 : "incomparable";
    }
    if (typeof x === "number" && typeof y === "number") return x - y;
    if (typeof x === "boolean" && typeof y === "boolean") return Number(x) - Number(y);
    if (typeof x === "string" && typeof y === "string") return x.localeCompare(y);
    return "incomparable";
  };
}

export function createClientRowModel<TRow>(options: ClientRowModelOptions<TRow>): RowModel<TRow> {
  const ceiling = options.maxRows ?? PROVISIONAL_CLIENT_ROW_CEILING;
  const source = signal(options.rows);
  const state = signal<GridState | null>(null);

  const comparatorFor = (key: string): Comparator<TRow> =>
    options.comparators?.[key] ?? defaultComparator(options.get, key);

  const filtered = computed(() => {
    const s = state();
    const rows = source();
    if (!s?.filter) return rows;
    return rows.filter((r) => evaluateFilter(s.filter, r, options.get));
  });

  const sorted = computed(() => {
    const s = state();
    const rows = filtered();
    if (!s || s.sort.length === 0) return rows;
    const comparators: Record<string, Comparator<TRow>> = {};
    for (const spec of s.sort) comparators[spec.key] = comparatorFor(spec.key);
    return sortRows(rows, s.sort, comparators).rows;
  });

  const result = computed<RowModelResult<TRow>>(() => {
    const all = source();
    // The refusal. The grid cannot read `process.env` (Oxygen ADR 0009 forbids
    // it, and it does not exist in every consumer's build), so it cannot know
    // development from production and does not pretend to: it always refuses
    // the same way and emits the reason. Degrading to server mode is the
    // application's decision, because the application owns the data source.
    //
    // A silent four-second sort is worse than a clear error.
    if (all.length > ceiling) {
      return {
        rows: [],
        total: all.length,
        loading: false,
        errors: [gridError({ code: "client-mode-refused", phase: "query" })],
      };
    }
    const rows = sorted().map((row, index) => ({ id: options.rowKey(row), row, index }));
    return { rows, total: rows.length, loading: false, errors: [] };
  });

  return {
    result,
    setState(next) {
      state.set(next);
    },
    destroy() {
      source.set([]);
      state.set(null);
    },
  };
}

export interface ServerRowModelOptions<TRow> {
  readonly dataSource: GridDataSource<TRow>;
  readonly rowKey: (row: TRow) => string;
}

export function queryFrom(state: GridState, sort: readonly SortSpec[]): GridQuery {
  return {
    sort,
    filter: state.filter,
    pageSize: state.pageSize,
    cursor: state.cursor,
    // Cursor is the default and offset is the special case (ADR 0005): against
    // FHIR there is no offset to choose. Offset paging arrives with the
    // pagination control in wave 2, for the non-FHIR sources that support it.
    offset: null,
  };
}

export function createServerRowModel<TRow>(options: ServerRowModelOptions<TRow>): RowModel<TRow> {
  const { dataSource, rowKey } = options;
  const caps = dataSource.capabilities;
  const result = signal<RowModelResult<TRow>>({ rows: [], total: "unknown", loading: false, errors: [] });

  let inflight: AbortController | null = null;
  let generation = 0;
  let destroyed = false;

  async function run(state: GridState): Promise<void> {
    // Without cancellation, fast typing renders the second-to-last answer.
    inflight?.abort();
    const controller = new AbortController();
    inflight = controller;
    const mine = ++generation;

    const errors: GridError[] = [];

    // A server may refuse a sort key. Asking anyway and rendering the result
    // would put a sorted header over an unsorted list, and once the column is a
    // risk score that is a clinical claim.
    let sort = state.sort;
    if (caps?.sortableKeys) {
      const allowed = new Set(caps.sortableKeys);
      const refused = sort.filter((s) => !allowed.has(s.key));
      for (const s of refused) {
        errors.push(gridError({ code: "sort-not-honoured", phase: "query", columnKey: s.key }));
      }
      sort = sort.filter((s) => allowed.has(s.key));
    }

    result.update((r) => ({ ...r, loading: true, errors }));
    const query = queryFrom(state, sort);

    try {
      const page = await dataSource.getRows(query, controller.signal);
      if (destroyed || mine !== generation) return; // a newer query won

      // The server may have silently ignored a sort it never declared.
      for (const asked of sort) {
        const applied = page.appliedSort.find((a) => a.key === asked.key);
        if (!applied || applied.direction !== asked.direction) {
          errors.push(gridError({ code: "sort-not-honoured", phase: "query", columnKey: asked.key }));
        }
      }
      // `_count` is commonly capped at 100. The page size is negotiated, not
      // chosen, and the grid must say when it got less than it asked for.
      if (page.appliedPageSize !== undefined && page.appliedPageSize < query.pageSize) {
        errors.push(gridError({ code: "page-size-reduced", phase: "query" }));
      }

      // A fresh query replaces; following a cursor appends. Indices continue
      // across pages so `aria-rowindex` stays absolute — the whole point of
      // carrying an index rather than a position in the window.
      const previous = state.cursor === null ? [] : result().rows;
      const appended = page.rows.map((row, i) => ({
        id: rowKey(row),
        row,
        index: previous.length + i,
      }));
      result.set({
        rows: [...previous, ...appended],
        total: page.total,
        loading: false,
        errors,
      });
    } catch (thrown) {
      if (destroyed || mine !== generation) return;
      if (controller.signal.aborted) return; // superseded, not failed
      result.set({
        rows: [],
        total: "unknown",
        loading: false,
        errors: [...errors, sanitiseError(thrown, { code: "source-threw", phase: "query" })],
      });
    }
  }

  return {
    result,
    setState(next) {
      if (!destroyed) void run(next);
    },
    destroy() {
      destroyed = true;
      inflight?.abort();
      inflight = null;
    },
  };
}
