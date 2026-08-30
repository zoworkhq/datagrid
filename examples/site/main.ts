/**
 * The site's behaviour.
 *
 * Everything here drives the REAL library. The hero is `createGridRenderer`
 * over 50,000 rows; the absence lab reads the same `describeAbsence` the
 * package ships; the surfaces render through the actual cell hosts. A marketing
 * page for a grid that used fake grids would be making a claim it declines to
 * demonstrate.
 */
import {
  createClientRowModel, initialState, reduce,
  type GridAction, type GridState,
} from "@oxygenui-design/grid-core";
import { createGridRenderer, type GridViewModel } from "@oxygenui-design/grid-dom";
import {
  describeAbsence, ABSENCE_REASONS,
  labResultCell, medicationCell, allergyCell, riskScoreCell,
  codedTermCell, vitalsTrendCell, careTeamCell, appointmentCell, documentationCell,
  type Absent,
} from "@oxygenui-design/grid-healthcare";
import { ward, MEASURED, type Patient } from "./data.js";
import { CELLS, currentMode, setMode, type AbsenceMode } from "./cells.js";

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

/**
 * HTML-escapes.
 *
 * NOT called `escape`. That name is a deprecated GLOBAL in lib.dom — the URL
 * encoder — so a file that uses `escape()` and forgets to define it typechecks
 * cleanly and renders `Order%20it%2C%20if%20it%20is%20indicated.` This page did
 * exactly that until someone looked at it.
 */
const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const reduced = (): boolean =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ── the hero ────────────────────────────────────────────────────────────────

const ROWS = ward(50_000);

const HERO_COLUMNS = [
  { key: "name", header: "Patient", width: 180, sortable: true, pinned: "start" as const },
  { key: "bed", header: "Bed", width: 74 },
  { key: "acuity", header: "Acuity", width: 132, sortable: true },
  { key: "news2", header: "NEWS2", width: 92, sortable: true },
  { key: "potassium", header: "Potassium", width: 186, sortable: true },
  { key: "creatinine", header: "Creatinine", width: 172 },
  { key: "allergies", header: "Allergies", width: 214 },
  { key: "problems", header: "Problem list", width: 254 },
  { key: "anticoag", header: "Anticoagulation", width: 236 },
  { key: "disposition", header: "Disposition", width: 246 },
  { key: "attending", header: "Attending", width: 180 },
  { key: "los", header: "LOS", width: 78, sortable: true },
];

let heroState: GridState = initialState();

function mountHero(): void {
  const host = el("hero-host");
  const model = createClientRowModel<Patient>({
    rows: ROWS,
    rowKey: (r) => r.id,
    get: (r, k) => (r as unknown as Record<string, never>)[k],
    // The cells own comparison, so sort and read cannot disagree about a value.
    comparators: Object.fromEntries(
      Object.entries(CELLS).map(([key, c]) => [key, c.compare.bind(c)]),
    ),
  });

  const renderer = createGridRenderer<Patient>(host, {
    label: "Inpatient worklist",
    rowHeight: 44,
    cells: CELLS,
    onAction: (a: GridAction) => {
      heroState = reduce(heroState, a, { rowIds: [] });
      paint();
    },
    fallback: (row, key) => ({ kind: "text", text: String((row as unknown as Record<string, unknown>)[key] ?? "") }),
  });

  function paint(): void {
    model.setState(heroState);
    const result = model.result();
    renderer.render({
      columns: HERO_COLUMNS,
      rows: result.rows,
      total: result.total,
      sort: heroState.sort,
      selection: heroState.selection,
      focus: heroState.focus,
    } satisfies GridViewModel<Patient>);
  }

  paint();

  // The switch. Every visible absence rewrites, staggered, so the change is
  // legible rather than instantaneous — the argument is in the transition.
  for (const button of document.querySelectorAll<HTMLButtonElement>(".switch")) {
    button.addEventListener("click", () => {
      const next = button.dataset["mode"] as AbsenceMode;
      if (next === currentMode()) return;
      setMode(next);
      for (const b of document.querySelectorAll(".switch")) b.classList.toggle("is-on", b === button);
      el("switch-note").textContent =
        next === "typed" ? "Eight reasons, never a blank" : "One blank, ten meanings";
      paint();
      if (reduced()) return;
      const cells = Array.from(host.querySelectorAll<HTMLElement>(".c-absent, .c-blank"));
      cells.forEach((node, i) => {
        const target = node.closest<HTMLElement>('[role="gridcell"]');
        if (!target) return;
        window.setTimeout(() => {
          target.classList.remove("rewrote");
          void target.offsetWidth;
          target.classList.add("rewrote");
        }, Math.min(i * 20, 380));
      });
    });
  }
}

// ── the absence lab ─────────────────────────────────────────────────────────

interface Sample {
  readonly reason: (typeof ABSENCE_REASONS)[number];
  readonly label: string;
  readonly absent: Absent;
  readonly what: string;
  readonly consequence: string;
  readonly exports: string;
}

const SAMPLES: readonly Sample[] = [
  {
    reason: "not-ordered", label: "Not ordered", absent: { reason: "not-ordered" },
    what: "Nobody asked for this test.",
    consequence: "Order it, if it is indicated.",
    exports: "Not ordered",
  },
  {
    reason: "not-resulted", label: "Not resulted", absent: { reason: "not-resulted", orderedAt: "06:40" },
    what: "It was ordered and the lab has not reported yet.",
    consequence: "Wait, or chase the lab. Do not re-order.",
    exports: "Ordered 06:40, not yet resulted",
  },
  {
    reason: "not-measured", label: "Not measured", absent: { reason: "not-measured" },
    what: "An observation nobody has taken.",
    consequence: "Take it.",
    exports: "Not measured",
  },
  {
    reason: "not-applicable", label: "Not applicable", absent: { reason: "not-applicable", because: "on dialysis" },
    what: "The value cannot exist for this patient.",
    consequence: "Nothing. Chasing it wastes a round.",
    exports: "Not applicable — on dialysis",
  },
  {
    reason: "declined", label: "Declined", absent: { reason: "declined", by: "patient" },
    what: "The patient said no.",
    consequence: "Record it. Do not silently re-request.",
    exports: "Declined by patient",
  },
  {
    reason: "specimen-problem", label: "Specimen problem", absent: { reason: "specimen-problem", detail: "haemolysed" },
    what: "The sample arrived and could not be run.",
    consequence: "Re-bleed. This one will never result.",
    exports: "Specimen problem — haemolysed",
  },
  {
    reason: "withheld", label: "Withheld", absent: { reason: "withheld", policy: "42 CFR Part 2", legal: "42 CFR §2.32" },
    what: "It exists and policy does not disclose it to you.",
    consequence: "Break-glass, if you have grounds. It is audited.",
    exports: "[withheld: 42 CFR Part 2]",
  },
  {
    reason: "source-unreachable", label: "Source unreachable", absent: { reason: "source-unreachable", source: "Northside Regional Exchange" },
    what: "A system that should have answered did not.",
    consequence: "This is the one that is a bug. It escalates into coverage.",
    exports: "Northside Regional Exchange could not be reached",
  },
];

let picked = 1;

function mountAbsenceLab(): void {
  const list = el("reasons");
  const host = el("absence-host");

  const renderer = createGridRenderer<Sample>(host, {
    label: "One value, eight reasons it might be missing",
    rowHeight: 40,
    onAction: () => {},
    fallback: (row, key) =>
      key === "analyte"
        ? { kind: "text", text: "Potassium" }
        : key === "collected"
          ? { kind: "text", text: row.reason === "not-resulted" ? "06:40" : "—" }
          : { kind: "text", text: describeAbsence(row.absent) },
  });

  SAMPLES.forEach((s, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "reason";
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(i === picked));
    b.innerHTML =
      `<span class="rkey">${esc(s.reason)}</span><span class="rn">${String(i + 1).padStart(2, "0")}</span>`;
    b.addEventListener("click", () => choose(i));
    b.addEventListener("mouseenter", () => choose(i));
    b.addEventListener("focus", () => choose(i));
    list.append(b);
  });

  function choose(i: number): void {
    if (i === picked) return;
    picked = i;
    for (const [n, b] of Array.from(list.children).entries()) {
      b.setAttribute("aria-selected", String(n === picked));
    }
    paint();
  }

  function paint(): void {
    const s = SAMPLES[picked] as Sample;
    renderer.render({
      columns: [
        { key: "analyte", header: "Analyte", width: 130 },
        { key: "collected", header: "Collected", width: 110 },
        { key: "result", header: "Result", width: 340 },
      ],
      rows: [{ id: s.reason, row: s, index: 0 }],
      total: 1, sort: [], selection: [], focus: null,
    });

    el("absence-what").textContent = s.what;
    el("absence-meta").innerHTML =
      `<dt>What to do</dt><dd>${esc(s.consequence)}</dd>` +
      `<dt>In the CSV</dt><dd>${esc(s.exports)}</dd>` +
      `<dt>Sorts</dt><dd>${s.reason === "withheld" ? "masked, never by value" : "last, in source order"}</dd>`;

    const cell = host.querySelector<HTMLElement>('[data-col-key="result"]');
    if (cell && !reduced()) {
      cell.classList.remove("rewrote");
      void cell.offsetWidth;
      cell.classList.add("rewrote");
    }
  }

  paint();
}

// ── evidence ────────────────────────────────────────────────────────────────

interface Bench {
  readonly what: string;
  readonly at: string;
  readonly ours: number;
  readonly theirs: number;
  readonly unit: string;
  /** Lower is better for every one of these except none. */
  readonly factor: string;
  /** What the factor means for THIS row. "Faster" is wrong for a cell count. */
  readonly of: string;
}

const BENCH: readonly Bench[] = [
  { what: "Cells built per row", at: MEASURED.cellsPerRow.at, ours: 15, theirs: 250, unit: "", factor: "17×", of: "fewer" },
  { what: "Scroll frame, p50", at: MEASURED.scrollP50.at, ours: 8.3, theirs: 33.3, unit: "ms", factor: "4×", of: "faster" },
  { what: "Re-sort", at: MEASURED.resort.at, ours: 1.9, theirs: 117.7, unit: "ms", factor: "62×", of: "faster" },
  { what: "Resident memory", at: MEASURED.memory.at, ours: 252, theirs: 1331, unit: "MB", factor: "5.3×", of: "smaller" },
  { what: "Streaming frame, p95", at: MEASURED.streaming.at, ours: 9.0, theirs: 16.7, unit: "ms", factor: "1.9×", of: "faster" },
  { what: "Bundle, brotlied", at: MEASURED.bundle.at, ours: 10.71, theirs: 292.6, unit: "kB", factor: "27×", of: "smaller" },
];

function mountBench(): void {
  const root = el("bench");
  for (const b of BENCH) {
    const row = document.createElement("div");
    row.className = "row";
    row.setAttribute("data-reveal", "");
    const max = Math.max(b.ours, b.theirs);
    row.innerHTML = `
      <div class="row-what">${esc(b.what)}<span class="row-at">${esc(b.at)}</span></div>
      <div class="bars">
        <div class="bar ours"><span class="bar-label">Oxygen</span>
          <span class="bar-track"><span class="bar-fill" data-w="${(b.ours / max) * 100}"></span></span>
          <span class="bar-value">${b.ours}${esc(b.unit)}</span></div>
        <div class="bar theirs"><span class="bar-label">AG Grid</span>
          <span class="bar-track"><span class="bar-fill" data-w="100"></span></span>
          <span class="bar-value">${b.theirs}${esc(b.unit)}</span></div>
      </div>
      <div class="row-delta" data-count="${b.ours}" data-unit="${esc(b.unit)}">
        ${b.factor}<small>${esc(b.of)}</small>
      </div>`;
    root.append(row);
  }
}

// ── surfaces ────────────────────────────────────────────────────────────────

const SURFACES: readonly { readonly cell: string; readonly demo: string; readonly says: string }[] = [
  {
    cell: "labResultCell",
    demo: labResultCell.read({
      analyte: "Potassium", value: 5.9, unit: "mmol/L",
      range: { low: 3.5, high: 5.1 }, interpretation: "critical-high", collectedAt: "07:12",
    }),
    says: "Carries its reference range and the source's own flag. It never infers abnormality from a range it was not given.",
  },
  {
    cell: "medicationCell",
    demo: medicationCell.read({
      drug: "Enoxaparin", dose: "40 mg", route: "subcutaneous",
      frequency: "once daily", state: "held", reason: "pre-procedure",
    }),
    says: "Held is not stopped, and both carry why. The difference is a dose given or missed.",
  },
  {
    cell: "allergyCell",
    demo: allergyCell.read({ known: "none" }),
    says: "“No known allergies” is a recorded clinical fact. It is not the same as nobody having asked.",
  },
  {
    cell: "riskScoreCell",
    demo: riskScoreCell.read({
      value: 7.4, scale: "0–10",
      model: { name: "Deterioration Index", version: "3.2", validatedOn: "2025-11-04" },
      confidence: 0.81,
    }),
    says: "A score names its model, its version and the date it was validated. A number without provenance is not a score.",
  },
  {
    cell: "codedTermCell",
    demo: codedTermCell.read({ system: "ICD-10", code: "E11.9", display: "Type 2 diabetes mellitus without complications" }),
    says: "The display truncates; the code never does. A truncated code is a different diagnosis.",
  },
  {
    cell: "vitalsTrendCell",
    demo: vitalsTrendCell.read({
      label: "Systolic BP", unit: "mmHg", points: [128, 134, 141, 138, 145], band: { low: 90, high: 140 },
    }),
    says: "A trend with its reference band, read out as a sentence for anyone not looking at the sparkline.",
  },
  {
    cell: "careTeamCell",
    demo: careTeamCell.read({
      members: [
        { name: "Dr. M. Sandoval", role: "Attending", primary: true },
        { name: "L. Fitzgerald", role: "Care coordinator" },
        { name: "S. Adeyemi", role: "Pharmacist" },
      ],
    }),
    says: "Primary first, then the count. Who to call is the question this cell answers.",
  },
  {
    cell: "appointmentCell",
    demo: appointmentCell.read({
      at: "2026-09-03 14:20", kind: "Nephrology follow-up",
      state: "no-show", location: "Clinic 4", provider: "Dr. P. Achterberg",
    }),
    says: "A no-show is an outcome, not a gap. It is the row a recall list is built from.",
  },
  {
    cell: "documentationCell",
    demo: documentationCell.read({
      kind: "Discharge summary", state: "pending-signature", author: "Dr. M. Sandoval", overdue: true,
    }),
    says: "What is unsigned, by whom, and how late. This is the column that closes a month end.",
  },
];

function mountSurfaces(): void {
  const root = el("surfaces");
  for (const s of SURFACES) {
    const card = document.createElement("article");
    card.className = "surface";
    card.setAttribute("data-reveal", "");
    card.innerHTML =
      `<h3>${esc(s.cell)}</h3>` +
      `<p class="demo">${esc(s.demo)}</p>` +
      `<p class="says">${esc(s.says)}</p>`;
    root.append(card);
  }
}

// ── getting started ─────────────────────────────────────────────────────────

const STEPS = [
  { h: "Install", p: "One package for the engine, one for the renderer, and an adapter if you use a framework." },
  { h: "Describe your columns", p: "A key, a header, and a cell host for anything clinical. Widths are optional." },
  { h: "Hand it your rows", p: "Objects you already have. The grid never fetches; it consumes the client you authorised." },
  { h: "Say what absent means", p: "Return a typed absence instead of undefined, and every output downstream honours it." },
];

const SNIPPETS: Readonly<Record<string, string>> = {
  react: `<span class="k">import</span> { DataGrid } <span class="k">from</span> <span class="s">"@oxygenui-design/grid-react"</span>;
<span class="k">import</span> { labResultCell } <span class="k">from</span> <span class="s">"@oxygenui-design/grid-healthcare"</span>;

<span class="k">export function</span> <span class="f">Worklist</span>({ patients }) {
  <span class="k">return</span> (
    &lt;DataGrid
      label=<span class="s">"Inpatient worklist"</span>
      model={{ columns, rows: patients, total: patients.length, sort: [], selection: [], focus: null }}
      cells={{ potassium: labResultCell }}
      onAction={dispatch}
    /&gt;
  );
}

<span class="c">// A missing result is a value, not an absence of one.</span>
<span class="k">const</span> potassium = resulted
  ? { analyte: <span class="s">"Potassium"</span>, value: 5.9, unit: <span class="s">"mmol/L"</span> }
  : { reason: <span class="s">"not-resulted"</span>, orderedAt: <span class="s">"06:40"</span> };`,

  angular: `<span class="k">import</span> { OxDataGrid } <span class="k">from</span> <span class="s">"@oxygenui-design/grid-angular"</span>;

@Component({
  standalone: <span class="k">true</span>,
  imports: [OxDataGrid],
  template: \`
    &lt;div [oxDataGrid]="'Inpatient worklist'"
         [model]="model()"
         [cells]="cells"
         (action)="onAction($event)"&gt;&lt;/div&gt;\`,
})
<span class="k">export class</span> <span class="f">WorklistComponent</span> {
  <span class="k">readonly</span> model = signal(viewModel);
  <span class="k">readonly</span> cells = { potassium: labResultCell };
}`,

  element: `<span class="k">import</span> { defineDataGrid } <span class="k">from</span> <span class="s">"@oxygenui-design/grid-element"</span>;

defineDataGrid(); <span class="c">// registers &lt;ox-data-grid&gt;</span>

<span class="k">const</span> grid = document.querySelector(<span class="s">"ox-data-grid"</span>);
grid.label = <span class="s">"Inpatient worklist"</span>;
grid.cells = { potassium: labResultCell };
grid.model = viewModel;

<span class="c">// Vue, Svelte, Solid and Qwik all bind properties. No adapter needed.</span>`,

  vanilla: `<span class="k">import</span> { createGridRenderer } <span class="k">from</span> <span class="s">"@oxygenui-design/grid-dom"</span>;
<span class="k">import</span> { createClientRowModel } <span class="k">from</span> <span class="s">"@oxygenui-design/grid-core"</span>;

<span class="k">const</span> model = <span class="f">createClientRowModel</span>({ rows: patients, rowKey: (r) =&gt; r.id, get });
<span class="k">const</span> grid = <span class="f">createGridRenderer</span>(host, {
  label: <span class="s">"Inpatient worklist"</span>,
  cells: { potassium: labResultCell },
  onAction: dispatch,
});

model.<span class="f">setState</span>(state);
grid.<span class="f">render</span>({ columns, ...model.<span class="f">result</span>() });`,
};

function mountStart(): void {
  const steps = el("steps");
  STEPS.forEach((s, i) => {
    const d = document.createElement("div");
    d.className = "step";
    d.setAttribute("data-reveal", "");
    d.innerHTML =
      `<span class="step-n">${i + 1}</span>` +
      `<div><h3>${esc(s.h)}</h3><p>${esc(s.p)}</p></div>`;
    steps.append(d);
  });

  const code = el("code").querySelector("code") as HTMLElement;
  const show = (fw: string): void => {
    code.innerHTML = SNIPPETS[fw] ?? "";
  };
  show("react");

  for (const tab of document.querySelectorAll<HTMLButtonElement>(".codetab")) {
    tab.addEventListener("click", () => {
      for (const t of document.querySelectorAll(".codetab")) t.classList.toggle("is-on", t === tab);
      show(tab.dataset["fw"] as string);
    });
  }

  el("copy").addEventListener("click", () => {
    const button = el("copy");
    void navigator.clipboard?.writeText(code.textContent ?? "").then(() => {
      button.textContent = "Copied";
      window.setTimeout(() => (button.textContent = "Copy"), 1400);
    });
  });
}

// ── chrome behaviour ────────────────────────────────────────────────────────

type Theme = "system" | "light" | "dark";
const KEY = "oxg-site-theme";

function applyTheme(next: Theme): void {
  const root = document.documentElement;
  if (next === "system") delete root.dataset["theme"];
  else root.dataset["theme"] = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // A private window is not a reason to fail.
  }
  const label = document.querySelector(".tlabel");
  if (label) label.textContent = next === "system" ? "System" : next === "light" ? "Light" : "Dark";
}

function mountChrome(): void {
  let theme: Theme = "system";
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === "light" || stored === "dark" || stored === "system") theme = stored;
  } catch {
    // ignored
  }
  applyTheme(theme);

  el("theme").addEventListener("click", () => {
    theme = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
    applyTheme(theme);
  });

  const top = document.querySelector<HTMLElement>(".top") as HTMLElement;
  const onScroll = (): void => {
    if (window.scrollY > 8) top.dataset["scrolled"] = "1";
    else delete top.dataset["scrolled"];
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Reveal on entry, and fill the benchmark bars once. Numbers that animate
  // every time you scroll past stop reading as measurements.
  const seen = new WeakSet<Element>();
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || seen.has(entry.target)) continue;
        seen.add(entry.target);
        entry.target.classList.add("shown");
        for (const fill of entry.target.querySelectorAll<HTMLElement>(".bar-fill")) {
          window.requestAnimationFrame(() => {
            fill.style.width = `${fill.dataset["w"]}%`;
          });
        }
      }
    },
    { rootMargin: "0px 0px -12% 0px", threshold: 0.15 },
  );
  for (const node of document.querySelectorAll("[data-reveal]")) observer.observe(node);
}

// ── go ──────────────────────────────────────────────────────────────────────

mountChrome();
mountHero();
mountAbsenceLab();
mountBench();
mountSurfaces();
mountStart();

// Everything added after `mountChrome` needs observing too.
const late = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("shown");
      for (const fill of entry.target.querySelectorAll<HTMLElement>(".bar-fill")) {
        window.requestAnimationFrame(() => {
          fill.style.width = `${fill.dataset["w"]}%`;
        });
      }
      late.unobserve(entry.target);
    }
  },
  { rootMargin: "0px 0px -10% 0px", threshold: 0.1 },
);
for (const node of document.querySelectorAll("[data-reveal]:not(.shown)")) late.observe(node);
