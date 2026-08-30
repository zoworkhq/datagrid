/**
 * The site's cells, built the way the library says to build them.
 *
 * ── WHY NOT JUST RETURN MARKUP ──────────────────────────────────────────────
 *
 * The first version of this page returned HTML strings from `fallback`, and
 * `setCellContent` writes `textContent` — so every cell rendered its own markup
 * as literal text. That is the renderer refusing on purpose: a cell that can
 * return markup is a cell that can inject it, and `renderer-returned-markup` is
 * a real error code in this library.
 *
 * The supported route is a `CellRenderer`, which OWNS its element and builds
 * nodes. It costs more lines than a template string and buys three things a
 * marketing page should not skip: no injection surface, a `read()` that says
 * exactly what a screen reader announces, and `compare`/`toExport` that keep
 * sort and export honest for the same value.
 *
 * `mount` is called for a fresh node and `update` for a recycled one — never
 * both — so each paint function has to leave the element completely correct on
 * its own.
 */
import type { CellRenderer } from "@oxygenui-design/grid-dom";
import { describeAbsence, isAbsent, type Absent } from "@oxygenui-design/grid-healthcare";
import type { Patient } from "./data.js";

/** How this page renders a value that is not there. Swapped by the hero switch. */
export type AbsenceMode = "typed" | "blank";
let mode: AbsenceMode = "typed";
export const setMode = (next: AbsenceMode): void => {
  mode = next;
};
export const currentMode = (): AbsenceMode => mode;

const span = (cls: string, text: string): HTMLElement => {
  const s = document.createElement("span");
  s.className = cls;
  s.textContent = text;
  return s;
};

/** The absence treatment, and the whole argument of the page. */
function paintAbsence(el: HTMLElement, absent: Absent): void {
  el.textContent = "";
  el.append(
    mode === "blank"
      ? span("c-blank", "")
      : span("c-absent", describeAbsence(absent)),
  );
}

interface Spec {
  /** Fills the element completely. Called for both mount and update. */
  readonly paint: (el: HTMLElement, row: Patient) => void;
  /** What a screen reader says. The same string, whatever the cell looks like. */
  readonly read: (row: Patient) => string;
  readonly compare?: (a: Patient, b: Patient) => number | "incomparable";
}

const raw = (row: Patient, key: string): unknown =>
  (row as unknown as Record<string, unknown>)[key];

/**
 * Wraps a spec into the eight-method contract.
 *
 * An absent value short-circuits every method, so a cell's own logic never has
 * to remember to check — which is how a cell ends up sorting an absence as
 * though it were a zero.
 */
export function cell(key: string, spec: Spec): CellRenderer<Patient> {
  const paint = (el: HTMLElement, row: Patient): void => {
    const value = raw(row, key);
    if (isAbsent(value)) paintAbsence(el, value as Absent);
    else spec.paint(el, row);
  };

  const read = (row: Patient): string => {
    const value = raw(row, key);
    return isAbsent(value) ? describeAbsence(value as Absent) : spec.read(row);
  };

  return {
    mount: (el, ctx) => paint(el, ctx.row),
    update: (el, ctx) => paint(el, ctx.row),
    unmount: (el) => {
      el.textContent = "";
    },
    measure: (ctx) => ({ intrinsic: Math.min(read(ctx.row).length * 7.2 + 24, 320), growable: true }),
    read: (ctx) => read(ctx.row),
    compare: (a, b) => {
      // Absent is incomparable, in both directions. "We do not know" is not a
      // rank, and ordering it as one puts a patient nobody has measured at the
      // top or bottom of a worklist by accident.
      if (isAbsent(raw(a, key)) || isAbsent(raw(b, key))) return "incomparable";
      return spec.compare ? spec.compare(a, b) : read(a).localeCompare(read(b));
    },
    toExport: (ctx) => {
      const value = raw(ctx.row, key);
      if (isAbsent(value)) {
        const absent = value as Absent;
        return absent.reason === "withheld"
          ? { kind: "masked", reason: absent.policy }
          : { kind: "value", value: describeAbsence(absent) };
      }
      return { kind: "value", value: read(ctx.row) };
    },
    toPrint: (ctx) => ({ kind: "value", value: read(ctx.row) }),
  };
}

// ── the columns this page shows ─────────────────────────────────────────────

const chips = (el: HTMLElement, items: readonly string[]): void => {
  el.textContent = "";
  if (items.length === 0) {
    el.append(span("c-absent", "No known allergies"));
    return;
  }
  const wrap = document.createElement("span");
  wrap.className = "tags";
  for (const item of items.slice(0, 2)) wrap.append(span("tag", item));
  const rest = items.length - Math.min(items.length, 2);
  if (rest > 0) wrap.append(span("more", `+${rest}`));
  el.append(wrap);
};

const measured = (v: unknown): { value: number; unit: string } => v as { value: number; unit: string };

export const CELLS: Readonly<Record<string, CellRenderer<Patient>>> = {
  name: cell("name", {
    paint: (el, row) => {
      el.textContent = "";
      el.append(span("c-name", row.name));
    },
    read: (row) => row.name,
    compare: (a, b) => a.name.localeCompare(b.name),
  }),

  bed: cell("bed", {
    paint: (el, row) => {
      el.textContent = "";
      el.append(span("c-mono", row.bed));
    },
    read: (row) => row.bed,
  }),

  acuity: cell("acuity", {
    paint: (el, row) => {
      el.textContent = "";
      el.append(span(`pill ${row.acuity.toLowerCase()}`, row.acuity));
    },
    read: (row) => row.acuity,
    // Sickest first, which is the order a round is done in — not alphabetical.
    compare: (a, b) => ORDER[a.acuity] - ORDER[b.acuity],
  }),

  news2: cell("news2", {
    paint: (el, row) => {
      const n = row.news2 as number;
      el.textContent = "";
      el.append(span(`c-mono ${n >= 7 ? "crit" : n >= 5 ? "high" : ""}`, String(n)));
    },
    read: (row) => `NEWS2 ${String(row.news2)}`,
    compare: (a, b) => (b.news2 as number) - (a.news2 as number),
  }),

  potassium: cell("potassium", {
    paint: (el, row) => {
      const v = measured(row.potassium);
      el.textContent = "";
      const out = span(`c-mono ${v.value > 5.1 || v.value < 3.5 ? "high" : ""}`, `${v.value} `);
      out.append(span("dim", v.unit));
      el.append(out);
    },
    read: (row) => {
      const v = measured(row.potassium);
      return `Potassium ${v.value} ${v.unit}`;
    },
    compare: (a, b) => measured(a.potassium).value - measured(b.potassium).value,
  }),

  creatinine: cell("creatinine", {
    paint: (el, row) => {
      const v = measured(row.creatinine);
      el.textContent = "";
      const out = span(`c-mono ${v.value > 110 ? "high" : ""}`, `${v.value} `);
      out.append(span("dim", v.unit));
      el.append(out);
    },
    read: (row) => {
      const v = measured(row.creatinine);
      return `Creatinine ${v.value} ${v.unit}`;
    },
  }),

  allergies: cell("allergies", {
    paint: (el, row) => chips(el, row.allergies as readonly string[]),
    read: (row) => {
      const list = row.allergies as readonly string[];
      return list.length === 0 ? "No known allergies" : `${list.length} allergies: ${list.join(", ")}`;
    },
  }),

  problems: cell("problems", {
    paint: (el, row) => chips(el, row.problems),
    read: (row) => `${row.problems.length} problems: ${row.problems.join(", ")}`,
  }),

  anticoag: cell("anticoag", {
    paint: (el, row) => {
      el.textContent = String(row.anticoag);
    },
    read: (row) => String(row.anticoag),
  }),

  disposition: cell("disposition", {
    paint: (el, row) => {
      el.textContent = String(row.disposition);
    },
    read: (row) => String(row.disposition),
  }),

  attending: cell("attending", {
    paint: (el, row) => {
      el.textContent = row.attending;
    },
    read: (row) => row.attending,
  }),

  los: cell("los", {
    paint: (el, row) => {
      el.textContent = "";
      el.append(span("c-mono", `${row.los}d`));
    },
    read: (row) => `${row.los} days`,
    compare: (a, b) => a.los - b.los,
  }),

  mrn: cell("mrn", {
    paint: (el, row) => {
      el.textContent = "";
      el.append(span("c-mono", row.mrn));
    },
    read: (row) => row.mrn,
  }),
};

const ORDER: Readonly<Record<Patient["acuity"], number>> = {
  Critical: 0,
  Deteriorating: 1,
  Guarded: 2,
  Stable: 3,
};
