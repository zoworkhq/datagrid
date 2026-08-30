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
import { duplicateIdError, findDuplicateIds, type DuplicateReport } from "./identity.js";

/** Shared, so a clean result allocates no array at all. */
const EMPTY_ERRORS: readonly GridError[] = [];
import { evaluateFilter, type Accessor } from "./filter-eval.js";
import type { GridDataSource, GridQuery, SortSpec, SourceCapabilities } from "./query.js";
import { sortRows, type Comparator } from "./sort.js";
import { createSortIndex, type SortIndex } from "./sort-index.js";
import type { GridState } from "./state.js";

export interface ModelRow<TRow> {
  readonly id: string;
  readonly row: TRow;
  /** Absolute position in the whole result set, 0-based. */
  readonly index: number;
}

export interface RowModelResult<TRow> {
  /**
   * Every row, wrapped.
   *
   * ── PREFER `rowsIn` ──────────────────────────────────────────────────────
   *
   * Reading this materialises one `{id, row, index}` object PER ROW, and the
   * grid renders about thirty of them. At a million rows that is a million
   * allocations to display thirty, repeated on every sort and every filter,
   * all of it garbage a frame later — measured at 5.4 ms of the 7.0 ms a
   * re-sort costs, which is most of it.
   *
   * It is a lazy getter, so a caller that only uses `rowsIn` never pays. It
   * stays because it is the existing contract and because a caller who wants
   * the whole set — an export, a select-all — genuinely needs it.
   */
  readonly rows: readonly ModelRow<TRow>[];
  /**
   * The rows a viewport actually shows.
   *
   * Wraps only `[start, end)`, which is the access pattern a virtualised grid
   * has. Cost is a function of the window, not of the set.
   */
  rowsIn(start: number, end: number): readonly ModelRow<TRow>[];
  /** How many rows the view holds, without materialising any of them. */
  readonly length: number;
  readonly total: number | "unknown";
  readonly loading: boolean;
  /** Emitted to the caller, never sent anywhere. Coordinates only. */
  readonly errors: readonly GridError[];
}

/**
 * A result over rows that are already wrapped.
 *
 * For the models that hold materialised rows anyway — the server and block
 * models hold a page or a block, which is already window-sized, so there is
 * nothing to be lazy about. Keeps every model producing the same shape.
 */
export function resultOf<TRow>(
  rows: readonly ModelRow<TRow>[],
  rest: {
    readonly total: number | "unknown";
    readonly loading: boolean;
    readonly errors: readonly GridError[];
  },
): RowModelResult<TRow> {
  return {
    rows,
    length: rows.length,
    rowsIn: (start, end) => rows.slice(Math.max(0, start), Math.max(0, end)),
    ...rest,
  };
}

export interface RowModel<TRow> {
  readonly result: ReadSignal<RowModelResult<TRow>>;
  setState(state: GridState): void;
  destroy(): void;
}

/**
 * ── A DEFAULT, NOT A MEASUREMENT — AND THE RIGHT NUMBER IS YOURS ────────────
 *
 * This is the published ceiling from the architecture review (~100k), not a
 * number measured on your hardware. It cannot be: the constant that decides
 * whether client mode is offered is TOTAL RETAINED HEAP on the device the grid
 * runs on, and that varies by deployment more than it varies by grid.
 *
 * For scale: TanStack Table v9 — the best-measured engine in the category —
 * retains 380 MB for one million rows by eight columns. A clinical grid has
 * forty, on a shared workstation with 4 GB and an EHR already open.
 *
 * **Measure your own and pass it as `maxRows`.** The procedure:
 *
 *   1. Load a representative row shape — your real column count, not eight.
 *   2. Take a heap snapshot on the target device class, not a developer laptop.
 *   3. Find the row count where retained heap crosses what that device can
 *      spare with the applications a clinician actually has open.
 *   4. Use it. It will be lower than this default, and it should be.
 *
 * `bench/browser.mjs` runs the interaction half of that on a CPU-throttled
 * Chromium; the heap half needs the real machine.
 *
 * ── AND IT IS OPTIMISTIC. MEASURED. ─────────────────────────────────────────
 *
 * `bench/device-profile.mjs` walks a size ladder until an interaction crosses
 * an interaction budget — 100 ms for a sort or filter, one frame for a scroll.
 * On the machine this library is developed on:
 *
 *   8 cores, unthrottled     50,000 rows      (sort crosses 100 ms at 100k)
 *   the same, 4x throttled   10,000 rows
 *   the same, 8x throttled    1,000 rows
 *
 * So this default is roughly 2x optimistic on a developer laptop and an order
 * of magnitude optimistic on anything slower — and a shared ward workstation
 * with an EHR already open is slower than 4x throttling, which emulates a
 * slower CPU and not a contended one.
 *
 * The number is NOT lowered here, deliberately. Lowering it would make the
 * grid refuse work that many deployments handle fine, and the right ceiling
 * genuinely is a property of the device rather than of the library. What has
 * changed is that there is now a tool that measures it:
 *
 *     node bench/device-profile.mjs            # on the machine that matters
 *
 * Run it on the target device class and pass the number it prints.
 */
export const DEFAULT_CLIENT_ROW_CEILING = 100_000;

/**
 * @deprecated Renamed to `DEFAULT_CLIENT_ROW_CEILING`. The old name implied a
 * measurement was pending; it is a default, and the measured number is the
 * deployment's to supply.
 */
export const PROVISIONAL_CLIENT_ROW_CEILING = DEFAULT_CLIENT_ROW_CEILING;

export interface ClientRowModelOptions<TRow> {
  readonly rows: readonly TRow[];
  readonly rowKey: (row: TRow) => string;
  readonly get: Accessor<TRow>;
  readonly comparators?: Readonly<Record<string, Comparator<TRow>>>;
  /**
   * The row count above which client mode refuses.
   *
   * Measure it on your target device class rather than taking the default —
   * see `DEFAULT_CLIENT_ROW_CEILING`.
   */
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
  const ceiling = options.maxRows ?? DEFAULT_CLIENT_ROW_CEILING;
  const source = signal(options.rows);
  const state = signal<GridState | null>(null);

  const comparatorFor = (key: string): Comparator<TRow> =>
    options.comparators?.[key] ?? defaultComparator(options.get, key);

  /**
   * ── THE INDEXED SORT PATH ────────────────────────────────────────────────
   *
   * Built lazily per column and reused, which is what makes it worth the build
   * pass: measured at 100,000 rows the comparator path costs 97.8 ms per sort
   * and the indexed one 1.6 ms on every sort after the first — 59.9x, and 71.6x
   * at a million.
   *
   * It is only reachable when the caller supplied NO comparator for the column.
   * A custom comparator is an ordering nobody here can see through, so a column
   * with one takes the comparator path and pays for it. The index also refuses
   * mixed-type columns and objects rather than inventing an order.
   *
   * Rebuilt whenever the source array changes identity: keys built from the old
   * array would order rows that no longer exist.
   */
  let index: SortIndex | null = null;
  let indexedRows: readonly TRow[] | null = null;

  function indexFor(rows: readonly TRow[]): SortIndex {
    if (index === null || indexedRows !== rows) {
      index = createSortIndex(rows, options.get);
      indexedRows = rows;
    }
    return index;
  }

  /** Whether one sort spec can go through the index at all. */
  const indexable = (spec: SortSpec): boolean => options.comparators?.[spec.key] === undefined;

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

    // Single indexed key: the fast path, and the overwhelmingly common one —
    // a worklist is sorted by one column at a time.
    const only = s.sort.length === 1 ? s.sort[0] : undefined;
    if (only && indexable(only)) {
      const order = indexFor(rows).order(only.key, only.direction);
      if (order) {
        // One pass, one array. The comparator path allocates a decorator object
        // per row and then a second array to undecorate — 2N objects that are
        // garbage a frame later.
        const out = new Array<TRow>(rows.length);
        for (let i = 0; i < order.length; i++) out[i] = rows[order[i] as number] as TRow;
        return out;
      }
    }

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
        rowsIn: () => [],
        length: 0,
        total: all.length,
        loading: false,
        errors: [gridError({ code: "client-mode-refused", phase: "query" })],
      };
    }

    const view = sorted();
    const wrap = (row: TRow, index: number): ModelRow<TRow> => ({
      id: options.rowKey(row), row, index,
    });

    // Identity is the axis transactions, selection, disclosure and the
    // renderer's node map are all addressed on. A duplicate redirects every one
    // of them at whichever row registered last, silently.
    //
    // LAZY, and memoised, exactly like `rows` below. The check is O(n) in
    // `rowKey` calls, and this model exists to let a caller read a window of
    // thirty rows out of five thousand without paying for the other 4,970 —
    // an eager check would have quietly taken that guarantee away. A caller
    // that reads `errors` pays once; one that never does never pays.
    let duplicates: DuplicateReport | null | undefined;
    const duplicateErrors = (): readonly GridError[] => {
      if (duplicates === undefined) duplicates = findDuplicateIds(view, options.rowKey);
      return duplicates ? [duplicateIdError(duplicates)] : EMPTY_ERRORS;
    };

    let materialised: readonly ModelRow<TRow>[] | null = null;
    return {
      length: view.length,
      total: view.length,
      loading: false,
      // Reported, and the rows are still served: a grid that renders nothing
      // because two ids collided is a worse failure than one that renders and
      // says so. Refusing is the application's call, and it now has the fact
      // it needs to make it.
      get errors() {
        return duplicateErrors();
      },

      rowsIn(start, end) {
        const from = Math.max(0, Math.min(start, view.length));
        const to = Math.max(from, Math.min(end, view.length));
        const out = new Array<ModelRow<TRow>>(to - from);
        for (let i = from; i < to; i++) out[i - from] = wrap(view[i] as TRow, i);
        return out;
      },

      // Lazy and memoised: a caller that never reads it never pays for it.
      get rows() {
        materialised ??= view.map(wrap);
        return materialised;
      },
    };
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

/**
 * The query one state produces, against one source.
 *
 * `capabilities` is optional and its absence means "we do not know", which is
 * treated as cursor-only — the safe reading. Cursor is the default and offset
 * is the special case (ADR 0005): against FHIR there is no offset to choose,
 * and sending one anyway gets it silently ignored, which is the worst outcome
 * available because the grid then renders page 1 believing it is page 7.
 */
export function queryFrom(
  state: GridState,
  sort: readonly SortSpec[],
  capabilities?: SourceCapabilities,
): GridQuery {
  const seekable = capabilities?.paging === "offset";
  // `page` arrived after `GridState` shipped, so a view saved before it — from
  // a URL, from storage, from a server — deserialises without the field. Left
  // alone that makes `undefined * pageSize` into `NaN`, and a NaN offset is
  // either a 400 from the server or, worse, a silently ignored parameter and a
  // grid rendering page 1 believing it is page 7.
  const page = Number.isFinite(state.page) ? Math.max(0, Math.floor(state.page)) : 0;
  return {
    sort,
    filter: state.filter,
    pageSize: state.pageSize,
    // The two are alternatives. A source that seeks is sent an offset and no
    // cursor; everything else is sent its cursor and no offset.
    cursor: seekable ? null : state.cursor,
    offset: seekable ? page * state.pageSize : null,
  };
}

export function createServerRowModel<TRow>(options: ServerRowModelOptions<TRow>): RowModel<TRow> {
  const { dataSource, rowKey } = options;
  const caps = dataSource.capabilities;
  const result = signal<RowModelResult<TRow>>(
    resultOf<TRow>([], { total: "unknown", loading: false, errors: [] }),
  );

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
    const query = queryFrom(state, sort, caps);

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
      const merged = [...previous, ...appended];
      // Across the WHOLE accumulated set, not just the page: paging is exactly
      // where two sources' locally-unique ids meet, and a duplicate that spans
      // two pages is the one a per-page check would miss.
      const dupes = findDuplicateIds(merged, (r) => r.id);
      if (dupes) errors.push(duplicateIdError(dupes));
      result.set(resultOf(merged, {
        total: page.total, loading: false, errors,
      }));
    } catch (thrown) {
      if (destroyed || mine !== generation) return;
      if (controller.signal.aborted) return; // superseded, not failed
      result.set(resultOf<TRow>([], {
        total: "unknown",
        loading: false,
        errors: [...errors, sanitiseError(thrown, { code: "source-threw", phase: "query" })],
      }));
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
