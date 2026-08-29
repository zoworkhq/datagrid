/**
 * The playground's real-browser smoke test.
 *
 * ── WHY THIS EXISTS, SPECIFICALLY ───────────────────────────────────────────
 *
 * The demo shipped with virtualisation silently dead. `style.css` set
 * `body { height: 100% }` without a height on `html`; a percentage height
 * resolves against the parent, so body computed to `auto`, `.antd` grew to fit
 * its content, and the grid's viewport became unbounded. The renderer then read
 * a `clientHeight` large enough to window in EVERY row — 50,000 of them — and
 * the tab hung.
 *
 * Nothing in the existing suite could see it:
 *
 *   · 625 jsdom tests passed, because jsdom HAS NO LAYOUT. `clientHeight` is
 *     always 0 there, and the tests stub it to 600 to get any rows at all — so
 *     they assert against a height the browser never computes.
 *   · The scroll-scaling gate passed, because it drives the renderer directly
 *     with a viewport it supplies itself.
 *   · The size and engine budgets passed, because neither renders a page.
 *
 * The defect lived exactly in the gap between them: a CSS rule, in the host
 * application, that changes what the renderer measures. Only a real engine
 * computing real layout can catch that, which is what this does.
 *
 * It asserts the load-bearing INVARIANT rather than a pixel: the number of
 * rendered rows must stay bounded no matter how many rows exist. That is what
 * virtualisation means, and it is the thing that was untrue.
 *
 *   node examples/playground/smoke.browser.mjs
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { context as esbuildContext } from "esbuild";
import { options, copyStatic } from "./build.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(HERE, "dist");

/** A window of rows, plus overscan and pinned rows. Never a function of total. */
const MAX_RENDERED_ROWS = 60;
/** Generous: this is a hang detector, not a performance budget. */
const MAX_LOAD_MS = 10_000;

const failures = [];
const check = (ok, label, detail) => {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(label);
};

copyStatic();
const ctx = await esbuildContext(options);
await ctx.rebuild();
const server = await ctx.serve({ servedir: DIST, host: "127.0.0.1", port: 0 });
const origin = `http://127.0.0.1:${server.port}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") pageErrors.push(`console: ${m.text()}`);
});

try {
  console.log(`\n${origin}/index.html`);

  const started = Date.now();
  // `load` and not `domcontentloaded`: the hang this guards against happened
  // during the first paint, after the document had parsed.
  //
  // Caught rather than thrown, because a TIMEOUT IS THE EXPECTED SHAPE of the
  // failure this file exists for. Letting it escape prints a Playwright stack
  // trace and no diagnosis; the whole value here is naming the cause.
  let timedOut = false;
  try {
    await page.goto(`${origin}/index.html`, { waitUntil: "load", timeout: MAX_LOAD_MS });
  } catch (error) {
    if (!/Timeout/i.test(String(error))) throw error;
    timedOut = true;
  }
  const loadMs = Date.now() - started;

  if (timedOut) {
    check(false, "the page finishes loading", `timed out after ${MAX_LOAD_MS} ms`);
    console.log(
      "\n  A hang here almost always means virtualisation is off and the grid is\n" +
        "  rendering every row. Check that `html` AND `body` carry a height: a\n" +
        "  percentage height resolves against the parent, so `body { height: 100% }`\n" +
        "  alone computes to `auto`, the scroll viewport becomes unbounded, and the\n" +
        "  renderer windows in the entire set.\n",
    );
    await browser.close();
    await ctx.dispose();
    process.exit(1);
  }
  await page.waitForTimeout(600);

  const state = await page.evaluate(() => {
    const viewport = document.querySelector(".oxg-viewport");
    const canvas = document.querySelector(".oxg-canvas");
    return {
      rows: document.querySelectorAll('.oxg-body [role="row"]').length,
      cells: document.querySelectorAll('.oxg-body [role="gridcell"]').length,
      blank: [...document.querySelectorAll('.oxg-body [role="gridcell"]')]
        .filter((c) => !c.textContent.trim()).length,
      viewportHeight: viewport ? Math.round(viewport.clientHeight) : 0,
      canvasHeight: canvas ? Math.round(canvas.getBoundingClientRect().height) : 0,
      bodyHeight: Math.round(document.body.getBoundingClientRect().height),
      windowHeight: window.innerHeight,
      identity: document.querySelector(".idc .pname")?.textContent ?? "",
      pill: document.querySelector(".cs")?.textContent ?? "",
      chips: document.querySelectorAll(".a-tag").length,
      // The ground belongs to `.oxg-head`, not to its cells — the header spans
      // past the last column, which a flex row of fixed-width cells does not.
      headerGround: getComputedStyle(
        document.querySelector(".oxg-head") ?? document.body,
      ).backgroundColor,
      // The tokens are the design system. If these resolve, the lifted
      // stylesheet loaded AND the namespace class survived.
      lineToken: getComputedStyle(document.body).getPropertyValue("--line").trim(),
      gridRadius: getComputedStyle(
        document.querySelector('.oxg-root > [role="grid"]') ?? document.body,
      ).borderRadius,
      coverage: (document.getElementById("coverage")?.textContent ?? "").trim(),
    };
  });

  console.log(`\nload ${loadMs} ms · ${state.rows} rows rendered · viewport ${state.viewportHeight}px\n`);

  check(loadMs < MAX_LOAD_MS, "the page finishes loading", `${loadMs} ms`);

  // THE REGRESSION. 50,000 rows exist; a bounded number may be rendered.
  check(
    state.rows > 0 && state.rows <= MAX_RENDERED_ROWS,
    "virtualisation renders a bounded window",
    `${state.rows} rows (limit ${MAX_RENDERED_ROWS})`,
  );

  // The cause, asserted directly, so a failure names the reason and not just
  // the symptom: an unbounded viewport is what made the window unbounded.
  check(
    state.viewportHeight > 0 && state.viewportHeight <= state.windowHeight,
    "the scroll viewport is bounded by the window",
    `${state.viewportHeight}px in ${state.windowHeight}px`,
  );
  check(
    state.bodyHeight <= state.windowHeight + 1,
    "the page itself does not grow past the window",
    `body ${state.bodyHeight}px`,
  );
  // The canvas SHOULD be huge — that is the scrollable extent. If it collapsed
  // to the viewport, the grid would be showing a window with nothing behind it.
  check(
    state.canvasHeight > state.viewportHeight * 10,
    "the scroll canvas spans the whole set",
    `${state.canvasHeight.toLocaleString()}px`,
  );

  check(state.blank === 0, "no cell paints blank", `${state.cells} cells`);
  check(state.identity !== "", "the identity cell renders", state.identity);
  check(state.pill !== "", "the status pill renders", state.pill);
  check(state.chips > 0, "problem chips render", `${state.chips} tags`);
  check(
    state.lineToken !== "",
    "the brief's tokens resolve",
    `--line: ${state.lineToken || "(unset)"}`,
  );
  check(
    state.headerGround !== "rgba(0, 0, 0, 0)",
    "the header carries the brief's ground",
    state.headerGround,
  );
  check(
    state.gridRadius === "12px",
    "the grid shell matches the brief's radius",
    state.gridRadius,
  );
  check(state.coverage.length > 0, "the coverage claim is stated");
  check(pageErrors.length === 0, "no page errors", pageErrors[0] ?? "none");

  // Scrolling must not grow the DOM: that is the other half of virtualisation.
  await page.evaluate(() => {
    const vp = document.querySelector(".oxg-viewport");
    if (vp) vp.scrollTop = 500_000;
  });
  await page.waitForTimeout(400);
  const afterScroll = await page.evaluate(() => ({
    rows: document.querySelectorAll('.oxg-body [role="row"]').length,
    blank: [...document.querySelectorAll('.oxg-body [role="gridcell"]')]
      .filter((c) => !c.textContent.trim()).length,
  }));
  check(
    afterScroll.rows > 0 && afterScroll.rows <= MAX_RENDERED_ROWS,
    "the window stays bounded after scrolling deep",
    `${afterScroll.rows} rows`,
  );
  check(afterScroll.blank === 0, "no cell paints blank after recycling");
} finally {
  await browser.close();
  await ctx.dispose();
}

if (failures.length > 0) {
  console.log(`\n${failures.length} failed:\n${failures.map((f) => `  · ${f}`).join("\n")}\n`);
  process.exit(1);
}
console.log("\nplayground smoke: all checks passed\n");
process.exit(0);
