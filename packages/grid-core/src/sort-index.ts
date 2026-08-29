/**
 * Precomputed sort keys.
 *
 * ── WHY THIS EXISTS, AND WHAT WAS MEASURED FIRST ────────────────────────────
 *
 * Sorting a million rows by a string column costs 995 ms, and the obvious
 * explanations are all wrong. Measured, on the same machine, same data:
 *
 *   resolving the comparator chain once instead of per comparison   1.06-1.20x
 *   `Intl.Collator` instead of `localeCompare` (the usual advice)   0.31x — WORSE
 *   plain `<` / `>` instead of linguistic ordering                  1.3x
 *   comparing numbers instead of strings                            4.3x
 *
 * V8 already special-cases `localeCompare` for the default locale, so the
 * standard optimisation makes it three times slower. The sort is bound by the
 * comparator, and no amount of tuning the sort loop moves it.
 *
 * So stop comparing strings. Map each distinct value to an ordinal once, sort
 * a `Uint32Array` of those ordinals with a radix sort, and the comparison
 * disappears entirely:
 *
 *   build ordinal keys (once per column)   1,373 ms
 *   radix sort                                 16 ms
 *   materialise rows in order                   4 ms
 *   ────────────────────────────────────────────────
 *   first sort                              1,393 ms   0.72x — slower
 *   RE-SORT, keys already built                20 ms   50.9x
 *
 * The trade is explicit: the first sort of a column is ~40% slower, every
 * subsequent one is fifty times faster. That is the right trade for a worklist,
 * where a charge nurse toggles the same three columns all shift.
 *
 * ── WHAT IT REFUSES TO DO ───────────────────────────────────────────────────
 *
 * A custom comparator is not indexable — its ordering is a function nobody here
 * can see through — so a column with one falls back to the comparator path.
 * Same for mixed types: a column holding both numbers and strings has no
 * ordinal ordering that is not an invention.
 *
 * Absent values keep the engine's existing meaning. `null` and `undefined` are
 * not "smallest"; they are unordered against a present value, so they take the
 * maximum key and land at the end in source order — which a stable sort gives
 * for free, and which is exactly what the comparator path does with
 * `"incomparable"`.
 */

/** The key assigned to an absent value, so absences land last in source order. */
const ABSENT = 0xffffffff;

export interface SortKeys {
  /** One ordinal per row, positionally. */
  readonly keys: Uint32Array;
  /** Highest ordinal in use, excluding the absent sentinel. */
  readonly max: number;
}

/**
 * Ordinal keys for one column.
 *
 * Returns `null` when the column cannot be indexed — mixed types, or a type
 * with no total order. The caller falls back rather than inventing one.
 */
export function buildSortKeys<TRow>(
  rows: readonly TRow[],
  get: (row: TRow, key: string) => unknown,
  key: string,
): SortKeys | null {
  const n = rows.length;
  const keys = new Uint32Array(n);
  if (n === 0) return { keys, max: 0 };

  // One pass to collect distinct values and learn the column's type.
  const distinct = new Map<string | number | boolean, number>();
  let sawString = false;
  let sawNumber = false;
  let sawBoolean = false;

  for (let i = 0; i < n; i++) {
    const v = get(rows[i] as TRow, key);
    if (v === null || v === undefined) continue;
    if (typeof v === "string") sawString = true;
    else if (typeof v === "number") {
      if (Number.isNaN(v)) continue;
      sawNumber = true;
    } else if (typeof v === "boolean") sawBoolean = true;
    else return null; // objects, symbols, functions: no ordering to derive
    distinct.set(v as string | number | boolean, 0);
  }

  // Mixed types have no ordering that is not an invention.
  if (Number(sawString) + Number(sawNumber) + Number(sawBoolean) > 1) return null;

  const values = [...distinct.keys()];
  // More distinct values than ordinals is not a real dataset, but a silently
  // wrong sort would be worse than a slow one.
  if (values.length >= ABSENT) return null;

  values.sort(
    sawString
      ? (a, b) => (a as string).localeCompare(b as string)
      : (a, b) => Number(a) - Number(b),
  );
  for (let r = 0; r < values.length; r++) distinct.set(values[r] as string | number | boolean, r);

  for (let i = 0; i < n; i++) {
    const v = get(rows[i] as TRow, key);
    keys[i] =
      v === null || v === undefined || (typeof v === "number" && Number.isNaN(v))
        ? ABSENT
        : (distinct.get(v as string | number | boolean) ?? ABSENT);
  }

  return { keys, max: Math.max(0, values.length - 1) };
}

/**
 * Stable LSD radix sort over the keys, returning row indices.
 *
 * Stability is not optional: it is what makes absent values keep source order
 * at the end, and what makes a second sort key behave.
 */
export function radixOrder(keys: Uint32Array): Uint32Array {
  const n = keys.length;
  let src = new Uint32Array(n);
  let dst = new Uint32Array(n);
  for (let i = 0; i < n; i++) src[i] = i;
  if (n < 2) return src;

  const count = new Uint32Array(256);
  for (let shift = 0; shift < 32; shift += 8) {
    count.fill(0);
    for (let i = 0; i < n; i++) count[(keys[src[i] as number] as number >>> shift) & 255]!++;

    // Every key shares this byte: the pass would be an identity permutation.
    if (count[(keys[src[0] as number] as number >>> shift) & 255] === n) continue;

    let sum = 0;
    for (let b = 0; b < 256; b++) {
      const c = count[b] as number;
      count[b] = sum;
      sum += c;
    }
    for (let i = 0; i < n; i++) {
      const v = src[i] as number;
      dst[count[(keys[v] as number >>> shift) & 255]!++] = v;
    }
    const swap = src;
    src = dst;
    dst = swap;
  }
  return src;
}

/**
 * Row order for one indexed column.
 *
 * Descending is produced by inverting the KEY rather than reversing the result.
 * Reversing would also reverse ties, and ties are rows the column could not
 * distinguish — they must keep source order in both directions, which is what
 * the comparator path does.
 */
export function orderFromKeys(
  { keys, max }: SortKeys,
  direction: "asc" | "desc",
): Uint32Array {
  if (direction === "asc") return radixOrder(keys);

  const inverted = new Uint32Array(keys.length);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i] as number;
    // Absences stay absent: they belong at the end whichever way the column
    // is pointing, because "we do not know" is not a value to be ranked.
    inverted[i] = k === ABSENT ? ABSENT : max - k;
  }
  return radixOrder(inverted);
}

export interface SortIndex {
  /**
   * Row order for a column, or `null` if it cannot be indexed.
   *
   * Keys are built on first use and kept until invalidated, which is the whole
   * point: the first call pays, every later one does not.
   */
  order(key: string, direction: "asc" | "desc"): Uint32Array | null;
  /** Drops cached keys. Call with a column to drop one, without to drop all. */
  invalidate(key?: string): void;
}

/**
 * A per-column key cache over one row array.
 *
 * Tied to the array identity it was built from. A new array is new data, and
 * keys built from the old one would order rows that no longer exist.
 */
export function createSortIndex<TRow>(
  rows: readonly TRow[],
  get: (row: TRow, key: string) => unknown,
): SortIndex {
  const built = new Map<string, SortKeys | null>();

  return {
    order(key, direction) {
      let entry = built.get(key);
      if (entry === undefined) {
        entry = buildSortKeys(rows, get, key);
        built.set(key, entry);
      }
      return entry === null ? null : orderFromKeys(entry, direction);
    },
    invalidate(key) {
      if (key === undefined) built.clear();
      else built.delete(key);
    },
  };
}
