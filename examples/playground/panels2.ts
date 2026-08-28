/**
 * Working on a row, AI, and migration.
 *
 * The three panels that show what the library refuses to do: it refuses to keep
 * a failed write on screen, refuses to run a query it cannot compile, refuses
 * to rank a model's guess against a measured fact, and refuses to write a
 * coverage claim on your behalf.
 */
import {
  and, beginEdit, cancelEdit, commitEdit, fromSearchParams, inspect, inspectionEvent,
  toSearchParams, updateDraft, type FilterNode, type ModelProvenance,
} from "@oxygenui-design/grid-core";
import { createGridRenderer } from "@oxygenui-design/grid-dom";
import {
  acceptProposal, aiDerived, compareSourced, compileProposal, describeProvenance,
  verified, type Proposal, type Sourced,
} from "@oxygenui-design/grid-ai";
// Precomputed at build time — see build.mjs. A codemod is a build-time tool,
// and bundling it for the browser pulled in the whole TypeScript compiler.
import migrations from "./migrations.generated.json";

const text = (t: string) => ({ kind: "text" as const, text: t });

// ── working on a row: editing + inspector ───────────────────────────────────

interface Row { readonly id: string; readonly name: string; readonly ward: string; readonly mrn: string }

let rows: Row[] = [
  { id: "w1", name: "A. Okafor", ward: "Ashgrove", mrn: "MRN-100000" },
  { id: "w2", name: "K. Lindqvist", ward: "Beeches", mrn: "MRN-123757" },
  { id: "w3", name: "G. Novak", ward: "Dunlin", mrn: "MRN-115838" },
];

export interface WorkingRefs {
  readonly host: HTMLElement;
  readonly panel: HTMLElement;
  readonly urlBar: HTMLElement;
  readonly value: HTMLSelectElement;
  readonly commit: HTMLButtonElement;
  readonly note: HTMLElement;
}

export function mountWorking(refs: WorkingRefs): void {
  let inspector = inspect(rows[0]?.id ?? "w1");
  // Focus and selection are held here so the demo can PROVE inspecting does not
  // move them — the library cannot touch them, by signature.
  const selection = ["w2"];
  const focus = { rowId: "w3", columnKey: "name" };

  const render = (): void => {
    refs.host.textContent = "";
    const r = createGridRenderer<Row>(refs.host, {
      label: "Working set",
      rowHeight: 40,
      onAction: (a) => {
        if (a.type === "focus/cell") {
          inspector = inspect(a.rowId);
          renderPanel();
        }
      },
      fallback: (row, key) => text(String((row as unknown as Record<string, string>)[key] ?? "")),
    });
    r.render({
      columns: [
        { key: "name", header: "Patient", width: 190 },
        { key: "mrn", header: "MRN", width: 150 },
        { key: "ward", header: "Ward", width: 160 },
      ],
      rows: rows.map((row, index) => ({ id: row.id, row, index })),
      total: rows.length,
      sort: [],
      selection,
      focus,
    });
    renderPanel();
  };

  const renderPanel = (): void => {
    const row = rows.find((x) => x.id === inspector.rowId);
    refs.panel.innerHTML = row
      ? `<h3>${row.name}</h3>
         <dl>
           <dt>MRN</dt><dd>${row.mrn}</dd>
           <dt>Ward</dt><dd>${row.ward}</dd>
         </dl>
         <p class="muted-note" style="margin-top:.8rem">
           Inspecting emitted a disclosure event — it shows more than the list did.<br />
           Grid focus is still <b>${focus.rowId}</b> and the selection is still
           <b>${selection.join(", ")}</b>. Inspecting did not move either.
         </p>`
      : `<p class="muted-note">Click a row to inspect it.</p>`;

    if (row) {
      // Emitted for the caller to forward. The grid records nothing.
      console.log("disclosure:", inspectionEvent(row.id, ["mrn", "ward"], "09:14"));
    }
    // One URL: the row AND the query that produced the list.
    const params = toSearchParams({ inspector, query: "ward=any&sort=name" });
    refs.urlBar.textContent = `?${params.toString()}`;
    // Prove it round-trips.
    const back = fromSearchParams(params);
    if (back.inspector.rowId !== inspector.rowId) refs.urlBar.textContent += "  ← ROUND-TRIP FAILED";
  };

  refs.commit.addEventListener("click", () => {
    const target = rows[0];
    if (!target) return;

    const session = updateDraft(
      beginEdit({ rowId: target.id, columnKey: "ward", row: target, value: target.ward }),
      refs.value.value,
    );

    void commitEdit(session, {
      apply: (row, key, value) => ({ ...row, [key]: value }) as Row,
      // Writes to Cedar always fail, so the rollback is demonstrable rather
      // than described.
      write: async ({ value }) => {
        if (value === "Cedar") throw new Error("409 conflict for A. Okafor");
        return { ...target, ward: String(value) };
      },
    }).then((out) => {
      rows = rows.map((r) => (r.id === target.id ? out.row : r));
      refs.note.dataset["state"] = out.ok ? "ok" : "fail";
      refs.note.textContent = out.ok
        ? `Committed. Ward is now ${out.row.ward}.`
        : `Write failed. The row was RESTORED to "${out.row.ward}" — and your draft ` +
          `"${String(out.session.draft)}" is kept, so nobody retypes from memory. ` +
          `The error carries coordinates only.`;
      render();
    });
  });

  render();
}

// ── AI: refusal and provenance ──────────────────────────────────────────────

const MODEL: ModelProvenance = {
  model: "Deterioration risk",
  version: "3.4",
  validatedOn: "adult inpatients, 2019–2023",
  validatedAt: "2024-02-01",
};

interface Scored { readonly id: string; readonly name: string; readonly risk: Sourced<number> }

const SCORED: Scored[] = [
  { id: "a1", name: "A. Okafor", risk: verified(3) },
  { id: "a2", name: "K. Lindqvist", risk: aiDerived(8, MODEL, 0.82) },
  { id: "a3", name: "G. Novak", risk: verified(6) },
  { id: "a4", name: "H. Müller", risk: aiDerived(9, MODEL, 0.61) },
];

const PROPOSALS: Record<string, FilterNode | undefined> = {
  ok: and(
    { kind: "text", key: "ward", op: "eq", value: "Ashgrove" },
    { kind: "number", key: "risk", op: "gte", value: 7 },
  ),
  "unknown-column": { kind: "text", key: "diagnosis", op: "contains", value: "sepsis" },
  unsupported: { kind: "text", key: "ward", op: "endsWith", value: "e" },
  or: {
    kind: "or",
    children: [
      { kind: "text", key: "ward", op: "eq", value: "A" },
      { kind: "text", key: "ward", op: "eq", value: "B" },
    ],
  },
};

export interface AiRefs {
  readonly host: HTMLElement;
  readonly chips: HTMLElement;
  readonly refusal: HTMLElement;
  readonly select: HTMLSelectElement;
  readonly run: HTMLButtonElement;
  readonly accept: HTMLButtonElement;
}

export function mountAi(refs: AiRefs): void {
  const r = createGridRenderer<Scored>(refs.host, {
    label: "Risk scores",
    rowHeight: 40,
    onAction: () => {},
    fallback: (row, key) => {
      if (key === "name") return text(row.name);
      if (key === "risk") return text(String(row.risk.value));
      // The provenance sentence names the model, its version and the
      // population it was VALIDATED on — not the one it is applied to.
      return text(describeProvenance(row.risk) || "measured");
    },
  });

  const render = (): void => {
    r.render({
      columns: [
        { key: "name", header: "Patient", width: 170 },
        { key: "risk", header: "Risk", width: 90 },
        { key: "provenance", header: "Where this came from", width: 460 },
      ],
      // Sorting is deliberately NOT offered on risk: an AI-derived value and a
      // verified one are incomparable, and sorting a worklist is triage.
      rows: SCORED.map((row, index) => ({ id: row.id, row, index })),
      total: SCORED.length,
      sort: [],
      selection: [],
      focus: null,
    });
    for (const row of refs.host.querySelectorAll<HTMLElement>('[role="row"]')) {
      const id = row.dataset["rowId"];
      const found = SCORED.find((s) => s.id === id);
      if (found && found.risk.source === "ai-derived") row.dataset["ai"] = "true";
    }
  };

  refs.run.addEventListener("click", () => {
    const proposal: Proposal = {
      id: "p1",
      prompt: refs.select.selectedOptions[0]?.textContent ?? "",
      provenance: MODEL,
      ...(PROPOSALS[refs.select.value] ? { filter: PROPOSALS[refs.select.value] as FilterNode } : {}),
    };
    const compiled = compileProposal(proposal, {
      columnKeys: ["ward", "risk", "name"],
      supports: (c) => c.op !== "endsWith",
    });

    refs.chips.textContent = "";
    if (compiled.ok) {
      refs.refusal.hidden = true;
      refs.accept.disabled = false;
      for (const chip of compiled.chips) {
        const el = document.createElement("span");
        el.className = "chip";
        el.textContent = chip;
        refs.chips.append(el);
      }
      const note = document.createElement("span");
      note.className = "chip ai";
      note.textContent = "proposed — nothing has run";
      refs.chips.append(note);
    } else {
      // Runs nothing, and names the part it could not express.
      refs.refusal.hidden = false;
      refs.refusal.textContent = compiled.reason;
      refs.accept.disabled = true;
    }
    refs.accept.onclick = () => {
      const action = acceptProposal(compiled);
      refs.chips.textContent = action ? "" : "";
      const el = document.createElement("span");
      el.className = "chip";
      el.textContent = action
        ? `accepted → dispatched ${action.type} (the CALLER dispatched it, not the plugin)`
        : "nothing to accept";
      refs.chips.append(el);
      refs.accept.disabled = true;
    };
  });

  // Prove the incomparability rather than describing it.
  const cmp = compareSourced(SCORED[1]?.risk as Sourced<number>, SCORED[0]?.risk as Sourced<number>, (a, b) => a - b);
  console.log("AI-derived vs verified compare →", cmp);

  render();
}

// ── migration ───────────────────────────────────────────────────────────────

interface Migrated {
  readonly input: string;
  readonly output: string;
  readonly report: string;
}

const MIGRATIONS = migrations as Record<string, Migrated>;

export interface MigrationRefs {
  readonly input: HTMLElement;
  readonly output: HTMLElement;
  readonly todos: HTMLElement;
  readonly source: HTMLSelectElement;
  readonly run: HTMLButtonElement;
}

export function mountMigration(refs: MigrationRefs): void {
  const load = (): void => {
    refs.input.textContent = MIGRATIONS[refs.source.value]?.input ?? "";
    refs.output.textContent = "";
    refs.todos.textContent = "";
  };

  refs.run.addEventListener("click", () => {
    const m = MIGRATIONS[refs.source.value];
    if (!m) return;
    refs.output.textContent = m.output;
    refs.todos.textContent = m.report;
  });

  refs.source.addEventListener("change", load);
  load();
}

export { cancelEdit };
