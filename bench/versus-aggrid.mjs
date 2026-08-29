/**
 * Head-to-head against AG Grid, in a real browser.
 *
 * ── METHODOLOGY, BECAUSE THE NUMBERS ARE WORTHLESS WITHOUT IT ───────────────
 *
 * Both grids get: the same generated dataset (same seed, same shapes), the same
 * viewport, the same column count and widths, the same row height, the same
 * Chromium instance, and the same driver code. Neither gets a warm cache the
 * other does not.
 *
 * What is measured:
 *
 *   firstPaintMs   navigation start → the frame in which the first data row
 *                  is painted. Not "the constructor returned".
 *   sortMs         click-equivalent sort dispatch → next painted frame.
 *   filterMs       filter applied → next painted frame.
 *   scrollP50/95/99 per-frame durations during a scripted scroll, from
 *                  requestAnimationFrame deltas — the metric a user feels.
 *   renderedRows   DOM row count at rest. The virtualisation check.
 *   heapMb         performance.memory.usedJSHeapSize after settling.
 *
 * WHAT THIS IS NOT. One machine, one browser, one dataset shape. AG Grid is
 * run in its default community configuration with no tuning; a tuned AG Grid
 * would do better on some of these. Treat it as a directional comparison
 * between two default configurations, not as a vendor benchmark.
 *
 *   node bench/versus-aggrid.mjs [rows] [cols]
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const AG = join(
  "/private/tmp/claude-501/-Users-rahulrajeevan-zowork-datagrid--claude-worktrees-project-overview-11bfe5",
  "7159b057-d9bd-487a-bc5c-72d2b1e36867/scratchpad/aggrid/node_modules/ag-grid-community",
);

const ROWS = Number(process.argv[2] ?? 100_000);
const COLS = Number(process.argv[3] ?? 20);
const VIEWPORT = { width: 1600, height: 900 };
const ROW_HEIGHT = 32;

if (!existsSync(AG)) {
  console.error(`AG Grid not found at ${AG}\n  npm install ag-grid-community`);
  process.exit(1);
}

// ── the shared fixture, stringified into both pages ─────────────────────────
const FIXTURE = `
const WARDS = ["A","B","C","D","E","F","G","H"];
function makeRows(n, cols) {
  const rows = new Array(n);
  for (let i = 0; i < n; i++) {
    const r = { id: "p"+i, name: "Patient " + ((i*7919)%n), ward: WARDS[i%8],
                k: i%13===0 ? null : 3+((i*37)%40)/10, seen: "2026-0"+((i%8)+1)+"-1"+(i%9) };
    for (let c = 5; c < cols; c++) r["c"+c] = (i*(c+1))%1000;
    rows[i] = r;
  }
  return rows;
}
function columnKeys(cols) {
  const keys = ["name","ward","k","seen","id"];
  for (let c = 5; c < cols; c++) keys.push("c"+c);
  return keys.slice(0, cols);
}
// Frame timing, from rAF deltas: what the user actually feels.
function recordFrames(ms) {
  return new Promise((resolve) => {
    const deltas = []; let last = performance.now(); const stop = last + ms;
    function tick(now) { deltas.push(now - last); last = now;
      if (now < stop) requestAnimationFrame(tick); else resolve(deltas); }
    requestAnimationFrame(tick);
  });
}
function pct(a, p) { if (!a.length) return 0; const s=[...a].sort((x,y)=>x-y);
  return s[Math.min(s.length-1, Math.floor(s.length*p))]; }
`;

// ── our grid ────────────────────────────────────────────────────────────────
const ourBundle = await esbuild({
  stdin: {
    contents: `
      export { createGridRenderer } from "${join(ROOT, "packages/grid-dom/dist/index.js").replace(/\\/g, "/")}";
      export { sortRows, evaluateFilter } from "${join(ROOT, "packages/grid-core/dist/index.js").replace(/\\/g, "/")}";
    `,
    resolveDir: ROOT,
    loader: "js",
  },
  bundle: true, format: "iife", globalName: "OXG", write: false, minify: true,
});
const ourJs = ourBundle.outputFiles[0].text;

const ourPage = `<!doctype html><meta charset="utf-8"><title>ours</title>
<style>
  html,body{margin:0;height:100%;font:13px system-ui}
  #host{height:${VIEWPORT.height - 40}px}
  .oxg-root{height:100%;display:flex;flex-direction:column}
  .oxg-root > [role=grid]{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;border:1px solid #ddd}
  .oxg-head{flex:none;background:#f5f5f5}
  .oxg-head [role=row]{display:flex}
  .oxg-viewport{flex:1 1 auto;min-height:0}
  .oxg-body [role=row]{display:flex}
  [role=columnheader]{height:${ROW_HEIGHT}px;padding:0 8px;display:flex;align-items:center;font-weight:600;border-right:1px solid #e5e5e5;box-sizing:border-box}
  [role=gridcell]{height:${ROW_HEIGHT}px;padding:0 8px;display:flex;align-items:center;overflow:hidden;white-space:nowrap;border-bottom:1px solid #eee;border-right:1px solid #f0f0f0;box-sizing:border-box}
</style>
<div id="host"></div>
<script>${ourJs}</script>
<script>
${FIXTURE}
const ROWS=${ROWS}, COLS=${COLS};
const rows = makeRows(ROWS, COLS);
const keys = columnKeys(COLS);
const columns = keys.map((k) => ({ key: k, header: k.toUpperCase(), sortable: true, width: 140 }));
const comparators = {
  name: (a,b)=>a.name.localeCompare(b.name),
  k: (a,b)=>(a.k===null||b.k===null?"incomparable":a.k-b.k),
  ward: (a,b)=>a.ward.localeCompare(b.ward),
};
let view = rows;
const r = OXG.createGridRenderer(document.getElementById("host"), {
  label: "bench", rowHeight: ${ROW_HEIGHT}, overscan: 4,
  onAction: () => {},
  fallback: (row, key) => ({ kind: "text", text: String(row[key] ?? "") }),
});
function paint() {
  r.render({ columns,
    rows: view.map((row, index) => ({ id: row.id, row, index })),
    total: view.length, sort: [], selection: [], focus: null });
}
const parseMs = performance.now();
window.__bench = {
  scriptParseMs: () => parseMs,
  first() { const t=performance.now(); paint();
    return new Promise((res)=>requestAnimationFrame(()=>requestAnimationFrame(()=>res(performance.now()-t)))); },
  sort() { const t=performance.now();
    view = OXG.sortRows(rows, [{key:"name",direction:"asc"}], comparators).rows; paint();
    return new Promise((res)=>requestAnimationFrame(()=>requestAnimationFrame(()=>res(performance.now()-t)))); },
  filter() { const t=performance.now();
    const f={kind:"text",key:"ward",op:"eq",value:"C"};
    view = rows.filter((row)=>OXG.evaluateFilter(f,row,(x,k)=>x[k])); paint();
    return new Promise((res)=>requestAnimationFrame(()=>requestAnimationFrame(()=>res(performance.now()-t)))); },
  async scroll() {
    const vp = document.querySelector(".oxg-viewport");
    const frames = recordFrames(2000);
    let top = 0; const step = () => { top += 600; vp.scrollTop = top;
      if (top < ${ROWS} * ${ROW_HEIGHT} - 2000) requestAnimationFrame(step); };
    requestAnimationFrame(step);
    const d = await frames;
    return { p50: pct(d,0.5), p95: pct(d,0.95), p99: pct(d,0.99), dropped: d.filter(x=>x>16.7).length, frames: d.length };
  },
  renderedRows: () => document.querySelectorAll(".oxg-body [role=row]").length,
};
</script>`;

// ── ag grid ─────────────────────────────────────────────────────────────────
const agJs = readFileSync(join(AG, "dist/ag-grid-community.min.noStyle.js"), "utf8");
const agCss =
  readFileSync(join(AG, "styles/ag-grid.min.css"), "utf8") +
  readFileSync(join(AG, "styles/ag-theme-alpine.min.css"), "utf8");

const agPage = `<!doctype html><meta charset="utf-8"><title>ag</title>
<style>html,body{margin:0;height:100%;font:13px system-ui}
#host{height:${VIEWPORT.height - 40}px}
${agCss}</style>
<div id="host" class="ag-theme-alpine"></div>
<script>${agJs}</script>
<script>
${FIXTURE}
const ROWS=${ROWS}, COLS=${COLS};
const rows = makeRows(ROWS, COLS);
const keys = columnKeys(COLS);
const columnDefs = keys.map((k)=>({ field:k, headerName:k.toUpperCase(), width:140, sortable:true }));
let api;
// Script parse is already done by the time this runs, so the timer covers the
// same work our own first-paint measurement covers: construct, lay out, paint.
const parseMs = performance.now();
let firstPaintMs = null;
const t0 = performance.now();
const ready = new Promise((res)=>{
  const opts = { columnDefs, rowData: rows, rowHeight: ${ROW_HEIGHT},
    animateRows: false, suppressColumnVirtualisation: false,
    defaultColDef: { sortable: true, filter: false, resizable: false },
    onGridReady: (e) => { api = e.api;
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        firstPaintMs = performance.now() - t0; res();
      }));
    } };
  agGrid.createGrid(document.getElementById("host"), opts);
});
const nextPaint = () => new Promise((r)=>requestAnimationFrame(()=>requestAnimationFrame(r)));
window.__bench = {
  ready,
  first: () => ready.then(()=>firstPaintMs),
  scriptParseMs: () => parseMs,
  async sort() { const t=performance.now();
    api.applyColumnState({ state:[{colId:"name", sort:"asc"}], defaultState:{sort:null} });
    await nextPaint(); return performance.now()-t; },
  async filter() { const t=performance.now();
    api.setGridOption("rowData", rows.filter((r)=>r.ward==="C"));
    await nextPaint(); return performance.now()-t; },
  async scroll() {
    const vp = document.querySelector(".ag-body-vertical-scroll-viewport");
    const frames = recordFrames(2000);
    let top = 0; const step = () => { top += 600; vp.scrollTop = top;
      if (top < ${ROWS} * ${ROW_HEIGHT} - 2000) requestAnimationFrame(step); };
    requestAnimationFrame(step);
    const d = await frames;
    return { p50: pct(d,0.5), p95: pct(d,0.95), p99: pct(d,0.99), dropped: d.filter(x=>x>16.7).length, frames: d.length };
  },
  renderedRows: () => document.querySelectorAll("#host .ag-row").length,
};
</script>`;

// ── drive both identically ──────────────────────────────────────────────────
const browser = await chromium.launch({
  args: ["--enable-precise-memory-info", "--js-flags=--expose-gc"],
});

async function measure(name, html, isAg) {
  const page = await browser.newPage({ viewport: VIEWPORT });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  const started = Date.now();
  await page.setContent(html, { waitUntil: "load", timeout: 120_000 });

  // Both measured the same way, from inside the page: construct → painted row.
  const firstPaintMs = await page.evaluate(() => window.__bench.first());
  const scriptParseMs = await page.evaluate(() => window.__bench.scriptParseMs());
  const pageLoadMs = Date.now() - started;

  await page.waitForTimeout(600);
  const renderedRows = await page.evaluate(() => window.__bench.renderedRows());
  const sortMs = await page.evaluate(() => window.__bench.sort());
  await page.waitForTimeout(300);
  const scroll = await page.evaluate(() => window.__bench.scroll());
  await page.waitForTimeout(300);
  const filterMs = await page.evaluate(() => window.__bench.filter());
  await page.waitForTimeout(500);
  const heapMb = await page.evaluate(
    () => (performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null),
  );

  await page.close();
  const round = (v) => (typeof v === "number" ? Number(v.toFixed(1)) : v);
  return {
    firstPaintMs: round(firstPaintMs), scriptParseMs: round(scriptParseMs),
    pageLoadMs: round(pageLoadMs), renderedRows, sortMs: round(sortMs),
    filterMs: round(filterMs), heapMb: round(heapMb),
    scrollP50: round(scroll.p50), scrollP95: round(scroll.p95), scrollP99: round(scroll.p99),
    droppedFrames: scroll.dropped, frames: scroll.frames,
    errors: errors.slice(0, 3),
  };
}

console.log(`\n${ROWS.toLocaleString()} rows × ${COLS} columns · chromium · ${VIEWPORT.width}×${VIEWPORT.height}\n`);
const ours = await measure("ours", ourPage, false);
const ag = await measure("ag", agPage, true);
await browser.close();

const rowsOut = [
  ["script parse (ms)", ours.scriptParseMs, ag.scriptParseMs, true],
  ["first paint (ms)", ours.firstPaintMs, ag.firstPaintMs, true],
  ["page load total (ms)", ours.pageLoadMs, ag.pageLoadMs, true],
  ["rendered rows", ours.renderedRows, ag.renderedRows, null],
  ["sort (ms)", ours.sortMs, ag.sortMs, true],
  ["filter (ms)", ours.filterMs, ag.filterMs, true],
  ["scroll p50 (ms)", ours.scrollP50, ag.scrollP50, true],
  ["scroll p95 (ms)", ours.scrollP95, ag.scrollP95, true],
  ["scroll p99 (ms)", ours.scrollP99, ag.scrollP99, true],
  ["dropped frames", ours.droppedFrames, ag.droppedFrames, true],
  ["heap (MB)", ours.heapMb, ag.heapMb, true],
];
console.log(`${"metric".padEnd(20)}${"ours".padStart(10)}${"ag grid".padStart(10)}${"ratio".padStart(10)}`);
for (const [label, a, b, ratio] of rowsOut) {
  const r = ratio && a > 0 && b > 0 ? `${(b / a).toFixed(2)}x` : "";
  console.log(`${label.padEnd(20)}${String(a).padStart(10)}${String(b).padStart(10)}${r.padStart(10)}`);
}
if (ours.errors.length) console.log("\nours errors:", ours.errors);
if (ag.errors.length) console.log("ag errors:", ag.errors);

const out = join(HERE, `versus-aggrid-${ROWS}x${COLS}.json`);
writeFileSync(out, `${JSON.stringify({ rows: ROWS, cols: COLS, viewport: VIEWPORT, ours, ag }, null, 2)}\n`);
console.log(`\nwrote ${out}`);
