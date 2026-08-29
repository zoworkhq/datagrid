/**
 * Deep engine measurement for the architecture review.
 *
 * Separate from `run.mjs`, which is the CI ratchet and whose baselines must not
 * move for a one-off investigation. This one goes wider — to a million rows and
 * to 500 columns — and measures the things the ratchet does not: the row
 * model's per-recompute allocation, group and aggregate cost, and the width of
 * the gap between "the engine sorted it" and "the model handed it over".
 *
 *   node --expose-gc bench/review-engine.mjs
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
const core = await import(join(HERE, "..", "packages", "grid-core", "dist", "index.js"));
const {
  sortRows, evaluateFilter, createGeometry, createClientRowModel,
  initialState, groupRows, aggregate,
} = core;

const WARDS = ["A", "B", "C", "D", "E", "F", "G", "H"];
const get = (row, key) => row[key];
const rowKey = (row) => row.id;

/** A row with `cols` fields, so column count is a measured axis and not a guess. */
function makeRows(n, cols = 5) {
  const rows = new Array(n);
  for (let i = 0; i < n; i++) {
    const row = {
      id: `p${i}`,
      name: `Patient ${(i * 7919) % n}`,
      ward: WARDS[i % WARDS.length],
      k: i % 13 === 0 ? null : 3 + ((i * 37) % 40) / 10,
      seen: `2026-0${(i % 8) + 1}-1${i % 9}`,
    };
    for (let c = 5; c < cols; c++) row[`c${c}`] = (i * (c + 1)) % 1000;
    rows[i] = row;
  }
  return rows;
}

function time(fn, iterations) {
  fn();
  const started = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  return Number(((performance.now() - started) / iterations).toFixed(3));
}

function heapAfter(build) {
  if (typeof global.gc !== "function") return null;
  global.gc();
  const before = process.memoryUsage().heapUsed;
  const held = build();
  global.gc();
  const after = process.memoryUsage().heapUsed;
  void held;
  return Number(Math.max(0, (after - before) / 1024 / 1024).toFixed(1));
}

const comparators = {
  name: (a, b) => a.name.localeCompare(b.name),
  k: (a, b) => (a.k === null || b.k === null ? "incomparable" : a.k - b.k),
  ward: (a, b) => a.ward.localeCompare(b.ward),
};

const report = { node: process.version, platform: `${process.platform}-${process.arch}`, rows: {}, columns: {} };

// ── row scaling ─────────────────────────────────────────────────────────────
const SIZES = [1_000, 10_000, 100_000, 500_000, 1_000_000];
for (const n of SIZES) {
  const rows = makeRows(n);
  const iterations = n <= 10_000 ? 20 : n <= 100_000 ? 5 : 2;
  const filter = { kind: "text", key: "ward", op: "eq", value: "C" };

  const out = {
    sortMs: time(() => sortRows(rows, [{ key: "k", direction: "desc" }], comparators), iterations),
    sortTwoKeyMs: time(
      () => sortRows(rows, [{ key: "name", direction: "asc" }, { key: "k", direction: "desc" }], comparators),
      iterations,
    ),
    filterMs: time(() => rows.filter((r) => evaluateFilter(filter, r, get)), iterations),
  };

  // The model's own cost, ABOVE sorting: this is the wrapper-object allocation
  // the pipeline performs on every recompute.
  const model = createClientRowModel({ rows, rowKey, get, comparators, maxRows: 10_000_000 });
  model.setState({ ...initialState(), sort: [{ key: "k", direction: "desc" }] });
  out.modelFirstResultMs = time(() => {
    model.setState({ ...initialState(), sort: [{ key: "k", direction: Math.random() > 0.5 ? "desc" : "asc" }] });
    return model.result().rows.length;
  }, Math.max(2, Math.floor(iterations / 2)));

  out.modelHeapMb = heapAfter(() => {
    const m = createClientRowModel({ rows, rowKey, get, comparators, maxRows: 10_000_000 });
    m.setState(initialState());
    return m.result();
  });

  // Grouping and aggregation, where the category's engines usually fall over.
  if (typeof groupRows === "function") {
    out.groupMs = time(
      () => groupRows(rows, { by: ["ward"], expanded: new Set(WARDS), rowKey, get }),
      Math.max(1, Math.floor(iterations / 2)),
    );
  }

  const g = createGeometry({ count: n, estimate: 40 });
  for (let i = 0; i < n; i += 17) g.measure(i, 32 + (i % 7) * 8);
  out.windowMs = time(() => g.windowFor(Math.floor(n / 2) * 40, 800, 6), 200);
  out.geometryHeapMb = heapAfter(() => {
    const gg = createGeometry({ count: n, estimate: 40 });
    for (let i = 0; i < n; i += 17) gg.measure(i, 40);
    return gg;
  });

  report.rows[n] = out;
  console.log(
    `${String(n).padStart(9)} rows  sort ${String(out.sortMs).padStart(9)}ms  ` +
      `2-key ${String(out.sortTwoKeyMs).padStart(9)}ms  filter ${String(out.filterMs).padStart(8)}ms  ` +
      `model ${String(out.modelFirstResultMs).padStart(9)}ms  heap ${out.modelHeapMb}MB`,
  );
}

// ── column scaling, at a fixed 100k rows ────────────────────────────────────
console.log("");
for (const cols of [20, 50, 100, 250, 500]) {
  const n = 100_000;
  const rows = makeRows(n, cols);
  const filter = { kind: "text", key: "ward", op: "eq", value: "C" };
  const out = {
    sortMs: time(() => sortRows(rows, [{ key: "k", direction: "desc" }], comparators), 3),
    filterMs: time(() => rows.filter((r) => evaluateFilter(filter, r, get)), 3),
    rowsHeapMb: heapAfter(() => makeRows(n, cols)),
  };
  report.columns[cols] = out;
  console.log(
    `${String(cols).padStart(4)} cols  sort ${String(out.sortMs).padStart(8)}ms  ` +
      `filter ${String(out.filterMs).padStart(7)}ms  source heap ${out.rowsHeapMb}MB`,
  );
}

writeFileSync(join(HERE, "review-engine.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(`\nwrote bench/review-engine.json`);
