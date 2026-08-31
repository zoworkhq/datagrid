/**
 * Four real clinical surfaces, built on the same renderer.
 *
 * ── WHY FOUR AND NOT ONE ────────────────────────────────────────────────────
 *
 * "A data grid for healthcare" is a claim that a worklist demo does not
 * support. A health system does not buy one grid — it builds a MAR, a
 * flowsheet, a denials queue and a bed board, and those four disagree about
 * almost everything: what a row is, what a column means, what an empty cell
 * means, and what the reader is trying to decide.
 *
 * So each one here is configured the way it would actually be configured,
 * including the parts that are awkward:
 *
 *   MAR         Rows are ORDERS and columns are ADMINISTRATION TIMES. An empty
 *               cell is the most dangerous cell on the page — "not given" and
 *               "not due" and "not charted" are three different events and only
 *               one of them is a near-miss.
 *
 *   FLOWSHEET   Rows are OBSERVATIONS and columns are TIMESTAMPS, so the whole
 *               table is transposed relative to every other grid here. A row is
 *               a trend, which is why the trend is drawn in it.
 *
 *   DENIALS     Money and clocks. The reader is working a queue against a
 *               filing deadline, so age is the column that has to shout, and
 *               the sort that matters is "what expires first", not "what is
 *               biggest".
 *
 *   BED BOARD   Rows are BEDS, not patients — an empty bed is a row with no
 *               patient in it, and that is the row the reader is looking for.
 *
 * Every value is synthetic. No PHI appears anywhere on this page.
 */
import { createGridRenderer, type CellRenderer } from "@oxygenui-design/grid-dom";
import { describeAbsence, isAbsent, type Absent } from "@oxygenui-design/grid-healthcare";
import { setRowHeight } from "./cells.js";

const span = (cls: string, text: string): HTMLElement => {
  const s = document.createElement("span");
  s.className = cls;
  s.textContent = text;
  return s;
};

/**
 * The narrow contract these surfaces need.
 *
 * `paint` fills the element completely, because `mount` runs for a fresh node
 * and `update` for a recycled one and never both — a paint that only sets part
 * of the element leaves the previous row's content behind in the other part.
 */
interface Paint<T> {
  readonly paint: (el: HTMLElement, row: T) => void;
  readonly read: (row: T) => string;
  readonly compare?: (a: T, b: T) => number | "incomparable";
}

function make<T>(key: string, spec: Paint<T>): CellRenderer<T> {
  const value = (row: T): unknown => (row as unknown as Record<string, unknown>)[key];
  const paint = (el: HTMLElement, row: T): void => {
    const v = value(row);
    if (isAbsent(v)) {
      el.textContent = "";
      const sentence = describeAbsence(v as Absent);
      el.title = sentence;
      el.append(span("c-absent", sentence));
      return;
    }
    el.title = "";
    spec.paint(el, row);
  };
  const read = (row: T): string => {
    const v = value(row);
    return isAbsent(v) ? describeAbsence(v as Absent) : spec.read(row);
  };
  return {
    mount: (el, ctx) => paint(el, ctx.row),
    update: (el, ctx) => paint(el, ctx.row),
    unmount: (el) => { el.textContent = ""; },
    measure: (ctx) => ({ intrinsic: Math.min(read(ctx.row).length * 7.2 + 24, 320), growable: true }),
    read: (ctx) => read(ctx.row),
    compare: (a, b) => {
      if (isAbsent(value(a)) || isAbsent(value(b))) return "incomparable";
      return spec.compare ? spec.compare(a, b) : read(a).localeCompare(read(b));
    },
    toExport: (ctx) => {
      const v = value(ctx.row);
      if (isAbsent(v)) {
        const absent = v as Absent;
        return absent.reason === "withheld"
          ? { kind: "masked", reason: absent.policy }
          : { kind: "value", value: describeAbsence(absent) };
      }
      return { kind: "value", value: read(ctx.row) };
    },
    toPrint: (ctx) => ({ kind: "value", value: read(ctx.row) }),
  };
}

/** Plain text, the common case. */
const text = <T,>(key: string, opts: { mono?: boolean; strong?: boolean } = {}): CellRenderer<T> =>
  make<T>(key, {
    paint: (el, row) => {
      const v = String((row as unknown as Record<string, unknown>)[key] ?? "");
      el.textContent = "";
      el.append(span(opts.mono ? "c-mono" : opts.strong ? "c-name" : "", v));
    },
    read: (row) => String((row as unknown as Record<string, unknown>)[key] ?? ""),
  });

// ════════════════════════════════════════════════════════════════════════════
// 1. MAR — medication administration record
// ════════════════════════════════════════════════════════════════════════════

type MarStatus =
  | { readonly at: string; readonly state: "given" | "due" | "late" }
  | { readonly at: string; readonly state: "held"; readonly why: string }
  | { readonly at: string; readonly state: "refused"; readonly why: string }
  | Absent;

interface MarRow {
  readonly id: string;
  readonly drug: string;
  readonly dose: string;
  readonly route: string;
  readonly t06: MarStatus; readonly t08: MarStatus; readonly t12: MarStatus;
  readonly t14: MarStatus; readonly t18: MarStatus; readonly t22: MarStatus;
}

const DRUGS: readonly (readonly [string, string, string])[] = [
  ["Enoxaparin", "40 mg", "SC"],
  ["Amlodipine", "5 mg", "PO"],
  ["Metformin", "500 mg", "PO"],
  ["Paracetamol", "1 g", "PO"],
  ["Furosemide", "40 mg", "IV"],
  ["Levothyroxine", "75 mcg", "PO"],
  ["Salbutamol", "2.5 mg", "NEB"],
  ["Co-amoxiclav", "1.2 g", "IV"],
  ["Omeprazole", "20 mg", "PO"],
  ["Bisoprolol", "2.5 mg", "PO"],
  ["Insulin aspart", "6 units", "SC"],
  ["Senna", "15 mg", "PO"],
  ["Atorvastatin", "40 mg", "PO"],
  ["Ondansetron", "4 mg", "IV"],
  ["Gabapentin", "300 mg", "PO"],
];

/**
 * The MAR's absences are the point.
 *
 * A drug that is not due at 12:00 is `not-applicable`; a dose whose signature
 * never arrived is `not-charted` and is a near-miss; a withheld one is a
 * clinical decision with a reason. Rendering all three as an empty box is how a
 * paper MAR kills someone, and it is exactly what a grid does by default.
 */
function marCell(i: number, slot: number): MarStatus {
  const n = (i * 7 + slot * 3) % 11;
  const at = ["06:04", "08:11", "12:02", "14:20", "18:07", "22:15"][slot] as string;
  if (n === 4) return { reason: "not-applicable", because: "not due" };
  // NOTE, honestly: a due dose with no signature is not one of the eight. The
  // closest true one is `not-resulted` — expected, not yet arrived — and that is
  // what is used here. A MAR would want a ninth reason of its own, and saying so
  // is better than inventing one in a demo.
  if (n === 7) return { reason: "not-resulted", orderedAt: at };
  if (n === 9) return { at, state: "held", why: "SBP 92 — held per protocol" };
  if (n === 2 && slot > 2) return { at, state: "refused", why: "patient declined" };
  if (n === 5 && slot > 3) return { at, state: "due" };
  if (n === 1 && slot > 3) return { at, state: "late" };
  return { at, state: "given" };
}

export function marRows(): MarRow[] {
  return DRUGS.map((d, i) => ({
    id: `m${i}`,
    drug: d[0], dose: d[1], route: d[2],
    t06: marCell(i, 0), t08: marCell(i, 1), t12: marCell(i, 2),
    t14: marCell(i, 3), t18: marCell(i, 4), t22: marCell(i, 5),
  }));
}

const marSlot = (key: string): CellRenderer<MarRow> =>
  make<MarRow>(key, {
    paint: (el, row) => {
      const v = (row as unknown as Record<string, MarStatus>)[key] as Exclude<MarStatus, Absent>;
      el.textContent = "";
      const label =
        v.state === "given" ? `Given ${v.at}`
        : v.state === "late" ? `Late ${v.at}`
        : v.state === "due" ? `Due ${v.at}`
        : v.state === "held" ? "Held"
        : "Refused";
      el.append(span(`mar ${v.state}`, label));
    },
    read: (row) => {
      const v = (row as unknown as Record<string, MarStatus>)[key] as Exclude<MarStatus, Absent>;
      // A screen reader gets the REASON, not just the state. "Held" alone is
      // the same failure as a blank box, in audio.
      return "why" in v ? `${v.state} at ${v.at}: ${v.why}` : `${v.state} at ${v.at}`;
    },
  });

const MAR_CELLS: Readonly<Record<string, CellRenderer<MarRow>>> = {
  drug: make<MarRow>("drug", {
    paint: (el, row) => {
      el.textContent = "";
      el.append(span("c-name", row.drug));
    },
    read: (row) => row.drug,
  }),
  dose: text<MarRow>("dose", { mono: true }),
  route: text<MarRow>("route", { mono: true }),
  t06: marSlot("t06"), t08: marSlot("t08"), t12: marSlot("t12"),
  t14: marSlot("t14"), t18: marSlot("t18"), t22: marSlot("t22"),
};

const MAR_COLUMNS = [
  { key: "drug", header: "Medication", width: 178, pinned: "start" as const },
  { key: "dose", header: "Dose", width: 92 },
  { key: "route", header: "Route", width: 74 },
  { key: "t06", header: "06:00", width: 176 },
  { key: "t08", header: "08:00", width: 176 },
  { key: "t12", header: "12:00", width: 176 },
  { key: "t14", header: "14:00", width: 176 },
  { key: "t18", header: "18:00", width: 176 },
  { key: "t22", header: "22:00", width: 176 },
];

// ════════════════════════════════════════════════════════════════════════════
// 2. FLOWSHEET — observations down, time across
// ════════════════════════════════════════════════════════════════════════════

interface FlowRow {
  readonly id: string;
  readonly obs: string;
  readonly unit: string;
  readonly ref: string;
  readonly series: readonly (number | Absent)[];
  readonly h00: number | Absent; readonly h04: number | Absent; readonly h08: number | Absent;
  readonly h12: number | Absent; readonly h16: number | Absent; readonly h20: number | Absent;
}

const OBS: readonly (readonly [string, string, string, number, number])[] = [
  ["Heart rate", "bpm", "60–100", 74, 22],
  ["Systolic BP", "mmHg", "100–140", 118, 26],
  ["Diastolic BP", "mmHg", "60–90", 72, 14],
  ["Respiratory rate", "/min", "12–20", 16, 6],
  ["SpO₂", "%", "≥ 94", 96, 4],
  ["Temperature", "°C", "36.1–37.8", 36.8, 1.2],
  ["NEWS2", "", "0–4", 2, 5],
  ["Pain score", "/10", "0–3", 2, 4],
  ["Blood glucose", "mmol/L", "4–7", 6.1, 3.4],
  ["Urine output", "mL/h", "≥ 30", 48, 30],
];

function flowValue(base: number, spread: number, i: number, slot: number): number | Absent {
  const n = (i * 5 + slot * 7) % 13;
  if (n === 3) return { reason: "not-measured" };
  if (n === 8 && slot > 2) return { reason: "declined", by: "patient" };
  const drift = Math.sin((i + 1) * 1.7 + slot * 0.9) * spread * 0.5;
  const value = base + drift;
  return Math.round(value * 10) / 10;
}

export function flowRows(): FlowRow[] {
  return OBS.map((o, i) => {
    const slots = [0, 1, 2, 3, 4, 5].map((s) => flowValue(o[3], o[4], i, s));
    return {
      id: `o${i}`,
      obs: o[0], unit: o[1], ref: o[2],
      series: slots,
      h00: slots[0] as number | Absent, h04: slots[1] as number | Absent,
      h08: slots[2] as number | Absent, h12: slots[3] as number | Absent,
      h16: slots[4] as number | Absent, h20: slots[5] as number | Absent,
    };
  });
}

/**
 * The sparkline, drawn from the row's own series.
 *
 * It skips absent points rather than interpolating across them — a line drawn
 * through a gap asserts a measurement nobody took, which is the graphical
 * version of the blank cell this library exists to refuse.
 */
function sparkline(series: readonly (number | Absent)[]): SVGElement {
  const numbers = series.filter((v): v is number => typeof v === "number");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "spark");
  svg.setAttribute("viewBox", "0 0 54 16");
  svg.setAttribute("aria-hidden", "true");
  if (numbers.length < 2) return svg;

  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  const range = max - min || 1;
  const step = 54 / Math.max(series.length - 1, 1);

  let d = "";
  let open = false;
  series.forEach((v, i) => {
    if (typeof v !== "number") { open = false; return; }
    const x = i * step;
    const y = 14 - ((v - min) / range) * 12;
    d += `${open ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)} `;
    open = true;
  });

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", d.trim());
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.5");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.append(path);
  return svg;
}

const flowSlot = (key: string): CellRenderer<FlowRow> =>
  make<FlowRow>(key, {
    paint: (el, row) => {
      const v = (row as unknown as Record<string, number>)[key] as number;
      el.textContent = "";
      el.append(span("c-mono", String(v)));
    },
    read: (row) => `${String((row as unknown as Record<string, number>)[key])} ${row.unit}`.trim(),
    compare: (a, b) =>
      ((a as unknown as Record<string, number>)[key] as number) -
      ((b as unknown as Record<string, number>)[key] as number),
  });

const FLOW_CELLS: Readonly<Record<string, CellRenderer<FlowRow>>> = {
  obs: make<FlowRow>("obs", {
    paint: (el, row) => {
      el.textContent = "";
      el.append(span("c-name", row.obs));
    },
    read: (row) => row.obs,
  }),
  unit: text<FlowRow>("unit", { mono: true }),
  ref: text<FlowRow>("ref", { mono: true }),
  trend: {
    mount: (el, ctx) => { el.textContent = ""; el.append(sparkline(ctx.row.series)); },
    update: (el, ctx) => { el.textContent = ""; el.append(sparkline(ctx.row.series)); },
    unmount: (el) => { el.textContent = ""; },
    measure: () => ({ intrinsic: 70, growable: false }),
    // A drawing is not readable, so the row states its trend in words.
    read: (ctx) => {
      const nums = ctx.row.series.filter((v): v is number => typeof v === "number");
      const gaps = ctx.row.series.length - nums.length;
      if (nums.length < 2) return "Not enough measurements to trend";
      const delta = (nums.at(-1) as number) - (nums[0] as number);
      const way = delta > 0 ? "rising" : delta < 0 ? "falling" : "flat";
      return `${way} over ${nums.length} of ${ctx.row.series.length} readings${gaps > 0 ? `, ${gaps} not measured` : ""}`;
    },
    compare: () => "incomparable",
    toExport: (ctx) => ({ kind: "value", value: ctx.row.series.map((v) => (typeof v === "number" ? String(v) : "")).join(" ") }),
    toPrint: (ctx) => ({ kind: "value", value: ctx.row.series.map((v) => (typeof v === "number" ? String(v) : "·")).join(" ") }),
  } satisfies CellRenderer<FlowRow>,
  h00: flowSlot("h00"), h04: flowSlot("h04"), h08: flowSlot("h08"),
  h12: flowSlot("h12"), h16: flowSlot("h16"), h20: flowSlot("h20"),
};

const FLOW_COLUMNS = [
  { key: "obs", header: "Observation", width: 168, pinned: "start" as const },
  { key: "unit", header: "Unit", width: 84 },
  { key: "ref", header: "Reference", width: 110 },
  { key: "trend", header: "24 h", width: 86 },
  { key: "h00", header: "00:00", width: 124, sortable: true },
  { key: "h04", header: "04:00", width: 124, sortable: true },
  { key: "h08", header: "08:00", width: 124, sortable: true },
  { key: "h12", header: "12:00", width: 124, sortable: true },
  { key: "h16", header: "16:00", width: 124, sortable: true },
  { key: "h20", header: "20:00", width: 124, sortable: true },
];

// ════════════════════════════════════════════════════════════════════════════
// 3. DENIALS — revenue cycle worklist
// ════════════════════════════════════════════════════════════════════════════

interface DenialRow {
  readonly id: string;
  readonly claim: string;
  readonly payer: string;
  readonly code: string;
  readonly reason: string;
  readonly billed: number;
  readonly allowed: number | Absent;
  readonly age: number;
  readonly deadline: number;
  readonly owner: string;
  readonly status: string;
}

const PAYERS = ["Meridian Health Plan", "Statewide Medicaid", "Anchor Mutual", "Federal Part B", "Cascade PPO", "Unity Advantage"];
const CARC: readonly (readonly [string, string])[] = [
  ["CO-97", "Bundled into another service"],
  ["CO-16", "Missing or invalid information"],
  ["PR-204", "Not covered under the plan"],
  ["CO-50", "Not deemed medically necessary"],
  ["CO-45", "Charge exceeds fee schedule"],
  ["CO-29", "Filed after the time limit"],
  ["PR-1", "Applied to deductible"],
  ["CO-11", "Diagnosis inconsistent with procedure"],
];
const OWNERS = ["A. Petrova", "J. Mbeki", "R. Delgado", "S. Kaur", "T. Lindholm"];

export function denialRows(n = 4_000): DenialRow[] {
  const rows: DenialRow[] = [];
  for (let i = 0; i < n; i++) {
    const carc = CARC[i % CARC.length] as readonly [string, string];
    const billed = 240 + ((i * 977) % 48_000) / 10;
    rows.push({
      id: `d${i}`,
      claim: `CLM-${String(4_100_000 + i * 13)}`,
      payer: PAYERS[i % PAYERS.length] as string,
      code: carc[0],
      reason: carc[1],
      billed: Math.round(billed * 100) / 100,
      // A payer that has not adjudicated has not allowed zero. That distinction
      // is the difference between a write-off and a claim still worth working.
      allowed: i % 6 === 2 ? { reason: "not-resulted", orderedAt: "12 Aug" } : Math.round(billed * (0.32 + ((i % 40) / 100)) * 100) / 100,
      age: 3 + ((i * 7) % 160),
      deadline: 180,
      owner: i % 9 === 4 ? "Unassigned" : (OWNERS[i % OWNERS.length] as string),
      status: (["Ready to appeal", "Awaiting records", "Appealed", "In review", "Write-off proposed"] as const)[i % 5] as string,
    });
  }
  return rows;
}

const usd = (n: number): string => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const DENIAL_CELLS: Readonly<Record<string, CellRenderer<DenialRow>>> = {
  claim: text<DenialRow>("claim", { mono: true }),
  payer: text<DenialRow>("payer"),
  code: make<DenialRow>("code", {
    paint: (el, row) => {
      el.textContent = "";
      el.append(span("tag", row.code));
    },
    read: (row) => `${row.code}, ${row.reason}`,
  }),
  reason: text<DenialRow>("reason"),
  billed: make<DenialRow>("billed", {
    paint: (el, row) => { el.textContent = ""; el.append(span("money", usd(row.billed))); },
    read: (row) => usd(row.billed),
    compare: (a, b) => a.billed - b.billed,
  }),
  allowed: make<DenialRow>("allowed", {
    paint: (el, row) => { el.textContent = ""; el.append(span("money", usd(row.allowed as number))); },
    read: (row) => usd(row.allowed as number),
    compare: (a, b) => (a.allowed as number) - (b.allowed as number),
  }),
  age: make<DenialRow>("age", {
    paint: (el, row) => {
      // Colour is the filing clock, not the size of the number. A 40-day-old
      // claim at a 90-day payer is later than a 60-day-old one at 365.
      const left = row.deadline - row.age;
      const band = left < 30 ? "old" : left < 75 ? "mid" : "new";
      el.textContent = "";
      el.append(span(`age-pill ${band}`, `${row.age} d`));
    },
    read: (row) => `${row.age} days old, ${row.deadline - row.age} days left to file`,
    compare: (a, b) => (a.deadline - a.age) - (b.deadline - b.age),
  }),
  owner: text<DenialRow>("owner"),
  status: make<DenialRow>("status", {
    paint: (el, row) => {
      el.textContent = "";
      const tone = row.status === "Ready to appeal" ? "stable"
        : row.status === "Write-off proposed" ? "critical"
        : row.status === "Awaiting records" ? "guarded" : "";
      el.append(tone ? span(`pill ${tone}`, row.status) : span("", row.status));
    },
    read: (row) => row.status,
  }),
};

const DENIAL_COLUMNS = [
  { key: "claim", header: "Claim", width: 148, pinned: "start" as const },
  { key: "age", header: "Age", width: 92, sortable: true },
  { key: "payer", header: "Payer", width: 190 },
  { key: "code", header: "CARC", width: 92 },
  { key: "reason", header: "Denial reason", width: 248 },
  { key: "billed", header: "Billed", width: 122, sortable: true },
  { key: "allowed", header: "Allowed", width: 170, sortable: true },
  { key: "status", header: "Status", width: 172 },
  { key: "owner", header: "Owner", width: 148 },
];

// ════════════════════════════════════════════════════════════════════════════
// 4. BED BOARD — rows are beds, and an empty one is the answer
// ════════════════════════════════════════════════════════════════════════════

interface BedRow {
  readonly id: string;
  readonly bed: string;
  readonly state: "Occupied" | "Ready" | "Cleaning" | "Blocked";
  readonly patient: string | Absent;
  readonly service: string | Absent;
  readonly los: number | Absent;
  readonly isolation: string | Absent;
  readonly disposition: string | Absent;
  readonly since: string;
}

const SERVICES = ["General medicine", "Cardiology", "Respiratory", "Care of the elderly", "Surgery", "Stroke"];
const ISO = ["Contact", "Droplet", "Airborne", "Protective"];

export function bedRows(): BedRow[] {
  const rows: BedRow[] = [];
  for (let i = 0; i < 96; i++) {
    const state = (["Occupied", "Occupied", "Occupied", "Ready", "Cleaning", "Occupied", "Blocked", "Occupied"] as const)[i % 8] as BedRow["state"];
    const empty = state !== "Occupied";
    rows.push({
      id: `b${i}`,
      bed: `${["A", "B", "C", "D"][Math.floor(i / 24)]}${String((i % 24) + 1).padStart(2, "0")}`,
      state,
      // An unoccupied bed has no patient — and that is `not-applicable`, not
      // missing data. The reader is scanning for exactly these rows.
      patient: empty ? { reason: "not-applicable", because: `bed is ${state.toLowerCase()}` } : `${["Amara", "Daniel", "Priya", "Marcus", "Elena", "Tobias"][i % 6]} ${["Okafor", "Lindqvist", "Rahman", "Müller", "Nakamura", "Kowalski"][(i * 5) % 6]}`,
      service: empty ? { reason: "not-applicable", because: "no admission" } : (SERVICES[i % SERVICES.length] as string),
      los: empty ? { reason: "not-applicable", because: "no admission" } : 1 + ((i * 3) % 22),
      isolation: empty
        ? { reason: "not-applicable", because: "no admission" }
        : i % 7 === 1 ? (ISO[i % ISO.length] as string) : "No precautions",
      disposition: empty
        ? { reason: "not-applicable", because: "no admission" }
        : i % 5 === 3 ? { reason: "not-resulted", orderedAt: "11:20" } : (["Home 14:00", "Rehab, bed requested", "Awaiting social care", "Home with DN"] as const)[i % 4] as string,
      since: `${String(6 + (i % 14)).padStart(2, "0")}:${String((i * 11) % 60).padStart(2, "0")}`,
    });
  }
  return rows;
}

const BED_CELLS: Readonly<Record<string, CellRenderer<BedRow>>> = {
  bed: make<BedRow>("bed", {
    paint: (el, row) => { el.textContent = ""; el.append(span("c-mono c-name", row.bed)); },
    read: (row) => `Bed ${row.bed}`,
  }),
  state: make<BedRow>("state", {
    paint: (el, row) => {
      el.textContent = "";
      const tone = row.state === "Ready" ? "stable" : row.state === "Cleaning" ? "guarded" : row.state === "Blocked" ? "critical" : "";
      el.append(tone ? span(`pill ${tone}`, row.state) : span("", row.state));
    },
    read: (row) => row.state,
  }),
  patient: text<BedRow>("patient", { strong: true }),
  service: text<BedRow>("service"),
  los: make<BedRow>("los", {
    paint: (el, row) => { el.textContent = ""; el.append(span("c-mono", `${String(row.los)} d`)); },
    read: (row) => `${String(row.los)} days`,
    compare: (a, b) => (a.los as number) - (b.los as number),
  }),
  isolation: make<BedRow>("isolation", {
    paint: (el, row) => { el.textContent = ""; el.append(span("tag", String(row.isolation))); },
    read: (row) => `${String(row.isolation)} precautions`,
  }),
  disposition: text<BedRow>("disposition"),
  since: text<BedRow>("since", { mono: true }),
};

const BED_COLUMNS = [
  { key: "bed", header: "Bed", width: 86, pinned: "start" as const },
  { key: "state", header: "State", width: 130 },
  { key: "patient", header: "Patient", width: 196 },
  { key: "service", header: "Service", width: 186 },
  { key: "los", header: "LOS", width: 92, sortable: true },
  { key: "isolation", header: "Isolation", width: 156 },
  { key: "disposition", header: "Disposition", width: 218 },
  { key: "since", header: "In state since", width: 128 },
];

// ── the surfaces, as one list ───────────────────────────────────────────────

export interface Workstation {
  readonly key: string;
  readonly tab: string;
  readonly title: string;
  readonly meta: string;
  /** The one sentence that says what this surface's empty cells mean. */
  readonly note: string;
  readonly mount: (host: HTMLElement) => void;
}

function surface<T extends { id: string }>(
  label: string,
  rowHeight: number,
  rows: readonly T[],
  columns: readonly { key: string; header: string; width: number }[],
  cells: Readonly<Record<string, CellRenderer<T>>>,
): (host: HTMLElement) => void {
  return (host) => {
    setRowHeight(host, rowHeight);
    const renderer = createGridRenderer<T>(host, {
      label,
      rowHeight,
      cells,
      onAction: () => {},
      fallback: (row, key) => ({ kind: "text", text: String((row as unknown as Record<string, unknown>)[key] ?? "") }),
    });
    renderer.render({
      columns,
      rows: rows.map((row, index) => ({ id: row.id, row, index })),
      total: rows.length,
      sort: [], selection: [], focus: null,
    });
  };
}

export const WORKSTATIONS: readonly Workstation[] = [
  {
    key: "mar",
    tab: "Medication record",
    title: "Medication administration record",
    meta: "15 orders · 6 rounds · Ashgrove A14",
    note: "Three of these cells are empty for three different reasons, and only one of them is a near-miss. A grid that renders all three the same way is how a paper MAR fails.",
    mount: surface("Medication administration record", 42, marRows(), MAR_COLUMNS, MAR_CELLS),
  },
  {
    key: "flow",
    tab: "Vitals flowsheet",
    title: "Observations, last 24 hours",
    meta: "10 observations · 4-hourly · transposed",
    note: "Rows are observations and columns are times, so the table is transposed against every other surface here. The trend line skips the gaps rather than drawing through them.",
    mount: surface("Observation flowsheet", 40, flowRows(), FLOW_COLUMNS, FLOW_CELLS),
  },
  {
    key: "denials",
    tab: "Denials worklist",
    title: "Denied claims, open queue",
    meta: "4,000 claims · sorted by days left to file",
    note: "Age is coloured by what is left on the filing clock, not by how big the number is — a 40-day claim at a 90-day payer is later than a 60-day one at 365.",
    mount: surface("Denials worklist", 40, denialRows(), DENIAL_COLUMNS, DENIAL_CELLS),
  },
  {
    key: "beds",
    tab: "Bed board",
    title: "Bed board, four bays",
    meta: "96 beds · 24 per bay",
    note: "A row is a bed, not a patient — so an empty bed is a row with a typed absence in every patient column, and it is the row the bed manager is scanning for.",
    mount: surface("Bed board", 40, bedRows(), BED_COLUMNS, BED_CELLS),
  },
];
