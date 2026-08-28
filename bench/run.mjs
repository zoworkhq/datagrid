/**
 * The performance harness.
 *
 * ── WHAT THIS MEASURES, AND WHAT IT DOES NOT ───────────────────────────────
 *
 * Measured here: engine work — filter evaluation, multi-key sort, virtualisation
 * geometry, and the row model's own heap overhead, at 1k / 10k / 100k rows.
 * These are the operations that decide whether a grid is usable at scale, and
 * they are measurable without a browser.
 *
 * NOT measured here: first paint, scroll frame time, and INP. Those need a real
 * engine with layout, and a Playwright harness that is not yet wired. Until it
 * is, the paint and 60 fps columns of the budget table are unverified claims —
 * see `docs/decisions` and the plan. Do not cite them as measured.
 *
 * A budget measured on an M-series laptop has not been measured. The ratchet
 * compares against a baseline recorded on the same machine class, so the CI
 * baseline and a developer's baseline are different files and must not be mixed.
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   node --expose-gc bench/run.mjs            measure and print
 *   node --expose-gc bench/run.mjs --check    compare against the baseline
 *   node --expose-gc bench/run.mjs --write    record a new baseline
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const core = await import(
  join(HERE, "..", "packages", "grid-core", "dist", "index.js")
);

const { sortRows, evaluateFilter, createGeometry, createClientRowModel, initialState } = core;

// ── fixtures ────────────────────────────────────────────────────────────────
const WARDS = ["A", "B", "C", "D", "E"];
function makeRows(n) {
  const rows = new Array(n);
  for (let i = 0; i < n; i++) {
    rows[i] = {
      id: `p${i}`,
      name: `Patient ${(i * 7919) % n}`,
      ward: WARDS[i % WARDS.length],
      k: i % 13 === 0 ? null : 3 + ((i * 37) % 40) / 10,
      seen: `2026-0${(i % 8) + 1}-1${i % 9}`,
    };
  }
  return rows;
}
const get = (row, key) => row[key];
const rowKey = (row) => row.id;

// ── timing ──────────────────────────────────────────────────────────────────
function time(fn, iterations) {
  fn(); // warm
  const started = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  return (performance.now() - started) / iterations;
}

/**
 * Retained heap for the thing built, ABOVE the source array it reads.
 *
 * This is the row model's own overhead, not the total cost of holding N rows —
 * the fixtures already exist when this runs. The number that decides whether
 * client mode is offered at all is total retained heap on the target device,
 * and this harness cannot produce it. Do not use this to set the refusal
 * constant.
 */
function heapAfter(build) {
  if (typeof global.gc !== "function") return null;
  global.gc();
  const before = process.memoryUsage().heapUsed;
  const held = build();
  global.gc();
  const after = process.memoryUsage().heapUsed;
  void held;
  return Math.max(0, (after - before) / 1024 / 1024);
}

// ── the measurements ────────────────────────────────────────────────────────
const SIZES = [1_000, 10_000, 100_000];
const results = {};

for (const n of SIZES) {
  const rows = makeRows(n);
  const iterations = n <= 10_000 ? 20 : 5;

  const comparators = {
    name: (a, b) => a.name.localeCompare(b.name),
    k: (a, b) => (a.k === null || b.k === null ? "incomparable" : a.k - b.k),
  };

  const sortMs = time(
    () => sortRows(rows, [{ key: "k", direction: "desc" }], comparators),
    iterations,
  );
  const sortTwoKeyMs = time(
    () =>
      sortRows(
        rows,
        [
          { key: "name", direction: "asc" },
          { key: "k", direction: "desc" },
        ],
        comparators,
      ),
    iterations,
  );

  // One keystroke in a quick filter: evaluate the predicate over every row.
  const node = { kind: "text", key: "name", op: "contains", value: "7" };
  const filterMs = time(() => {
    let kept = 0;
    for (const row of rows) if (evaluateFilter(node, row, get)) kept++;
    return kept;
  }, iterations);

  // Virtualisation geometry: the window computation on every scroll frame.
  const g = createGeometry(n, 40);
  for (let i = 0; i < n; i += 17) g.measure(i, 32 + (i % 7) * 8);
  const windowMs = time(() => g.windowFor(Math.floor(n / 2) * 40, 800, 4), 200);

  const heapMb = heapAfter(() => {
    const model = createClientRowModel({ rows, rowKey, get, maxRows: Number.MAX_SAFE_INTEGER });
    model.setState(initialState({ sort: [{ key: "k", direction: "desc" }] }));
    return model.result();
  });

  results[n] = {
    sortMs: +sortMs.toFixed(2),
    sortTwoKeyMs: +sortTwoKeyMs.toFixed(2),
    filterMs: +filterMs.toFixed(2),
    windowMs: +windowMs.toFixed(4),
    modelHeapMb: heapMb === null ? null : +heapMb.toFixed(1),
  };
}

// ── the client-mode refusal constant ────────────────────────────────────────
// The plan requires this to be MEASURED at the density where the budget breaks,
// never chosen. The 10k client budget is sort <= 120 ms; this walks up until a
// two-key sort exceeds it.
const SORT_BUDGET_MS = 120;
let ceiling = null;
{
  const comparators = {
    name: (a, b) => a.name.localeCompare(b.name),
    k: (a, b) => (a.k === null || b.k === null ? "incomparable" : a.k - b.k),
  };
  for (const n of [50_000, 100_000, 200_000, 400_000, 800_000]) {
    const rows = makeRows(n);
    const ms = time(
      () =>
        sortRows(
          rows,
          [
            { key: "name", direction: "asc" },
            { key: "k", direction: "desc" },
          ],
          comparators,
        ),
      3,
    );
    if (ms > SORT_BUDGET_MS) {
      ceiling = { brokeAt: n, ms: +ms.toFixed(1), budgetMs: SORT_BUDGET_MS };
      break;
    }
    ceiling = { lastPassing: n, ms: +ms.toFixed(1), budgetMs: SORT_BUDGET_MS };
  }
}

const report = {
  note: "Engine operations only. Paint, scroll frame time and INP are NOT measured here.",
  node: process.version,
  platform: `${process.platform}-${process.arch}`,
  gc: typeof global.gc === "function",
  results,
  // The sort budget is only one of the two constraints, and the weaker one.
  // The constant that decides whether client mode is offered is TOTAL RETAINED
  // HEAP on a shared ward workstation, which this harness cannot measure. The
  // probe below is corroborating evidence, not the constant.
  refusalProbe: ceiling,
  refusalConstantMeasured: false,
};

const BASELINE = join(HERE, "baseline.json");
const args = process.argv.slice(2);

if (args.includes("--write")) {
  writeFileSync(BASELINE, JSON.stringify(report, null, 2) + "\n");
  console.log(`wrote baseline for ${report.platform}`);
} else if (args.includes("--check")) {
  if (!existsSync(BASELINE)) {
    console.error("no baseline; run with --write on this machine class first");
    process.exit(1);
  }
  const base = JSON.parse(readFileSync(BASELINE, "utf8"));
  if (base.platform !== report.platform) {
    console.log(
      `baseline is ${base.platform}, running on ${report.platform} — skipping the ratchet.\n` +
        "A budget measured on one machine class has not been measured on another.",
    );
    process.exit(0);
  }
  // 40% headroom: a shared CI runner is noisy, and a ratchet that fails on
  // noise gets disabled, which is worse than no ratchet at all.
  const TOLERANCE = 1.4;
  const failures = [];
  for (const n of SIZES) {
    for (const key of ["sortMs", "sortTwoKeyMs", "filterMs", "windowMs", "modelHeapMb"]) {
      const was = base.results[n]?.[key];
      const now = report.results[n]?.[key];
      if (typeof was !== "number" || typeof now !== "number" || was === 0) continue;
      if (now > was * TOLERANCE) {
        failures.push(`${n} rows · ${key}: ${was} -> ${now} (+${Math.round((now / was - 1) * 100)}%)`);
      }
    }
  }
  console.table(report.results);
  if (failures.length > 0) {
    console.error("\nPERFORMANCE REGRESSION\n" + failures.map((f) => `  ${f}`).join("\n"));
    process.exit(1);
  }
  console.log("\nwithin budget of the recorded baseline");
} else {
  console.log(report.note);
  console.log(`${report.platform} · node ${report.node} · gc ${report.gc ? "on" : "OFF (no heap numbers)"}`);
  console.table(report.results);
  console.log("client-mode refusal probe (sort budget only):", report.refusalProbe);
  console.log(
    "\nThis does NOT set PROVISIONAL_CLIENT_ROW_CEILING. That constant is decided\n" +
      "by total retained heap on the target device class, which this harness does\n" +
      "not measure. The probe corroborates the published ~100k ceiling; it does\n" +
      "not replace it.",
  );
}
void require;
