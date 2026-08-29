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
    state.gridRadius !== "0px",
    "the grid shell is styled",
    `radius ${state.gridRadius}`,
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

  // ── every panel mounts, and says something ────────────────────────────────
  //
  // Thirteen tabs, and a panel that throws on mount leaves an empty box that
  // looks exactly like a panel with nothing to show. Every one is opened, and
  // each is required to produce content — a grid with cells, or prose that is
  // not the empty string. A panel whose script died produces neither.
  const TABS = await page.$$eval('[role="tab"]', (els) => els.map((e) => e.dataset.tab));
  check(TABS.length === 13, "every tab is present", `${TABS.length} tabs`);

  for (const name of TABS) {
    await page.click(`[role="tab"][data-tab="${name}"]`);
    // The scale panel measures 100,000 rows on open; give it room.
    await page.waitForTimeout(name === "scale" ? 3500 : 500);
    const panel = await page.evaluate((n) => {
      const p = document.querySelector(`[data-panel="${n}"]`);
      // A `hidden` block is legitimately empty — #export-out only fills after
      // an export runs. Everything VISIBLE has to say something.
      const prose = [...p.querySelectorAll("pre, .p-hint, .p-stat, .p-held, .todos, .migout")]
        .filter((e) => !e.hidden && e.offsetParent !== null && !("transient" in e.dataset));
      return {
        cells: p.querySelectorAll('[role="gridcell"]').length,
        prose: prose.length,
        emptyProse: prose.filter((e) => !e.textContent.trim()).map((e) => e.id || e.className),
      };
    }, name);
    check(
      panel.cells > 0 || panel.prose > 0,
      `the ${name} panel renders something`,
      `${panel.cells} cells, ${panel.prose} text blocks`,
    );
    check(
      panel.emptyProse.length === 0,
      `the ${name} panel leaves no empty text block`,
      panel.emptyProse.join(", ") || "none",
    );
  }
  check(pageErrors.length === 0, "no page errors across every panel", pageErrors[0] ?? "none");

  // ── the claims the new panels exist to make ───────────────────────────────
  //
  // Each of these is the ONE number that panel is about. Asserting "it rendered"
  // would pass on a panel that renders every column, which is the exact defect
  // column virtualisation exists to prevent.
  await page.click('[role="tab"][data-tab="columns"]');
  await page.waitForTimeout(700);
  const wide = await page.evaluate(() => {
    const p = document.querySelector('[data-panel="columns"]');
    const row = p.querySelector('.oxg-body [role="row"]');
    return {
      declared: p.querySelectorAll('[role="columnheader"]').length,
      perRow: row ? row.querySelectorAll('[role="gridcell"]').length : 0,
      spacers: row ? row.querySelectorAll('[role="presentation"]').length : 0,
      viewportWidth: p.querySelector(".oxg-viewport")?.clientWidth ?? 0,
    };
  });
  // The safety valve: an unlaid-out viewport reports 0 and the renderer paints
  // every column on purpose. Asserting the window without asserting the width
  // would pass on exactly that case, which is how this nearly shipped untested.
  check(wide.viewportWidth > 0, "the wide panel's viewport has a width", `${wide.viewportWidth}px`);
  check(
    wide.perRow > 0 && wide.perRow < 40,
    "250 columns render as a window, not as 250 cells",
    `${wide.perRow} cells per row, ${wide.spacers} spacers`,
  );

  await page.click('[role="tab"][data-tab="fhir"]');
  await page.waitForTimeout(900);
  const fhir = await page.evaluate(async () => {
    const p = document.querySelector('[data-panel="fhir"]');
    const vp = p.querySelector(".oxg-viewport");
    // Each pass reaches the bottom of the runway, which is what asks for the
    // next page. Headless is slower than a warm tab, so this is generous.
    for (let i = 0; i < 6; i++) {
      vp.scrollTop = vp.scrollHeight;
      vp.dispatchEvent(new Event("scroll"));
      await new Promise((r) => setTimeout(r, 500));
    }
    const calls = p.querySelector("#fhir-calls").textContent;
    p.querySelector("#fhir-jump").click();
    await new Promise((r) => setTimeout(r, 500));
    return {
      follows: (calls.match(/→ follow/g) ?? []).length,
      rowcount: p.querySelector('[role="grid"]').getAttribute("aria-rowcount"),
      refusal: p.querySelector("#fhir-calls").textContent.includes("cursor-jump-unsupported"),
      leaksRowId: /rowId/i.test(p.querySelector("#fhir-calls").textContent),
    };
  });
  check(fhir.follows >= 3, "scrolling pages through the opaque link.next", `${fhir.follows} follows`);
  check(fhir.rowcount === "-1", "an unknown total is announced as unknown", `aria-rowcount ${fhir.rowcount}`);
  check(fhir.refusal, "a cursor source refuses a jump rather than hanging");
  check(!fhir.leaksRowId, "the refusal names a row index, never a row id");

  await page.click('[role="tab"][data-tab="frameworks"]');
  await page.waitForTimeout(900);
  const adapters = await page.evaluate(async () => {
    const p = document.querySelector('[data-panel="frameworks"]');
    const first = (id) => {
      const row = p.querySelector(`#${id} .oxg-body [role="row"]`);
      return row ? [...row.querySelectorAll('[role="gridcell"]')].map((c) => c.textContent.trim()).join("|") : "";
    };
    const live = ["fw-vanilla", "fw-element", "fw-react", "fw-signals"];
    const before = live.map(first);
    p.querySelector("#fw-shuffle").click();
    await new Promise((r) => setTimeout(r, 400));
    return { before, after: live.map(first), ssr: first("fw-ssr") };
  });
  check(
    new Set(adapters.before).size === 1 && adapters.before[0] !== "",
    "every adapter starts on the same row",
    adapters.before[0],
  );
  check(
    new Set(adapters.after).size === 1 && adapters.after[0] !== adapters.before[0],
    "every adapter moves together — one engine, not four",
    adapters.after[0],
  );
  check(adapters.ssr !== "", "the server-rendered grid is adopted, not blanked", adapters.ssr);

  // Every adapter must SIZE the same, not just show the same rows. An adapter
  // that inserts an auto-height wrapper breaks the host's height chain, the
  // renderer reads an unbounded clientHeight, and virtualisation stops — the
  // grid renders every row it was given. The React adapter did exactly this: a
  // 268px slot held a 642px grid spilling over the section below it.
  const heights = await page.evaluate(() => {
    const p = document.querySelector('[data-panel="frameworks"]');
    return ["fw-vanilla", "fw-element", "fw-react", "fw-signals"].map((id) => {
      const host = p.querySelector(`#${id}`);
      const inner = host.querySelector(".oxg-root");
      return {
        id,
        host: Math.round(host.getBoundingClientRect().height),
        grid: inner ? Math.round(inner.getBoundingClientRect().height) : -1,
      };
    });
  });
  const overflowing = heights.filter((h) => h.grid > h.host + 2);
  check(
    overflowing.length === 0,
    "no adapter lets the grid outgrow the box it was given",
    overflowing.map((h) => `${h.id} ${h.grid}px in ${h.host}px`).join(", ") ||
      heights.map((h) => `${h.id} ${h.grid}px`).join(", "),
  );

  await page.click('[role="tab"][data-tab="scale"]');
  await page.waitForTimeout(3500);
  const scale = await page.evaluate(() => {
    const p = document.querySelector('[data-panel="scale"]');
    const rows = [...p.querySelectorAll('.oxg-body [role="row"]')].map((r) =>
      [...r.querySelectorAll('[role="gridcell"]')].map((c) => c.textContent.trim()),
    );
    return { rows, strategy: rows[0]?.[1] ?? "", store: rows.find((r) => r[0]?.includes("buildColumnStore"))?.[1] ?? "" };
  });
  check(scale.rows.length >= 8, "the scale panel measures every model", `${scale.rows.length} measurements`);
  check(scale.strategy === "columnar", "100,000 rows chooses the columnar store", scale.strategy);
  check(/MB in/.test(scale.store), "the store reports real bytes", scale.store);

  // ── a hidden grid stays still ─────────────────────────────────────────────
  //
  // ResizeObserver reports 0 for every rendered row the moment a grid is
  // hidden. Taken as a height, that collapses the geometry, the window grows
  // to cover the whole set, and the pool adds a node per row on every frame —
  // in a tab nobody is looking at. Measured before the fix: a hidden 2,000-row
  // grid reached 27,628 nodes in two seconds and made two frames take 4.4 s.
  //
  // jsdom cannot see this: it has no layout, so no observer ever fires. This
  // is the same gap that hid the dead-virtualisation bug this file was written
  // for, which is why the check lives here and not in a unit test.
  await page.click('[role="tab"][data-tab="columns"]');
  await page.waitForTimeout(600);
  await page.click('[role="tab"][data-tab="working"]');
  const nodesAt = () => page.evaluate(() => document.querySelectorAll("*").length);
  await page.waitForTimeout(400);
  const settled = await nodesAt();
  await page.waitForTimeout(1800);
  const later = await nodesAt();
  check(
    later - settled < 200,
    "a hidden grid does not grow the DOM",
    `${settled} → ${later} nodes over 1.8 s`,
  );
  const frameMs = await page.evaluate(async () => {
    const t0 = performance.now();
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r));
    return Math.round(performance.now() - t0);
  });
  check(frameMs < 200, "the page still animates at a sane rate", `two frames in ${frameMs} ms`);

  // Back to the roster, so the theme checks below start where they used to.
  await page.click('[role="tab"][data-tab="roster"]');
  await page.waitForTimeout(300);

  // ── the chrome carries no hue ─────────────────────────────────────────────
  //
  // The lifted brief is teal to its neutrals: `--surface: #101d1b` has more
  // green in it than red or blue, and at scale that reads as a brand rather
  // than as an instrument. The demo overrides the whole ramp — this asserts the
  // override actually reached the page, in BOTH themes, because a token block
  // that loses a specificity fight fails silently and looks merely "off".
  //
  // Status colours are exempt: green there means stable, which is information.
  //
  // TOLERANCE, stated rather than implied: a channel spread of 8. The neutrals
  // in use reach 6 (the dark header is a deliberately cool grey), and the
  // brief's teal ground scores 13-17. So this catches the palette REVERTING —
  // it will not catch a cast of a few points, which is imperceptible at these
  // luminances anyway. It is a regression guard, not a colorimeter.
  const spread = (rgb) => {
    const [r, g, b] = (rgb.match(/\d+/g) ?? []).map(Number);
    return Math.max(r, g, b) - Math.min(r, g, b);
  };

  for (const scheme of ["light", "dark"]) {
    const themed = await browser.newPage({ viewport: { width: 1280, height: 800 }, colorScheme: scheme });
    await themed.goto(`${origin}/index.html`, { waitUntil: "load", timeout: MAX_LOAD_MS });
    await themed.waitForTimeout(400);
    const chrome = await themed.evaluate(() => {
      const read = (el) => (el ? getComputedStyle(el).backgroundColor : "rgb(0,0,0)");
      return {
        page: read(document.body),
        head: read(document.querySelector(".oxg-head")),
        cell: read(document.querySelector('.oxg-body [role="gridcell"]')),
        ink: getComputedStyle(document.body).color,
      };
    });
    await themed.close();

    for (const [what, value] of Object.entries(chrome)) {
      check(
        spread(value) <= 8,
        `${scheme}: the ${what} is neutral`,
        `${value} (channel spread ${spread(value)})`,
      );
    }
  }

  // ── the theme switch ──────────────────────────────────────────────────────
  //
  // Three states, and the machine's preference is only the DEFAULT. A two-way
  // switch has to pick a side on first load, and picking wrong hands a
  // clinician on a night shift a white screen.
  const themed = await browser.newPage({ viewport: { width: 1280, height: 800 }, colorScheme: "light" });
  await themed.goto(`${origin}/index.html`, { waitUntil: "load", timeout: MAX_LOAD_MS });
  await themed.waitForTimeout(300);

  const themeState = async () =>
    themed.evaluate(() => ({
      attr: document.documentElement.dataset.theme ?? "system",
      bg: getComputedStyle(document.body).backgroundColor,
    }));

  const start = await themeState();
  check(start.attr === "system", "the theme defaults to the machine's preference", start.attr);

  await themed.click("#theme");
  await themed.waitForTimeout(150);
  await themed.click("#theme");
  await themed.waitForTimeout(200);
  const dark = await themeState();
  // The page is in a LIGHT system context, so this proves the override wins.
  check(dark.attr === "dark", "an explicit dark theme overrides the system", dark.attr);
  check(
    spread(dark.bg) <= 8 && Number((dark.bg.match(/\d+/g) ?? [])[0]) < 60,
    "dark actually paints dark, and neutral",
    dark.bg,
  );

  await themed.reload({ waitUntil: "load", timeout: MAX_LOAD_MS });
  await themed.waitForTimeout(400);
  const remembered = await themeState();
  check(remembered.attr === "dark", "the choice survives a reload", remembered.attr);
  await themed.close();
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
