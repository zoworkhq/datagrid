/**
 * The block row model — a windowed view over a set too large to hold.
 *
 * ── WHY THE CLIENT MODEL IS NOT ENOUGH ──────────────────────────────────────
 *
 * `createClientRowModel` refuses above a ceiling, which is honest and better
 * than a silent four-second sort. It is not a strategy for a 20-million-row
 * patient registry. This is: rows arrive in fixed-size blocks, at most
 * `maxBlocks` are retained, and memory is therefore a function of the window
 * rather than of the dataset.
 *
 * ── THE CONSTRAINT THAT SHAPES EVERYTHING ───────────────────────────────────
 *
 * Random access to block N requires an offset. FHIR does not have one: paging
 * is by an opaque `link.next`, and Azure Health Data Services returns only
 * `next` (ADR 0005). So for a cursor source, block 500 is reachable only by
 * walking blocks 0 through 499 — five hundred round trips to answer one
 * scrollbar drag.
 *
 * Three ways to handle that, and only one is defensible:
 *
 *   · pretend, and issue 500 requests — a scrollbar drag becomes a minute of
 *     load on the server and a frozen grid;
 *   · silently show the nearest loaded block — the reader is somewhere else
 *     entirely and has no way to know;
 *   · SAY SO. Emit `cursor-jump-unsupported`, load the furthest reachable
 *     block, and let the application decide whether to walk, to offer a
 *     filter, or to tell the user this source cannot be scrubbed.
 *
 * The third is what this does. A grid that cannot reach a row should say
 * which row it could not reach.
 */
import { signal, type ReadSignal } from "@oxygenui-design/grid-signals";
import { gridError, sanitiseError, type GridError } from "./errors.js";
import type { GridDataSource, GridQuery, SortSpec } from "./query.js";
import type { GridState } from "./state.js";
import { resultOf, type ModelRow, type RowModel, type RowModelResult } from "./row-model.js";

/** A row the source has not sent yet. Never rendered as an empty row. */
export interface LoadingRow {
  readonly loading: true;
  readonly index: number;
}

export const isLoadingRow = (row: unknown): row is LoadingRow =>
  typeof row === "object" && row !== null && (row as LoadingRow).loading === true;

interface Block<TRow> {
  readonly rows: readonly TRow[];
  /** Monotonic, for LRU eviction. */
  touched: number;
}

export interface BlockRowModelOptions<TRow> {
  readonly dataSource: GridDataSource<TRow>;
  readonly rowKey: (row: TRow) => string;
  /**
   * Rows per block. Negotiated down to the source's `maxPageSize`, because
   * `_count` is commonly capped at 100 and asking for more gets you 100 with
   * no error.
   */
  readonly blockSize?: number;
  /**
   * Blocks retained. THIS is what makes memory constant: twenty blocks of a
   * hundred rows is two thousand rows resident, whether the set is fifty
   * thousand or twenty million.
   */
  readonly maxBlocks?: number;
}

export interface BlockRowModel<TRow> extends RowModel<TRow> {
  /**
   * Declares which rows the viewport wants.
   *
   * Called on every scroll frame, so it must be cheap when the blocks are
   * already resident — it is, because the check is two integer divisions.
   */
  setRange(start: number, end: number): void;
  /** Blocks currently held, for tests and for a memory panel. */
  readonly resident: number;
}

const DEFAULT_BLOCK_SIZE = 100;
const DEFAULT_MAX_BLOCKS = 20;

export function createBlockRowModel<TRow>(
  options: BlockRowModelOptions<TRow>,
): BlockRowModel<TRow> {
  const { dataSource, rowKey } = options;
  const caps = dataSource.capabilities;
  const blockSize = Math.max(
    1,
    Math.min(options.blockSize ?? DEFAULT_BLOCK_SIZE, caps?.maxPageSize ?? Number.MAX_SAFE_INTEGER),
  );
  const maxBlocks = Math.max(1, options.maxBlocks ?? DEFAULT_MAX_BLOCKS);
  const randomAccess = caps?.paging === "offset";

  const blocks = new Map<number, Block<TRow>>();
  /** Cursor that OPENS a block, for sources that page by cursor. */
  const cursors = new Map<number, string>([[0, ""]]);
  const inflight = new Map<number, AbortController>();

  let total: number | "unknown" = "unknown";
  let clock = 0;
  let generation = 0;
  let destroyed = false;
  let state: GridState | null = null;
  let range = { start: 0, end: 0 };
  /**
   * Held, not passed per publish.
   *
   * `publish` runs on every range change and again when a request settles, so
   * an error handed to one call was overwritten by the next one microseconds
   * later — reported, and gone before anything could read it. Errors live
   * until the state changes, which is when they stop being true.
   */
  let errors: GridError[] = [];

  const result = signal<RowModelResult<TRow>>(
    resultOf<TRow>([], { total: "unknown", loading: false, errors: [] }),
  );

  const blockOf = (index: number): number => Math.floor(index / blockSize);

  /** Drops the least recently touched blocks. Never drops one in the window. */
  function evict(): void {
    if (blocks.size <= maxBlocks) return;
    const wanted = new Set<number>();
    for (let b = blockOf(range.start); b <= blockOf(Math.max(range.start, range.end - 1)); b++) {
      wanted.add(b);
    }
    const candidates = [...blocks.entries()]
      .filter(([index]) => !wanted.has(index))
      .sort((a, b) => a[1].touched - b[1].touched);
    for (const [index] of candidates) {
      if (blocks.size <= maxBlocks) break;
      blocks.delete(index);
    }
  }

  function report(error: GridError): void {
    // One per code+row: a scroll that repeatedly crosses an unreachable block
    // should say so once, not sixty times a second.
    const key = `${error.code}:${error.rowIndex ?? ""}`;
    if (errors.some((e) => `${e.code}:${e.rowIndex ?? ""}` === key)) return;
    errors = [...errors, error];
  }

  function publish(): void {
    if (destroyed) return;
    const rows: ModelRow<TRow>[] = [];
    for (let index = range.start; index < range.end; index++) {
      if (total !== "unknown" && index >= total) break;
      const block = blocks.get(blockOf(index));
      const row = block?.rows[index % blockSize];
      rows.push(
        row === undefined
          ? // A placeholder that ANNOUNCES itself. An empty row reads as a row
            // with no data, which is a different and much worse claim.
            ({ id: `__loading_${index}__`, row: { loading: true, index } as unknown as TRow, index })
          : { id: rowKey(row), row, index },
      );
    }
    result.set(resultOf(rows, { total, loading: inflight.size > 0, errors }));
  }

  function queryFor(index: number): GridQuery | null {
    const block = blockOf(index);
    if (randomAccess) {
      return {
        sort: state?.sort ?? [],
        filter: state?.filter ?? null,
        pageSize: blockSize,
        cursor: null,
        offset: block * blockSize,
      };
    }
    const cursor = cursors.get(block);
    if (cursor === undefined) return null; // unreachable without walking
    return {
      sort: state?.sort ?? [],
      filter: state?.filter ?? null,
      pageSize: blockSize,
      cursor: cursor === "" ? null : cursor,
      offset: null,
    };
  }

  async function load(blockIndex: number): Promise<void> {
    if (blocks.has(blockIndex) || inflight.has(blockIndex)) return;

    const query = queryFor(blockIndex * blockSize);
    if (!query) {
      // The honest refusal. Walking there would be one request per block.
      report(gridError({
        code: "cursor-jump-unsupported",
        phase: "query",
        rowIndex: blockIndex * blockSize,
      }));
      publish();
      return;
    }

    const controller = new AbortController();
    inflight.set(blockIndex, controller);
    const mine = ++generation;
    publish();

    try {
      const page = await dataSource.getRows(query, controller.signal);
      if (destroyed || controller.signal.aborted) return;
      // A page that arrives after the state moved on describes a query nobody
      // is looking at any more.
      if (mine < generation - inflight.size) return;

      blocks.set(blockIndex, { rows: page.rows, touched: ++clock });
      total = page.total;
      if (!randomAccess && page.nextCursor !== null) {
        cursors.set(blockIndex + 1, page.nextCursor);
      }

      // A source that silently ignored the sort has produced a list whose
      // header is a lie. Say so rather than re-rendering as though it worked.
      if (state && !sameSort(page.appliedSort, state.sort)) {
        report(gridError({ code: "sort-not-honoured", phase: "query" }));
      }
      if (page.appliedPageSize !== undefined && page.appliedPageSize < query.pageSize) {
        report(gridError({ code: "page-size-reduced", phase: "query" }));
      }
      evict();
      publish();
    } catch (thrown) {
      if (destroyed || controller.signal.aborted) return;
      report(sanitiseError(thrown, { code: "source-threw", phase: "query" }));
      publish();
    } finally {
      inflight.delete(blockIndex);
      if (!destroyed && inflight.size === 0) publish();
    }
  }

  function ensure(): void {
    if (range.end <= range.start) return;
    const first = blockOf(range.start);
    const last = blockOf(range.end - 1);
    for (let b = first; b <= last; b++) {
      const held = blocks.get(b);
      if (held) held.touched = ++clock;
      else void load(b);
    }
    publish();
  }

  return {
    result: result as ReadSignal<RowModelResult<TRow>>,

    get resident() {
      return blocks.size;
    },

    setRange(start, end) {
      const next = { start: Math.max(0, start), end: Math.max(0, end) };
      if (next.start === range.start && next.end === range.end) return;
      range = next;
      ensure();
    },

    setState(next) {
      // A new sort or filter invalidates every block: they describe a
      // different query. Keeping them would show yesterday's ordering under
      // today's header.
      state = next;
      // The errors described the previous query. They stop being true here.
      errors = [];
      blocks.clear();
      cursors.clear();
      cursors.set(0, "");
      total = "unknown";
      for (const controller of inflight.values()) controller.abort();
      inflight.clear();
      ensure();
    },

    destroy() {
      destroyed = true;
      for (const controller of inflight.values()) controller.abort();
      inflight.clear();
      blocks.clear();
    },
  };
}

const sameSort = (a: readonly SortSpec[], b: readonly SortSpec[]): boolean =>
  a.length === b.length &&
  a.every((s, i) => s.key === b[i]?.key && s.direction === b[i]?.direction);
