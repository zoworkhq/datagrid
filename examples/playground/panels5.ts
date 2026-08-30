/**
 * The adapters, and the FHIR source.
 *
 * `mountFrameworks` renders ONE view model through every adapter the library
 * ships, side by side, in this tab. The claim the library makes is that the
 * engine is framework-free and the adapters are thin; four grids that look
 * identical because they are the same renderer is the only way to show that
 * without asking anyone to take it on faith.
 *
 * `mountFhir` runs a Bundle through the real adapter. The server here is fake —
 * it has to be, there is no PHI anywhere near this page — but it is fake in the
 * ways real servers are awkward: it omits `Bundle.total`, caps `_count`, pages
 * by an opaque `link.next`, returns `_include` entries that are not rows, and
 * silently ignores a `_sort` it does not support.
 */
import {
  createBlockRowModel, createRunway, isLoadingRow, type GridDataSource,
} from "@oxygenui-design/grid-core";
import { createGridRenderer, renderToString, hydrationNotes, type GridViewModel } from "@oxygenui-design/grid-dom";
import { defineDataGrid, type OxDataGridElement } from "@oxygenui-design/grid-element";
import { computed, effect, signal } from "@oxygenui-design/grid-signals";
import { DataGrid } from "@oxygenui-design/grid-react";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import {
  capabilitiesOf, compileFilter, expandParams, fhirSource, partitionBundle, totalFrom,
  type Bundle, type FhirClient,
} from "@oxygenui-design/grid-fhir";
import { liveState } from "./live.js";
import { nameFor, WARDS } from "./people.js";

const text = (t: string) => ({ kind: "text" as const, text: t });

// ── one model, every adapter ────────────────────────────────────────────────

interface Bed { readonly id: string; readonly name: string; readonly ward: string; readonly status: string }

const STATUSES = ["Stable", "Needs review", "Deteriorating"];

const BEDS: readonly Bed[] = Array.from({ length: 24 }, (_, i) => ({
  id: `b${i}`,
  name: nameFor(i + 5),
  ward: WARDS[i % WARDS.length] as string,
  status: STATUSES[i % STATUSES.length] as string,
}));

const BED_COLUMNS = [
  { key: "name", header: "Patient", width: 190 },
  { key: "ward", header: "Ward", width: 120 },
  { key: "status", header: "Status", width: 150 },
];

const bedModel = (
  rows: readonly Bed[],
  over: Partial<GridViewModel<Bed>> = {},
): GridViewModel<Bed> => ({
  columns: BED_COLUMNS,
  rows: rows.map((row, index) => ({ id: row.id, row, index })),
  total: rows.length, sort: [], selection: [], focus: null,
  ...over,
});

const bedFallback = (row: Bed, key: string) =>
  text((row as unknown as Record<string, string>)[key] ?? "");

export interface FrameworkRefs {
  readonly vanilla: HTMLElement;
  readonly element: HTMLElement;
  readonly react: HTMLElement;
  readonly signals: HTMLElement;
  readonly ssr: HTMLElement;
  readonly ssrNote: HTMLElement;
  readonly angular: HTMLElement;
  readonly note: HTMLElement;
  readonly shuffle: HTMLButtonElement;
}

export function mountFrameworks(refs: FrameworkRefs): void {
  let rows = BEDS.slice(0, 8);
  // ONE live state behind all four adapters. Focus in any of them moves the
  // model, and every grid repaints from it — which is the claim this panel
  // makes, extended from "the same rows" to "the same interaction".
  const live = liveState({ repaint: () => paint(), rowIds: () => rows.map((b) => b.id) });

  // 1 · Vanilla. The renderer, with nothing in front of it.
  const plain = createGridRenderer<Bed>(refs.vanilla, {
    label: "Beds — no framework", rowHeight: 40, onAction: live.onAction, fallback: bedFallback,
  });

  // 2 · The custom element. Registered once; `model` is a property, not an
  //     attribute, because a view model is not a string.
  defineDataGrid("ox-data-grid");
  const el = document.createElement("ox-data-grid") as OxDataGridElement<Bed>;
  el.label = "Beds — custom element";
  el.rowHeight = 40;
  el.fallback = bedFallback;
  refs.element.append(el);

  // 3 · React. A real root, a real component, React 19.
  const reactRoot = createRoot(refs.react);

  // 4 · Signals. The adapter is `alien-signals`; the grid subscribes to a
  //     computed and repaints when it changes. Nothing schedules but the
  //     signal graph.
  const source = signal(rows);
  // The focus goes THROUGH the computed. Reading it outside would repaint from
  // a model that still says `focus: null`, and the signal path would be the one
  // adapter that loses focus on every update.
  const derived = computed(() =>
    bedModel(source(), { sort: live.sort, selection: live.selection, focus: live.focus }),
  );
  const signalGrid = createGridRenderer<Bed>(refs.signals, {
    label: "Beds — signals", rowHeight: 40, onAction: live.onAction, fallback: bedFallback,
  });
  effect(() => {
    signalGrid.render(derived());
  });

  function paint(): void {
    const model = bedModel(rows, {
      sort: live.sort,
      selection: live.selection,
      focus: live.focus,
    });
    plain.render(model);
    el.model = model;
    reactRoot.render(
      createElement(DataGrid<Bed>, {
        model, label: "Beds — React", onAction: live.onAction, fallback: bedFallback,
      }),
    );
    // `live` is not a signal, so reading it inside the computed creates no
    // dependency and a focus change alone would never re-run the effect. The
    // signal path gets the same explicit render as the others; `source.set`
    // still drives it when the ROWS change, which is what it is there to show.
    source.set(rows);
    signalGrid.render(bedModel(rows, { sort: live.sort, selection: live.selection, focus: live.focus }));
  }

  refs.shuffle.addEventListener("click", () => {
    // Rotating the rows proves all four are reading the SAME model, rather
    // than four grids that happen to have been seeded identically.
    rows = [...rows.slice(1), rows[0] as Bed];
    paint();
  });

  // 5 · Server rendering. The string below is what a server would send; it is
  //     inserted as markup and then ADOPTED by a client renderer — no clear,
  //     no rebuild, no flash.
  const html = renderToString(bedModel(BEDS.slice(0, 6)), {
    label: "Beds — server rendered", firstPage: 6, rowHeight: 40, fallback: bedFallback,
  });
  refs.ssr.innerHTML = html;
  // The adopted grid gets its own live state: it shows a different six rows
  // from the four above, so sharing one focus would point at a row it does not
  // have.
  const ssrRows = BEDS.slice(0, 6);
  const ssrLive = liveState({ repaint: () => paintSsr(), rowIds: () => ssrRows.map((b) => b.id) });
  const adopted = createGridRenderer<Bed>(refs.ssr, {
    label: "Beds — server rendered", rowHeight: 40, onAction: ssrLive.onAction, fallback: bedFallback,
  });
  const paintSsr = (): void =>
    adopted.render(
      bedModel(ssrRows, { sort: ssrLive.sort, selection: ssrLive.selection, focus: ssrLive.focus }),
    );
  paintSsr();
  // Two sentences, joined as two sentences. Lowercasing the first word of a
  // quoted note produces "…50 rows. never the whole set."
  refs.ssrNote.textContent =
    `${html.length.toLocaleString()} bytes of markup. ${hydrationNotes.serverRenders} ` +
    hydrationNotes.clientAdopts;

  // 6 · Angular. Honest about why it is source and not a live grid.
  refs.angular.textContent = [
    `<div [oxDataGrid]="'Beds'" [model]="model()" (action)="onAction($event)"></div>`,
    "",
    "// The directive is 62 lines: one effect reading Angular signals and pushing",
    "// into the same framework-free renderer above. It is not mounted in this tab",
    "// because doing so would pull the Angular compiler into the page — the same",
    "// reason the migration panel runs its codemod at build time. It is exercised",
    "// headlessly in the package's own tests.",
  ].join("\n");

  refs.note.textContent =
    "One view model, five adapters, the same renderer under all of them. Press Shuffle: every " +
    "grid moves together, because there is only one engine and the adapters do not own state.";
  paint();
}

// ── FHIR ────────────────────────────────────────────────────────────────────

interface FhirRow { readonly id: string; readonly name: string; readonly birthDate: string; readonly ward: string }

const PAGE_SIZE = 25;
const SERVER_ROWS = 240;

/**
 * A server that is awkward in the ways real ones are.
 *
 * Every quirk below is one an implementer meets on a real endpoint, and each is
 * the reason for a corresponding decision in the adapter.
 */
function fakeServer(): FhirClient & { readonly calls: string[] } {
  const calls: string[] = [];

  const page = (offset: number, count: number): Bundle => {
    const n = Math.min(count, SERVER_ROWS - offset);
    const entry = Array.from({ length: Math.max(0, n) }, (_, i) => ({
      // `fullUrl` is what a real bundle carries; the adapter does not need it.
      fullUrl: `urn:uuid:patient-${offset + i}`,
      resource: {
        resourceType: "Patient",
        id: `pat-${offset + i}`,
        name: [{ text: nameFor(offset + i) }],
        birthDate: `19${50 + ((offset + i) % 50)}-0${((offset + i) % 9) + 1}-1${(offset + i) % 9}`,
      } as Record<string, unknown>,
      search: { mode: "match" as const },
    }));

    // One `_include` entry: context, not a row. Counting it as a row is the
    // classic way a FHIR grid reports 26 patients on a page of 25.
    const included = {
      fullUrl: "urn:uuid:org-1",
      resource: { resourceType: "Organization", id: "org-1", name: "Northside Regional" } as Record<string, unknown>,
      search: { mode: "include" as const },
    };

    // And one entry the adapter's `toRow` will refuse, because it has no name.
    const unmappable = {
      fullUrl: "urn:uuid:patient-bad",
      resource: { resourceType: "Patient", id: "pat-bad" } as Record<string, unknown>,
      search: { mode: "match" as const },
    };

    const next = offset + n < SERVER_ROWS
      ? [{ relation: "next", url: `https://fhir.example/Patient?_getpages=abc&_offset=${offset + n}` }]
      : [];

    return {
      resourceType: "Bundle",
      type: "searchset",
      // NO `total`. Optional in the spec, and absent on plenty of servers.
      link: [{ relation: "self", url: "https://fhir.example/Patient" }, ...next],
      entry: [...entry, included, unmappable],
    } as Bundle;
  };

  return {
    calls,
    async request(input) {
      if (input.kind === "search") {
        calls.push(`search ${new URLSearchParams(input.params).toString()}`);
        // `_count` is capped at 25 here, silently — exactly as servers do.
        return page(0, PAGE_SIZE);
      }
      calls.push(`follow ${input.url.replace("https://fhir.example/Patient?", "")}`);
      const offset = Number(new URL(input.url).searchParams.get("_offset") ?? 0);
      return page(offset, PAGE_SIZE);
    },
  };
}

export interface FhirRefs {
  readonly host: HTMLElement;
  readonly meta: HTMLElement;
  readonly calls: HTMLElement;
  readonly filterOut: HTMLElement;
  readonly note: HTMLElement;
  readonly jump: HTMLButtonElement;
}

export function mountFhir(refs: FhirRefs): void {
  const client = fakeServer();
  const capability = { maxPageSize: PAGE_SIZE, totalIs: "none" as const, sortableKeys: ["family", "birthdate"] };

  const source: GridDataSource<FhirRow> = fhirSource<FhirRow>({
    client,
    resourceType: "Patient",
    searchParams: { name: "name", ward: "organization" },
    sortParams: { name: "family", birthDate: "birthdate" },
    capability,
    toRow: (resource) => {
      const r = resource as { id?: string; name?: { text?: string }[]; birthDate?: string };
      const label = r.name?.[0]?.text;
      // No name, no row. Returning undefined is how the adapter is told, and
      // it is COUNTED rather than dropped — see `unmapped` below.
      if (!label || !r.id) return undefined;
      return { id: r.id, name: label, birthDate: r.birthDate ?? "", ward: "Northside Regional" };
    },
  });

  const model = createBlockRowModel<FhirRow>({
    dataSource: source, rowKey: (r) => r.id, blockSize: PAGE_SIZE, maxBlocks: 4,
  });

  const COLUMNS = [
    { key: "name", header: "Patient", width: 220, sortable: true },
    { key: "birthDate", header: "Born", width: 140, sortable: true },
    { key: "ward", header: "Organisation", width: 220 },
  ];

  const live = liveState({ repaint: () => paint(), rowIds: () => lastIds });
  let lastIds: readonly string[] = [];
  const r = createGridRenderer<FhirRow>(refs.host, {
    label: "FHIR Patient search",
    rowHeight: 40,
    onAction: live.onAction,
    fallback: (row, key) =>
      // A block that has not arrived is a LOADING row, not a blank one. The
      // difference is whether an empty grid means "no patients" or "wait".
      isLoadingRow(row)
        ? text(key === "name" ? "Loading…" : "")
        : text((row as unknown as Record<string, string>)[key] ?? ""),
  });

  /**
   * The runway that makes a windowed model renderable.
   *
   * The block model publishes only the window the viewport declared, and the
   * renderer takes its geometry from the length of the row list it is handed —
   * so handing it the window makes a grid one window tall, which cannot scroll
   * and therefore never asks for the next page.
   *
   * This was thirty lines of hand-written clamping here, and it was wrong
   * twice. It is `createRunway` now, with the two failure modes it exists to
   * prevent written down beside it.
   */
  const runway = createRunway<FhirRow>({ pageSize: PAGE_SIZE });

  function paint(): void {
    const result = model.result();
    const rows = runway.absorb(result);

    lastIds = rows.map((row) => row.id);
    r.render({
      columns: COLUMNS,
      rows: rows as never,
      // "unknown", not a guess. The server did not say, so neither do we.
      total: result.total,
      sort: live.sort,
      selection: live.selection,
      focus: live.focus,
    });

    refs.calls.textContent = [
      ...client.calls.map((c) => `→ ${c}`),
      ...(result.errors.length > 0
        ? ["", `${result.errors.length} refusal(s) — note what an error is allowed to carry:`,
           // No message, no row id, no cell value. A grid error names the
           // CODE, the phase, the column and the row INDEX, and nothing that
           // could put a patient into a log line.
           ...result.errors.map((e) =>
             `  · ${e.code}  phase=${e.phase}  column=${e.columnKey ?? "—"}  rowIndex=${e.rowIndex ?? "—"}`)]
        : []),
    ].join("\n") || "(no requests yet)";
  }

  // The model publishes through a signal, so the repaint is an effect on it —
  // the same wiring an application writes, not a demo-only callback.
  effect(() => {
    void model.result();
    paint();
  });

  /**
   * The viewport declares what it wants; the model fetches it.
   *
   * This has to be driven by scrolling rather than requested once up front. A
   * cursor source can only reach block n once block n-1 has arrived and handed
   * over its `link.next`, so asking for rows 0–30 at startup spans two blocks
   * and the second is not reachable YET — it refuses, correctly, and the rows
   * sit at "Loading…" because nothing ever asks again. Scrolling asks again,
   * which is exactly how a real grid drives a paged source.
   */
  const ROW_H = 40;
  function declareRange(): void {
    const vp = refs.host.querySelector<HTMLElement>(".oxg-viewport");
    if (!vp) return;
    const first = Math.max(0, Math.floor(vp.scrollTop / ROW_H));
    const visible = Math.ceil((vp.clientHeight || 340) / ROW_H);
    // The clamp lives in `createRunway` now — a range that reaches past the
    // runway asks for a block whose cursor has not arrived, and the grid
    // stalls one page short of where it was going.
    const range = runway.rangeFor(first, visible);
    model.setRange(range.start, range.end);
  }
  refs.host.addEventListener("scroll", declareRange, { capture: true, passive: true });
  // One block to start with, so the first paint is rows that exist rather than
  // a refusal the user did not ask for.
  model.setRange(0, PAGE_SIZE);

  refs.jump.addEventListener("click", () => {
    // Relative to what has actually arrived, not a fixed row.
    //
    // A cursor source can only reach block n once block n-1 has handed over
    // its `link.next`, so "unreachable" is a moving target: row 120 is a jump
    // at first and an ordinary scroll once you have paged past it. Six pages
    // beyond the high-water mark is always past the furthest cursor anyone
    // holds, so this always demonstrates the refusal rather than sometimes
    // demonstrating a successful fetch.
    //
    // An offset server would serve this. This one pages by cursor, so the
    // model emits `cursor-jump-unsupported` instead of silently walking every
    // page in between — or, worse, leaving the rows saying "Loading…" forever.
    const target = runway.arrived + PAGE_SIZE * 6;
    model.setRange(target, target + 20);
    setTimeout(paint, 120);
  });

  // The static half: what the adapter computes without any request.
  const bundle = {
    resourceType: "Bundle", type: "searchset",
    entry: [
      { resource: { resourceType: "Patient", id: "a", name: [{ text: "Amara Okafor" }] }, search: { mode: "match" } },
      { resource: { resourceType: "Organization", id: "o" }, search: { mode: "include" } },
      { resource: { resourceType: "Patient", id: "b" }, search: { mode: "match" } },
    ],
  } as unknown as Bundle;
  const part = partitionBundle<FhirRow>(bundle, "Patient", (res) => {
    const p = res as { id?: string; name?: { text?: string }[] };
    return p.name?.[0]?.text && p.id
      ? { id: p.id, name: p.name[0].text as string, birthDate: "", ward: "" }
      : undefined;
  });
  const caps = capabilitiesOf(capability);

  // A filter the server can take, and two it cannot. `compileFilter` RETURNS
  // the refusal rather than throwing, because "the server cannot express this"
  // is an ordinary answer that the caller handles by filtering on the client.
  const ok = compileFilter(
    { kind: "text", key: "name", op: "contains", value: "Okafor" },
    { name: "name" },
  );
  const unmapped = compileFilter(
    { kind: "number", key: "potassium", op: "gt", value: 5 },
    { name: "name" },
  );
  const disjunction = compileFilter(
    { kind: "or", children: [
      { kind: "text", key: "name", op: "contains", value: "Okafor" },
      { kind: "text", key: "name", op: "contains", value: "Rahman" },
    ] },
    { name: "name" },
  );

  refs.filterOut.textContent = [
    `capabilities     total=${caps.total}  paging=${caps.paging}  maxPageSize=${caps.maxPageSize ?? "unknown"}`,
    `Bundle.total     ${totalFrom(bundle, capability)}   ← the server omitted it, so this is not a number`,
    "",
    `partitionBundle  ${part.rows.length} row(s), ${part.meta.included} include(d), ` +
      `unmapped ${JSON.stringify(part.meta.unmapped)}`,
    "",
    `compileFilter    name contains "Okafor" → ${ok.ok ? JSON.stringify(ok.params) : ok.reason}`,
    `                 expandParams → ${JSON.stringify(expandParams(ok.ok ? ok.params : {}))}`,
    "",
    `refused          potassium > 5 → ${unmapped.ok ? JSON.stringify(unmapped.params) : unmapped.reason}`,
    `refused          name=A OR name=B → ${disjunction.ok ? JSON.stringify(disjunction.params) : disjunction.reason}`,
  ].join("\n");

  refs.note.textContent =
    "A fake server, awkward on purpose: no Bundle.total, _count capped at 25, paging by an opaque " +
    "link.next, one _include entry that is not a row, and one Patient with no name. Every one of " +
    "those is why the adapter is shaped the way it is.";
  refs.meta.textContent =
    `blockSize ${PAGE_SIZE}, maxBlocks 4 — at most 100 rows resident no matter how far you scroll.`;
  paint();
}
