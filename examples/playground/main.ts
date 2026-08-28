/**
 * The playground.
 *
 * Not a demo of a table — a demo of the decisions. Every visible behaviour here
 * is one of the things the library exists to do: declare what the query did not
 * reach, give every empty cell a typed reason, refuse rather than guess, and
 * never move a row under the reader's hand.
 *
 * All data is synthetic, on reserved example systems. No PHI appears anywhere.
 */
import {
  aggregate,
  createClientRowModel,
  describeAggregate,
  initialState,
  DEFAULT_CLIENT_ROW_CEILING,
  sortRows,
  toggleSort,
  type Comparator,
  type GridAction,
  type GridState,
} from "@oxygenui-design/grid-core";
import { createGridRenderer, type GridRenderer, type GridViewModel } from "@oxygenui-design/grid-dom";
import { ROSTER_CELLS, type Patient, type Status } from "./cells.js";
import { excerpt } from "./excerpt.js";
import {
  describeAbsence,
  describeCoverage,
  isAbsent,
  type Absent,
  type Coverage,
} from "@oxygenui-design/grid-healthcare";
import { printSheetHtml, toCsv, toXlsx, type ExportColumn } from "@oxygenui-design/grid-export";
import { copyRange, emptyUndo, invert, record, undo as undoStep } from "@oxygenui-design/grid-clipboard";
import { createDevtools, explain } from "@oxygenui-design/grid-devtools";
import { mountClinical, mountDisclosure, mountGrouping } from "./panels.js";
import { mountAi, mountMigration, mountWorking } from "./panels2.js";
import {
  arrivalCount,
  createLiveState,
  freeze,
  release,
  thaw,
  upsert,
  type LiveState,
} from "@oxygenui-design/grid-core";

// ── synthetic data ──────────────────────────────────────────────────────────


const WARDS = ["Ashgrove", "Beeches", "Cedar", "Dunlin", "Elmwood"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const STATUSES: readonly Status[] = ["Stable", "Needs review", "Deteriorating", "Newly admitted"];
const PROBLEMS = [
  "Depression", "Anxiety", "Type 2 diabetes", "Hypertension", "Asthma",
  "Insomnia", "COPD", "Atrial fibrillation", "Chronic kidney disease",
];
const SURNAMES = [
  "Okafor", "Lindqvist", "Rahman", "Müller", "Nakamura", "Oyelaran", "Kowalski",
  "Ferreira", "Haddad", "Bianchi", "Novak", "Petrov", "Dlamini", "Marchetti",
];
const GIVEN = ["A.", "B.", "C.", "D.", "E.", "F.", "G.", "H.", "J.", "K."];

/** The eight reasons a cell can be empty, cycled so all of them are visible. */
const ABSENCES: Absent[] = [
  { reason: "not-ordered" },
  { reason: "not-resulted", orderedAt: "08:40" },
  { reason: "not-measured" },
  { reason: "not-applicable", because: "on dialysis" },
  { reason: "declined", by: "patient" },
  { reason: "specimen-problem", detail: "haemolysed" },
  { reason: "withheld", policy: "42 CFR Part 2" },
  { reason: "source-unreachable", source: "Northside Regional Exchange" },
];

function makePatients(n: number): Patient[] {
  const rows = new Array<Patient>(n);
  for (let i = 0; i < n; i++) {
    // Roughly one row in seven has no result, and each of those carries a
    // different reason. A blank cell would be indistinguishable from a bug.
    const absent = i % 7 === 3;
    rows[i] = {
      id: `p${i}`,
      name: `${GIVEN[(i * 3) % GIVEN.length]} ${SURNAMES[(i * 5) % SURNAMES.length]}`,
      mrn: `MRN-${String(100000 + ((i * 7919) % 899999))}`,
      ward: WARDS[i % WARDS.length] as string,
      potassium: absent
        ? (ABSENCES[i % ABSENCES.length] as Absent)
        : { value: Math.round((3 + ((i * 37) % 30) / 10) * 10) / 10, unit: "mmol/L" },
      dob: `${String((i % 28) + 1).padStart(2, "0")} ${MONTHS[i % 12]} ${1938 + (i % 62)}`,
      status: STATUSES[i % STATUSES.length] as Status,
      problems: PROBLEMS.slice(i % 4, (i % 4) + 1 + (i % 5)),
      reviewed: `2026-08-${String((i % 27) + 1).padStart(2, "0")}`,
    };
  }
  // Two rows carry a spreadsheet formula in the NAME field, because a name is
  // free text a patient supplies and a registration clerk types. Nothing in the
  // grid treats these as special — they render as the literal text they are.
  // Export is where it matters, and the CSV panel shows what the writer emitted.
  if (rows[1]) rows[1] = { ...(rows[1] as Patient), name: `=cmd|' /c calc'!A1` };
  if (rows[2]) rows[2] = { ...(rows[2] as Patient), name: `@SUM(1+1)*cmd|' /c calc'!A1` };
  return rows;
}


// ── the grid ────────────────────────────────────────────────────────────────

const columns = [
  { key: "name", header: "Patient", sortable: true, width: 238 },
  { key: "status", header: "Clinical status", sortable: true, width: 150 },
  { key: "problems", header: "Problem list", width: 210 },
  { key: "ward", header: "Ward", sortable: true, width: 120 },
  { key: "potassium", header: "Potassium", sortable: true, width: 200 },
  { key: "reviewed", header: "Last seen", sortable: true, width: 120 },
];

const comparators: Record<string, Comparator<Patient>> = {
  name: (a, b) => a.name.localeCompare(b.name),
  ward: (a, b) => a.ward.localeCompare(b.ward),
  reviewed: (a, b) => a.reviewed.localeCompare(b.reviewed),
  // A result with no value cannot be ordered against one that has a value.
  // Returning "incomparable" keeps it out of the ordering instead of sorting
  // it to the top as though it were the most urgent.
  potassium: (a, b) =>
    isAbsent(a.potassium) || isAbsent(b.potassium)
      ? "incomparable"
      : a.potassium.value - b.potassium.value,
};

const host = document.getElementById("grid-host") as HTMLElement;
const coverageEl = document.getElementById("coverage") as HTMLElement;
const arrivalsEl = document.getElementById("arrivals") as HTMLElement;
const refusalEl = document.getElementById("refusal") as HTMLElement;
const statsEl = document.getElementById("stats") as HTMLElement;

let renderer: GridRenderer<Patient> | null = null;
let source: Patient[] = [];
let live: LiveState<Patient> = createLiveState<Patient>([]);
let state: GridState = initialState();
let visible: Patient[] = [];
let refused = false;
let arrivalsTimer: number | null = null;
let nextArrival = 0;

const get = (row: Patient, key: string) => (row as unknown as Record<string, unknown>)[key];

/** Text for a cell. A typed absence renders its reason, never a blank. */
function cellText(row: Patient, key: string): string {
  if (key !== "potassium") return String(get(row, key) ?? "");
  const v = row.potassium;
  return isAbsent(v) ? describeAbsence(v) : `${v.value} ${v.unit ?? ""}`.trim();
}

function coverage(): Coverage {
  const unreachable = visible.some(
    (p) => isAbsent(p.potassium) && p.potassium.reason === "source-unreachable",
  );
  return {
    sources: [
      { id: "ehr", label: "This application", status: "ok" },
      // A per-cell failure escalates into coverage: a source nobody could read
      // is part of what the query did not reach.
      ...(unreachable
        ? ([
            {
              id: "hie",
              label: "Northside Regional Exchange",
              status: "unreachable" as const,
              reason: "timed out",
            },
          ] as const)
        : []),
    ] as Coverage["sources"],
    // The source does not report a total, so we say so rather than implying one.
    total: "unknown",
    loaded: visible.length,
    ...(state.filter ? { excluded: [{ count: source.length - visible.length, reason: "filtered out" }] } : {}),
    asOf: new Date().toTimeString().slice(0, 5),
  };
}

function recompute(): void {
  const model = createClientRowModel({
    rows: live.rows,
    rowKey: (r) => r.id,
    get,
    comparators,
    // The refusal is a real behaviour, not a hypothetical: pick 200,000 rows
    // in the control above and the grid declines with a reason.
    maxRows: DEFAULT_CLIENT_ROW_CEILING,
  });
  model.setState(state);
  const result = model.result();

  refused = result.errors.some((e) => e.code === "client-mode-refused");
  if (refused) {
    visible = [];
    refusalEl.hidden = false;
    refusalEl.textContent =
      `Client mode refuses ${result.total.toLocaleString()} rows. The ceiling is ` +
      `${DEFAULT_CLIENT_ROW_CEILING.toLocaleString()}, above which the server owns the set. ` +
      `A silent four-second sort is worse than a clear error. ` +
      `(The constant is provisional and unmeasured — it needs a real ward workstation.)`;
  } else {
    refusalEl.hidden = true;
    visible = sortRows(result.rows.map((r) => r.row), state.sort, comparators).rows as Patient[];
  }

  render();
}

function viewModel(): GridViewModel<Patient> {
  return {
    columns,
    rows: visible.map((row, index) => ({ id: row.id, row, index })),
    total: refused ? 0 : "unknown",
    sort: state.sort,
    selection: state.selection,
    focus: state.focus,
  };
}

function render(): void {
  renderer?.render(viewModel());
  coverageEl.textContent = describeCoverage(coverage());

  // An aggregate over mixed units refuses rather than coercing. Here every
  // result is mmol/L, so it produces a number — and reports how many rows it
  // could not use, because a mean over some of them is not a mean over all.
  const mean = aggregate(
    "mean",
    visible.slice(0, 500).map((p) => (isAbsent(p.potassium) ? null : p.potassium)),
  );
  const meanText =
    mean.kind === "value"
      ? describeAggregate({ ...mean, value: Math.round(mean.value * 10) / 10 })
      : describeAggregate(mean);
  statsEl.textContent = refused
    ? ""
    : `${visible.length.toLocaleString()} shown · mean K⁺ of the first 500: ${meanText}`;
}

function mount(): void {
  renderer?.destroy();
  host.textContent = "";
  renderer = createGridRenderer<Patient>(host, {
    label: "Patient roster",
    // The identity cell is two lines, which is what makes the roster legible
    // and what sets the row height. 56px is the brief's own measurement.
    rowHeight: 56,
    overscan: 6,
    onAction: onAction,
    onError: (e) => console.warn("grid error (coordinates only):", e),
    cells: ROSTER_CELLS,
    fallback: (row, key) => ({ kind: "text", text: cellText(row, key) }),
  });
  render();
}

const devtools = createDevtools({ limit: 300 });
let undoStack = emptyUndo();

function onAction(action: GridAction): void {
  const started = performance.now();
  const inverse = invert(action, { selection: state.selection });
  if (inverse) undoStack = record(undoStack, { action, inverse });
  devtools.action(action, performance.now() - started);
  devtools.state(state);

  switch (action.type) {
    case "sort/toggle":
      state = { ...state, sort: toggleSort(state.sort, action.key, action.additive) };
      recompute();
      return;
    case "focus/cell":
      state = { ...state, focus: { rowId: action.rowId, columnKey: action.columnKey } };
      return;
    case "select/toggle": {
      const has = state.selection.includes(action.id);
      state = {
        ...state,
        selection: has ? state.selection.filter((id) => id !== action.id) : [...state.selection, action.id],
      };
      render();
      return;
    }
    case "select/clear":
      state = { ...state, selection: [] };
      render();
      return;
    default:
      return;
  }
}

// ── controls ────────────────────────────────────────────────────────────────

function load(n: number): void {
  source = makePatients(n);
  live = createLiveState(source);
  state = initialState();
  nextArrival = n;
  recompute();
  mount();
}

document.getElementById("size")?.addEventListener("change", (e) => {
  load(Number((e.target as HTMLSelectElement).value));
});

document.getElementById("filter")?.addEventListener("input", (e) => {
  const term = (e.target as HTMLInputElement).value.trim();
  state = {
    ...state,
    filter: term ? { kind: "text", key: "name", op: "contains", value: term } : null,
  };
  recompute();
});

// ── live updates, position-stable ───────────────────────────────────────────
//
// While the pointer or focus is inside the body the list FREEZES: arrivals
// queue behind a divider and only the counter moves. You aim at row four and
// an admission arrives; row four is still row four.

host.addEventListener("pointerenter", () => {
  live = freeze(live);
});
host.addEventListener("pointerleave", () => {
  live = thaw(live);
});
host.addEventListener("focusin", () => {
  live = freeze(live);
});

function showArrivals(): void {
  const n = arrivalCount(live);
  arrivalsEl.hidden = n === 0;
  arrivalsEl.textContent = n === 0 ? "" : `${n} new ${n === 1 ? "arrival" : "arrivals"} — click to show`;
}

arrivalsEl.addEventListener("click", () => {
  live = release(live, { rowKey: (r) => r.id });
  source = [...live.rows];
  showArrivals();
  recompute();
});

document.getElementById("arrivals-toggle")?.addEventListener("click", (e) => {
  const button = e.target as HTMLButtonElement;
  if (arrivalsTimer !== null) {
    clearInterval(arrivalsTimer);
    arrivalsTimer = null;
    button.textContent = "Start live updates";
    return;
  }
  button.textContent = "Stop live updates";
  arrivalsTimer = window.setInterval(() => {
    const admitted = makePatients(nextArrival + 1).slice(-1) as Patient[];
    live = upsert(live, admitted, { rowKey: (r) => r.id });
    nextArrival++;
    showArrivals();
    // A thawed list takes arrivals straight in; a frozen one queues them.
    if (!live.frozen) {
      source = [...live.rows];
      recompute();
    }
  }, 600);
});

// ── export ──────────────────────────────────────────────────────────────────

const exportColumns: ExportColumn<Patient>[] = columns.map((c) => ({
  key: c.key,
  header: c.header,
  value: (row) => {
    if (c.key === "potassium") {
      const v = row.potassium;
      // A withheld cell exports its reason and never its value.
      if (isAbsent(v) && v.reason === "withheld") {
        return { kind: "masked", reason: `${v.policy}` };
      }
      return { kind: "value", value: isAbsent(v) ? describeAbsence(v) : v.value };
    }
    return { kind: "value", value: String(get(row, c.key) ?? "") };
  },
}));

const request = () => ({
  columns: exportColumns,
  rows: visible.slice(0, 2000),
  coverage: describeCoverage(coverage()),
  ...(state.filter ? { predicate: `name contains "${(state.filter as { value: string }).value}"` } : {}),
});

const exportOut = () => document.getElementById("export-out") as HTMLElement;

/**
 * Shows what the writer actually emitted.
 *
 * More useful than handing over a file: the point of these writers is that a
 * patient-supplied name arrives inert, and you can only see that by reading the
 * bytes. `'=cmd|…` with its leading apostrophe is the whole demonstration.
 */
function showOutput(title: string, body: string, note: string, interesting?: readonly RegExp[]): void {
  const el = exportOut();
  el.hidden = false;
  el.textContent = "";
  const head = document.createElement("b");
  head.textContent = `${title}\n${note}\n\n`;
  el.append(head, document.createTextNode(excerpt(body, interesting)));
}
/**
 * Offers the file, when the viewer's host allows it.
 *
 * A published artifact grants saves through a capability the viewer confirms;
 * a plain download link is inert there. `null` means this view cannot save, so
 * the affordance simply is not offered.
 */
async function offerSave(filename: string, data: string | Uint8Array): Promise<string> {
  const claude = (globalThis as { claude?: { use(n: string): Promise<unknown> } }).claude;
  if (!claude?.use) return "";
  const downloads = (await claude.use("downloads")) as
    | { save(r: { filename: string; data: string | Uint8Array }): Promise<unknown> }
    | null;
  if (!downloads) return "";
  try {
    await downloads.save({ filename, data });
    return "  ·  saved";
  } catch {
    // Declined, rate-limited, or the format is not on the host's allowlist.
    return "  ·  not saved";
  }
}

document.getElementById("csv")?.addEventListener("click", () => {
  const out = toCsv(request(), { filename: "roster.csv" });
  if (!out.ok) return;
  const text = new TextDecoder().decode(out.bytes);
  showOutput(
    "roster.csv — the emitted bytes",
    text,
    "The formula payload in a patient name arrives neutralised: find the line starting '=cmd. " +
      "A withheld cell reads [withheld: …] and never its value. The coverage sentence is the first line.",
    [/'[=@+]/, /\[withheld/],
  );
  void offerSave("roster.csv", text).then((note) => {
    if (note) exportOut().append(document.createTextNode(note));
  });
});

document.getElementById("xlsx")?.addEventListener("click", () => {
  const out = toXlsx(request(), { filename: "roster.xlsx", sheetName: "Roster" });
  if (!out.ok) return;
  // The sheet part is stored uncompressed, so the interesting XML is readable
  // straight out of the archive — and it IS the interesting part.
  const whole = new TextDecoder().decode(out.bytes);
  const start = whole.indexOf("<worksheet");
  const end = whole.indexOf("</worksheet>");
  showOutput(
    "roster.xlsx — the sheet XML inside the archive",
    // One row per line: the part is emitted as a single line, and the rows are
    // what a reader is comparing.
    (start >= 0 && end > start ? whole.slice(start, end + 12) : "(sheet part is compressed here)")
      .replaceAll("</row>", "</row>\n"),
    "In XLSX a formula is an <f> element. Search this for one — there is none, so the same payload " +
      "is inert BY THE STRUCTURE OF THE FORMAT: nothing to unescape, and no apostrophe left " +
      'polluting the cell as CSV must. Strings are t="inlineStr"; numbers are typed <v> cells.',
    [/cmd\|/, /withheld/],
  );
});

document.getElementById("print")?.addEventListener("click", () => {
  const sheet = printSheetHtml(request(), { title: "Patient roster" });
  showOutput(
    "The print sheet",
    sheet,
    "A real <table> with a <thead>: display:table-header-group is the only thing that repeats a " +
      "header across printed pages, and a div grid cannot do it. The coverage sentence prints at the " +
      "top AND in a running footer, because paper is where “See all” stops existing.",
    [/&#39;[=@+]|&amp;#39;/, /withheld/, /table-header-group/],
  );
  void offerSave("roster.html", sheet).then((note) => {
    if (note) exportOut().append(document.createTextNode(note));
  });
});

// ── panels ──────────────────────────────────────────────────────────────────

const panels = Array.from(document.querySelectorAll<HTMLElement>("[data-panel]"));
const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
let mounted = new Set<string>();

function show(name: string): void {
  for (const p of panels) p.hidden = p.dataset["panel"] !== name;
  for (const t of tabs) t.setAttribute("aria-selected", String(t.dataset["tab"] === name));
  // The roster's controls and its coverage claim belong to the roster. A
  // coverage sentence above a different grid is a claim about the wrong set.
  for (const el of document.querySelectorAll<HTMLElement>("[data-roster-only]")) {
    el.style.display = name === "roster" ? "" : "none";
  }
  if (mounted.has(name)) {
    if (name === "devtools") renderDevtools();
    return;
  }
  mounted.add(name);

  if (name === "clinical") {
    mountClinical(
      document.getElementById("clinical-host") as HTMLElement,
      document.getElementById("held-note") as HTMLElement,
    );
  }
  if (name === "disclosure") {
    mountDisclosure({
      host: document.getElementById("disclosure-host") as HTMLElement,
      note: document.getElementById("withheld-note") as HTMLElement,
      maySeeNotes: document.getElementById("p-notes") as HTMLInputElement,
      restrictPart2: document.getElementById("p-part2") as HTMLInputElement,
      mayExport: document.getElementById("p-export") as HTMLInputElement,
      breakGlass: document.getElementById("breakglass") as HTMLButtonElement,
    });
  }
  if (name === "grouping") {
    mountGrouping({
      host: document.getElementById("group-host") as HTMLElement,
      groupBy: document.getElementById("groupby") as HTMLSelectElement,
      mixUnits: document.getElementById("mixed-units") as HTMLInputElement,
    });
  }
  if (name === "working") {
    mountWorking({
      host: document.getElementById("working-host") as HTMLElement,
      panel: document.getElementById("inspector-panel") as HTMLElement,
      urlBar: document.getElementById("url-bar") as HTMLElement,
      value: document.getElementById("edit-value") as HTMLSelectElement,
      commit: document.getElementById("edit-commit") as HTMLButtonElement,
      note: document.getElementById("edit-note") as HTMLElement,
    });
  }
  if (name === "ai") {
    mountAi({
      host: document.getElementById("ai-host") as HTMLElement,
      chips: document.getElementById("ai-chips") as HTMLElement,
      refusal: document.getElementById("ai-refusal") as HTMLElement,
      select: document.getElementById("ai-proposal") as HTMLSelectElement,
      run: document.getElementById("ai-run") as HTMLButtonElement,
      accept: document.getElementById("ai-accept") as HTMLButtonElement,
    });
  }
  if (name === "migration") {
    mountMigration({
      input: document.getElementById("mig-in") as HTMLElement,
      output: document.getElementById("mig-out") as HTMLElement,
      todos: document.getElementById("mig-todos") as HTMLElement,
      source: document.getElementById("mig-source") as HTMLSelectElement,
      run: document.getElementById("mig-run") as HTMLButtonElement,
    });
  }
  if (name === "devtools") renderDevtools();
}

function renderDevtools(): void {
  const out = document.getElementById("devtools-out") as HTMLElement;
  const stats = document.getElementById("dt-stats") as HTMLElement;
  const snap = devtools.snapshot();
  out.textContent = [
    "── why this grid is in its current state ──",
    ...explain(snap),
    "",
    devtools.report(),
  ].join("\n");
  stats.textContent = `${snap.stats.actions} actions · ${snap.stats.errors} errors · p95 ${snap.stats.p95FrameMs} ms`;
}

for (const t of tabs) t.addEventListener("click", () => show(t.dataset["tab"] as string));
document.getElementById("dt-clear")?.addEventListener("click", () => {
  devtools.clear();
  renderDevtools();
});

// ── copy and undo, on the roster ────────────────────────────────────────────

document.addEventListener("keydown", (e) => {
  const meta = e.ctrlKey || e.metaKey;
  if (!meta) return;

  if (e.key === "c" && state.focus) {
    // A masked cell copies masked: the clipboard is an export.
    const index = visible.findIndex((p) => p.id === state.focus?.rowId);
    if (index < 0) return;
    const out = copyRange({
      shape: { rows: [index], columns: columns.map((c) => c.key) },
      rowAt: (i) => visible[i],
      valueAt: (row, key) => exportColumns.find((c) => c.key === key)?.value(row) ?? { kind: "value", value: "" },
    });
    if (out.ok) {
      void navigator.clipboard?.writeText(out.text);
      note(`Copied 1 row${out.masked ? ` (${out.masked} masked cell kept masked)` : ""}`);
    }
  }

  if (e.key === "z") {
    const back = undoStep(undoStack);
    undoStack = back.stack;
    if (back.action) {
      onAction(back.action);
      note("Undid the last invertible action");
    } else note("Nothing to undo — a write is never un-sent");
  }
});

function note(message: string): void {
  const el = document.getElementById("roster-hint") as HTMLElement;
  el.textContent = message;
  window.setTimeout(() => {
    el.textContent = "";
  }, 3200);
}

show("roster");
load(50_000);
