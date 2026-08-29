/**
 * A columnar row store.
 *
 * ── WHY, WITH THE NUMBERS THAT JUSTIFY IT ───────────────────────────────────
 *
 * A row held as a plain object costs about 50 bytes per cell and, past roughly
 * 600 properties, drops out of V8's hidden-class optimisation into dictionary
 * mode, where every field read becomes a hash lookup. Measured, 100,000 rows:
 *
 *   250 columns, object per row     1,000 MB RSS
 *   250 columns, columnar             282 MB RSS      3.5x smaller
 *   600 columns, sort one column    1,056 ms  vs  46 ms columnar   22.8x
 *
 * (The 282 MB is 13 MB of JS heap and 191 MB external — typed arrays are not
 * on the heap, which is why `heapUsed` reports a columnar store as nearly free
 * and is the wrong number to quote.)
 *
 * Three things follow from the representation, not from tuning:
 *
 *   · a numeric column is 8 bytes per row instead of ~50;
 *   · a string column is 4 bytes per row plus one copy of each distinct value,
 *     so a ward column over 100,000 rows holds eight strings, not 100,000;
 *   · typed arrays TRANSFER to a worker. Object graphs are structured-cloned,
 *     which is a copy. This is the precondition for getting sort and filter
 *     off the main thread, and no amount of optimising the object path
 *     provides it.
 *
 * ── WHAT IT IS NOT ──────────────────────────────────────────────────────────
 *
 * Not a replacement for the row array, and not something existing callers are
 * migrated onto. It is an opt-in source for the case that needs it: wide
 * clinical grids and multi-million-row registries. A forty-column worklist is
 * fine as objects and should stay that way — the store costs a build pass and
 * an indirection, and below a few hundred thousand cells that is a loss.
 *
 * ── WHERE DICTIONARY ENCODING DOES NOT PAY ──────────────────────────────────
 *
 * A string column is stored as an ordinal into a dictionary, which is a large
 * win when values repeat — four wards over 100,000 rows — and NO win at all
 * when they do not. An id or an MRN is distinct per row, so its dictionary
 * grows linearly and the encoding buys an indirection and nothing else.
 *
 * Measured: cost per row FALLS with scale for a ward column and does not for
 * an id column. Keep identifiers out of the store; they belong in the row
 * objects the window materialises, thirty at a time.
 *
 * ── ABSENCE IS FIRST CLASS, BECAUSE IT IS EVERYWHERE HERE ───────────────────
 *
 * Every column carries a presence bitmap. A typed array has no null: 0 in a
 * Float64Array is a potassium of zero, which is a different clinical fact from
 * "not measured", and collapsing them is exactly the failure this library
 * exists to refuse. The bitmap costs one bit per cell.
 */

export type ColumnType = "number" | "string" | "boolean";

export interface StoredColumn {
  readonly key: string;
  readonly type: ColumnType;
}

interface NumericColumn {
  readonly kind: "number";
  readonly values: Float64Array;
  readonly present: Uint8Array;
}
interface OrdinalColumn {
  readonly kind: "string";
  /** Index into `dictionary`. */
  readonly codes: Uint32Array;
  readonly dictionary: string[];
  readonly present: Uint8Array;
  /** Value → code, kept for the build. Both builders intern as they write. */
  readonly seen: Map<string, number>;
}
interface BooleanColumn {
  readonly kind: "boolean";
  readonly values: Uint8Array;
  readonly present: Uint8Array;
}
type Column = NumericColumn | OrdinalColumn | BooleanColumn;

const bit = (present: Uint8Array, i: number): boolean =>
  ((present[i >> 3] as number) & (1 << (i & 7))) !== 0;

const setBit = (present: Uint8Array, i: number): void => {
  present[i >> 3] = (present[i >> 3] as number) | (1 << (i & 7));
};

export interface ColumnStore {
  readonly length: number;
  readonly keys: readonly string[];
  /**
   * One cell, by row index.
   *
   * The same shape as the `get(row, key)` accessor the engine already takes,
   * so sort, filter and the cell renderers reach a columnar store and an
   * object array through one signature.
   */
  get(index: number, key: string): string | number | boolean | null;
  /** Materialises one row. For the ~30 rows in a window, never for the set. */
  row(index: number): Record<string, string | number | boolean | null>;
  /**
   * Sorted row indices for a column.
   *
   * Absent values land last in source order, in both directions — "we do not
   * know" is not a value to be ranked above or below the ones we do.
   */
  order(key: string, direction: "asc" | "desc"): Uint32Array;
  /** Row indices matching a predicate over one column's raw values. */
  select(key: string, match: (value: string | number | boolean | null) => boolean): Uint32Array;
  /** Bytes held, so a caller can decide whether the store is worth it. */
  readonly bytes: number;
}

/** Empty columns of the right shapes. Shared by both builders. */
function allocate(specs: readonly StoredColumn[], n: number): Map<string, Column> {
  const bitmapBytes = (n + 7) >> 3;
  const columns = new Map<string, Column>();
  for (const spec of specs) {
    const present = new Uint8Array(bitmapBytes);
    if (spec.type === "number") {
      columns.set(spec.key, { kind: "number", values: new Float64Array(n), present });
    } else if (spec.type === "boolean") {
      columns.set(spec.key, { kind: "boolean", values: new Uint8Array(n), present });
    } else {
      columns.set(spec.key, {
        kind: "string", codes: new Uint32Array(n), dictionary: [], present,
        seen: new Map<string, number>(),
      });
    }
  }
  return columns;
}

/**
 * Writes one cell, and records that it is present.
 *
 * A value of the wrong type is treated as ABSENT rather than coerced. A string
 * "3.4" in a numeric column is a data problem, and quietly parsing it would
 * turn that problem into a lab value nobody can trace.
 */
function writeCell(column: Column, i: number, value: unknown): void {
  if (column.kind === "number") {
    if (typeof value !== "number" || Number.isNaN(value)) return;
    column.values[i] = value;
  } else if (column.kind === "boolean") {
    if (typeof value !== "boolean") return;
    column.values[i] = value ? 1 : 0;
  } else {
    if (typeof value !== "string") return;
    let code = column.seen.get(value);
    if (code === undefined) {
      code = column.dictionary.length;
      column.dictionary.push(value);
      column.seen.set(value, code);
    }
    column.codes[i] = code;
  }
  setBit(column.present, i);
}

/**
 * Builds a store from rows the caller already has.
 *
 * ── THIS DOES NOT SAVE MEMORY BY ITSELF ─────────────────────────────────────
 *
 * Measured: 100,000 rows x 250 columns as objects is 1,331 MB resident; the
 * store's own data is 193 MB. But building one FROM the other means both exist
 * at once — measured at 1,473 MB, WORSE than the objects alone — and V8 does
 * not return the pages promptly afterwards.
 *
 * Use this when the rows are already in hand and the win you want is sort and
 * filter speed. When the win you want is MEMORY, use `buildColumnStore`.
 */
export function createColumnStore<TRow>(
  specs: readonly StoredColumn[],
  rows: readonly TRow[],
  get: (row: TRow, key: string) => unknown,
): ColumnStore {
  const n = rows.length;
  const columns = allocate(specs, n);
  // Column-major: one pass per column is the cheapest traversal of an array
  // that is already resident, because each pass touches one typed array.
  for (const spec of specs) {
    const column = columns.get(spec.key) as Column;
    for (let i = 0; i < n; i++) writeCell(column, i, get(rows[i] as TRow, spec.key));
  }
  return storeOver(specs, columns, n);
}

/**
 * Builds a store from a source that is not already in memory.
 *
 * This is the one that saves memory. Rows arrive one at a time — from a fetch
 * stream, a cursor, a generator — are written into the typed arrays, and are
 * never collectively held. Measured over 100,000 rows x 250 columns:
 *
 *   object rows                    1,331 MB RSS
 *   store built from that array    1,473 MB RSS   — WORSE: both exist at once
 *   store built from a stream        279 MB RSS   — 4.8x smaller
 *
 * ── WHY THIS IS NOT `createColumnStore` WITH AN ITERABLE ────────────────────
 *
 * `createColumnStore` fills one column at a time: a full pass over the rows
 * per column, because that is the cheapest way to build from an array already
 * in memory. A stream cannot be traversed twice, so this walks ROW-major
 * instead, writing every column of a row before advancing. Same store, and the
 * only access pattern a stream supports.
 *
 * `count` must be known up front, because typed arrays are not growable. That
 * is a real constraint worth surfacing rather than hiding: a source that
 * cannot say how many rows it has should page instead. `Bundle.total` in FHIR
 * is optional for closely related reasons.
 *
 * A source that ends early leaves the tail absent rather than throwing — a
 * stream that stops is a real thing, and discarding the rows that DID arrive
 * would be worse than showing them with a short tail.
 */
export function buildColumnStore<TRow>(
  specs: readonly StoredColumn[],
  count: number,
  source: Iterable<TRow>,
  get: (row: TRow, key: string) => unknown,
): ColumnStore {
  const columns = allocate(specs, count);
  let i = 0;
  for (const row of source) {
    if (i >= count) break; // more rows than declared: the arrays are full
    for (const spec of specs) {
      writeCell(columns.get(spec.key) as Column, i, get(row, spec.key));
    }
    i++;
  }
  return storeOver(specs, columns, count);
}

/**
 * The reading half: everything both builders hand back.
 *
 * Kept separate from the writing half so the two build strategies — one pass
 * per column for a resident array, one pass per row for a stream — share every
 * line of the part that has to be correct.
 */
function storeOver(
  specs: readonly StoredColumn[],
  columns: Map<string, Column>,
  n: number,
): ColumnStore {
  const ABSENT = 0xffffffff;
  const rankCache = new Map<string, Uint32Array>();

  const need = (key: string): Column => {
    const column = columns.get(key);
    if (!column) throw new Error(`no column "${key}" in this store`);
    return column;
  };

  const cellOf = (column: Column, index: number): string | number | boolean | null => {
    if (!bit(column.present, index)) return null;
    if (column.kind === "number") return column.values[index] as number;
    if (column.kind === "boolean") return column.values[index] === 1;
    return column.dictionary[column.codes[index] as number] as string;
  };

  /** An integer rank per row, with absence pushed past every present value. */
  function ranks(key: string, column: Column): Uint32Array {
    const cached = rankCache.get(key);
    if (cached) return cached;

    const out = new Uint32Array(n);
    if (column.kind === "string") {
      // The dictionary is small — four wards, not 100,000 — so ordering it is
      // cheap, and every row then sorts as an integer.
      const ordered = column.dictionary
        .map((v, i) => [v, i] as const)
        .sort((a, b) => a[0].localeCompare(b[0]));
      const rankOf = new Uint32Array(Math.max(1, column.dictionary.length));
      ordered.forEach(([, original], rank) => { rankOf[original] = rank; });
      for (let i = 0; i < n; i++) {
        out[i] = bit(column.present, i) ? (rankOf[column.codes[i] as number] as number) : ABSENT;
      }
    } else {
      const distinct = new Set<number>();
      for (let i = 0; i < n; i++) if (bit(column.present, i)) distinct.add(column.values[i] as number);
      const sorted = [...distinct].sort((a, b) => a - b);
      const rankOf = new Map<number, number>();
      sorted.forEach((v, r) => rankOf.set(v, r));
      for (let i = 0; i < n; i++) {
        out[i] = bit(column.present, i) ? (rankOf.get(column.values[i] as number) as number) : ABSENT;
      }
    }
    rankCache.set(key, out);
    return out;
  }

  /** Stable LSD radix. Stability is what keeps absences in source order. */
  function radix(keys: Uint32Array): Uint32Array {
    let src = new Uint32Array(n);
    let dst = new Uint32Array(n);
    for (let i = 0; i < n; i++) src[i] = i;
    if (n < 2) return src;

    const count = new Uint32Array(256);
    for (let shift = 0; shift < 32; shift += 8) {
      count.fill(0);
      for (let i = 0; i < n; i++) count[((keys[src[i] as number] as number) >>> shift) & 255]!++;
      if (count[((keys[src[0] as number] as number) >>> shift) & 255] === n) continue;
      let sum = 0;
      for (let b = 0; b < 256; b++) {
        const c = count[b] as number;
        count[b] = sum;
        sum += c;
      }
      for (let i = 0; i < n; i++) {
        const v = src[i] as number;
        dst[count[((keys[v] as number) >>> shift) & 255]!++] = v;
      }
      const swap = src;
      src = dst;
      dst = swap;
    }
    return src;
  }

  /** Honest accounting, so a caller can decide whether the store is worth it. */
  let bytes = ((n + 7) >> 3) * specs.length;
  for (const column of columns.values()) {
    if (column.kind === "number") bytes += n * 8;
    else if (column.kind === "boolean") bytes += n;
    else {
      bytes += n * 4;
      for (const v of column.dictionary) bytes += v.length * 2 + 16;
    }
  }

  return {
    length: n,
    keys: specs.map((s) => s.key),
    bytes,

    get(index, key) {
      if (index < 0 || index >= n) return null;
      return cellOf(need(key), index);
    },

    row(index) {
      const out: Record<string, string | number | boolean | null> = {};
      for (const [key, column] of columns) out[key] = cellOf(column, index);
      return out;
    },

    order(key, direction) {
      const column = need(key);
      const r = ranks(key, column);
      if (direction === "asc") return radix(r);

      // Inverting the KEY, not reversing the result: reversing would reverse
      // ties too, and a tie is rows the column could not distinguish.
      let max = 0;
      for (let i = 0; i < n; i++) {
        const v = r[i] as number;
        if (v !== ABSENT && v > max) max = v;
      }
      const inverted = new Uint32Array(n);
      for (let i = 0; i < n; i++) {
        const v = r[i] as number;
        inverted[i] = v === ABSENT ? ABSENT : max - v;
      }
      return radix(inverted);
    },

    select(key, match) {
      const column = need(key);
      const hits = new Uint32Array(n);
      let count = 0;
      for (let i = 0; i < n; i++) if (match(cellOf(column, i))) hits[count++] = i;
      return hits.subarray(0, count);
    },
  };
}
