/**
 * The roster's cells, in the component brief's visual vocabulary.
 *
 * These exist to settle a claim the brief makes in prose: that the library
 * ships no CSS and no opinion about what a cell looks like, and that the
 * prototypes' appearance is entirely the host application's. The prototypes
 * are static `<table>` markup; everything below is built against the real
 * virtualising renderer, through its published `CellRenderer` contract.
 *
 * Two consequences worth naming:
 *
 *   · `update()` is separate from `mount()` because rows are RECYCLED. A cell
 *     node outlives the row it was created for, so nothing may be captured
 *     from the first context — every field is written on update.
 *
 *     `mount()` builds the skeleton and then DELEGATES to `update()`. The
 *     renderer calls one or the other, never both (renderer.ts:266), so a
 *     mount that only builds an empty skeleton paints a blank cell. That is
 *     invisible in the demo, where a second render follows immediately and
 *     fills it in — and wrong for any consumer that renders once.
 *
 *   · Nothing is set through `innerHTML`. The renderer forbids it one layer
 *     down; a cell that reached around that would put patient-supplied text
 *     into a parser, which is the same defect the export writers exist to
 *     prevent.
 */
import type { CellRenderer } from "@oxygenui-design/grid-dom";
import { avatarFor, type FacePool } from "./avatar.js";
import type { ExportValue, Measured } from "@oxygenui-design/grid-core";
// The real absence union — eight typed reasons, not a string. `describeAbsence`
// turns one into the sentence a clinician reads, so the cell never composes it.
import { describeAbsence, isAbsent, type Absent } from "@oxygenui-design/grid-healthcare";

export type { Absent, Measured };

export interface Patient {
  readonly id: string;
  readonly name: string;
  readonly mrn: string;
  readonly dob: string;
  readonly ward: string;
  readonly status: Status;
  readonly problems: readonly string[];
  readonly potassium: Measured | Absent;
  readonly reviewed: string;
  /** A real photograph, when the record has one. See avatar.ts. */
  readonly photoUrl?: string;
  /** Which portrait set the generated face comes from. Presentation only. */
  readonly facePool?: FacePool;
}

export type Status = "Stable" | "Needs review" | "Deteriorating" | "Newly admitted";

export { isAbsent };

/** The brief's status tones. `cs-none` is a state, not a missing value. */
const STATUS_TONE: Readonly<Record<Status, string>> = {
  Stable: "cs-ok",
  "Needs review": "cs-cau",
  Deteriorating: "cs-crit",
  "Newly admitted": "cs-info",
};

const el = (tag: string, cls?: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** Initials for the avatar. Two letters, from the parts a person actually has. */
function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

// ── the identity cell ───────────────────────────────────────────────────────

/**
 * Name, and underneath it the two things that disambiguate a person.
 *
 * The brief is emphatic that a name alone is not an identity: wards contain
 * people who share one. MRN and date of birth ride in the secondary line for
 * that reason, not for decoration — which is also why they are never truncated
 * away before the name is.
 */
export const identityCell: CellRenderer<Patient> = {
  mount(node, ctx) {
    const idc = el("div", "idc");
    idc.append(el("span", "a-avatar"), (() => {
      const who = el("div", "who");
      who.append(el("div", "pname"), el("div", "sub2"));
      return who;
    })());
    node.append(idc);
    identityCell.update(node, ctx);
  },
  update(node, ctx) {
    const { row } = ctx;
    const avatar = node.querySelector(".a-avatar") as HTMLElement;
    const face = avatarFor(row.id, row.photoUrl, row.facePool);
    // Both states are written every time, because a recycled node arrives
    // carrying whichever one the PREVIOUS patient had.
    if (face.kind === "photo") {
      avatar.style.backgroundImage = face.image;
      avatar.style.backgroundColor = "";
      avatar.textContent = "";
      avatar.dataset["avatar"] = "photo";
    } else {
      avatar.style.backgroundImage = "";
      avatar.style.backgroundColor = face.background;
      avatar.textContent = initials(row.name);
      avatar.dataset["avatar"] = "initials";
    }
    avatar.setAttribute("aria-hidden", "true");

    (node.querySelector(".pname") as HTMLElement).textContent = row.name;

    const sub = node.querySelector(".sub2") as HTMLElement;
    sub.textContent = "";
    sub.append(
      // No "MRN" label: the identifier carries its own prefix, and a second
      // one read "MRN MRN-100000" on screen.
      document.createTextNode(row.mrn),
      el("span", "sep", "·"),
      document.createTextNode(row.dob),
    );
  },
  unmount(node) {
    node.textContent = "";
  },
  measure: () => ({ intrinsic: 238, growable: true }),
  read: (ctx) => `${ctx.row.name}, MRN ${ctx.row.mrn}, born ${ctx.row.dob}`,
  compare: (a, b) => a.name.localeCompare(b.name),
  toExport: (ctx): ExportValue => ({ kind: "value", value: ctx.row.name }),
  toPrint: (ctx): ExportValue => ({ kind: "value", value: `${ctx.row.name} (${ctx.row.mrn})` }),
};

// ── the status pill ─────────────────────────────────────────────────────────

/** A dot AND a word. Colour alone would fail every colour-blind reader. */
export const statusCell: CellRenderer<Patient> = {
  mount(node, ctx) {
    const pill = el("span", "cs");
    pill.append(el("i", "gl gl-dot"), el("span", "cs-t"));
    node.append(pill);
    statusCell.update(node, ctx);
  },
  update(node, ctx) {
    const pill = node.querySelector(".cs") as HTMLElement;
    pill.className = `cs ${STATUS_TONE[ctx.row.status]}`;
    (pill.querySelector(".gl") as HTMLElement).setAttribute("aria-hidden", "true");
    (pill.querySelector(".cs-t") as HTMLElement).textContent = ctx.row.status;
  },
  unmount(node) {
    node.textContent = "";
  },
  measure: () => ({ intrinsic: 150, growable: false }),
  read: (ctx) => ctx.row.status,
  compare: (a, b) => a.status.localeCompare(b.status),
  toExport: (ctx): ExportValue => ({ kind: "value", value: ctx.row.status }),
  toPrint: (ctx): ExportValue => ({ kind: "value", value: ctx.row.status }),
};

// ── the problem list ────────────────────────────────────────────────────────

const SHOWN = 2;

/**
 * Two conditions, then a count.
 *
 * The overflow is a count and not an ellipsis because "+4" is a fact a reader
 * can act on — it says how much is missing. "…" says only that something is.
 */
export const problemsCell: CellRenderer<Patient> = {
  mount(node, ctx) {
    node.append(el("div", "chips"));
    problemsCell.update(node, ctx);
  },
  update(node, ctx) {
    const chips = node.querySelector(".chips") as HTMLElement;
    chips.textContent = "";
    for (const problem of ctx.row.problems.slice(0, SHOWN)) {
      chips.append(el("span", "a-tag blue", problem));
    }
    const rest = ctx.row.problems.length - SHOWN;
    if (rest > 0) {
      const more = el("span", "a-tag plain", `+${rest}`);
      more.title = ctx.row.problems.slice(SHOWN).join(", ");
      chips.append(more);
    }
  },
  unmount(node) {
    node.textContent = "";
  },
  measure: () => ({ intrinsic: 210, growable: true }),
  read: (ctx) => ctx.row.problems.join(", ") || "no problems recorded",
  compare: (a, b) => a.problems.length - b.problems.length,
  toExport: (ctx): ExportValue => ({ kind: "value", value: ctx.row.problems.join("; ") }),
  toPrint: (ctx): ExportValue => ({ kind: "value", value: ctx.row.problems.join("; ") }),
};

// ── the result ──────────────────────────────────────────────────────────────

/**
 * A measurement, or the REASON there is not one.
 *
 * The absent case is the whole point and it is why this cell exists at all: a
 * blank is indistinguishable from a bug, from a value of zero, and from a test
 * nobody ordered. Each of those is a different clinical situation.
 */
export const resultCell: CellRenderer<Patient> = {
  mount(node, ctx) {
    node.append(el("span", "res-v"));
    resultCell.update(node, ctx);
  },
  update(node, ctx) {
    const span = node.querySelector(".res-v") as HTMLElement;
    const k = ctx.row.potassium;
    // `res-v` is the HOOK and stays on the node; only the presentation classes
    // change. Writing a bare `className` here dropped the hook, so the next
    // recycle found nothing to update and the cell rendered empty — the exact
    // hazard described at the top of this file, and easy to walk into.
    span.className = isAbsent(k) ? "res-v cs cs-none" : "res-v num";
    span.textContent = isAbsent(k) ? describeAbsence(k) : `${k.value} ${k.unit}`;
  },
  unmount(node) {
    node.textContent = "";
  },
  measure: () => ({ intrinsic: 230, growable: true }),
  read: (ctx) => {
    const k = ctx.row.potassium;
    return isAbsent(k) ? `no result: ${describeAbsence(k)}` : `${k.value} ${k.unit}`;
  },
  // A measurement and a reason-for-absence are not on one scale. Saying so is
  // the honest answer; inventing an order would sort a worklist by a fiction.
  compare: (a, b) => {
    const x = a.potassium;
    const y = b.potassium;
    if (isAbsent(x) || isAbsent(y)) return isAbsent(x) && isAbsent(y) ? 0 : "incomparable";
    return x.value - y.value;
  },
  toExport: (ctx): ExportValue => {
    const k = ctx.row.potassium;
    return isAbsent(k) ? { kind: "value", value: describeAbsence(k) } : { kind: "value", value: k.value };
  },
  toPrint: (ctx): ExportValue => {
    const k = ctx.row.potassium;
    return isAbsent(k)
      ? { kind: "value", value: describeAbsence(k) }
      : { kind: "value", value: `${k.value} ${k.unit}` };
  },
};

export const ROSTER_CELLS: Readonly<Record<string, CellRenderer<Patient>>> = {
  name: identityCell,
  status: statusCell,
  problems: problemsCell,
  potassium: resultCell,
};
