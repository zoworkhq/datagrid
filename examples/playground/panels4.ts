/**
 * Columns at width, and the state that outlives a session.
 *
 * `mountColumns` is the 250-column case: the one where rendering every cell is
 * the thing that kills a grid, and where the count in the corner is the whole
 * demonstration. It also shows the two column facilities that are NOT the
 * renderer's — `layoutColumns` and `moveTo` compute a layout the renderer then
 * consumes, and saying so is more useful than implying the renderer pins.
 *
 * `mountViews` is saved views, keymap overrides, bulk review and paste: four
 * things that share one property, which is that they are all a user's intent
 * surviving something — a reload, a rebind, a filter change, a clipboard.
 */
import {
  DEFAULT_KEYMAP, applyKeymapOverride, confirmReview, describeDrift, describeMove, describeReview,
  driftBetween, emptySelection, hasDrifted, initialState, layoutColumns, moveTo, openReview,
  parseKeymapOverride, parseView, applyView, resolveSelection, resolveViews, selectIds,
  selectMatching, selectionCount, totalWidth, viewFromState,
  type ColumnSpec, type GridState, type GridView, type Selection,
} from "@oxygenui-design/grid-core";
import { planPaste, shapeOfRange } from "@oxygenui-design/grid-clipboard";
import { createGridRenderer, type GridViewModel } from "@oxygenui-design/grid-dom";
import { liveState } from "./live.js";
import { nameFor, WARDS } from "./people.js";

const text = (t: string) => ({ kind: "text" as const, text: t });

// ── 250 columns ─────────────────────────────────────────────────────────────

/** One observation per column. Wide sets are wide because time is a column. */
const OBSERVATIONS = [
  "HR", "SpO₂", "Temp", "RR", "MAP", "GCS", "Pain", "Urine", "Glucose", "Lactate",
];

interface WideRow { readonly id: string; readonly name: string; readonly ward: string; readonly v: readonly number[] }

const COLUMN_COUNT = 250;

const wideColumns = () => {
  // The patient's name is pinned, which is the whole case for pinning: a
  // 250-column flowsheet you scroll sideways is unreadable the moment you can
  // no longer see whose row you are on.
  const cols: { key: string; header: string; width: number; sortable?: boolean; pinned?: "start" | "end" }[] = [
    { key: "name", header: "Patient", width: 190, sortable: true, pinned: "start" },
    { key: "ward", header: "Ward", width: 120, sortable: true },
  ];
  for (let i = 0; i < COLUMN_COUNT - 2; i++) {
    const day = Math.floor(i / OBSERVATIONS.length) + 1;
    cols.push({
      key: `v${i}`,
      header: `${OBSERVATIONS[i % OBSERVATIONS.length]} d${day}`,
      width: 104,
      // The last observation is frozen to the right edge, so both bands are
      // exercised rather than only the easy one.
      ...(i === COLUMN_COUNT - 3 ? { pinned: "end" as const } : {}),
    });
  }
  return cols;
};

const wideRows = (n: number): WideRow[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `w${i}`,
    name: nameFor(i),
    ward: WARDS[i % WARDS.length] as string,
    v: Array.from({ length: COLUMN_COUNT - 2 }, (_, c) => 40 + ((i * 13 + c * 29) % 120)),
  }));

export interface ColumnRefs {
  readonly host: HTMLElement;
  readonly count: HTMLElement;
  readonly note: HTMLElement;
  readonly layout: HTMLElement;
  readonly moveLeft: HTMLButtonElement;
  readonly moveRight: HTMLButtonElement;
  readonly pinFirst: HTMLInputElement;
  readonly spanRow: HTMLInputElement;
}

export function mountColumns(refs: ColumnRefs): void {
  let columns = wideColumns();
  const rows = wideRows(2_000);
  /** Which column the reorder buttons act on. Index 2 is the first observation. */
  let cursor = 2;

  // A span function that only ever fires for one row, so the panel can show
  // BOTH paths: virtualised (span off) and un-virtualised (span on). The
  // renderer opts out of column virtualisation entirely when a span function is
  // present, because a span reasons over columns that are not in the DOM.
  const span = (row: WideRow, key: string): number =>
    row.id === "w3" && key === "name" ? 4 : 1;

  const live = liveState({ repaint: () => paint(), rowIds: () => rows.map((x) => x.id) });

  const r = createGridRenderer<WideRow>(refs.host, {
    label: "Wide observation grid",
    rowHeight: 40,
    onAction: live.onAction,
    fallback: (row, key) =>
      text(
        key === "name" ? row.name
        : key === "ward" ? row.ward
        : String(row.v[Number(key.slice(1))] ?? ""),
      ),
  });

  // Spans change the renderer's strategy, so they need a second renderer rather
  // than a flag — `span` is fixed at construction, deliberately, because
  // switching it per-frame would mean two different virtualisation strategies
  // over one set of recycled nodes.
  let spanning: ReturnType<typeof createGridRenderer<WideRow>> | null = null;

  function model(): GridViewModel<WideRow> {
    return {
      columns,
      rows: rows.map((row, index) => ({ id: row.id, row, index })),
      // Two pinned rows: the ward's sickest, kept in view. `partitionPinned`
      // runs inside the renderer; this is the request.
      ...(refs.pinFirst.checked ? { pinned: { top: new Set(["w0", "w1"]) } } : {}),
      total: rows.length,
      sort: live.sort,
      selection: live.selection,
      focus: live.focus,
    };
  }

  function paint(): void {
    if (refs.spanRow.checked) {
      if (!spanning) {
        r.element.style.display = "none";
        const holder = document.createElement("div");
        holder.style.height = "100%";
        refs.host.append(holder);
        spanning = createGridRenderer<WideRow>(holder, {
          label: "Wide observation grid, with a spanned row",
          rowHeight: 40, span,
          onAction: live.onAction,
          fallback: (row, key) =>
            text(
              key === "name" ? `${row.name} — admitted overnight, no observations recorded`
              : key === "ward" ? row.ward
              : String(row.v[Number(key.slice(1))] ?? ""),
            ),
        });
      }
      spanning.element.parentElement!.style.display = "";
      spanning.render(model());
    } else {
      if (spanning) spanning.element.parentElement!.style.display = "none";
      r.element.style.display = "";
      r.render(model());
    }
    report();
  }

  /** The count that is the whole point of the panel. */
  function report(): void {
    const live = refs.spanRow.checked ? spanning!.element : r.element;
    const cells = live.querySelectorAll('[role="gridcell"]').length;
    const bodyRows = live.querySelectorAll('.oxg-body [role="row"]').length;
    const perRow = bodyRows > 0 ? Math.round(cells / bodyRows) : 0;
    refs.count.textContent =
      `${columns.length} columns declared · ${bodyRows} rows in the DOM · ` +
      `${perRow} cells per row · ${cells.toLocaleString()} cells total`;
    refs.count.dataset["spanning"] = String(refs.spanRow.checked);

    // The engine-side layout, which is a different job from rendering. This is
    // where pinned COLUMNS live: `layoutColumns` assigns each one an offset and
    // an edge, and a host that wants frozen columns positions them from this.
    // The DOM renderer here does not consume `pinned` on a column, and saying
    // that plainly beats implying a feature from an API that exists.
    const specs: ColumnSpec[] = columns.slice(0, 6).map((c, i) => ({
      key: c.key, width: c.width,
      ...(i === 0 ? { pinned: "start" as const } : {}),
      ...(i === 5 ? { pinned: "end" as const } : {}),
    }));
    const laid = layoutColumns(specs, { available: 900 });
    refs.layout.textContent =
      `layoutColumns over the first 6: ` +
      laid.map((l) => `${l.key}@${l.offset}${l.pinned ? `(${l.pinned})` : ""}`).join("  ") +
      `  · totalWidth ${totalWidth(laid)}px`;
  }

  const move = (delta: number): void => {
    const to = Math.min(columns.length - 1, Math.max(0, cursor + delta));
    if (to === cursor) return;
    // `moveTo` is the whole reorder primitive: pure, on any array, and it
    // returns a new one rather than splicing in place.
    columns = moveTo(columns, cursor, to) as typeof columns;
    refs.note.textContent = describeMove(
      (columns[to] as { header: string }).header, cursor, to, columns.length,
    );
    cursor = to;
    paint();
  };

  refs.moveLeft.addEventListener("click", () => move(-1));
  refs.moveRight.addEventListener("click", () => move(1));
  refs.pinFirst.addEventListener("change", paint);
  refs.spanRow.addEventListener("change", paint);
  // Scrolling changes which columns are in the DOM, which is the claim.
  refs.host.addEventListener("scroll", () => report(), { capture: true, passive: true });

  refs.note.textContent =
    `${COLUMN_COUNT} columns, 2,000 rows — half a million cells. The renderer builds the ones you ` +
    `can see. Scroll sideways: the per-row count stays flat, and Patient stays with you because it ` +
    `is pinned — a wide flowsheet is unreadable the moment you cannot see whose row you are on.`;
  paint();
}

// ── views, keys, selection, paste ───────────────────────────────────────────

const VIEW_COLUMNS = ["name", "ward", "mrn", "potassium", "status", "notes"];

/** Four layers, in the order `resolveViews` applies them. */
const LAYERS: readonly GridView[] = [
  {
    version: 1, id: "base", label: "Default", scope: "default",
    columns: VIEW_COLUMNS.map((key) => ({ key })),
    sort: [{ key: "name", direction: "asc" }],
  },
  {
    version: 1, id: "nursing", label: "Nursing", scope: "role",
    // A role hides billing detail. It also TRIES to hide `name`, which is the
    // one column that identifies the row — the resolver refuses that and says
    // so, rather than handing back a roster nobody can read.
    columns: [{ key: "mrn", hidden: true }, { key: "name", hidden: true }, { key: "potassium", width: 220 }],
    sort: [{ key: "ward", direction: "asc" }],
  },
  {
    version: 1, id: "ward-b", label: "Beeches team", scope: "team",
    columns: [{ key: "ward", pinned: "start" }],
  },
  {
    version: 1, id: "mine", label: "My layout", scope: "personal",
    columns: [{ key: "notes", hidden: true }, { key: "status", width: 180 }],
    sort: [{ key: "potassium", direction: "desc" }],
  },
];

export interface ViewRefs {
  readonly out: HTMLElement;
  readonly scopes: HTMLElement;
  readonly keymapInput: HTMLTextAreaElement;
  readonly keymapOut: HTMLElement;
  readonly selectionOut: HTMLElement;
  readonly selectAll: HTMLButtonElement;
  readonly selectSome: HTMLButtonElement;
  readonly shrink: HTMLButtonElement;
  readonly pasteIn: HTMLTextAreaElement;
  readonly pasteOut: HTMLElement;
  readonly bulkOut: HTMLElement;
}

/** What each refusal means, in the words a person would use for it. */
const PROBLEM_VERB: Readonly<Record<string, string>> = {
  "unknown-column": "reference a column that does not exist:",
  "required-column-hidden": "hide the column that identifies the row:",
  "unsortable-column": "sort on a column that cannot be sorted:",
};

export function mountViews(refs: ViewRefs): void {
  // ── layered views ─────────────────────────────────────────────────────────
  const enabled = new Set(["default", "role", "team", "personal"]);

  function renderViews(): void {
    const layers = LAYERS.filter((l) => enabled.has(l.scope));
    const resolution = resolveViews(layers, {
      columnKeys: VIEW_COLUMNS,
      // `name` cannot be hidden by any layer. A required column is the one
      // guarantee a view system has to make, or a saved view can hide the
      // thing that identifies the row.
      requiredColumns: ["name"],
      sortableKeys: ["name", "ward", "potassium"],
    });
    const state = applyView(resolution.view, initialState({ pageSize: 50 }));
    const roundTrip = viewFromState(
      state, { id: "round", label: "Round trip", scope: "personal" }, VIEW_COLUMNS,
    );
    const encoded = JSON.stringify(roundTrip);
    const parsed = parseView(encoded);

    refs.out.textContent = [
      `applied layers   ${resolution.applied.join(" → ") || "(none)"}`,
      `visible columns  ${VIEW_COLUMNS.filter((k) => !state.hidden.includes(k)).join(", ")}`,
      `hidden           ${state.hidden.join(", ") || "(none)"}`,
      `sort             ${state.sort.map((s) => `${s.key} ${s.direction}`).join(", ") || "(none)"}`,
      `widths           ${Object.entries(state.widths).map(([k, v]) => `${k}=${v}`).join(" ") || "(none)"}`,
      "",
      `problems         ${resolution.problems.length === 0 ? "none" : ""}`,
      // Every problem has the same three fields, so say them in a sentence
      // rather than dumping the object — which repeated the kind twice and
      // buried which layer was responsible, the one thing worth knowing.
      ...resolution.problems.map(
        (p) => `  · the "${p.viewId}" layer tried to ${PROBLEM_VERB[p.kind]} "${p.key}"`,
      ),
      "",
      `round trip       viewFromState → JSON (${encoded.length} bytes) → parseView: ` +
        (parsed.ok ? "ok" : `refused — ${JSON.stringify(parsed)}`),
    ].join("\n");
  }

  refs.scopes.querySelectorAll<HTMLInputElement>("input[data-scope]").forEach((box) => {
    box.addEventListener("change", () => {
      if (box.checked) enabled.add(box.dataset["scope"] as string);
      else enabled.delete(box.dataset["scope"] as string);
      renderViews();
    });
  });
  renderViews();

  // ── keymap overrides ──────────────────────────────────────────────────────
  function renderKeymap(): void {
    const override = parseKeymapOverride(refs.keymapInput.value);
    if (!override) {
      refs.keymapOut.textContent =
        "Not a keymap override. Refused whole rather than partly applied — a half-applied " +
        "keymap is a grid where some keys moved and the user cannot tell which.";
      return;
    }
    const resolved = applyKeymapOverride(DEFAULT_KEYMAP, override);
    const changed = resolved.keymap.filter((b) => {
      const base = DEFAULT_KEYMAP.find((d) => d.id === b.id);
      return base && base.keys !== b.keys;
    });
    refs.keymapOut.textContent = [
      `${DEFAULT_KEYMAP.length} default bindings, ${changed.length} rebound.`,
      ...changed.map((b) => {
        const base = DEFAULT_KEYMAP.find((d) => d.id === b.id);
        // A chord of " " prints as nothing at all, which reads as a binding
        // that lost its key rather than one bound to Space.
        return `  · ${b.id}: ${JSON.stringify(base?.keys)} → ${JSON.stringify(b.keys)}`;
      }),
      resolved.problems.length === 0
        ? "No problems."
        : `${resolved.problems.length} problem(s) — reported, not silently dropped:`,
      ...resolved.problems.map((p) => `  · ${p.kind} on ${p.bindingId}: ${p.detail}`),
    ].join("\n");
  }
  refs.keymapInput.addEventListener("input", renderKeymap);
  renderKeymap();

  // ── selection that survives a changing set ────────────────────────────────
  let selection: Selection = emptySelection();
  let loaded = Array.from({ length: 40 }, (_, i) => `p${i}`);

  function renderSelection(): void {
    const ctx = { loadedIds: loaded, matchingTotal: "unknown" as const };
    const resolved = resolveSelection(selection, ctx);
    refs.selectionOut.textContent = [
      `selection kind   ${selection.kind}`,
      `count            ${selectionCount(resolved)}`,
      `loaded ids       ${loaded.length}`,
    ].join("\n");
  }

  refs.selectAll.addEventListener("click", () => {
    // A predicate selection is "everything matching", including rows that were
    // never loaded — which is why its count is a phrase and not a number.
    selection = selectMatching(null);
    renderSelection();
  });
  refs.selectSome.addEventListener("click", () => {
    selection = selectIds(loaded.slice(0, 12));
    renderSelection();
  });
  refs.shrink.addEventListener("click", () => {
    const before = loaded;
    loaded = loaded.filter((_, i) => i % 3 !== 0);
    const drift = driftBetween(before, loaded);
    renderSelection();
    refs.selectionOut.textContent +=
      `\n\ndrift            ${hasDrifted(drift) ? describeDrift(drift) : "none"}`;
  });
  renderSelection();

  // ── paste ─────────────────────────────────────────────────────────────────
  function renderPaste(): void {
    const target = shapeOfRange(
      { anchor: { rowIndex: 0, columnKey: "name" }, focus: { rowIndex: 2, columnKey: "ward" } },
      ["name", "ward", "mrn"],
    );
    const plan = planPaste(refs.pasteIn.value, target);
    refs.pasteOut.textContent = [
      `target range     rows ${target.rows.join(",")} x columns ${target.columns.join(", ")}`,
      `parsed           ${plan.rows.length} row(s), widest ${Math.max(0, ...plan.rows.map((r2) => r2.length))} column(s)`,
      // `fits` is the whole answer. A paste that overflows the selected range
      // is not silently clipped and not silently expanded — the caller is told
      // by how much, and decides.
      `fits the range   ${plan.fits ? "yes" : `NO — ${plan.overflow} cell(s) beyond it`}`,
      "",
      ...plan.rows.slice(0, 4).map((r2, i) =>
        `  row ${i}  ${r2.map((v) => JSON.stringify(v)).join("  ")}`),
    ].join("\n");
  }
  refs.pasteIn.addEventListener("input", renderPaste);
  renderPaste();

  // ── bulk review ───────────────────────────────────────────────────────────
  const review = openReview<{ id: string; name: string }>({
    selection: selectMatching(null),
    context: { loadedIds: loaded.slice(0, 20), matchingTotal: "unknown" },
    rowsById: (id) => ({ id: String(id), name: nameFor(Number(String(id).slice(1))) }),
    takenAt: "2026-08-29T09:12:00Z",
  });
  const refused = confirmReview(review, {
    context: { loadedIds: loaded.slice(0, 20), matchingTotal: "unknown" },
  });
  const allowed = confirmReview(review, {
    context: { loadedIds: loaded.slice(0, 20), matchingTotal: "unknown" },
    allowUnnamed: true,
  });
  refs.bulkOut.textContent = [
    // The sentence the library writes, which is the one a confirmation dialog
    // should show. Counting the rows yourself is how "3 selected" ends up over
    // an action that touches nine thousand.
    `describeReview   ${describeReview(review)}`,
    "",
    `named            ${review.named.length} rows the user can actually see, e.g. ${review.named.slice(0, 3).map((r) => r.row.name).join(", ")}`,
    `unnamed          ${review.unnamed}`,
    `total            ${review.total}`,
    "",
    `confirm()        ${refused.ok ? "allowed" : `REFUSED — ${refused.reason}`}`,
    `confirm({allowUnnamed})  ${allowed.ok ? "allowed" : "refused"}`,
  ].join("\n");
}

export type { GridState };
