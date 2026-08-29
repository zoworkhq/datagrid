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
 *   node bench/device-profile.mjs              this machine, unthrottled
 *   node bench/device-profile.mjs --throttle 6 approximate a slower one
 *   node bench/device-profile.mjs --json       machine-readable, for CI
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
import { chromium } from "playwright";
import { build as esbuild } from "esbuild";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const args = process.argv.slice(2);
const asJson = args.includes("--json");
const throttle = Number(args[args.indexOf("--throttle") + 1]) || 1;

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

const browser = await chromium.launch({
  args: ["--enable-precise-memory-info", "--js-flags=--expose-gc"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const cdp = await page.context().newCDPSession(page);
if (throttle > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
await page.setContent(PAGE, { waitUntil: "load" });

const hardware = await page.evaluate(() => ({
  cores: navigator.hardwareConcurrency ?? null,
  deviceMemoryGb: navigator.deviceMemory ?? null,
  userAgent: navigator.userAgent,
}));

const rounded = (v) => (typeof v === "number" ? Number(v.toFixed(1)) : v);
const results = {};
let ceiling = null;
let brokeOn = null;

if (!asJson) {
  console.log(`\n${hardware.cores ?? "?"} cores · ${hardware.deviceMemoryGb ?? "?"} GB reported` +
    ` · CPU throttle ${throttle}x`);
  console.log(
    `budgets: paint ${BUDGET.firstPaintMs}ms · sort ${BUDGET.sortMs}ms · ` +
    `filter ${BUDGET.filterMs}ms · frame ${BUDGET.scrollP95Ms.toFixed(1)}ms` +
    (throttle > 1 ? ` (16.7 x ${throttle})` : "") + `\n`,
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

  const broken = Object.entries(BUDGET)
    .filter(([k, limit]) => typeof out[k] === "number" && out[k] > limit)
    .map(([k]) => k);

  results[n] = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, rounded(v)]));
  results[n].withinBudget = broken.length === 0;

  if (!asJson) {
    console.log(
      `${String(n).padStart(9)}  ${String(rounded(out.firstPaintMs)).padStart(8)}  ` +
      `${String(rounded(out.sortMs)).padStart(8)}  ${String(rounded(out.filterMs)).padStart(8)}  ` +
      `${String(rounded(out.scrollP95Ms)).padStart(7)}  ` +
      `${String(rounded(out.heapMb) ?? "-").padStart(8)}  ` +
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

const report = {
  measuredAt: "run `date` alongside this — the harness cannot read a clock",
  hardware,
  cpuThrottle: throttle,
  budget: BUDGET,
  results,
  ceiling,
  brokeOn,
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("");
  if (ceiling === null) {
    console.log(`  This device did not hold the budget at even ${LADDER[0].toLocaleString()} rows.`);
    console.log(`  Use a server row model here — see docs/api.md §5.`);
  } else {
    console.log(`  Largest size that held every budget: ${ceiling.toLocaleString()} rows.`);
    if (brokeOn) {
      console.log(`  Broke at ${brokeOn.rows.toLocaleString()} on: ${brokeOn.why}.`);
    } else {
      console.log(`  Nothing on the ladder broke it — the real ceiling is above ` +
        `${LADDER[LADDER.length - 1].toLocaleString()}.`);
    }
    console.log(`\n  Pass this to the row model on THIS device class:`);
    console.log(`      createClientRowModel({ …, maxRows: ${ceiling} })`);
  }
  console.log(
    `\n  Measured on this machine only. A shared ward workstation with an EHR and two\n` +
    `  payer portals already open will be worse, and this harness cannot emulate that —\n` +
    `  it emulates a slower CPU, not a contended one. Run it there.\n`,
  );
}

writeFileSync(join(HERE, "device-profile.json"), `${JSON.stringify(report, null, 2)}\n`);
