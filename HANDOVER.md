# Data Grid — handover

**Read this first.** It is the complete context for `zoworkhq/datagrid`, written
so that a session with no memory of the research can start correctly.

- **Written:** 27 August 2026
- **Source material:** `oxygen-data-grid-brief.html` (product research, partly
  superseded) and `oxygen-datagrid-architecture-review.html` (architecture
  review, current). Both currently live at the root of the `oxygenui` repo.
- **Status of this repo:** EMPTY, when this was written. It is not any more —
  thirteen packages, an engine, three adapters and a playground exist. This
  document is kept as the record of the reasoning the repository was built
  from, and §2, §8 and §10 are still the live ones. **For what is actually
  built today, read [`README.md`](README.md), which is generated against
  measured facts rather than remembered ones.**

> [!NOTE]
> This is a HANDOVER, not a status page. Where the two disagree, the README is
> the current one. That was not true for a while, and it is exactly the kind of
> drift that makes people stop reading both.

---

## 0. The thirty-second version

Build a **framework-agnostic, virtualised enterprise data grid with a healthcare
layer**, as a separate repository of small packages under the
**`@oxygenui-design`** npm scope.

The single idea to preserve above all others:

> **A framework-free DOM renderer sits _below_ the framework adapters.**
> The engine has no DOM. The renderer has no framework. An adapter is ~4 KB of
> binding with **no grid logic in it**. That is what makes writing the
> accessibility model and the virtualiser once — instead of four times —
> affordable.

Everything else in this document can be revised in a later release. That cannot.

---

## 1. What is settled — do not re-litigate

| Decision | Why |
| --- | --- |
| Separate repo from `oxygenui` | Different release cadence (versioned dependency, not copy-source), different dependency direction, different audience. |
| Monorepo of small packages, not one package | Otherwise a patient directory ships the FHIR adapter, the AI plugin and a WASM bundle. |
| npm scope `@oxygenui-design` | It is the scope we own and publish from. `@oxygenui/*` is **not** ours — ownership was never confirmed. |
| Framework-agnostic core, signals-based | TanStack Table v9 moved to signals and measured +79% row processing and −86% retained heap. TC39 Signals is Stage 1 with Angular, Vue, Solid, Preact and MobX behind it. |
| DOM rendering. **Not canvas.** | Canvas scales beautifully and puts every cell outside the accessibility tree. Disqualifying for an all-day clinical surface under WCAG 2.2 AA. |
| React adapter first; Angular second | Angular is what actually tests the agnosticism claim, and its signals validate the reactivity choice. Vue/Svelte/Qwik are served by a custom element, not by more packages. |
| The grid **hosts** clinical cells, it does not own them | Eight already ship at Stable in `oxygenui`. Two implementations of "is this result critical" that can disagree is the failure this library exists to prevent. |
| Coverage, typed absence, identity safety, disclosure policy, sort provenance, position-stable live updates | The product. No competitor has any of them. |

---

## 2. What changed since the product brief — **important**

`oxygen-data-grid-brief.html` is excellent product research and **four of its
claims are wrong**. If you read it, read this table alongside it.

| The brief says | Correct position | Why |
| --- | --- | --- |
| Budgets up to **1,000,000+ rows client-side** | **Delete it.** Client-side ceiling is ~100k; above that the server owns the set and client mode *refuses with a reason*. | TanStack v9 — the best-measured engine in the category — retains **380 MB for 1M rows × 8 columns**. A clinical grid has forty columns on a 4 GB shared ward workstation. |
| Coverage reads **"Showing 8 of 1,284"** | `Coverage.total` is `number \| "unknown"`, and the sentence must be true when it is unknown. | FHIR servers return opaque `link.next` URLs and the spec forbids constructing your own. `Bundle.total` is optional; several major servers omit or estimate it. Azure returns only `next` — no first/last/previous. So no totals and no page numbers. |
| Pagination is **offset or cursor**, caller's choice | **Cursor is the default.** Offset is the special case for non-FHIR sources. | Against FHIR there is no offset to choose. |
| **AI is a differentiator** | The *features* are table stakes. **Provenance and refusal** are the differentiator. | Syncfusion ships semantic filtering and anomaly detection today; MUI X v9 ships an AI assistant in Premium. |

Two more amendments, both additive:

- **Absence has eight reasons, not seven.** Add `source-unreachable`, so a
  per-cell failure escalates into coverage.
- **The cell host contract has eight obligations, not seven.** Add **mask
  state** — a cell that returns only a flat value cannot tell the export writer
  the value must not leave.

---

## 3. Three security defects to fix before the first export ships

These are defects in the design as written, not feature requests.

1. **CSV formula injection → remote code execution.** A patient's preferred name
   is free text they supply. `=cmd|' /C ...'!A0` in a name field is executed by
   Excel, Sheets and LibreOffice on open. Defence belongs **inside the writer
   with no way to switch it off**; prefer XLSX with typed cells for anything a
   human opens. OWASP's own note: quoting is not sufficient, because Excel can
   strip escaping on save-and-reopen and re-arm the payload — and full-width
   variants (`＝`, `＋`) execute in some locales. Apply the rule after the
   delimiter, not only at field start.
2. **Telemetry can carry PHI.** An exception thrown inside a cell renderer
   conventionally carries the value that caused it. Guarantee by construction
   that errors carry `{ columnKey, rowIndex, code }` and never a value.
3. **No renderer safety contract.** Every competitor lets a custom cell return
   arbitrary markup. Make raw HTML a **type error**: a renderer returns text, a
   token, or a component — never a markup string.

Each needs a test: an export-bytes assertion with the payload in a patient-name
fixture; a throwing renderer asserting the reported payload contains no fixture
string; a masked cell asserting the clipboard.

---

## 4. Five ADRs to write before code

> **Status, 27 August 2026: written.** All five are accepted in
> [`docs/decisions/`](docs/decisions/), plus a sixth for the naming fix below.
> The list here is kept as the record of why each was needed.

The grid inherits `oxygenui`'s accepted decisions. Five of them conflict with
this architecture and each needs an ADR in **this** repo.

1. **The grid never performs network I/O.**
   [ADR 0009](https://github.com/zoworkhq/oxygenui/blob/main/content/decisions/0009-supply-chain-and-component-constraints.md) forbids `fetch`, `XMLHttpRequest` and `WebSocket` in any Oxygen
   package, **lint-enforced**. The grid has a server row model, a FHIR source and
   live updates. The design already complies — the grid takes a caller-supplied
   `dataSource` and receives *pushed* updates — but it is nowhere stated, and the
   lint rule will fire on day one. Write it down.
2. **The grid emits events; it does not emit telemetry.**
   [ADR 0009](https://github.com/zoworkhq/oxygenui/blob/main/content/decisions/0009-supply-chain-and-component-constraints.md) forbids emitting telemetry of any kind. The PHI-safe error contract
   above must be framed as emitting to the caller, who decides what to send.
3. **The signals dependency.**
   [ADR 0009](https://github.com/zoworkhq/oxygenui/blob/main/content/decisions/0009-supply-chain-and-component-constraints.md) requires an ADR for every new runtime dependency. Cover why it is
   behind a façade package (`grid-signals`) so TC39 Signals landing changes one
   file, and why nothing else in core has a dependency.
4. **The grid is npm-only; dual-channel does not apply.**
   [ADR 0002](https://github.com/zoworkhq/oxygenui/blob/main/content/decisions/0002-dual-channel-distribution.md) makes npm + copy-source registry mandatory for every release. A
   15-package grid with cross-dependencies cannot ship copy-source. Write the
   exemption explicitly rather than silently not doing it.
5. **Coverage may report an unknown total.**
   [ADR 0011](https://github.com/zoworkhq/oxygenui/blob/main/content/decisions/0011-summaries-declare-their-boundaries.md) is *accepted* and this amends it. An accepted ADR is amended by a
   superseding ADR, not by a paragraph in an HTML file.

### And one naming fix — my error, fix it before anyone writes a lint rule

> **Settled by [ADR 0006](docs/decisions/0006-the-grids-layers-are-named-not-numbered.md):**
> the grid's layers are named — `foundation / engine / render / domain /
> adapter / plugin` — and `L0`–`L4` is not used in this repository at all.

`oxygenui`'s `ENGINEERING.md` §2 already defines a layer model:

```
L0 foundation → L1 behaviour → L2 components → L3 composition → L4 distribution
```

The architecture review reuses `L0`–`L4` with **different meanings**:

```
L0 foundation → L1 engine → L2 render+domain → L3 adapters → L4 plugins
```

`L1` through `L4` all mean different things in the two documents. A
`dependency-cruiser` rule written against one is wrong for the other. **Rename
the grid's layers** (`engine / render / domain / adapter / plugin` reads better
than a number anyway) or publish an explicit mapping. Do it before the first
lint rule, not after.

---

## 5. Package layout

Fifteen at maturity. **Five ship in wave one.**

| Package | Layer | Budget | Depends on | Wave |
| --- | --- | --- | --- | --- |
| `@oxygenui-design/grid-core` | engine | 22 KB | — | 1 |
| `@oxygenui-design/grid-signals` | engine | 3 KB | grid-core | 1 |
| `@oxygenui-design/grid-dom` | render | 18 KB | grid-core | 1 |
| `@oxygenui-design/grid-react` | adapter | 4 KB | grid-core, grid-dom | 1 |
| `@oxygenui-design/grid-healthcare` | domain | 16 KB | grid-core, grid-dom | 1 |
| `@oxygenui-design/grid-export` | plugin | 7 KB | grid-core | 2 |
| `@oxygenui-design/grid-fhir` | domain | 9 KB | grid-healthcare, fhir | 4 |
| `@oxygenui-design/grid-angular` | adapter | 4 KB | grid-core, grid-dom | 4 |
| `@oxygenui-design/grid-filters` | plugin | 8 KB | grid-core | — |
| `@oxygenui-design/grid-testing` | tooling | — | grid-core | — |
| `@oxygenui-design/grid-devtools` | tooling | — | grid-core | — |
| `@oxygenui-design/grid-codemod` | tooling | — | — | 5 |
| `@oxygenui-design/grid-vue` | adapter | 4 KB | grid-core, grid-dom | 6 |
| `@oxygenui-design/grid-element` | adapter | 6 KB | grid-core, grid-dom | 6 |
| `@oxygenui-design/grid-analytics` | plugin | 5 KB + wasm | grid-core | 6 |
| `@oxygenui-design/grid-ai` | plugin | 6 KB | grid-core, copilot-core | 6 |

**The dependency rule for this repo:** the grid may depend on `oxygenui`'s
foundation packages (`tokens`, `fhir`, `intl`, `utils`) **and nothing above
them**. If it needs anything higher, that thing moves down to the foundation or
is inlined. Enforce with `dependency-cruiser`.

### Tooling — all justified, none for fashion

pnpm workspaces (strict linking catches phantom deps, which matters when the
claim is that core has none) · Turborepo (remote caching, once benchmarks are on
the critical path) · TypeScript project references (fifteen packages without them
means a full rebuild per change) · changesets (independent per-package
versioning) · ESM only (dual-publishing CJS is a permanent tax; add it when a
named customer asks) · conventional commits.

**Not** Nx (Turborepo already does what we need) and **not** a runtime licence
key (user-hostile, trivially removable, and it puts a console warning in a
clinician's browser).

---

## 6. Wave 1 — what to actually build first

Five to six weeks. **Shippable on its own**, and nothing after it changes the
consumer API.

- [ ] Framework-agnostic core with signals
- [ ] Framework-free DOM renderer owning accessibility
- [ ] Column model, row models, sort, filter AST, selection
- [ ] `role="grid"`, roving focus, the 24-binding keymap
- [ ] Required `coverage`, **with the unknown-total form**
- [ ] Typed absence taxonomy (eight reasons)
- [ ] PHI-safe telemetry and error contract
- [ ] Renderer safety contract (no raw HTML, by type)
- [ ] React adapter
- [ ] Bundle, accessibility and performance gates in CI

**Why these ten and not others:** every one is a type-system or DOM-structure
decision. They are cheap now and expensive or impossible to retrofit. A gate
added later never catches the regression that mattered.

Later waves, each separately cancellable: **2** scale and truth (virtualisation
with recycling and anchoring, server contract, cursor pagination, SSR boundary,
the export writer) · **3** clinical shape (cell host contract, catalogue as
cells, grouping, tree, aggregation, arrivals, sort provenance, memory gate) ·
**4** work and disclosure and the Angular adapter · **5** developer product
(docs, playground, codemods) · **6** bets (Vue, analytics, AI, pivot, devtools).

---

## 7. Six conditions on building this

1. **Do not claim framework agnosticism until the second adapter exists.** A
   README listing four frameworks and supporting one loses exactly the engineers
   it is aimed at.
2. **Fix the three security defects before the first export ships.**
3. **Delete the 1M client-side claim; replace it with an explained refusal.**
   Refusing loudly, with a number and a reason, builds more credibility than a
   benchmark table.
4. **Decide the licence and support posture before the repo is public.**
   Recommendation: MIT for everything a security reviewer must read — core,
   signals, DOM, adapters, healthcare, FHIR, export, filters, testing — and a
   separate commercial licence only for an enterprise recipe pack, named in every
   file. **Note the trap:** HyperFormula is GPLv3 unless licensed, so vendoring a
   formula engine would make our position radioactive for exactly the buyers we
   want.
5. **Name a clinician reviewer and budget for them before wave 3.** This is the
   fourth artefact blocked on it. Until then every clinical rule is a
   well-researched proposal and must be labelled as one.
6. **Keep wave 1 shippable alone**, so stopping is a decision rather than a
   failure.

### The condition under which to abandon framework agnosticism

If, at the end of wave 4, the Angular adapter is larger than ~8 KB or contains
any logic the React adapter also contains, the abstraction is in the wrong place.
**Stop at one framework and say so** — do not keep paying a multiplier for a
claim we cannot honour.

---

## 8. What not to build

Keep this list in the repo. Most of these will be proposed again, some annually.

| Not building | Why |
| --- | --- |
| Canvas rendering | Every cell outside the accessibility tree. Faster, and disqualifying. |
| An IoC container or bespoke internal framework | AG Grid's is the clearest cautionary tale in the category. |
| A formula engine or spreadsheet mode in core | HyperFormula is GPLv3; the metaphor invites bulk paste into clinical fields. |
| Terminology content (ICD-10, CPT, SNOMED, LOINC, RxNorm) | Licensed, versioned, jurisdictional clinical data. Bind to a service; never ship the data. |
| Charts inside the grid | A sparkline is a cell. A chart is a different component with a different accessibility model. |
| Audit log storage or retention | A client that records its own access is a client that can choose not to. Emit; the server records. |
| Real-time collaborative editing / CRDTs | A different product. Co-presence indicators already ship. |
| A viewport row model | AG Grid's own docs warn it is over-implemented. |
| Our own virtualisation for the docs site | Use the grid. If it is not good enough for our docs, it is not good enough. |
| A second search surface | `ChartCommandPalette` ships. Compose it. |
| Framework agnosticism beyond four adapters | Svelte, Qwik and Solid are served by the custom element. |
| An enterprise licence key checker | Gate on the registry, not in the bundle. |

---

## 9. Performance budgets

Measured **CPU-throttled on the CI machine**, ratcheted, and failing the build on
regression. The target device is a shared ward workstation — 4 GB, a decade-old
CPU, an EHR and two payer portals already open. Every interaction budget is an
INP budget (≤200 ms at p75).

| Rows | Mode | First paint | Sort | Filter key | Scroll | JS heap |
| --- | --- | --- | --- | --- | --- | --- |
| 1,000 | client | ≤120 ms | ≤40 ms | ≤32 ms | 60 fps | <12 MB |
| 10,000 | client, virtualised | ≤180 ms | ≤120 ms | ≤50 ms | 60 fps | <45 MB |
| 100,000 | server ops, windowed | ≤200 ms | server | ≤50 ms | 60 fps | <70 MB |
| 500,000 | server ops, cursor | ≤200 ms | server | ≤50 ms | 60 fps | <70 MB |
| 1,000,000+ | **server only** | ≤200 ms | server | ≤50 ms | 60 fps | <90 MB |
| 100+ cols | column virtualisation | ≤200 ms | ≤120 ms | ≤50 ms | 60 fps | +8 MB |
| 1k upd/s | streaming | — | — | — | 60 fps | flat |

**Client mode refuses above a measured row-count constant** — throws in
development, degrades to server mode in production. The constant is *measured on
the CI machine at the density where the budget breaks*, never chosen. A silent
four-second sort is worse than a clear error.

---

## 10. Still open

Two of the five listed here were settled by ADRs and one by a measurement; they
are kept below, struck through, because a list that only ever grows teaches
people to stop reading it.

- **The clinician reviewer.** Blocking wave 3 and the clinical safety copy.
  `GridDoseCell` is not implemented and throws, and five shipped cells make no
  clinical claim *by construction* — which is an argument, not a review.
- **The behavioural-health weighting.** Four of fourteen recipes assume a
  behavioural-health buyer. Flagged in three documents without an answer. If the
  buyer is general digital health, the right shape is two BH recipes and two more
  in revenue-cycle — and that changes what wave 3 builds.
- ~~**Licence and support posture.**~~ Settled: MIT throughout, no commercial
  split until there is something built to split
  ([0009](docs/decisions/0009-the-licence-is-mit-and-the-support-posture-is-stated.md)).
- ~~**The client-mode refusal constant.**~~ Measured.
  `DEFAULT_CLIENT_ROW_CEILING` is 100,000, and the device profiler records what
  each engine actually reaches — chromium 50,000 · firefox 50,000 · webkit
  100,000 · 10,000 at 4x throttle · 1,000 at 8x. Those numbers are from a
  developer machine, not a ward workstation; that part is still open, and is
  hardware rather than a decision.
- ~~**Transposed layout**~~ Settled: a second component, `GridFlowsheet`,
  sharing `grid-core` and the cell contract with its own column-major geometry
  ([0010](docs/decisions/0010-what-wave-six-is-not.md)). Adding a component
  later is additive; removing a `layout` prop is not.

---

## 11. Housekeeping in the `oxygenui` repo

Not blocking, but each is wrong today and cheap to fix:

- `README.md:370` says *"Nothing is published to npm yet."* False —
  `@oxygenui-design/fhir@0.1.1` has been on npm since 5 August 2026.
- [ADR 0003](https://github.com/zoworkhq/oxygenui/blob/main/content/decisions/0003-package-topology.md) names 14 of 16 packages `@oxygenui/*`, which is not the owned scope.
- No `oxygenui` document mentions a data grid at all — zero hits across README,
  ARCHITECTURE, ENGINEERING, OXYGEN-UI-AUDIT and CHANGELOG. Worth a line in
  ARCHITECTURE.md pointing here.
- `oxygen-data-grid-brief.html` and `oxygen-datagrid-architecture-review.html`
  are both uncommitted at the `oxygenui` root. Consider moving them into this
  repo under `docs/research/` — they are the source material for everything
  above, and §2 of this document is the errata for the first one.

---

## 12. Provenance

Both source reports are generated, not hand-written; the generators live in an
**ephemeral session scratchpad** and will not survive. If the reports are worth
keeping, the generators are worth committing with them — this is the sixth brief
in this series with that exposure.

Neither report has been reviewed by a clinician. Every clinical rule in them is
derived from published literature and general knowledge. Label it that way on
every surface until that changes.
