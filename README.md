<div align="center">

<h1>Oxygen&nbsp;Data&nbsp;Grid</h1>

**The data grid that knows a row is a person.**

A framework-agnostic, virtualised enterprise data grid with a healthcare layer<br />
built in — for EHR, behavioural-health, clinical, operational and billing workflows.

<sub>
<img alt="engine 7.3 KB of a 22 KB budget" src="https://img.shields.io/badge/engine-7.3%20KB%20%2F%2022%20KB-0E7C66.svg" />
<img alt="React adapter 456 bytes" src="https://img.shields.io/badge/react%20adapter-456%20B-0E7C66.svg" />
<img alt="one external runtime dependency" src="https://img.shields.io/badge/runtime%20deps-1-0E7C66.svg" />
<img alt="430 tests" src="https://img.shields.io/badge/tests-430-0E7C66.svg" />
<img alt="11 accepted decision records" src="https://img.shields.io/badge/ADRs-11%20accepted-0E7C66.svg" />
<img alt="not published to npm" src="https://img.shields.io/badge/npm-not%20published-b7791f.svg" />
<img alt="MIT" src="https://img.shields.io/badge/license-MIT-blue.svg" />
</sub>

</div>

---

> ### Nothing here is published, and one thing is unreviewed
>
> Every package is `private: true`. The licence question is
> [settled](docs/decisions/0009-the-licence-is-mit-and-the-support-posture-is-stated.md) —
> MIT, everything — but publishing is a deliberate act nobody has performed,
> because a first publish claims names on a public registry.
>
> **No clinician has reviewed the clinical layer.** Every clinical rule in this
> repository is derived from published literature and general knowledge, and is
> labelled that way. The parts that need a reviewer are deliberately unbuilt.

---

## Why this exists

Most data grids render a value. They have no opinion about a result that came
back preliminary, a reference range that does not exist, a record flagged
restricted, or a filter someone set six days ago and forgot.

In healthcare those are the normal working set, and each one fails the same way:
**it renders perfectly and says something false.**

Three things no other grid in the category does:

**It declares what the query did not reach.** A required `coverage` prop,
rendered in a fixed place, and printed. A filtered list looks complete — *"no
results"* is otherwise indistinguishable from *"no patients have this problem"*.
`Coverage.total` is `number | "unknown"`, because a FHIR server often cannot
tell you, and the sentence has to stay true when it does not.

**Every empty cell carries a typed reason.** Not ordered, not resulted, not
measured, not applicable, declined, specimen problem, withheld, source
unreachable — eight reasons, eight different next actions. A blank cell is
otherwise indistinguishable from a rendering bug.

**It refuses rather than guessing.** Aggregating 5&nbsp;mg and 2&nbsp;mL returns
a reason, not `7`. A filter that FHIR search cannot express is refused by name
rather than approximated, because a silently narrowed cohort looks exactly like
a correct answer. A branch that failed to load renders as *failed*, never as
empty.

## What this library does not do

**It does not make an application HIPAA, GDPR or DPDP compliant.** It is not
clinical decision support and it is not a medical device. It renders a policy;
it does not decide one and it cannot enforce one. It cannot prevent a
screenshot, a photograph of a screen, or a forwarded export. Access control,
audit storage, data residency and clinical validation remain the application's.

It helps you build a compliant system. It is not one.

**Full API guide: [docs/api.md](docs/api.md)** — choosing a row model, cell renderers, streaming, paging, PHI handling and the measured performance budgets.

## Quick start

```tsx
import { DataGrid } from "@oxygenui-design/grid-react";
import { describeCoverage, type Coverage } from "@oxygenui-design/grid-healthcare";

const coverage: Coverage = {
  sources: [{ id: "ehr", label: "This application", status: "ok" }],
  total: "unknown",          // the server does not report one, and we say so
  loaded: patients.length,
  asOf: "09:12",
};

<>
  <p>{describeCoverage(coverage)}</p>
  {/* "Showing 2 loaded, more may be available; as of 09:12" */}

  <DataGrid
    label="Patient roster"
    model={{
      columns: [
        { key: "name", header: "Patient", sortable: true },
        { key: "potassium", header: "Potassium" },
      ],
      rows: patients.map((row, index) => ({ id: row.id, row, index })),
      total: coverage.total,
      sort: [],
      selection: [],
      focus: null,
    }}
    fallback={(row, key) => ({ kind: "text", text: String(row[key] ?? "") })}
    onAction={(action) => console.log(action)}
  />
</>
```

That snippet is
[`readme-example.test.tsx`](packages/grid-react/src/readme-example.test.tsx).
It compiles and runs in CI, so it cannot go stale without the build breaking.

There is no `<DataGrid url="…" />`. The grid never performs network I/O — it
takes a data source you supply and receives pushed updates
([ADR 0001](docs/decisions/0001-the-grid-never-performs-network-io.md)).

<details>
<summary>Without a framework — <code>&lt;ox-data-grid&gt;</code></summary>

```js
import { defineDataGrid } from "@oxygenui-design/grid-element";

defineDataGrid();

const grid = document.createElement("ox-data-grid");
grid.label = "Patient roster";
grid.fallback = (row, key) => ({ kind: "text", text: String(row[key] ?? "") });
grid.model = model;
grid.addEventListener("ox-action", (e) => console.log(e.detail));
document.body.append(grid);
```

Light DOM, deliberately: a shadow boundary cuts the design-token cascade and
breaks forced-colors inheritance, and both matter more here than encapsulation.
This is also the answer for Svelte, Qwik, Solid and vanilla.

</details>

**Three adapters ship: React, Angular and the custom element.** The largest is
1.09 KB. Vue is [declined](docs/decisions/0010-what-wave-six-is-not.md) — the
custom element already serves it.

## Architecture

```
grid-core  →  grid-dom  →  react · angular · element      (vue: declined)
 (signals,     (DOM, ARIA,      (456 B · 1.09 KB · 585 B,
  no DOM)       focus,           no grid logic in any)
                recycling)
```

A framework-free DOM renderer sits **below** the framework adapters, so the
accessibility model and the virtualiser are written once rather than once per
framework. That is the decision the whole repository is organised around.

It is enforced, not asserted. One accessibility-tree assertion runs across
adapters comparing *every* `aria-*` attribute, and a second test reads the built
Angular bundle and fails if any of the grid's own vocabulary — `aria-rowindex`,
`localeCompare`, `scrollTop` — appears in it. The adapters are small because
there is nothing in them to be large
([ADR 0011](docs/decisions/0011-framework-agnosticism-holds.md)).

| Package | Layer | Size | Budget |
| --- | --- | --- | --- |
| [`grid-core`](packages/grid-core) | engine | 7.34 KB | 22 KB |
| [`grid-signals`](packages/grid-signals) | engine | 1.66 KB | 3 KB |
| [`grid-dom`](packages/grid-dom) | render | 4.94 KB | 18 KB |
| [`grid-healthcare`](packages/grid-healthcare) | domain | 2.13 KB | 16 KB |
| [`grid-fhir`](packages/grid-fhir) | domain | 1.66 KB | 9 KB |
| [`grid-react`](packages/grid-react) | adapter | 456 B | 4 KB |
| [`grid-angular`](packages/grid-angular) | adapter | 1.09 KB | 8 KB |
| [`grid-element`](packages/grid-element) | adapter | 585 B | 6 KB |
| [`grid-export`](packages/grid-export) | plugin | 2.76 KB | 7 KB |
| [`grid-codemod`](packages/grid-codemod) | tooling | 1.68 KB | 12 KB |
| [`grid-clipboard`](packages/grid-clipboard) | plugin | 1.05 KB | 5 KB |
| [`grid-devtools`](packages/grid-devtools) | plugin | 893 B | 6 KB |
| [`grid-ai`](packages/grid-ai) | plugin | 868 B | 6 KB |

Brotlied, each package's own code. **One external runtime dependency in the
whole workspace** — `alien-signals`, imported by exactly one file so that TC39
Signals landing changes one package
([ADR 0003](docs/decisions/0003-the-signals-dependency.md)).

## Status

Waves 1 and 2 are complete. Waves 3 and 4 are complete except for the parts that
need a decision.

**Built.** Signals engine · framework-free renderer with node recycling and
scroll anchoring · virtualisation geometry with Fenwick-tree offsets,
property-tested at 40,000 rows · row models with cancellation and an explained
refusal · grouping, trees, and aggregation that refuses incompatible units ·
position-stable live updates with an arrivals queue · coverage, the absence
taxonomy and disclosure types · serialisable views with a precedence chain ·
selection algebra with drift detection · bulk review · CSV, XLSX and the print
sheet · the FHIR source · SSR with adoption.

**Gated in CI.** Types · 430 tests · 15 layer rules · per-package size budgets ·
structural axe · a memory-leak gate over 200 mount/unmount cycles · engine and
browser performance harnesses.

**Not built.** The clinical cell catalogue, sort-provenance copy and the
disclosure policy — all held on a clinician reviewer. The Angular and Vue
adapters. Docs site, playground, codemods. Everything in wave 6.

**Decided, and recorded.** MIT throughout, with no commercial split until
there is something built to split ([0009](docs/decisions/0009-the-licence-is-mit-and-the-support-posture-is-stated.md)).
The transposed layout is a second component rather than a `layout` prop;
DuckDB-WASM and a Vue package are declined with reasons; the AI plugin ships
provenance and refusal and not the model ([0010](docs/decisions/0010-what-wave-six-is-not.md)).

**Still open, and named rather than glossed.** The clinical reviewer, which is
the one thing here nobody can decide their way out of — `GridDoseCell` is not
built, and five shipped cells make no clinical claim *by construction*, which is
an argument rather than a review. `grid-angular` is not in the parity harness
([why](docs/decisions/0011-framework-agnosticism-holds.md)). And both
performance ratchets self-skip until a linux baseline is recorded on a runner,
so those two CI steps measure and print rather than gate.

Read [`HANDOVER.md`](HANDOVER.md) for the full context, and
[`docs/decisions/`](docs/decisions/) for the eleven records that gate the code.

### On the gates

Several have been deliberately broken to confirm they fail. That is not
ceremony: on three separate occasions a gate reported clean while the thing it
guarded was broken — the layer rules did not fire on an undeclared import, the
cross-adapter parity test compared a hand-picked attribute list, and the
scroll-scaling test counted rendered cells while paint scanned every row.
**A gate that has never been seen to fail has not been tested.**

The browser harness found an O(rows) scan in the scroll path on the day it was
written: at 100,000 rows, 60 of 60 frames dropped, now 2. It is CPU-throttled
Chromium, and it is **not** a ward workstation — the numbers are a floor on how
bad things get, not a prediction.

## What this is not

| Not building | Why |
| --- | --- |
| Canvas rendering | Faster, and puts every cell outside the accessibility tree. Disqualifying for an all-day clinical surface. |
| A formula engine or spreadsheet mode | HyperFormula is GPLv3 unless licensed, and the metaphor invites bulk paste into clinical fields. |
| Terminology content | ICD-10, CPT, SNOMED, LOINC and RxNorm are licensed, versioned, jurisdictional clinical data. Bind to a service; never ship the data. |
| Audit log storage | A client that records its own access is a client that can choose not to. We emit; the server records. |
| An IoC container | AG Grid's is the clearest cautionary tale in the category. |
| Charts inside the grid | A sparkline is a cell. A chart is a different component with a different accessibility model. |

The [full list](HANDOVER.md) is kept in the repository because most of these
will be proposed again, some annually.

## Migrating

```ts
import { migrate, describeMigration } from "@oxygenui-design/grid-codemod";

const result = migrate(source, "antd");   // or "mui"
console.log(describeMigration(result));
```

It renames what means the same thing, **leaves what does not** with the reason
attached, and refuses to write a `coverage` claim. A codemod that filled that in
would manufacture a false completeness claim across every table in a codebase,
in one commit nobody reads line by line — so it emits a placeholder that does not
compile, and a person supplies the truth.

## Development

```bash
pnpm install && pnpm gate
```

`gate` runs typecheck, tests, layer rules and size budgets. `pnpm bench` and
`pnpm bench:browser` run the performance harnesses.

## Repository layout

```
HANDOVER.md              the seed context — read this first
packages/                thirteen packages across five layers
bench/                   engine and browser performance harnesses
docs/
├─ decisions/            eleven ADRs, accepted — the ones that gate code
└─ research/             the product brief and architecture review, and the
                         Python sources both are generated from
```

## Related

[zoworkhq/oxygenui](https://github.com/zoworkhq/oxygenui) — the component
library this grid composes over. It supplies the design tokens, the FHIR types,
the terminology layer and eight clinical cell components the grid will host
rather than reimplement.

## License

MIT — see [LICENSE](LICENSE). Every package, including the healthcare and FHIR
layers. There is no dual licence and no commercial pack: splitting a licence
around a product nobody has built means guessing at the seam, and the audience
here is a security reviewer who should be able to read all of it
([ADR 0009](docs/decisions/0009-the-licence-is-mit-and-the-support-posture-is-stated.md)).

**Support posture, stated plainly:** issues are triaged weekly. Support is not
guaranteed and is not a contract. Silence would imply an SLA nobody agreed to.
