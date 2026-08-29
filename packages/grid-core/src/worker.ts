/**
 * Sort and filter, off the main thread.
 *
 * ── WHAT THIS DOES AND DOES NOT BUY ─────────────────────────────────────────
 *
 * It does not make the work faster. A million-row sort costs what it costs.
 * What it buys is that the main thread is not the thing paying: a 234 ms sort
 * is 14 dropped frames of a grid that does not respond to a click, a scroll or
 * a keystroke, and moving it means the spinner spins and the cancel button
 * works.
 *
 * ── WHY IT WAS NOT POSSIBLE BEFORE THE COLUMNAR STORE ───────────────────────
 *
 * `postMessage` structured-clones its argument. An array of a million row
 * OBJECTS is copied field by field — measurably slower than just sorting them
 * on the main thread, which is why "just use a worker" is usually wrong for a
 * grid.
 *
 * A typed array TRANSFERS. Ownership moves, nothing is copied, and the cost is
 * independent of length. So the worker takes the columnar store's arrays and
 * returns a `Uint32Array` of row indices — a few megabytes moving in each
 * direction regardless of how many rows there are.
 *
 * ── NO BUNDLER, NO BUILD STEP, NO WORKER FILE ───────────────────────────────
 *
 * The worker body is a string compiled to a blob URL. A separate `.worker.js`
 * entry point would need every consumer's bundler configured for it, and
 * bundler-specific syntax (`new URL(..., import.meta.url)`) is exactly the
 * kind of thing that works in one toolchain and breaks in the next. This
 * works in all of them, and in none of them requires a plugin.
 */
import { gridError, type GridError } from "./errors.js";

/** The comparison the worker performs. Deliberately small — see `SUPPORTED`. */
export type WorkerOp =
  | { readonly kind: "sort"; readonly direction: "asc" | "desc" }
  | { readonly kind: "filterRange"; readonly min: number; readonly max: number }
  | { readonly kind: "filterEquals"; readonly value: number };

/**
 * What the worker will do, and nothing else.
 *
 * Every operation here works on ONE numeric key array and returns indices. A
 * comparator cannot cross the boundary — a function is not structured-cloneable
 * and serialising one would mean evaluating caller-supplied source in a worker,
 * which is a code-execution sink dressed as a performance feature.
 *
 * So: columns the store has encoded as ordinals go to the worker; columns with
 * a custom comparator stay on the main thread. The split is by capability, not
 * by size.
 */
const SUPPORTED = new Set<WorkerOp["kind"]>(["sort", "filterRange", "filterEquals"]);

const WORKER_BODY = `
self.onmessage = (e) => {
  const { id, op, keys } = e.data;
  const n = keys.length;
  const ABSENT = 0xffffffff;

  function radix(src, keyOf) {
    let a = src, b = new Uint32Array(n);
    const count = new Uint32Array(256);
    for (let shift = 0; shift < 32; shift += 8) {
      count.fill(0);
      for (let i = 0; i < n; i++) count[(keyOf(a[i]) >>> shift) & 255]++;
      if (count[(keyOf(a[0]) >>> shift) & 255] === n) continue;
      let sum = 0;
      for (let k = 0; k < 256; k++) { const c = count[k]; count[k] = sum; sum += c; }
      for (let i = 0; i < n; i++) { const v = a[i]; b[count[(keyOf(v) >>> shift) & 255]++] = v; }
      const t = a; a = b; b = t;
    }
    return a;
  }

  let out;
  if (op.kind === "sort") {
    const src = new Uint32Array(n);
    for (let i = 0; i < n; i++) src[i] = i;
    if (op.direction === "asc") {
      out = radix(src, (i) => keys[i]);
    } else {
      let max = 0;
      for (let i = 0; i < n; i++) { const v = keys[i]; if (v !== ABSENT && v > max) max = v; }
      const inv = new Uint32Array(n);
      for (let i = 0; i < n; i++) { const v = keys[i]; inv[i] = v === ABSENT ? ABSENT : max - v; }
      out = radix(src, (i) => inv[i]);
    }
  } else {
    const hits = new Uint32Array(n);
    let c = 0;
    if (op.kind === "filterRange") {
      for (let i = 0; i < n; i++) {
        const v = keys[i];
        if (v !== ABSENT && v >= op.min && v <= op.max) hits[c++] = i;
      }
    } else {
      for (let i = 0; i < n; i++) if (keys[i] === op.value) hits[c++] = i;
    }
    out = hits.slice(0, c);
  }
  // Transferred, not copied: ownership moves and the cost is independent of n.
  self.postMessage({ id, out }, [out.buffer]);
};
`;

export interface GridWorker {
  /**
   * Runs one operation off-thread.
   *
   * `keys` is TRANSFERRED — the caller must not touch it afterwards. That is
   * the whole point, and pretending otherwise by copying first would give the
   * cost back.
   */
  run(op: WorkerOp, keys: Uint32Array): Promise<Uint32Array>;
  terminate(): void;
  /** `false` when this environment has no Worker — the caller stays on-thread. */
  readonly available: boolean;
}

/**
 * A worker, or an honest refusal.
 *
 * Returns `available: false` where `Worker` or `Blob` do not exist — a
 * server-rendering pass, a locked-down CSP, an old embedded browser. The
 * caller falls back to the main thread rather than failing, because a slow
 * grid is a working grid and a broken one is not.
 */
export function createGridWorker(): GridWorker {
  const canWork =
    typeof Worker === "function" && typeof Blob === "function" && typeof URL?.createObjectURL === "function";

  if (!canWork) {
    return {
      available: false,
      run: () => Promise.reject(gridError({ code: "worker-unavailable", phase: "query" })),
      terminate: () => {},
    };
  }

  const url = URL.createObjectURL(new Blob([WORKER_BODY], { type: "text/javascript" }));
  const worker = new Worker(url);
  // Revoked immediately: the worker holds its own reference, and leaving the
  // URL alive leaks one blob per grid for the life of the document.
  URL.revokeObjectURL(url);

  const pending = new Map<number, { resolve: (v: Uint32Array) => void; reject: (e: GridError) => void }>();
  let nextId = 0;

  worker.onmessage = (e: MessageEvent<{ id: number; out: Uint32Array }>) => {
    const entry = pending.get(e.data.id);
    if (!entry) return;
    pending.delete(e.data.id);
    entry.resolve(e.data.out);
  };
  worker.onerror = () => {
    // A worker that died takes every outstanding request with it. Failing them
    // is better than leaving promises that never settle.
    for (const entry of pending.values()) {
      entry.reject(gridError({ code: "worker-unavailable", phase: "query" }));
    }
    pending.clear();
  };

  return {
    available: true,

    run(op, keys) {
      if (!SUPPORTED.has(op.kind)) {
        return Promise.reject(gridError({ code: "worker-unavailable", phase: "query" }));
      }
      const id = nextId++;
      return new Promise<Uint32Array>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage({ id, op, keys }, [keys.buffer]);
      });
    },

    terminate() {
      for (const entry of pending.values()) {
        entry.reject(gridError({ code: "worker-unavailable", phase: "query" }));
      }
      pending.clear();
      worker.terminate();
    },
  };
}
