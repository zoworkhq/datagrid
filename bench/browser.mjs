/**
 * The browser performance harness.
 *
 * ── WHAT THIS ADDS OVER bench/run.mjs ───────────────────────────────────────
 *
 * `run.mjs` measures engine work in node. It cannot measure paint, scroll frame
 * time or INP, because those need a real engine with layout — so until this
 * file existed, three columns of the budget table were unverified claims.
 *
 * This drives a real Chromium through Playwright, CPU-throttled over CDP, and
 * measures:
 *
 *   first paint      mount to painted frame
 *   sort             action to painted frame
 *   filter keystroke one keystroke in a quick filter, to painted frame
 *   scroll           per-frame durations; p95 and the count over 16.7 ms
 *   heap             usedJSHeapSize, with --enable-precise-memory-info
 *
 * ── WHAT IT STILL IS NOT ────────────────────────────────────────────────────
 *
 * A ward workstation. CPU throttling emulates a slower processor; it does not
 * emulate 4 GB of contended memory, an EHR and two payer portals in other tabs,
 * a decade-old GPU, or a spinning disk. The throttle rate below is an
 * approximation chosen to be pessimistic, NOT a measurement of the target
 * device — so these numbers are a floor on how bad things get, not a
 * prediction. The client-mode refusal constant still needs the real thing.
 *
 *   node bench/browser.mjs            measure and print
 *   node bench/browser.mjs --check    compare against the baseline
 *   node bench/browser.mjs --write    record a new baseline
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINE = join(HERE, "browser-baseline.json");
const args = process.argv.slice(2);

/** A decade-old shared workstation is roughly this much slower than a dev laptop. */
const CPU_THROTTLE = 4;
const SIZES = [1_000, 10_000, 100_000];

// ── bundle the page ─────────────────────────────────────────────────────────
const pkg = (name) => join(HERE, "..", "packages", name, "dist", "index.js");

const bundled = await build({
  entryPoints: [join(HERE, "browser", "app.ts")],
  bundle: true,
  // Aliased to the built output rather than added as root dependencies: the
  // harness is not a consumer, and a fake root dependency would show up in the
  // very dependency graph this repository makes claims about.
  alias: {
    "@oxygenui-design/grid-core": pkg("grid-core"),
    "@oxygenui-design/grid-dom": pkg("grid-dom"),
    "@oxygenui-design/grid-signals": pkg("grid-signals"),
  },
  format: "iife",
  target: "es2022",
  write: false,
  logLevel: "silent",
});
const script = bundled.outputFiles[0].text;

const PAGE = `<!doctype html><html><head><meta charset="utf-8" />
<style>
  body { margin: 0; font: 13px system-ui; }
  .oxg-viewport { height: 600px; }
  [role="row"] { display: flex; }
  [role="gridcell"], [role="columnheader"] { padding: 4px 8px; border-bottom: 1px solid #ddd; }
</style></head><body><script>${script}<\/script></body></html>`;

// ── drive it ────────────────────────────────────────────────────────────────
const browser = await chromium.launch({
  args: ["--enable-precise-memory-info", "--js-flags=--expose-gc"],
});
const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);

await page.setContent(PAGE, { waitUntil: "load" });
await page.waitForFunction(() => window.ready === true);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE });

const results = {};
for (const n of SIZES) {
  // Warm once so the JIT and the pool are settled, then measure.
  await page.evaluate((rows) => window.harness.mount(rows), n);
  await page.evaluate(() => window.harness.teardown());

  const firstPaintMs = await page.evaluate((rows) => window.harness.mount(rows), n);
  const sortMs = await page.evaluate(() => window.harness.sort());
  const filterMs = await page.evaluate(() => window.harness.filterKeystroke("7"));
  await page.evaluate((rows) => window.harness.mount(rows), n);
  const scroll = await page.evaluate(() => window.harness.scroll(60));
  const heapMb = await page.evaluate(() => window.harness.heapMb());
  await page.evaluate(() => window.harness.teardown());

  results[n] = {
    firstPaintMs: +firstPaintMs.toFixed(1),
    sortMs: +sortMs.toFixed(1),
    filterMs: +filterMs.toFixed(1),
    scrollP50Ms: +scroll.p50.toFixed(1),
    scrollP95Ms: +scroll.p95.toFixed(1),
    droppedFrames: scroll.longFrames,
    heapMb: heapMb === null ? null : +heapMb.toFixed(1),
  };
}

await browser.close();

const report = {
  note: "Chromium, CPU-throttled. NOT a ward workstation — see the header of this file.",
  cpuThrottle: CPU_THROTTLE,
  platform: `${process.platform}-${process.arch}`,
  results,
};

// ── the budgets from the plan, so a run says pass or fail against them ──────
const BUDGET = {
  1_000: { firstPaintMs: 120, sortMs: 40, filterMs: 32 },
  10_000: { firstPaintMs: 180, sortMs: 120, filterMs: 50 },
  100_000: { firstPaintMs: 200, filterMs: 50 },
};

function budgetReport() {
  const rows = [];
  for (const n of SIZES) {
    for (const [key, limit] of Object.entries(BUDGET[n] ?? {})) {
      const got = results[n][key];
      rows.push({ rows: n, metric: key, budget: limit, measured: got, within: got <= limit });
    }
    // 60 fps is the scroll budget at every size.
    rows.push({
      rows: n,
      metric: "scrollP95Ms",
      budget: 16.7,
      measured: results[n].scrollP95Ms,
      within: results[n].scrollP95Ms <= 16.7,
    });
  }
  return rows;
}

if (args.includes("--write")) {
  writeFileSync(BASELINE, JSON.stringify(report, null, 2) + "\n");
  console.log(`wrote browser baseline for ${report.platform}`);
} else if (args.includes("--check")) {
  if (!existsSync(BASELINE)) {
    console.error("no browser baseline; run with --write on this machine class first");
    process.exit(1);
  }
  const base = JSON.parse(readFileSync(BASELINE, "utf8"));
  console.table(results);
  if (base.platform !== report.platform) {
    console.log(`baseline is ${base.platform}, running on ${report.platform} — skipping the ratchet.`);
    process.exit(0);
  }
  const TOLERANCE = 1.5; // browsers are noisier than node; a ratchet that fails on noise gets disabled
  const failures = [];
  for (const n of SIZES) {
    for (const key of ["firstPaintMs", "sortMs", "filterMs", "scrollP95Ms", "heapMb"]) {
      const was = base.results[n]?.[key];
      const now = results[n]?.[key];
      if (typeof was !== "number" || typeof now !== "number" || was === 0) continue;
      if (now > was * TOLERANCE) {
        failures.push(`${n} rows · ${key}: ${was} -> ${now} (+${Math.round((now / was - 1) * 100)}%)`);
      }
    }
  }
  if (failures.length > 0) {
    console.error("\nPERFORMANCE REGRESSION\n" + failures.map((f) => `  ${f}`).join("\n"));
    process.exit(1);
  }
  console.log("\nwithin the recorded baseline");
} else {
  console.log(report.note);
  console.log(`${report.platform} · chromium · CPU throttled ${CPU_THROTTLE}x`);
  console.table(results);
  console.log("\nAgainst the budgets in the plan:");
  console.table(budgetReport());
}
