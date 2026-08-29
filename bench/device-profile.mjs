/**
 * The device profile — run this on the machine that matters.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * Every number in this repository was measured on a developer laptop, and a
 * developer laptop is not the deployment. The device that decides whether this
 * grid is usable is a shared ward workstation: four to eight gigabytes, an EHR
 * and two payer portals already open, a decade-old integrated GPU, and a
 * browser the trust has pinned three versions back.
 *
 * `bench/browser.mjs` throttles the CPU 4x and says in its own header that this
 * is an approximation and not a measurement of the target. That remains true.
 * What this file adds is the thing that closes the gap: a harness you run ON
 * THE ACTUAL MACHINE, which prints a ceiling and a verdict rather than a
 * benchmark score.
 *
 *   node bench/device-profile.mjs                 this machine, chromium
 *   node bench/device-profile.mjs --throttle 6    approximate a slower CPU
 *   node bench/device-profile.mjs --browser all   chromium, firefox and webkit
 *   node bench/device-profile.mjs --record        append to bench/device-history.json
 *   node bench/device-profile.mjs --check         fail if the ceiling dropped
 *   node bench/device-profile.mjs --json          machine-readable, for CI
 *
 * ── WHAT IT ANSWERS ─────────────────────────────────────────────────────────
 *
 * One question, in the terms the library's own refusal is written in: **at what
 * row count does this device stop keeping up?** That number is the `maxRows` to
 * pass to `createClientRowModel`, and `DEFAULT_CLIENT_ROW_CEILING` says in its
 * own docstring that the right value is yours and not ours.
 *
 * The ceiling is found by measurement, not assumed: the harness walks upward
 * until an interaction crosses the budget, and reports the last size that held.
 */
import { chromium, firefox, webkit } from "playwright";
import { build as esbuild } from "esbuild";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const args = process.argv.slice(2);
const asJson = args.includes("--json");
const throttle = Number(args[args.indexOf("--throttle") + 1]) || 1;
const record = args.includes("--record");
const check = args.includes("--check");

const ENGINES = { chromium, firefox, webkit };
const requested = args.includes("--browser") ? args[args.indexOf("--browser") + 1] : "chromium";
const engines = requested === "all" ? Object.keys(ENGINES) : [requested];
for (const name of engines) {
  if (!(name in ENGINES)) {
    console.error(`unknown browser "${name}" — one of ${Object.keys(ENGINES).join(", ")}, or all`);
    process.exit(1);
  }
}

const HISTORY = join(HERE, "device-history.json");

/**
 * The budgets, and where they come from.
 *
 * These are interaction budgets, not benchmark targets. 100 ms is the point at
 * which a response stops feeling instant (Nielsen, and every RAIL document
 * since); 16.7 ms is one frame at 60 Hz. A grid that misses these on a device
 * is a grid that should be running in server mode on that device.
 */
const BASE_BUDGET = {
  firstPaintMs: 200,
  sortMs: 100,
  filterMs: 100,
  scrollP95Ms: 16.7,
  heapMb: 400,
};

/**
 * ── WHY THE FRAME BUDGET SCALES AND THE OTHERS DO NOT ───────────────────────
 *
 * CPU throttling stretches the browser's own frame cadence. At 4x, Chromium
 * cannot produce a 16.7 ms frame for ANY page — an empty document misses it —
 * so measuring rAF deltas against 16.7 ms under throttle measures the throttle,
 * not the grid. The first version of this harness did exactly that and reported
 * "this device cannot handle 1,000 rows", which is false and is the kind of
 * wrong advice that gets a library removed from a project.
 *
 * So the frame budget is multiplied by the throttle rate: at 4x a frame is
 * allowed 66.8 ms, because that IS one frame on that emulated device.
 *
 * The latency budgets are NOT scaled. 100 ms is the point at which a response
 * stops feeling instant, and a slow device does not move it — a clinician on
 * an old workstation does not become more patient. That is the whole point of
 * measuring there.
 */
const BUDGET = { ...BASE_BUDGET, scrollP95Ms: BASE_BUDGET.scrollP95Ms * throttle };

/** Sizes to walk. Stops at the first that breaks a budget. */
const LADDER = [1_000, 10_000, 50_000, 100_000, 250_000, 500_000, 1_000_000];

if (!existsSync(join(ROOT, "packages/grid-dom/dist/index.js"))) {
  console.error("Build first: pnpm build");
  process.exit(1);
}

const bundle = await esbuild({
  stdin: {
    contents: `
      export { createGridRenderer } from "${join(ROOT, "packages/grid-dom/dist/index.js").replace(/\\/g, "/")}";
      export { createClientRowModel, initialState } from "${join(ROOT, "packages/grid-core/dist/index.js").replace(/\\/g, "/")}";
    `,
    resolveDir: ROOT,
    loader: "js",
  },
  bundle: true, format: "iife", globalName: "OXG", write: false, minify: true,
});

const PAGE = `<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;height:100%;font:13px system-ui}
  #host{height:760px}
  .oxg-root{height:100%;display:flex;flex-direction:column}
  .oxg-root>[role=grid]{flex:1;min-height:0;display:flex;flex-direction:column;border:1px solid #ddd}
  .oxg-head{flex:none;background:#f5f5f5}.oxg-head [role=row]{display:flex}
  .oxg-viewport{flex:1;min-height:0}.oxg-body [role=row]{display:flex}
  [role=gridcell],[role=columnheader]{height:32px;flex:0 0 140px;width:140px;padding:0 8px;
    display:flex;align-items:center;overflow:hidden;white-space:nowrap;box-sizing:border-box}
</style>
<div id="host"></div>
<script>${bundle.outputFiles[0].text}</script>
<script>
const WARDS=["A","B","C","D","E","F","G","H"];
function frames(ms){return new Promise(r=>{const d=[];let l=performance.now();const s=l+ms;
  function t(n){d.push(n-l);l=n;if(n<s)requestAnimationFrame(t);else r(d);}requestAnimationFrame(t);});}
function pct(a,p){const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor(s.length*p))];}
const paint=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));

/**
 * What this engine can do with NOTHING on the page.
 *
 * Headless Firefox and WebKit do not run a clean 60 Hz, and a CPU-throttled
 * Chromium cannot either. Judging the grid against 16.7 ms in those conditions
 * blames it for the engine's cadence — the first version of this harness did
 * exactly that and reported "cannot handle 1,000 rows" for two engines that
 * handle it fine. The budget is therefore the LARGER of the interaction budget
 * and what the engine demonstrably manages when idle.
 */
window.__idleFrame = async () => {
  const d = await frames(600);
  return pct(d, 0.95);
};

window.__profile = async (n, cols) => {
  const rows = new Array(n);
  for (let i=0;i<n;i++){ const r={id:"p"+i,name:"Patient "+((i*7919)%n),ward:WARDS[i%8],
    k:i%13===0?null:3+((i*37)%40)/10};
    for(let c=4;c<cols;c++)r["c"+c]=(i*(c+1))%1000; rows[i]=r; }
  const keys=["name","ward","k","id"]; for(let c=4;c<cols;c++)keys.push("c"+c);
  const columns=keys.slice(0,cols).map(k=>({key:k,header:k.toUpperCase(),sortable:true,width:140}));

  const host=document.getElementById("host"); host.textContent="";
  const model=OXG.createClientRowModel({rows,rowKey:r=>r.id,get:(r,k)=>r[k],maxRows:1e9});
  model.setState(OXG.initialState());
  const grid=OXG.createGridRenderer(host,{label:"profile",rowHeight:32,onAction(){},
    fallback:(row,k)=>({kind:"text",text:String(row[k]??"")})});

  const view=()=>({columns,rows:model.result().rowsIn(0,60),total:model.result().length,
                   sort:[],selection:[],focus:null});

  let t=performance.now(); grid.render(view()); await paint();
  const firstPaintMs=performance.now()-t;

  t=performance.now();
  model.setState({...OXG.initialState(),sort:[{key:"name",direction:"asc"}]});
  grid.render(view()); await paint();
  const sortMs=performance.now()-t;

  t=performance.now();
  model.setState({...OXG.initialState(),filter:{kind:"text",key:"ward",op:"eq",value:"C"}});
  grid.render(view()); await paint();
  const filterMs=performance.now()-t;

  model.setState(OXG.initialState()); grid.render(view()); await paint();
  const vp=document.querySelector(".oxg-viewport");
  const f=frames(1500); let top=0;
  const step=()=>{top+=600;vp.scrollTop=top;
    grid.render({...view(),rows:model.result().rowsIn(Math.floor(top/32),Math.floor(top/32)+60)});
    if(top<n*32-2000)requestAnimationFrame(step);};
  requestAnimationFrame(step);
  const d=await f;

  const heapMb = performance.memory ? performance.memory.usedJSHeapSize/1048576 : null;
  return { firstPaintMs, sortMs, filterMs,
           scrollP50Ms: pct(d,0.5), scrollP95Ms: pct(d,0.95),
           droppedFrames: d.filter(x=>x>16.7).length, heapMb };
};
</script>`;

/**
 * One engine, walked up the ladder.
 *
 * Two things are Chromium-only and both degrade rather than fail: CPU
 * throttling is a CDP command, and `performance.memory` does not exist in
 * Firefox or WebKit. A heap figure of `null` from those engines is the honest
 * answer — inventing one from `measureUserAgentSpecificMemory` where it exists
 * and estimating where it does not would produce a column that looks
 * comparable and is not.
 */
async function profile(engineName) {
  const engine = ENGINES[engineName];
  const launchArgs =
    engineName === "chromium"
      ? { args: ["--enable-precise-memory-info", "--js-flags=--expose-gc"] }
      : {};
  const browser = await engine.launch(launchArgs);
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

  let throttled = false;
  if (throttle > 1 && engineName === "chromium") {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
    throttled = true;
  }

  await page.setContent(PAGE, { waitUntil: "load" });
  const hardware = await page.evaluate(() => ({
    cores: navigator.hardwareConcurrency ?? null,
    deviceMemoryGb: navigator.deviceMemory ?? null,
  }));

  // The floor this engine cannot go below, measured rather than assumed.
  const idleFrameMs = await page.evaluate(() => window.__idleFrame());
  const budget = {
    ...BUDGET,
    scrollP95Ms: Math.max(BUDGET.scrollP95Ms, idleFrameMs * 1.3),
  };

  const rounded = (v) => (typeof v === "number" ? Number(v.toFixed(1)) : v);
  const results = {};
  let ceiling = null;
  let brokeOn = null;

  if (!asJson) {
    console.log(
      `\n${engineName} ${browser.version()} · ${hardware.cores ?? "?"} cores` +
      (throttle > 1
        ? throttled ? ` · CPU throttle ${throttle}x` : ` · throttle ${throttle}x REQUESTED BUT UNSUPPORTED`
        : ""),
    );
    console.log(
      `idle frame ${idleFrameMs.toFixed(1)}ms → frame budget ${budget.scrollP95Ms.toFixed(1)}ms` +
      (budget.scrollP95Ms > BUDGET.scrollP95Ms ? " (raised: this engine cannot do 16.7ms idle)" : ""),
    );
    console.log(
      `${"rows".padStart(9)}  ${"paint".padStart(8)}  ${"sort".padStart(8)}  ` +
      `${"filter".padStart(8)}  ${"p95".padStart(7)}  ${"heap".padStart(8)}  verdict`,
    );
  }

  for (const n of LADDER) {
    let out;
    try {
      out = await page.evaluate(([rows, cols]) => window.__profile(rows, cols), [n, 20]);
    } catch (error) {
      brokeOn = { rows: n, why: `the page failed: ${String(error).slice(0, 60)}` };
      break;
    }

    // A budget cannot be judged on a measurement the engine did not make.
    const broken = Object.entries(budget)
      .filter(([k, limit]) => typeof out[k] === "number" && out[k] > limit)
      .map(([k]) => k);

    results[n] = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, rounded(v)]));
    results[n].withinBudget = broken.length === 0;

    if (!asJson) {
      console.log(
        `${String(n).padStart(9)}  ${String(rounded(out.firstPaintMs)).padStart(8)}  ` +
        `${String(rounded(out.sortMs)).padStart(8)}  ${String(rounded(out.filterMs)).padStart(8)}  ` +
        `${String(rounded(out.scrollP95Ms)).padStart(7)}  ` +
        `${String(out.heapMb === null ? "n/a" : rounded(out.heapMb)).padStart(8)}  ` +
        (broken.length === 0 ? "ok" : `over budget: ${broken.join(", ")}`),
      );
    }

    if (broken.length > 0) {
      brokeOn = { rows: n, why: broken.join(", ") };
      break;
    }
    ceiling = n;
  }

  await browser.close();
  return {
    engine: engineName,
    engineVersion: browser.version(),
    idleFrameMs: Number(idleFrameMs.toFixed(1)),
    frameBudgetMs: Number(budget.scrollP95Ms.toFixed(1)),
    hardware,
    cpuThrottle: throttled ? throttle : 1,
    throttleRequested: throttle,
    throttleSupported: throttle === 1 || throttled,
    results,
    ceiling,
    brokeOn,
  };
}

const runs = [];
for (const name of engines) runs.push(await profile(name));

const report = {
  budget: BUDGET,
  platform: `${process.platform}-${process.arch}`,
  runs,
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("");
  for (const run of runs) {
    if (run.ceiling === null) {
      console.log(`  ${run.engine}: did not hold the budget at even ${LADDER[0].toLocaleString()} rows.`);
    } else {
      const broke = run.brokeOn ? ` (broke at ${run.brokeOn.rows.toLocaleString()} on ${run.brokeOn.why})` : "";
      console.log(`  ${run.engine.padEnd(9)} ceiling ${run.ceiling.toLocaleString().padStart(9)} rows${broke}`);
    }
  }
  const failed = runs.filter((r) => r.ceiling === null);
  const found = runs.filter((r) => r.ceiling !== null);
  if (failed.length > 0) {
    // Reporting the minimum of the engines that SUCCEEDED would present a
    // number as safe across engines when one of them managed nothing at all.
    console.log(
      `\n  No safe value across engines: ${failed.map((r) => r.engine).join(", ")} ` +
      `held no size on the ladder. Investigate before choosing maxRows.`,
    );
  } else if (found.length > 0) {
    // The LOWEST across engines, because a deployment does not get to pick
    // which browser the trust installed.
    console.log(`\n  Safe across all ${found.length} engines: maxRows: ${Math.min(...found.map((r) => r.ceiling))}`);
  }
  console.log(
    `\n  Measured on this machine only. A shared ward workstation with an EHR and two\n` +
    `  payer portals already open will be worse, and this harness cannot emulate that —\n` +
    `  it emulates a slower CPU, not a contended one. Run it there.\n`,
  );
}

// ── history, so a regression is visible over time ──────────────────────────
const previous = existsSync(HISTORY)
  ? JSON.parse(readFileSync(HISTORY, "utf8"))
  : { note: "Ceilings measured over time. Append with --record, compare with --check.", entries: [] };

if (record) {
  previous.entries.push({
    platform: report.platform,
    cpuThrottle: throttle,
    ceilings: Object.fromEntries(runs.map((r) => [r.engine, r.ceiling])),
  });
  writeFileSync(HISTORY, `${JSON.stringify(previous, null, 2)}\n`);
  console.log(`  recorded to ${HISTORY}`);
}

if (check) {
  // Compare against the most recent entry for the same platform and throttle.
  const baseline = [...previous.entries]
    .reverse()
    .find((e) => e.platform === report.platform && e.cpuThrottle === throttle);

  if (!baseline) {
    console.log(`  no baseline for ${report.platform} at ${throttle}x — run with --record first`);
  } else {
    const dropped = runs.filter((r) => {
      const was = baseline.ceilings[r.engine];
      return typeof was === "number" && (r.ceiling ?? 0) < was;
    });
    if (dropped.length > 0) {
      console.error(`\n  CEILING DROPPED:`);
      for (const r of dropped) {
        console.error(`    ${r.engine}: ${baseline.ceilings[r.engine]?.toLocaleString()} → ` +
          `${(r.ceiling ?? 0).toLocaleString()}`);
      }
      process.exit(1);
    }
    console.log(`  no regression against the recorded baseline`);
  }
}

writeFileSync(join(HERE, "device-profile.json"), `${JSON.stringify(report, null, 2)}\n`);
