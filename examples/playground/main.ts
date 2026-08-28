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
  PROVISIONAL_CLIENT_ROW_CEILING,
  sortRows,
  toggleSort,
  type Comparator,
  type GridAction,
  type GridState,
  type Measured,
} from "@oxygenui-design/grid-core";
import { createGridRenderer, type GridRenderer, type GridViewModel } from "@oxygenui-design/grid-dom";
import {
  describeAbsence,
  describeCoverage,
  type Absent,
  type Coverage,
} from "@oxygenui-design/grid-healthcare";
import { printSheetHtml, toCsv, toXlsx, type ExportColumn } from "@oxygenui-design/grid-export";
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

interface Patient {
  readonly id: string;
  readonly name: string;
  readonly mrn: string;
  readonly ward: string;
  /** A result, or a typed reason there is not one. */
  readonly potassium: Measured | Absent;
  readonly reviewed: string;
}

const WARDS = ["Ashgrove", "Beeches", "Cedar", "Dunlin", "Elmwood"];
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
      reviewed: `2026-08-${String((i % 27) + 1).padStart(2, "0")}`,
    };
  }
  return rows;
}

const isAbsent = (v: Measured | Absent): v is Absent => "reason" in v;

// ── the grid ────────────────────────────────────────────────────────────────

const columns = [
  { key: "name", header: "Patient", sortable: true, width: 190 },
  { key: "mrn", header: "MRN", width: 130 },
  { key: "ward", header: "Ward", sortable: true, width: 130 },
  { key: "potassium", header: "Potassium", sortable: true, width: 230 },
  { key: "reviewed", header: "Last reviewed", sortable: true, width: 150 },
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
    maxRows: PROVISIONAL_CLIENT_ROW_CEILING,
  });
  model.setState(state);
  const result = model.result();

  refused = result.errors.some((e) => e.code === "client-mode-refused");
  if (refused) {
    visible = [];
    refusalEl.hidden = false;
    refusalEl.textContent =
      `Client mode refuses ${result.total.toLocaleString()} rows. The ceiling is ` +
      `${PROVISIONAL_CLIENT_ROW_CEILING.toLocaleString()}, above which the server owns the set. ` +
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
    rowHeight: 38,
    overscan: 6,
    onAction: onAction,
    onError: (e) => console.warn("grid error (coordinates only):", e),
    fallback: (row, key) => ({ kind: "text", text: cellText(row, key) }),
  });
  render();
}

function onAction(action: GridAction): void {
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

function download(bytes: Uint8Array, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

document.getElementById("csv")?.addEventListener("click", () => {
  const out = toCsv(request(), { filename: "roster.csv" });
  if (out.ok) download(out.bytes, out.filename, out.mediaType);
});

document.getElementById("xlsx")?.addEventListener("click", () => {
  const out = toXlsx(request(), { filename: "roster.xlsx", sheetName: "Roster" });
  if (out.ok) download(out.bytes, out.filename, out.mediaType);
});

document.getElementById("print")?.addEventListener("click", () => {
  const sheet = printSheetHtml(request(), { title: "Patient roster" });
  const w = window.open("", "_blank");
  if (w) {
    w.document.write(sheet);
    w.document.close();
  }
});

load(50_000);
