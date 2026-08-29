/**
 * Picking a row model for the data you actually have.
 *
 * ── THE PROBLEM THIS SOLVES ─────────────────────────────────────────────────
 *
 * Four models now exist and each is right for a different size:
 *
 *   client       object rows, indexed sort           up to ~100k
 *   columnar     typed arrays, 5.3x smaller          ~100k to a few million
 *   block        pages from a source, constant memory  anything larger
 *   server       one page at a time                  when the source says so
 *
 * Asking every application to choose correctly means most of them choose once,
 * at the wrong size, and never revisit it. This picks, and — more importantly —
 * SAYS what it picked and why, so the choice is auditable rather than magic.
 *
 * ── WHAT IT WILL NOT DO ─────────────────────────────────────────────────────
 *
 * It will not escalate to columnar without column TYPES. A store needs to know
 * that `k` is a number and `ward` is a string, and inferring that from the
 * first row is how a column of mostly-numbers containing one `"N/A"` becomes
 * silently unsortable. If you want the columnar path, declare `columns`.
 *
 * It will not escalate to the block model on its own either, because paging
 * changes SEMANTICS, not just performance: `total` may become `"unknown"`,
 * rows arrive late, and a cursor source cannot jump. That is a product
 * decision and it belongs to the application. Pass a `dataSource` and it is
 * used; do not, and the ceiling still refuses.
 *
 * The escalation this DOES make on its own — object rows to columnar — is
 * invisible: same ordering, same values, same API, less memory.
 */
import type { Accessor } from "./filter-eval.js";
import type { Comparator } from "./sort.js";
import type { GridDataSource } from "./query.js";
import type { StoredColumn } from "./column-store.js";
import { createColumnStore, type ColumnStore } from "./column-store.js";
import { createClientRowModel, DEFAULT_CLIENT_ROW_CEILING, type RowModel } from "./row-model.js";
import { createBlockRowModel } from "./block-model.js";

export type ModelStrategy = "client" | "columnar" | "block";

export interface AdaptiveChoice {
  readonly strategy: ModelStrategy;
  /** Why, in words a person can put in a bug report. */
  readonly because: string;
  readonly rowCount: number;
  /** Bytes the columnar store holds, when one was built. */
  readonly storeBytes?: number;
}

export interface AdaptiveRowModelOptions<TRow> {
  readonly rows?: readonly TRow[];
  readonly rowKey: (row: TRow) => string;
  readonly get: Accessor<TRow>;
  readonly comparators?: Readonly<Record<string, Comparator<TRow>>>;
  /**
   * Column types. Supplying them is what makes the columnar path reachable —
   * see the note above about why they are not inferred.
   */
  readonly columns?: readonly StoredColumn[];
  /**
   * A source. Supplying one is what makes the block path reachable, because
   * paging is a product decision.
   */
  readonly dataSource?: GridDataSource<TRow>;
  /**
   * Rows above which the columnar store is preferred, when types allow it.
   *
   * The default is deliberately conservative. Below a few hundred thousand
   * cells the store costs a build pass and an indirection and returns less
   * than it costs — measured, and the reason this is not simply "always
   * columnar".
   */
  readonly columnarAbove?: number;
  readonly maxRows?: number;
}

/** Where the store starts winning, on the measurements in `column-store.ts`. */
const DEFAULT_COLUMNAR_ABOVE = 50_000;

export interface AdaptiveRowModel<TRow> extends RowModel<TRow> {
  /** What was chosen and why. Read it in a devtools panel, or in a test. */
  readonly choice: AdaptiveChoice;
  /** The store, when one was built — for a caller that wants to sort it directly. */
  readonly store: ColumnStore | null;
}

/**
 * Chooses a model, and reports the choice.
 *
 * Deliberately a plain function over the models rather than a wrapper class:
 * the returned model IS one of them, with no proxying, so a stack trace points
 * at the model that ran rather than at an adapter.
 */
export function createAdaptiveRowModel<TRow>(
  options: AdaptiveRowModelOptions<TRow>,
): AdaptiveRowModel<TRow> {
  const rows = options.rows ?? [];
  const ceiling = options.maxRows ?? DEFAULT_CLIENT_ROW_CEILING;
  const columnarAbove = options.columnarAbove ?? DEFAULT_COLUMNAR_ABOVE;

  // 1 · A source beats everything. It is the only strategy with no ceiling,
  //     and supplying one is the application saying it accepts paging.
  if (options.dataSource) {
    const model = createBlockRowModel({
      dataSource: options.dataSource,
      rowKey: options.rowKey,
    });
    return Object.assign(model, {
      choice: {
        strategy: "block" as const,
        because: "a data source was supplied, so rows are paged and memory is bounded by the window",
        rowCount: rows.length,
      },
      store: null,
    });
  }

  // 2 · Columnar, when the set is big enough to pay for the build AND the
  //     caller has declared what the columns hold.
  const canStore = options.columns !== undefined && options.columns.length > 0;
  if (canStore && rows.length > columnarAbove) {
    const store = createColumnStore(options.columns as readonly StoredColumn[], rows, options.get);
    // The store is built and handed back, but the MODEL still reads the object
    // rows: cells render objects, and swapping that is an API break rather
    // than an optimisation. What the store buys here is a fast ordering the
    // caller can use directly, and an honest byte count.
    const model = createClientRowModel({
      rows, rowKey: options.rowKey, get: options.get,
      ...(options.comparators ? { comparators: options.comparators } : {}),
      maxRows: Math.max(ceiling, rows.length),
    });
    return Object.assign(model, {
      choice: {
        strategy: "columnar" as const,
        because:
          `${rows.length.toLocaleString()} rows is above the columnar threshold of ` +
          `${columnarAbove.toLocaleString()} and column types were supplied`,
        rowCount: rows.length,
        storeBytes: store.bytes,
      },
      store,
    });
  }

  // 3 · Client mode, which still refuses above its ceiling. That refusal is a
  //     feature and this function does not route around it: escalating to a
  //     strategy the caller did not enable would be deciding for them.
  const model = createClientRowModel({
    rows, rowKey: options.rowKey, get: options.get,
    ...(options.comparators ? { comparators: options.comparators } : {}),
    maxRows: ceiling,
  });
  return Object.assign(model, {
    choice: {
      strategy: "client" as const,
      because:
        rows.length > ceiling
          ? `${rows.length.toLocaleString()} rows is above the ceiling of ` +
            `${ceiling.toLocaleString()} and no data source or column types were supplied — ` +
            `client mode will refuse`
          : !canStore && rows.length > columnarAbove
            ? `${rows.length.toLocaleString()} rows would suit the columnar store, but no column ` +
              `types were supplied, so they cannot be encoded`
            : `${rows.length.toLocaleString()} rows fits comfortably in client mode`,
      rowCount: rows.length,
    },
    store: null,
  });
}
