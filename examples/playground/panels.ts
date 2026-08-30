/**
 * The four panels beyond the roster.
 *
 * Each demonstrates one decision the library makes, with the smallest grid that
 * shows it. All data is synthetic.
 */
import {
  aggregate, countLeaves, createBranchStore, childrenOf, describeAggregate, flattenTree,
  groupRows, toggleExpanded, type GroupEntry, type Measured,
} from "@oxygenui-design/grid-core";
import { createGridRenderer, type GridViewModel } from "@oxygenui-design/grid-dom";
import { liveState } from "./live.js";
import {
  AWAITING_CLINICAL_REVIEW, chipOverflowCell, describeWithheld, eligibilityCell, ledgerCell,
  maskedCell, requestBreakGlass, resolveColumns, resolveRows, resolutionCell,
  type DisclosurePolicy,
} from "@oxygenui-design/grid-healthcare";

const text = (t: string) => ({ kind: "text" as const, text: t });

// ── clinical cells ──────────────────────────────────────────────────────────

interface Case {
  readonly id: string;
  readonly name: string;
  readonly resolution: Parameters<typeof resolutionCell.read>[0];
  readonly diagnoses: Parameters<typeof chipOverflowCell.read>[0];
  readonly eligibility: Parameters<typeof eligibilityCell.read>[0];
  readonly ledger: Parameters<typeof ledgerCell.read>[0];
}

const CASES: Case[] = [
  {
    id: "c1", name: "A. Okafor",
    resolution: { what: "PHQ-9 due", owner: "J. Rahman", due: "2026-09-02" },
    diagnoses: { items: ["Depression", "Hypertension", "COPD", "CKD"] },
    eligibility: { state: "verified", plan: "Meridian Choice", asOf: { at: "09:12" } },
    ledger: { unitsRemaining: 6, expires: "2026-10-01" },
  },
  {
    id: "c2", name: "K. Lindqvist",
    resolution: { what: "Care plan review", owner: "F. Petrov", due: "2026-08-20", overdue: true },
    diagnoses: { items: ["Anxiety"] },
    // Unreachable is NOT not-covered. The difference is a bill sent to the
    // wrong payer.
    eligibility: { state: "unreachable", payer: "Northside", asOf: { at: "09:12" } },
    ledger: { unitsRemaining: "unknown" },
  },
  {
    id: "c3", name: "G. Novak",
    resolution: { reason: "not-ordered" },
    diagnoses: { items: ["Diabetes", "Neuropathy", "Retinopathy"] },
    eligibility: { state: "stale", plan: "Statewide", asOf: { at: "07:40" } },
    ledger: { unitsRemaining: 0, denialReason: "prior authorisation expired" },
  },
];

const CLINICAL_COLUMNS = [
  { key: "name", header: "Patient", width: 150 },
  { key: "resolution", header: "Owed", width: 260 },
  { key: "diagnoses", header: "Diagnoses", width: 300 },
  { key: "eligibility", header: "Eligibility", width: 280 },
  { key: "ledger", header: "Authorisation", width: 250 },
];

export function mountClinical(host: HTMLElement, heldNote: HTMLElement): void {
  const live = liveState({ repaint: () => paint(), rowIds: () => CASES.map((c) => c.id) });
  const r = createGridRenderer<Case>(host, {
    label: "Clinical cell catalogue",
    rowHeight: 44,
    onAction: live.onAction,
    // Every cell's text comes from its host's read() — the same string the
    // live region announces, so what is seen and what is heard cannot drift.
    fallback: (row, key) =>
      text(
        key === "name" ? row.name
        : key === "resolution" ? resolutionCell.read(row.resolution)
        : key === "diagnoses" ? chipOverflowCell.read(row.diagnoses)
        : key === "eligibility" ? eligibilityCell.read(row.eligibility)
        : ledgerCell.read(row.ledger),
      ),
  });
  const paint = (): void =>
    r.render({
      columns: CLINICAL_COLUMNS,
      rows: CASES.map((row, index) => ({ id: row.id, row, index })),
      total: CASES.length,
      sort: live.sort,
      selection: live.selection,
      focus: live.focus,
    });
  paint();
  heldNote.textContent = AWAITING_CLINICAL_REVIEW.doseCell;
}

// ── disclosure ──────────────────────────────────────────────────────────────

interface Patient { readonly id: string; readonly name: string; readonly ward: string; readonly notes: string; readonly part2: boolean }

const PATIENTS: Patient[] = [
  { id: "d1", name: "A. Okafor", ward: "Ashgrove", notes: "Stable on current regimen", part2: false },
  { id: "d2", name: "K. Lindqvist", ward: "Beeches", notes: "Buprenorphine 8mg", part2: true },
  { id: "d3", name: "G. Novak", ward: "Cedar", notes: "Review in two weeks", part2: false },
  { id: "d4", name: "H. Müller", ward: "Dunlin", notes: "Methadone titration", part2: true },
];

const DISCLOSURE_COLUMNS = [
  { key: "name", header: "Patient", required: true, width: 170 },
  { key: "ward", header: "Ward", width: 130 },
  { key: "notes", header: "Notes", width: 420 },
];

export interface DisclosureRefs {
  readonly host: HTMLElement;
  readonly note: HTMLElement;
  readonly maySeeNotes: HTMLInputElement;
  readonly restrictPart2: HTMLInputElement;
  readonly mayExport: HTMLInputElement;
  readonly breakGlass: HTMLButtonElement;
}

export function mountDisclosure(refs: DisclosureRefs): void {
  // Hoisted above the rebuild: this panel recreates its renderer whenever the
  // policy changes, and focus that lives inside the renderer would be lost
  // every time a checkbox moved.
  // A focus change repaints; a POLICY change rebuilds, because the fallback
  // closes over the policy. Rebuilding on focus took the focused node with it,
  // so a click landed focus and the repaint it caused immediately dropped it.
  const live = liveState({ repaint: () => paint(), rowIds: () => PATIENTS.map((p) => p.id) });
  let granted = false;
  let disclosureGrid: ReturnType<typeof createGridRenderer<Patient>> | null = null;
  let paint: () => void = () => {};

  const render = (): void => {
    const policy: DisclosurePolicy = {
      column: (k) => (k === "notes" && !refs.maySeeNotes.checked && !granted ? "withheld" : "visible"),
      cell: (row, k) =>
        k === "notes" && (row as Patient).part2 && !granted
          ? { masked: { code: "part2", label: "42 CFR Part 2" } }
          : "visible",
      row: (row) =>
        refs.restrictPart2.checked && (row as Patient).part2 && !granted
          ? { restricted: { code: "part2", label: "42 CFR Part 2" } }
          : "visible",
      mayExport: () => refs.mayExport.checked,
      mayPrint: () => true,
      mayCopy: () => true,
    };

    const cols = resolveColumns(DISCLOSURE_COLUMNS, policy);
    // A withheld column is STATED. A column that vanishes is
    // indistinguishable from one that never existed.
    refs.note.textContent =
      describeWithheld(cols) ||
      (granted ? "Break-glass granted — everything visible, and the request was emitted." : "Nothing withheld.");

    const rows = resolveRows(PATIENTS, (p) => p.id, policy);

    // Created ONCE. Tearing the renderer down on every repaint took the
    // focused node with it, so a click landed focus and the repaint it caused
    // immediately dropped it — the panel could not be used from a keyboard.
    // The renderer is built for this: it recycles nodes across renders.
    disclosureGrid?.destroy();
    refs.host.textContent = "";
    const r = createGridRenderer<Patient>(refs.host, {
      label: "Patient notes",
      rowHeight: 40,
      onAction: live.onAction,
      // A masked region spans the columns it covers, so one notice replaces
      // three repetitions of the same notice.
      span: (row, key) => (key === "notes" && policy.cell(row, "notes") !== "visible" ? 1 : 1),
      fallback: (row, key) => {
        if (key !== "notes") return text(String((row as unknown as Record<string, string>)[key] ?? ""));
        const verdict = policy.cell(row, "notes");
        return verdict === "visible"
          ? text(row.notes)
          : text(maskedCell.read({ reason: verdict.masked.label, legalBasis: "42 CFR §2.31" }));
      },
    });
    disclosureGrid = r;
    paint = () =>
      r.render({
        columns: cols.visible.map((c) => ({
          key: c.key,
          header: c.header,
          width: c.key === "notes" ? 420 : 170,
        })),
        rows: rows.rows.map((row, index) => ({ id: row.id, row, index })),
        total: rows.rows.length,
        sort: live.sort,
        selection: live.selection,
        focus: live.focus,
      });
    paint();

    // Restricted rows keep their slot and are marked, never filtered out.
    for (const [id] of rows.restricted) {
      refs.host.querySelector(`[data-row-id="${id}"]`)?.setAttribute("data-restricted", "true");
    }
  };

  for (const input of [refs.maySeeNotes, refs.restrictPart2, refs.mayExport]) {
    input.addEventListener("change", render);
  }

  refs.breakGlass.addEventListener("click", () => {
    void requestBreakGlass(
      { rowId: "d2", columnKey: "notes", reason: "emergency-care", requestedAt: "09:14" },
      {
        // The grid ASKS. The server decides. Here the demo plays the server.
        request: async () => ({ granted: true, expiresAt: "10:14" }),
        onDisclosure: (e) => console.log("disclosure event emitted:", e),
      },
    ).then((outcome) => {
      granted = outcome.granted;
      refs.breakGlass.textContent = granted ? "Break-glass active" : "Request break-glass";
      render();
    });
  });

  render();
}

// ── grouping ────────────────────────────────────────────────────────────────

interface Dose { readonly id: string; readonly name: string; readonly ward: string; readonly team: string; readonly dose: Measured }

const TEAMS = ["Red", "Blue"];
const WARDS_G = ["Ashgrove", "Beeches", "Cedar"];

function makeDoses(mixUnits: boolean): Dose[] {
  return Array.from({ length: 36 }, (_, i) => {
    const ward = WARDS_G[i % WARDS_G.length] as string;
    // Ward Cedar gets mL among the mg, so the aggregate has to refuse.
    const unit = mixUnits && ward === "Cedar" && i % 2 === 0 ? "mL" : "mg";
    return {
      id: `g${i}`, name: `Patient ${i}`, ward, team: TEAMS[i % TEAMS.length] as string,
      dose: { value: 2 + (i % 9), unit },
    };
  });
}

export interface GroupRefs {
  readonly host: HTMLElement;
  readonly groupBy: HTMLSelectElement;
  readonly mixUnits: HTMLInputElement;
}

export function mountGrouping(refs: GroupRefs): void {
  // Group entries are addressed by position, so the ids the selection algebra
  // works over are the row indices this panel renders.
  // Same split as the disclosure panel: expanding a branch rebuilds, because
  // the row set changes; moving focus only repaints.
  const live = liveState({ repaint: () => paint(), rowIds: () => lastIds });
  let lastIds: readonly string[] = [];
  let groupGrid: ReturnType<typeof createGridRenderer<GroupEntry<Dose>>> | null = null;
  let paint: () => void = () => {};
  const expanded = new Set<string>(["ward=Ashgrove"]);
  // A branch the demo never resolves, to show that unfetched is not empty.
  const branches = createBranchStore<Dose>({
    source: { getChildren: () => new Promise(() => {}) },
  });

  const render = (): void => {
    const rows = makeDoses(refs.mixUnits.checked);
    const by = refs.groupBy.value ? refs.groupBy.value.split(",") : [];
    const entries = groupRows(rows, {
      by, rowKey: (r) => r.id, expanded,
      get: (r, k) => (r as unknown as Record<string, unknown>)[k],
      aggregates: [{ columnKey: "dose", kind: "sum", value: (r) => r.dose }],
    });

    // One unresolved branch, appended so the state is visible.
    const withPending: GroupEntry<Dose>[] = [...entries];
    if (by.length > 0) {
      branches.request("ward=Elmwood");
      const state = childrenOf(branches.state("ward=Elmwood"));
      withPending.push({ kind: "group", path: "ward=Elmwood", columnKey: "ward", label: "Elmwood",
        depth: 0, count: "unresolved", expanded: true, aggregates: {} });
      if (state.kind === "marker") {
        withPending.push({ kind: "unresolved", path: "ward=Elmwood", depth: 1 });
      }
    }

    const model: GridViewModel<GroupEntry<Dose>> = {
      columns: [
        { key: "label", header: "Group or patient", width: 340 },
        { key: "count", header: "Rows", width: 110 },
        { key: "dose", header: "Total dose", width: 320 },
      ],
      rows: withPending.map((entry, index) => ({ id: `${index}`, row: entry, index })),
      total: withPending.length,
      sort: live.sort,
      selection: live.selection,
      focus: live.focus,
    };

    lastIds = withPending.map((_entry, index) => `${index}`);

    groupGrid?.destroy();
    refs.host.textContent = "";
    const r = createGridRenderer<GroupEntry<Dose>>(refs.host, {
      label: "Doses by ward",
      rowHeight: 36,
      onAction: live.onAction,
      fallback: (entry, key) => {
        const indent = "   ".repeat(entry.depth);
        if (entry.kind === "unresolved") {
          // NOT "no rows". A node with unknown children is not a node with no
          // children.
          return key === "label" ? text(`${indent}— not fetched —`) : text("");
        }
        if (entry.kind === "row") {
          return text(
            key === "label" ? `${indent}${entry.row.name}`
            : key === "count" ? ""
            : `${entry.row.dose.value} ${entry.row.dose.unit ?? ""}`,
          );
        }
        if (key === "label") return text(`${indent}${entry.expanded ? "▾" : "▸"} ${entry.label}`);
        if (key === "count") return text(entry.count === "unresolved" ? "unknown" : String(entry.count));
        const agg = entry.aggregates["dose"];
        // 5 mg + 2 mL returns a reason, not 7.
        return text(agg ? describeAggregate(agg) : "");
      },
    });
    groupGrid = r;
    paint = () =>
      r.render({ ...model, sort: live.sort, selection: live.selection, focus: live.focus });
    paint();

    refs.host.querySelectorAll<HTMLElement>('[role="row"]').forEach((el, i) => {
      if (withPending[i]?.kind === "group") el.classList.add("grouprow");
    });
  };

  refs.host.addEventListener("click", (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('[role="row"]');
    const label = row?.querySelector('[data-col-key="label"]')?.textContent?.trim() ?? "";
    if (!label.startsWith("▾") && !label.startsWith("▸")) return;
    const name = label.slice(1).trim();
    for (const w of WARDS_G) if (name === w) {
      const path = `ward=${w}`;
      if (!expanded.delete(path)) expanded.add(path);
    }
    render();
  });

  refs.groupBy.addEventListener("change", render);
  refs.mixUnits.addEventListener("change", render);
  render();
}

export { aggregate };

// ── a tree, which is not a grouping ─────────────────────────────────────────

/**
 * `groupRows` and `flattenTree` answer different questions.
 *
 * GROUPING derives the hierarchy from the DATA: "put these flat rows into
 * buckets by ward, then by team". Every level is a column value, and the same
 * rows regroup differently the moment you pick a different column.
 *
 * A TREE is a hierarchy the data already HAS: a ward contains bays, a bay
 * contains beds. There is no column to group by — the shape is the shape, and
 * asking to "group beds by bay" would be asking for something already true.
 *
 * The demo showed grouping only, so the distinction was invisible and the tree
 * API unreachable. Both render through the same `GroupEntry` list, which is the
 * point: one renderer, two ways of arriving at a hierarchy.
 */
interface Bed {
  readonly id: string;
  readonly label: string;
  readonly occupant?: string;
  readonly children?: readonly Bed[];
}

const WARD_TREE: readonly Bed[] = [
  {
    id: "w-ash", label: "Ashgrove",
    children: [
      {
        id: "w-ash-a", label: "Bay A",
        children: [
          { id: "b-a1", label: "Bed A1", occupant: "Amara Okafor" },
          { id: "b-a2", label: "Bed A2", occupant: "Ruth Petrov" },
          { id: "b-a3", label: "Bed A3" },
        ],
      },
      {
        id: "w-ash-b", label: "Bay B",
        children: [
          { id: "b-b1", label: "Bed B1", occupant: "Nadia Anand" },
          { id: "b-b2", label: "Bed B2" },
        ],
      },
    ],
  },
  {
    id: "w-bee", label: "Beeches",
    children: [
      {
        id: "w-bee-a", label: "Bay A",
        children: [
          { id: "b-c1", label: "Bed A1", occupant: "Anton Ferreira" },
          { id: "b-c2", label: "Bed A2", occupant: "Elena Sørensen" },
        ],
      },
    ],
  },
  // A ward whose children are not loaded. "Unresolved" is not "empty", and a
  // tree that renders them the same way tells a clinician a ward is clear when
  // nobody has looked. It starts EXPANDED, because `flattenTree` only asks for
  // the children of a node that is open — a collapsed unresolved branch is
  // indistinguishable from any other collapsed one, and correctly so.
  { id: "w-ced", label: "Cedar" },
];

export interface TreeRefs {
  readonly host: HTMLElement;
  readonly note: HTMLElement;
  readonly stat: HTMLElement;
  readonly toggle: HTMLButtonElement;
}

export function mountTree(refs: TreeRefs): void {
  let expanded: ReadonlySet<string> = new Set(["w-ash", "w-ash-a", "w-ced"]);
  const live = liveState({ repaint: () => paint(), rowIds: () => lastIds });
  let lastIds: readonly string[] = [];

  const grid = createGridRenderer<GroupEntry<Bed>>(refs.host, {
    label: "Ward, bay, bed",
    rowHeight: 34,
    onAction: live.onAction,
    // Every node of a tree is a ROW — a ward is a row, a bed is a row. That is
    // the difference from `groupRows`, which emits `kind: "group"` headers that
    // are not rows at all because no row corresponds to "ward = Ashgrove".
    fallback: (entry, key) => {
      const indent = "   ".repeat(entry.depth);
      if (entry.kind === "unresolved") {
        return key === "label" ? text(`${indent}— not fetched —`) : text("");
      }
      if (entry.kind !== "row") return text("");

      const node = entry.row;
      const kids = node.children;
      const open = expanded.has(node.id);
      const marker = kids && kids.length > 0 ? (open ? "▾ " : "▸ ") : "  ";
      return text(
        key === "label" ? `${indent}${marker}${node.label}`
        : key === "occupant" ? (kids ? "" : (node.occupant ?? "empty"))
        : kids ? `${kids.length}` : "",
      );
    },
  });

  function paint(): void {
    const entries = flattenTree(WARD_TREE, {
      rowKey: (b) => b.id,
      // "unresolved" rather than an empty array: a ward nobody has fetched is
      // not a ward with no beds, and the two must not render alike.
      childrenOf: (b) => b.children ?? (b.id === "w-ced" ? "unresolved" : []),
      expanded,
    });
    lastIds = entries.map((e, i) => (e.kind === "row" ? e.id : `${e.path}#${i}`));

    grid.render({
      columns: [
        { key: "label", header: "Ward · bay · bed", width: 300 },
        { key: "occupant", header: "Occupant", width: 220 },
        { key: "count", header: "Below", width: 90 },
      ],
      rows: entries.map((row, index) => ({ id: lastIds[index] as string, row, index })),
      total: entries.length,
      sort: live.sort,
      selection: live.selection,
      focus: live.focus,
    });

    // `countLeaves` counts entries of kind "row". In a TREE that is every node,
    // because every node is a row; in a GROUPING it excludes the headers,
    // because "ward = Ashgrove" is not a row anybody can point at. Same
    // function, two answers, and the difference is the thing worth seeing.
    const unresolved = entries.filter((e) => e.kind === "unresolved").length;
    refs.stat.textContent =
      `${entries.length} entries · countLeaves ${countLeaves(entries)} · ` +
      `${unresolved} unresolved branch${unresolved === 1 ? "" : "es"}`;
  }

  const toggleFocused = (): void => {
    const id = live.focus?.rowId;
    if (!id) return;
    // `toggleExpanded` is a pure Set operation over paths, which is why the
    // expanded set is something the application owns and can serialise into a
    // saved view — the tree holds no open/closed state of its own.
    expanded = toggleExpanded(expanded, id);
    paint();
  };

  refs.toggle.addEventListener("click", toggleFocused);
  refs.host.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === "ArrowRight" || e.key === "ArrowLeft") {
      // Enter and the arrows are the tree conventions. ArrowRight/Left still
      // move focus in the grid, so this only fires on a group row.
      if (e.key === "Enter") {
        e.preventDefault();
        toggleFocused();
      }
    }
  });

  refs.note.textContent =
    "groupRows derives a hierarchy from a COLUMN; flattenTree renders one the data already HAS. " +
    "Same GroupEntry list, same renderer, different question — and in a tree every node is a row, " +
    "where a grouping's headers are not. Focus a ward or bay and press Enter. Cedar's children are " +
    "unresolved: not fetched is not empty, and only an open branch is asked for.";
  paint();
}
