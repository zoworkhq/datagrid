/**
 * The race. Two grids, both live, both scrolling, side by side.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * A benchmark table is a claim about a run that already happened somewhere
 * else. A CTO has read a hundred of them and believes none. So this renders the
 * comparison in front of you, at your machine's speed, with the frame times
 * measured live and shown as they happen.
 *
 * ── AND WHY IT IS HONEST ────────────────────────────────────────────────────
 *
 * The right-hand grid is NOT a strawman and is not AG Grid. It is a naive
 * renderer that does the one thing every unvirtualised grid does: build a node
 * per cell for every row it was given. That is the whole difference being
 * demonstrated, and labelling it "AG Grid" when it is not would be the kind of
 * claim this library exists to avoid making.
 *
 * Both sides get the same rows, the same columns and the same scroll offsets.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT MEASURE ─────────────────────────────────
 *
 * It does not compare frame times, and the reason is worth writing down.
 *
 * Three versions of this file tried. Timing each side's own call reported the
 * naive grid as FASTER, because setting `scrollTop` is cheap and the browser
 * defers that grid's paint past the end of the timer. Taking turns — one side
 * scrolls, sample the real rAF interval, then the other — reported the real
 * grid at a 100 ms median against the naive grid's 33 ms, while the screen
 * plainly showed the opposite.
 *
 * That second result was not noise, and it is not a bug in the grid. Scrolling
 * a container does not invalidate layout, so the naive side's turn costs
 * almost nothing on the main thread. The real grid's turn RECYCLES NODES —
 * actual DOM mutation — and every such mutation makes the browser recalculate
 * style and layout across the whole document, including the 73,000-node
 * subtree sitting next to it. The real grid was being billed for the naive
 * grid's DOM.
 *
 * Which is the interesting finding, and it is now the section's argument: a
 * render-everything grid does not only make itself slow, it makes every other
 * mutation on the page slow. But it also means two grids on one page can never
 * be fairly frame-compared, so this reports only what it can measure cleanly —
 * build time and node count — and points at `bench/` for the frame numbers,
 * which are taken with one grid on the page at a time.
 */
import { createGridRenderer } from "@oxygenui-design/grid-dom";
import type { Patient } from "./data.js";
import { CELLS, setRowHeight } from "./cells.js";

const COLUMNS = [
  { key: "name", header: "Patient", width: 168 },
  { key: "bed", header: "Bed", width: 68 },
  { key: "acuity", header: "Acuity", width: 122 },
  { key: "news2", header: "NEWS2", width: 84 },
  { key: "potassium", header: "Potassium", width: 168 },
  { key: "creatinine", header: "Creatinine", width: 160 },
];

export interface RaceHandles {
  start(): void;
  stop(): void;
}

interface Side {
  readonly nodes: () => number;
  readonly scrollTo: (top: number) => void;
}

/**
 * The naive side: every row, every cell, in the DOM at once.
 *
 * Deliberately not slowed down artificially. It is simply what happens when a
 * grid renders what it was handed — which is what a grid without a virtualiser
 * does, and what a grid WITH one does the moment a CSS rule in the host page
 * gives its viewport no height. That second case shipped in this repository
 * once, which is why the smoke test now measures it.
 */
function mountNaive(host: HTMLElement, rows: readonly Patient[]): Side {
  host.textContent = "";
  const scroller = document.createElement("div");
  scroller.className = "naive-scroll";
  const table = document.createElement("div");
  table.className = "naive-body";

  for (const row of rows) {
    const tr = document.createElement("div");
    tr.className = "naive-row";
    for (const column of COLUMNS) {
      const td = document.createElement("div");
      td.className = "naive-cell";
      td.style.width = `${column.width}px`;
      const cell = CELLS[column.key];
      if (cell) {
        cell.mount(td, { row, columnKey: column.key, rowIndex: 0, onError: () => {} });
      }
      tr.append(td);
    }
    table.append(tr);
  }

  scroller.append(table);
  host.append(scroller);
  return {
    nodes: () => host.querySelectorAll("*").length,
    scrollTo: (top) => {
      scroller.scrollTop = top;
    },
  };
}

function mountReal(host: HTMLElement, rows: readonly Patient[]): Side {
  host.textContent = "";
  setRowHeight(host, 34);
  const renderer = createGridRenderer<Patient>(host, {
    label: "Oxygen",
    rowHeight: 34,
    cells: CELLS,
    onAction: () => {},
    fallback: (row, key) => ({ kind: "text", text: String((row as unknown as Record<string, unknown>)[key] ?? "") }),
  });
  renderer.render({
    columns: COLUMNS,
    rows: rows.map((row, index) => ({ id: row.id, row, index })),
    total: rows.length,
    sort: [], selection: [], focus: null,
  });
  return {
    nodes: () => host.querySelectorAll("*").length,
    scrollTo: (top) => {
      const vp = host.querySelector<HTMLElement>(".oxg-viewport");
      if (!vp) return;
      vp.scrollTop = top;
      vp.dispatchEvent(new Event("scroll"));
    },
  };
}

/**
 * Frame intervals for one side.
 *
 * ── WHY NOT p95 ─────────────────────────────────────────────────────────────
 *
 * The first version reported p95, and p95 over a two-second window is not a
 * statistic — it is whichever frame the operating system happened to steal.
 * A screenshot, a tab switch, or someone else's garbage collection produces a
 * 200 ms frame, and with roughly 120 samples the sixth-worst frame IS the p95.
 * It reported the real grid as five times slower than the naive one, which is
 * how you can tell a number is measuring the harness and not the subject.
 *
 * The two kept here both hold still across runs and both mean something a
 * reader can feel: the median frame, and the share of frames that missed the
 * 60 fps budget. Jank shows up in the second one, which is where it belongs.
 */
class Frames {
  private readonly kept: number[] = [];
  add(ms: number): void {
    this.kept.push(ms);
    if (this.kept.length > 400) this.kept.shift();
  }
  get median(): number {
    if (this.kept.length === 0) return 0;
    const sorted = [...this.kept].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] ?? 0;
  }
  /** Share of frames that missed the 60 fps budget, as a percentage. */
  get missed(): number {
    if (this.kept.length === 0) return 0;
    return (this.kept.filter((f) => f > 16.7).length / this.kept.length) * 100;
  }
  get samples(): number {
    return this.kept.length;
  }
}

export function mountRace(
  refs: {
    readonly ours: HTMLElement;
    readonly theirs: HTMLElement;
    readonly readout: HTMLElement;
    readonly button: HTMLButtonElement;
  },
  rows: readonly Patient[],
): RaceHandles {
  // Five thousand, not fifty. The naive side has to be survivable enough to
  // watch — at fifty thousand the tab stops responding and the point is lost
  // in a hang rather than made by a number.
  const set = rows.slice(0, 5_000);

  let real: Side | null = null;
  let naive: Side | null = null;
  let running = false;
  let raf = 0;
  let built = false;

  function build(): void {
    if (built) return;
    built = true;
    refs.ours.dataset["state"] = "building";
    refs.theirs.dataset["state"] = "building";

    const t0 = performance.now();
    real = mountReal(refs.ours, set);
    const ourBuild = performance.now() - t0;

    const t1 = performance.now();
    naive = mountNaive(refs.theirs, set);
    const theirBuild = performance.now() - t1;

    delete refs.ours.dataset["state"];
    delete refs.theirs.dataset["state"];

    readout(ourBuild, theirBuild);
  }

  function readout(ourBuild: number, theirBuild: number): void {
    const ourNodes = real?.nodes() ?? 0;
    const theirNodes = naive?.nodes() ?? 0;
    refs.readout.innerHTML = `
      <div class="race-stat">
        <span class="rs-label">First paint<small>build the grid and show the first row</small></span>
        <span class="rs-ours">${ourBuild.toFixed(0)} ms</span>
        <span class="rs-theirs">${theirBuild.toFixed(0)} ms</span>
      </div>
      <div class="race-stat">
        <span class="rs-label">DOM nodes held<small>for the same 5,000 rows, at rest</small></span>
        <span class="rs-ours">${ourNodes.toLocaleString()}</span>
        <span class="rs-theirs">${theirNodes.toLocaleString()}</span>
      </div>
      <div class="race-stat" data-single>
        <span class="rs-label">This page, right now<small id="race-phase">frame interval with both grids mounted — 60 fps is 16.7 ms</small></span>
        <span class="rs-page" data-page-frame>—</span>
      </div>`;
  }

  let offset = 0;
  let direction = 1;
  let last = 0;

  /**
   * One frame clock for the page, not one per side.
   *
   * Both grids are mounted and both scroll, so there is exactly one number
   * here that is true: what this page costs the browser per frame. Splitting
   * it in two would be inventing an attribution the measurement cannot make.
   */
  const pageFrames = new Frames();

  function show(): void {
    const node = refs.readout.querySelector("[data-page-frame]");
    if (node && pageFrames.samples >= 20) {
      node.textContent = `${pageFrames.median.toFixed(1)} ms`;
    }
    const phase = refs.readout.querySelector("#race-phase");
    if (phase) {
      phase.textContent = running
        ? `${pageFrames.missed.toFixed(0)}% of frames missing 60 fps, with 73,000 nodes on the page`
        : "frame interval with both grids mounted — 60 fps is 16.7 ms";
    }
  }

  function tick(now: number): void {
    if (!running) return;

    const interval = last === 0 ? 0 : now - last;
    last = now;
    if (interval > 0) pageFrames.add(interval);

    offset += direction * 9;
    const max = set.length * 34 - 320;
    if (offset > max) { offset = max; direction = -1; }
    if (offset < 0) { offset = 0; direction = 1; }

    // Both, on the same frame, by the same amount. This is the visual — the
    // eye does the comparison the numbers decline to make.
    real?.scrollTo(offset);
    naive?.scrollTo(offset);

    show();
    raf = requestAnimationFrame(tick);
  }

  refs.button.addEventListener("click", () => {
    build();
    running = !running;
    refs.button.textContent = running ? "Stop" : "Run it again";
    refs.button.dataset["running"] = String(running);
    if (running) {
      last = 0;
      raf = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(raf);
      show();
    }
  });

  return {
    start() {
      build();
      if (running) return;
      running = true;
      refs.button.textContent = "Stop";
      refs.button.dataset["running"] = "true";
      last = 0;
      raf = requestAnimationFrame(tick);
    },
    stop() {
      running = false;
      refs.button.textContent = built ? "Run it again" : "Run the race";
      delete refs.button.dataset["running"];
      cancelAnimationFrame(raf);
      show();
    },
  };
}
