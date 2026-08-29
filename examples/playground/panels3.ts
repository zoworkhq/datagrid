/**
 * The catalogue, and the scale panel.
 *
 * `mountCatalogue` renders every cell host the library ships — all eighteen —
 * beside the one thing a catalogue is actually for: what each one does when
 * the value is ABSENT. A cell that renders a value is easy; a cell that
 * renders "we did not measure it" differently from "the patient declined" is
 * the reason this library exists, and until now the demo showed five of them.
 *
 * `mountScale` runs the row-model strategies in front of you and prints what
 * they cost, measured here, on this machine, at the size you pick. Numbers
 * quoted from a README are numbers from someone else's laptop.
 */
import {
  arraySource, buildColumnStore, createAdaptiveRowModel, createBlockRowModel,
  createGridWorker, createServerRowModel, createSortIndex, buildSortKeys, initialState,
  isLoadingRow, type StoredColumn,
} from "@oxygenui-design/grid-core";
import { createGridRenderer, type GridViewModel } from "@oxygenui-design/grid-dom";
import {
  aiSummaryCell, allergyCell, appointmentCell, assessmentCell, carePlanCell, careTeamCell,
  chipOverflowCell, clinicalAlertCell, codedTermCell, documentationCell, eligibilityCell,
  labResultCell, ledgerCell, maskedCell, medicationCell, resolutionCell, riskScoreCell,
  vitalsTrendCell, type Absent,
} from "@oxygenui-design/grid-healthcare";
import { nameFor } from "./people.js";

const text = (t: string) => ({ kind: "text" as const, text: t });

// ── the catalogue ───────────────────────────────────────────────────────────

/**
 * One row per cell host.
 *
 * `host` is deliberately loosely typed. Each host is `CellHost<CellValue<T>>`
 * for a different T, and the catalogue's whole point is to call the SAME four
 * methods across all of them — which is what the contract promises and what a
 * per-host generic would make impossible to express in one array.
 */
interface Entry {
  readonly cell: string;
  readonly host: {
    read(v: never): string;
    toExport(v: never): { readonly kind: string; readonly value?: unknown };
    compare(a: never, b: never): number | "incomparable";
  };
  /** A populated value, in the shape that host takes. */
  readonly present: unknown;
  /** The absence this cell is most likely to meet in the wild. */
  readonly absent: Absent;
  /** What the cell is FOR, in one clause. */
  readonly about: string;
}

const ENTRIES: readonly Entry[] = [
  {
    cell: "codedTermCell", host: codedTermCell, about: "a coded term, code never truncated",
    present: { system: "ICD-10", code: "E11.9", display: "Type 2 diabetes mellitus without complications" },
    absent: { reason: "not-ordered" },
  },
  {
    cell: "allergyCell", host: allergyCell, about: "“no known allergies” is not “we did not ask”",
    present: { known: "some", entries: [
      { substance: "Penicillin", severity: "severe", reaction: "anaphylaxis" },
      { substance: "Latex", severity: "moderate" },
    ] },
    absent: { reason: "not-measured" },
  },
  {
    cell: "vitalsTrendCell", host: vitalsTrendCell, about: "a trend, with its reference band",
    present: { label: "Systolic BP", unit: "mmHg", points: [128, 134, 141, 138, 145], band: { low: 90, high: 140 } },
    absent: { reason: "declined", by: "patient" },
  },
  {
    cell: "riskScoreCell", host: riskScoreCell, about: "a score that names its model and validation date",
    present: { value: 7.4, scale: "0–10", model: { name: "Deterioration Index", version: "3.2", validatedOn: "2025-11-04" }, confidence: 0.81 },
    absent: { reason: "not-applicable", because: "under 18" },
  },
  {
    cell: "carePlanCell", host: carePlanCell, about: "plan state, including denied with an appeal date",
    present: { what: "Pulmonary rehabilitation", status: { state: "denied", reason: "not medically necessary", appealBy: "2026-09-15" }, owner: "R. Whitfield" },
    absent: { reason: "not-ordered" },
  },
  {
    cell: "labResultCell", host: labResultCell, about: "a result with its range and its flag",
    present: { analyte: "Potassium", value: 5.9, unit: "mmol/L", range: { low: 3.5, high: 5.1 }, interpretation: "critical-high", collectedAt: "07:12" },
    absent: { reason: "specimen-problem", detail: "haemolysed" },
  },
  {
    cell: "medicationCell", host: medicationCell, about: "dose, route, frequency and why it is held",
    present: { drug: "Enoxaparin", dose: "40 mg", route: "subcutaneous", frequency: "once daily", state: "held", reason: "pre-procedure" },
    absent: { reason: "not-ordered" },
  },
  {
    cell: "appointmentCell", host: appointmentCell, about: "a slot and its attendance state",
    present: { at: "2026-09-03 14:20", kind: "Nephrology follow-up", state: "no-show", location: "Clinic 4", provider: "Dr. P. Achterberg" },
    absent: { reason: "not-applicable", because: "inpatient" },
  },
  {
    cell: "careTeamCell", host: careTeamCell, about: "who is responsible, primary first",
    present: { members: [
      { name: "Dr. M. Sandoval", role: "Attending", primary: true },
      { name: "L. Fitzgerald", role: "Care coordinator" },
      { name: "S. Adeyemi", role: "Pharmacist" },
    ] },
    absent: { reason: "not-measured" },
  },
  {
    cell: "clinicalAlertCell", host: clinicalAlertCell, about: "severity, and whether anyone acknowledged it",
    present: { what: "Sepsis criteria met", severity: "critical", raisedAt: "06:48" },
    absent: { reason: "not-applicable", because: "alerting suspended on this unit" },
  },
  {
    cell: "documentationCell", host: documentationCell, about: "what is unsigned, and how late",
    present: { kind: "Discharge summary", state: "pending-signature", author: "Dr. M. Sandoval", overdue: true },
    absent: { reason: "not-ordered" },
  },
  {
    cell: "assessmentCell", host: assessmentCell, about: "an instrument score and its change",
    present: { instrument: "PHQ-9", score: 14, administeredAt: "2026-08-24", severity: "moderately severe", change: 3 },
    absent: { reason: "declined", by: "patient" },
  },
  {
    cell: "aiSummaryCell", host: aiSummaryCell, about: "masked until a named clinician reviews it",
    present: { text: "Three admissions in ninety days, each with fluid overload.", model: { name: "ward-summary", version: "0.9" }, generatedAt: "08:02" },
    absent: { reason: "not-applicable", because: "model unavailable" },
  },
  {
    cell: "resolutionCell", host: resolutionCell, about: "what is owed, by whom, by when",
    present: { what: "PHQ-9 due", owner: "J. Rahman", due: "2026-09-02", overdue: true },
    absent: { reason: "not-ordered" },
  },
  {
    cell: "chipOverflowCell", host: chipOverflowCell, about: "n chips and an honest +N",
    present: { items: ["Depression", "Hypertension", "COPD", "CKD stage 3"] },
    absent: { reason: "not-measured" },
  },
  {
    cell: "eligibilityCell", host: eligibilityCell, about: "unreachable is not not-covered",
    present: { state: "unreachable", payer: "Northside Regional", asOf: { at: "09:12" } },
    absent: { reason: "source-unreachable", source: "Northside Regional Exchange" },
  },
  {
    cell: "ledgerCell", host: ledgerCell, about: "authorised units, and why they ran out",
    present: { unitsRemaining: 0, denialReason: "prior authorisation expired" },
    absent: { reason: "not-applicable", because: "self-pay" },
  },
  {
    cell: "maskedCell", host: maskedCell, about: "a region withheld by policy, with the policy named",
    present: { masked: true, policy: "42 CFR Part 2" },
    absent: { reason: "withheld", policy: "42 CFR Part 2", legal: "42 CFR §2.32" },
  },
];

const CATALOGUE_COLUMNS = [
  { key: "cell", header: "Cell", width: 168 },
  { key: "about", header: "What it is for", width: 260 },
  { key: "present", header: "With a value", width: 340 },
  { key: "absent", header: "With no value", width: 300 },
  { key: "export", header: "Exports as", width: 150 },
];

/** `toExport` returns a tagged union; this is the tag plus a short shape. */
function exportShape(entry: Entry): string {
  try {
    const v = entry.host.toExport(entry.present as never) as { kind: string; value?: unknown };
    if (v.kind === "text" || v.kind === "number") return `${v.kind} ${JSON.stringify(v.value ?? "")}`.slice(0, 26);
    return v.kind;
  } catch {
    return "—";
  }
}

export function mountCatalogue(host: HTMLElement, note: HTMLElement): void {
  const r = createGridRenderer<Entry>(host, {
    label: "Cell host catalogue",
    rowHeight: 46,
    onAction: () => {},
    fallback: (row, key) =>
      text(
        key === "cell" ? row.cell
        : key === "about" ? row.about
        : key === "present" ? row.host.read(row.present as never)
        : key === "absent" ? row.host.read(row.absent as never)
        : exportShape(row),
      ),
  });
  r.render({
    columns: CATALOGUE_COLUMNS,
    rows: ENTRIES.map((row, index) => ({ id: row.cell, row, index })),
    total: ENTRIES.length, sort: [], selection: [], focus: null,
  });

  // The claim this panel exists to make, stated as a count rather than as an
  // adjective. Eighteen hosts, and every one of them answers `read` for an
  // absence without the caller special-casing it.
  const distinct = new Set(ENTRIES.map((e) => e.host.read(e.absent as never))).size;
  note.textContent =
    `${ENTRIES.length} cell hosts. The right-hand column is each one's read() of an ABSENT value — ` +
    `${distinct} distinct sentences, no blanks, no “N/A”. Nothing here is inferred from the value: ` +
    `a cell that does not know says so.`;
}

// ── scale ───────────────────────────────────────────────────────────────────

interface Wide { readonly id: string; readonly name: string; readonly ward: string; readonly k: number; readonly hr: number; readonly admitted: boolean }

const WARDS = ["Ashgrove", "Beeches", "Cedar", "Dunlin", "Elmwood", "Foxglove"];
const SPECS: readonly StoredColumn[] = [
  { key: "name", type: "string" }, { key: "ward", type: "string" },
  { key: "k", type: "number" }, { key: "hr", type: "number" }, { key: "admitted", type: "boolean" },
];

/** A generator, so the streaming builder never sees an array. That is the point. */
function* stream(n: number): Generator<Wide> {
  for (let i = 0; i < n; i++) {
    yield {
      id: `p${i}`,
      name: nameFor(i),
      ward: WARDS[i % WARDS.length] as string,
      k: 3.2 + ((i * 37) % 220) / 100,
      hr: 52 + ((i * 61) % 70),
      admitted: (i & 3) !== 0,
    };
  }
}

const getWide = (row: Wide, key: string) => (row as unknown as Record<string, unknown>)[key];
const ms = (n: number) => `${n < 10 ? n.toFixed(2) : n.toFixed(1)} ms`;
const mb = (bytes: number) => `${(bytes / 1_048_576).toFixed(1)} MB`;

export interface ScaleRefs {
  readonly out: HTMLElement;
  readonly size: HTMLSelectElement;
  readonly run: HTMLButtonElement;
  readonly host: HTMLElement;
  readonly note: HTMLElement;
}

interface Line { readonly what: string; readonly measured: string; readonly why: string }

export function mountScale(refs: ScaleRefs): void {
  const worker = createGridWorker();

  const rowsOf = (n: number): Wide[] => Array.from(stream(n));

  async function measure(n: number): Promise<readonly Line[]> {
    const lines: Line[] = [];
    const rows = rowsOf(n);

    // 1 · The choice. This is the only one that is not a timing: it is the
    //     library saying which model it picked and why, in a sentence you can
    //     paste into a bug report.
    const adaptive = createAdaptiveRowModel<Wide>({
      rows, rowKey: (r) => r.id, get: getWide, columns: SPECS,
    });
    lines.push({
      what: "createAdaptiveRowModel",
      measured: adaptive.choice.strategy,
      why: adaptive.choice.because,
    });

    // 2 · Sort keys. First call builds them, second call reuses. The gap IS
    //     the feature, so both are shown rather than the flattering one.
    const index = createSortIndex(rows, getWide);
    let t = performance.now();
    const first = index.order("k", "asc");
    const build = performance.now() - t;
    t = performance.now();
    index.order("k", "desc");
    const reuse = performance.now() - t;
    lines.push({
      what: "createSortIndex — first sort",
      measured: ms(build),
      why: `builds ${n.toLocaleString()} ordinal keys, then radix-sorts them`,
    });
    lines.push({
      what: "createSortIndex — re-sort",
      measured: ms(reuse),
      why: `keys are cached; ${(build / Math.max(reuse, 0.001)).toFixed(0)}x faster than the first`,
    });

    // 3 · A comparator sort over the same rows, for the honest baseline.
    const copy = rows.slice();
    t = performance.now();
    copy.sort((a, b) => a.k - b.k);
    const naive = performance.now() - t;
    lines.push({
      what: "Array#sort with a comparator",
      measured: ms(naive),
      why: `the baseline the index replaces — ${(naive / Math.max(reuse, 0.001)).toFixed(0)}x the re-sort`,
    });

    // 4 · The store, built from a STREAM. Building it from `rows` would hold
    //     both at once and measure the wrong thing; see column-store.ts.
    t = performance.now();
    const store = buildColumnStore(SPECS, n, stream(n), getWide);
    const built = performance.now() - t;
    // ~50 bytes per cell is the figure the store's own header cites for object
    // rows. It is an estimate and is labelled as one.
    const estimate = n * SPECS.length * 50;
    lines.push({
      what: "buildColumnStore — from a stream",
      measured: `${mb(store.bytes)} in ${ms(built)}`,
      why: `object rows for the same cells estimate at ~${mb(estimate)} (~50 B/cell) — ${(estimate / store.bytes).toFixed(1)}x`,
    });

    // 5 · Off-thread. `available: false` is a real answer and is printed as
    //     one rather than being hidden behind a fallback.
    const keys = buildSortKeys(rows, getWide, "hr");
    if (worker.available && keys) {
      const transfer = keys.keys.slice();
      t = performance.now();
      await worker.run({ kind: "sort", direction: "asc" }, transfer);
      lines.push({
        what: "createGridWorker — sort off-thread",
        measured: ms(performance.now() - t),
        why: "keys are transferred, not copied, so the cost does not scale with n",
      });
    } else {
      lines.push({
        what: "createGridWorker",
        measured: worker.available ? "not indexable" : "unavailable",
        why: worker.available
          ? "this column has no ordinal key, so the caller stays on-thread"
          : "no Worker in this environment — the caller stays on-thread rather than failing",
      });
    }

    // 6 · The block model. Memory here is bounded by blocks, not by n, which
    //     is the only reason a set larger than the ceiling is reachable.
    const block = createBlockRowModel<Wide>({
      dataSource: arraySource(rows), rowKey: (r) => r.id, blockSize: 100, maxBlocks: 20,
    });
    block.setRange(0, 30);
    await new Promise((r2) => setTimeout(r2, 0));
    block.setRange(n - 40, n - 10);
    await new Promise((r2) => setTimeout(r2, 0));
    lines.push({
      what: "createBlockRowModel — after two jumps",
      measured: `${block.resident} blocks resident`,
      why: `capped at 20 x 100 rows, whether the set is ${n.toLocaleString()} or twenty million`,
    });

    // 7 · One page at a time. The block model keeps a window of blocks; this
    //     keeps exactly the page the server last sent, which is what a grid
    //     backed by a paginated endpoint actually holds.
    const server = createServerRowModel<Wide>({
      dataSource: arraySource(rows), rowKey: (r2) => r2.id,
    });
    server.setState(initialState({ pageSize: 50 }));
    await new Promise((r2) => setTimeout(r2, 0));
    const page = server.result();
    lines.push({
      what: "createServerRowModel — one page",
      measured: `${page.length} rows held, total ${page.total}`,
      why: "the whole set stays on the server; the client holds one page and nothing else",
    });
    server.destroy();

    void first;
    return lines;
  }

  const COLUMNS = [
    { key: "what", header: "What ran", width: 300 },
    { key: "measured", header: "Measured here, just now", width: 260 },
    { key: "why", header: "What that means", width: 560 },
  ];

  const r = createGridRenderer<Line>(refs.host, {
    label: "Row model measurements",
    rowHeight: 44,
    onAction: () => {},
    fallback: (row, key) => text((row as unknown as Record<string, string>)[key] ?? ""),
  });

  const paint = (lines: readonly Line[]): void => {
    const model: GridViewModel<Line> = {
      columns: COLUMNS,
      rows: lines.map((row, index) => ({ id: row.what, row, index })),
      total: lines.length, sort: [], selection: [], focus: null,
    };
    r.render(model);
  };

  async function run(): Promise<void> {
    const n = Number(refs.size.value);
    refs.run.disabled = true;
    refs.out.textContent = `Running against ${n.toLocaleString()} rows…`;
    // Yield so the disabled state and the message paint before the work.
    await new Promise((res) => setTimeout(res, 16));
    const started = performance.now();
    const lines = await measure(n);
    paint(lines);
    refs.out.textContent =
      `${n.toLocaleString()} rows, ${SPECS.length} columns, measured in ${ms(performance.now() - started)} total. ` +
      `Run it again — the numbers move, which is what a real measurement does.`;
    refs.run.disabled = false;
  }

  refs.run.addEventListener("click", () => void run());
  refs.note.textContent =
    "Five row models ship, and the library picks one and says why. Nothing below is quoted from a " +
    "README: it is measured in this tab, on this machine, at the size you choose. The largest size " +
    "is above the client ceiling on purpose — that is the case the block model exists for.";
  void run();
}

export { isLoadingRow };
