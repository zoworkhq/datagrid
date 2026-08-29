# API guide

Everything a consumer needs, and the measurements behind the advice. Where a
number appears here it came from `bench/review-engine.mjs` or
`bench/versus-aggrid.mjs` on darwin-arm64 — reproduce them before trusting them
on your hardware.

The library is deliberately small: `grid-core` + `grid-dom` is **8.05 kB
brotlied**, against ag-grid-community's 292.6 kB plus 24.9 kB of CSS. It also
does much less, and the sections below say where.

---

## 1 · Choosing a row model

Four exist. Most applications should call `createAdaptiveRowModel` and let it
choose, because it reports what it chose and why.

```ts
import { createAdaptiveRowModel } from "@oxygenui-design/grid-core";

const model = createAdaptiveRowModel({
  rows,                                   // omit when paging from a source
  rowKey: (p) => p.id,
  get: (row, key) => row[key],
  columns: [                              // enables the columnar path
    { key: "ward", type: "string" },
    { key: "potassium", type: "number" },
  ],
});

console.log(model.choice);
// { strategy: "columnar", because: "120,000 rows is above the columnar
//   threshold of 50,000 and column types were supplied", storeBytes: 1_440_000 }
```

| strategy | when | cost at 100k × 250 |
|---|---|---|
| `client` | up to ~100k rows | 1,331 MB, sort 66 ms |
| `columnar` | 50k–few million, **types required** | 252 MB, sort 16 ms |
| `block` | anything larger, **source required** | bounded by the window |

### Why it will not choose for you in two cases

**Columnar needs column types.** Inferring them from the first row is how a
column of mostly-numbers containing one `"N/A"` becomes silently unsortable.
Declare `columns` and the path opens.

**Block needs a data source.** Paging changes *semantics*, not just
performance: `total` may become `"unknown"`, rows arrive late, and a cursor
source cannot jump. That is a product decision. Pass `dataSource` and it is
used; do not, and the client ceiling still refuses — which is deliberate, and
better than a silent four-second sort.

### Reading results

```ts
const result = model.result();          // a signal
result.length;                          // count, materialises nothing
result.rowsIn(scrollStart, scrollEnd);  // wraps only the window — prefer this
result.rows;                            // the whole set, lazily materialised
```

`rows` allocates one wrapper object **per row**. At a million rows that is a
million allocations to display thirty, on every sort. Measured: `rows[]` costs
108.3 ms at 1M against `rowsIn(0,30)` at 24.0 ms. Use `rows` only when you
genuinely need the set — an export, a select-all.

---

## 2 · Sorting

Two paths, and they differ in one visible way.

```ts
model.setState({ ...state, sort: [{ key: "name", direction: "asc" }] });
```

A **single-key sort on a column with no supplied comparator** goes through a
precomputed ordinal index automatically. Measured at 100,000 rows: 117.7 ms
falling to **1.9 ms** on every sort after the first — 62×.

Supply a comparator and that column takes the comparator path:

```ts
comparators: {
  potassium: (a, b) =>
    a.k === null || b.k === null ? "incomparable" : a.k - b.k,
}
```

### `"incomparable"` is a real answer

A comparator may refuse. A quantity with no unit, a value against an absence —
these are not orderable, and guessing is how an empty cell sorts to the top of
a worklist as though it were the most urgent.

### The one behavioural difference, stated

The two paths place absences differently, on purpose:

| path | where absences land |
|---|---|
| comparator | interleaved — position depends on V8's pivot choices |
| index (`createSortIndex`) | last, in source order, both directions |

`"incomparable"` is a property of a **pair**; "sorts to the end" is a property
of a **row**, and deriving one from the other needs every pair — O(n²). Every
cheaper rule is a heuristic, which is not a thing to put under a worklist. If
you want absences gathered, use `createSortIndex` explicitly.

---

## 3 · Rendering and cells

```ts
import { createGridRenderer } from "@oxygenui-design/grid-dom";

const grid = createGridRenderer(host, {
  label: "Patient roster",     // the accessible name. "Patient roster", not "grid"
  rowHeight: 56,
  cells: { name: identityCell },
  fallback: (row, key) => ({ kind: "text", text: String(row[key] ?? "") }),
  onAction: (action) => dispatch(action),
  onError: (e) => log(e),      // coordinates only — see §7
});

grid.render(viewModel);
```

Both axes are virtualised. Rendered DOM is **constant**: ~30 rows and ~14 cells
per row at 20, 100, 250 or 500 columns.

### A cell renderer

```ts
const identityCell: CellRenderer<Patient> = {
  mount(node, ctx) { /* build the skeleton, then… */ identityCell.update(node, ctx); },
  update(node, ctx) { /* write EVERY field */ },
  unmount(node) { node.textContent = ""; },
  measure: () => ({ intrinsic: 238, growable: true }),
  read: (ctx) => `${ctx.row.name}, born ${ctx.row.dob}`,   // what a screen reader says
  compare: (a, b) => a.name.localeCompare(b.name),
  toExport: (ctx) => ({ kind: "value", value: ctx.row.name }),
  toPrint: (ctx) => ({ kind: "value", value: ctx.row.name }),
};
```

**Rows recycle.** A cell node outlives the row it was built for, so:

- write every field on every `update` — nothing may be captured from the first context;
- `mount` must populate too, because the renderer calls one **or** the other, never both;
- keep any class you later query by — assigning `className` wholesale drops it, and the next recycle finds nothing.

**Never `innerHTML`.** The renderer writes with `textContent`; a cell reaching
around that puts patient-supplied text into a parser.

---

## 4 · Streaming updates

Handing over a new model to change one cell reruns filter and sort and repaints
every rendered row — measured at a pinned 16.7 ms frame at *every* update rate.

```ts
grid.applyTransaction({ update: [{ id: "p42", row: nextRow }] });
```

Patches by id, repaints only those rows, coalesces every patch inside a frame
into one repaint. Measured **9.0 ms p95 at 10,000 updates/second**.

- A patch to an unrendered row is recorded and shows when it scrolls in.
- `render()` **clears** the overlay: a new model is your statement of truth, and
  a patch it does not restate is stale.
- **Adds and removes are not handled here.** Both change the row count and
  therefore the geometry; they go through `render`.

---

## 5 · Paging from a source

```ts
const model = createBlockRowModel({
  dataSource,          // you own the I/O; the grid never fetches
  rowKey: (p) => p.id,
  blockSize: 100,      // negotiated down to capabilities.maxPageSize
  maxBlocks: 20,       // 20 × 100 = 2,000 rows resident, whatever the total
});

model.setRange(firstVisibleRow, lastVisibleRow);
```

Declare what your source can do:

```ts
capabilities: {
  total: "exact" | "estimate" | "none",
  paging: "offset" | "cursor" | "forward-only",
  sortableKeys?: string[],   // a sort outside this set is refused, not requested
  maxPageSize?: number,      // _count is commonly capped at 100
}
```

### The FHIR constraint

An **offset** source reaches row 500,000 in one request. A **cursor** source
would need five hundred, because FHIR pages by an opaque `link.next`. The grid
refuses instead:

```ts
{ code: "cursor-jump-unsupported", phase: "query", rowIndex: 500000 }
```

Your application decides: walk it, offer a filter, or tell the user this source
cannot be scrubbed. A row that has not arrived renders as **loading**, never as
blank — an empty row reads as a row with no data, which is a worse claim.

---

## 6 · Off the main thread

```ts
const worker = createGridWorker();
if (worker.available) {
  const order = await worker.run({ kind: "sort", direction: "asc" }, keys);
}
```

Measured at 1M rows: a 234 ms blocking sort becomes **24 ms with an 8 ms worst
main-thread frame**. It does not make the work faster; it stops the main thread
paying for it.

Three limits, each deliberate:

- **`keys` is transferred.** Do not touch it afterwards. Copying first would
  give the cost back — `postMessage` structured-clones, and a million row
  *objects* cost more to copy than to sort.
- **No comparators.** A function is not structured-cloneable, and serialising
  one means evaluating caller-supplied source inside a worker.
- **`available: false`** under SSR, a locked-down CSP, or an old embedded
  browser. Stay on the main thread. A slow grid is a working grid.

---

## 7 · Errors, PHI and export

Errors carry **coordinates, never values**:

```ts
{ code: "renderer-threw", phase: "render", columnKey: "potassium", rowIndex: 4113 }
```

`rowIndex`, not `rowId` — a row id can be an MRN, and errors get logged.

### Export

```ts
const out = toCsv(request, { filename: "roster.csv" });
```

A patient-supplied name beginning `=`, `+`, `-`, `@`, tab or CR is a formula in
Excel and Sheets. CSV output prefixes it; XLSX writes `t="inlineStr"` with no
`<f>` element, so the same payload is inert **by the structure of the format**.
Withheld cells export as `[withheld: …]` and never their value.

### Coverage is required and has no default

```ts
coverage: { sources: [...], total: "unknown", loaded: 50_000, asOf: "09:14" }
```

Every plausible default is a claim you did not make. `"unknown"` is a value,
not an absent field: an absent field reads as *we forgot to ask*, `"unknown"`
reads as *we asked and the server does not know*. Only the second is a claim.

---

## 8 · Healthcare cells

Eighteen hosts ship, each answering eight obligations — measure, truncate, focus,
read, compare, export, print, **mask state**. The eighth is what makes
mask-preserving export possible: a cell returning a flat value cannot tell the
writer that the value must not leave.

**One rule above them: a cell renders a state the application supplies. It
never derives one.** No cell computes whether a result is critical, whether a
value is abnormal, or whether something is too old to trust. Enforced by
`assertPure`, which calls each probe twice and fails on any difference.

| cell | the distinction it protects |
|---|---|
| `allergyCell` | **"no known allergies" ≠ "nobody asked"** — same empty row, different clinical facts |
| `codedTermCell` | the code is authoritative, the display is a convenience |
| `vitalsTrendCell` | says when it was given no reference range |
| `riskScoreCell` | carries model, version and the population it was *validated* on |
| `carePlanCell` | a denial carries its reason, so it can be appealed |
| `resolutionCell` | lateness is supplied, never read from a clock |
| `chipOverflowCell` | a counted `+N`, not an ellipsis |
| `maskedCell` | a masked region spans its columns and states the policy |
| `eligibilityCell` | coverage state, not a guess from a date |
| `ledgerCell` | amounts with their currency |
| `labResultCell` | the interpretation comes from the lab, not from comparing to a range |
| `medicationCell` | held ≠ stopped ≠ never prescribed — all look like "no dose today" |
| `appointmentCell` | no-show ≠ cancelled — one freed the slot, one did not |
| `careTeamCell` | never invents a primary when the source named none |
| `clinicalAlertCell` | acknowledgement names **who** — an alert nobody owns is alert fatigue |
| `documentationCell` | an unsigned note is not a note yet |
| `assessmentCell` | a PHQ-9 does not rank against a GAD-7 |
| `aiSummaryCell` | **masked until a person reviews it** — see below |

### The one cell that refuses to export

`aiSummaryCell` masks itself until `reviewedBy` is set. Unreviewed model text
in a CSV arrives looking exactly like a clinician's note, and there is no way
back from that. `toExport` returns `{ kind: "masked" }` until a person has
checked it.

`GridDoseCell` is deliberately **withheld** pending review by a named
clinician. Shipping it quietly is the one thing ADR 0008 forbids.

---

## 9 · Accessibility

`role="grid"` with absolute `aria-rowindex` and `aria-colindex` — a screen
reader says "row 19,998" and "column 187", not the position in a rendered
window. `aria-rowcount="-1"` when the total is unknown, which is the specified
value.

The body is **one tab stop** with roving `tabindex`. A tab stop per cell is 800
presses to leave a 40×20 grid. The focused row and column are kept rendered
even when scrolled out — recycling the focused cell drops focus to the body,
and there would be nothing to tab back to.

Status is never colour alone: every indicator carries a dot **and** a word,
because colour fails colour-blind readers and prints grey.

---

## 10 · What this library will not do

- **No network I/O.** No `fetch`, no base URL, no socket anywhere in the repo.
- **No telemetry.** It emits events; forwarding them is yours.
- **No compliance boundary.** It renders a policy, it does not decide or
  enforce one.
- **No clinical decision support, and not a medical device.**
- **No pivoting, no Canvas renderer, no WASM.** Each was considered and
  measured against; the notes are in the audit.

---

## 11 · Measure your own ceiling

Every number in this guide came from a developer laptop. Yours will differ, and
the one that decides whether client mode is viable is a property of **your**
device class:

```bash
node bench/device-profile.mjs              # this machine
node bench/device-profile.mjs --throttle 6 # approximate a slower one
node bench/device-profile.mjs --json       # for CI
```

It walks a size ladder until an interaction crosses a budget — 100 ms for a
sort or filter, one frame for a scroll — and prints the last size that held,
which is the `maxRows` to pass.

Measured on the machine this library is developed on:

| device | ceiling |
|---|---|
| 8 cores, unthrottled | **50,000 rows** |
| the same, 4× throttled | **10,000 rows** |
| the same, 8× throttled | **1,000 rows** |

`DEFAULT_CLIENT_ROW_CEILING` is 100,000. That is **roughly 2× optimistic on a
developer laptop and an order of magnitude optimistic on anything slower** —
and CPU throttling emulates a slower processor, not a contended one, so a
shared workstation with an EHR already open is worse again. The default is not
lowered, because the right ceiling is a property of the device and lowering it
would refuse work many deployments handle fine. Measure, and pass the number.

---

## 12 · Performance budgets

Gate your own build on these; ours are in `pnpm gate`.

| metric | ours | how it is held |
|---|---|---|
| bundle, core + dom | 8.05 kB brotli | `size-limit` on the composed entry |
| cells rendered per row | ≤ 20 at any column count | `column-scaling.test.ts` |
| scroll p50 | 8.3 ms | `smoke.browser.mjs` |
| first paint, 100k × 20 | 34 ms | `smoke.browser.mjs` |
| sort re-sort, 100k | 1.9 ms | `review-engine.mjs` |
| streaming p95, 10k/sec | 9.0 ms | `bench/versus-aggrid.mjs` |

A gate that has never failed is not known to work. Every one of ours has been
broken on purpose and watched to fail.
