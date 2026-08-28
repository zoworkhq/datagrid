<div align="center">

<h1>Oxygen&nbsp;Data&nbsp;Grid</h1>

**The data grid that knows a row is a person.**

A framework-agnostic, virtualised enterprise data grid with a healthcare layer<br />
built in — for EHR, behavioural-health, clinical, operational and billing workflows.

<sub>
<img alt="engine 6.8 KB of a 22 KB budget" src="https://img.shields.io/badge/engine-6.8%20KB%20%2F%2022%20KB-0E7C66.svg" />
<img alt="React adapter 456 bytes" src="https://img.shields.io/badge/react%20adapter-456%20B-0E7C66.svg" />
<img alt="one external runtime dependency" src="https://img.shields.io/badge/runtime%20deps-1-0E7C66.svg" />
<img alt="329 tests" src="https://img.shields.io/badge/tests-329-0E7C66.svg" />
<img alt="7 accepted decision records" src="https://img.shields.io/badge/ADRs-7%20accepted-0E7C66.svg" />
<img alt="not published to npm" src="https://img.shields.io/badge/npm-not%20published-b7791f.svg" />
<img alt="MIT, provisional" src="https://img.shields.io/badge/license-MIT%20(provisional)-blue.svg" />
</sub>

</div>

---

> ### Nothing here is published, and one thing is unreviewed
>
> Every package is `private: true`. Publication is blocked on a licence and
> support decision that has not been made — see [Status](#status).
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

**Two adapters ship today: React and the custom element.** Angular and Vue do
not exist, and this README will not list them until they do.

## Architecture

```
grid-core  →  grid-dom  →  react · element        (angular · vue: not built)
 (signals,     (DOM, ARIA,      (~500 B each,
  no DOM)       focus,           no grid logic)
                recycling)
```

A framework-free DOM renderer sits **below** the framework adapters, so the
accessibility model and the virtualiser are written once rather than once per
framework. That is the decision the whole repository is organised around.

It is enforced, not asserted: one accessibility-tree assertion runs against
every adapter and compares *every* `aria-*` attribute, so the moment an adapter
starts making its own ARIA decisions it fails. Both adapters are under
600&nbsp;bytes because there is nothing in them to be large.

| Package | Layer | Size | Budget |
| --- | --- | --- | --- |
| [`grid-core`](packages/grid-core) | engine | 6.82 KB | 22 KB |
| [`grid-signals`](packages/grid-signals) | engine | 1.66 KB | 3 KB |
| [`grid-dom`](packages/grid-dom) | render | 4.88 KB | 18 KB |
| [`grid-healthcare`](packages/grid-healthcare) | domain | 449 B | 16 KB |
| [`grid-fhir`](packages/grid-fhir) | domain | 1.66 KB | 9 KB |
| [`grid-react`](packages/grid-react) | adapter | 456 B | 4 KB |
| [`grid-element`](packages/grid-element) | adapter | 585 B | 6 KB |
| [`grid-export`](packages/grid-export) | plugin | 2.76 KB | 7 KB |

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

**Gated in CI.** Types · 329 tests · 15 layer rules · per-package size budgets ·
structural axe · a memory-leak gate over 200 mount/unmount cycles · engine and
browser performance harnesses.

**Not built.** The clinical cell catalogue, sort-provenance copy and the
disclosure policy — all held on a clinician reviewer. The Angular and Vue
adapters. Docs site, playground, codemods. Everything in wave 6.

**Not decided.** Licence and support posture, which blocks publishing ·
behavioural health versus general digital health, which changes which recipes
get built · the Angular build toolchain · the client-mode refusal constant,
which needs a real ward workstation.

Read [`HANDOVER.md`](HANDOVER.md) for the full context, and
[`docs/decisions/`](docs/decisions/) for the seven records that gate the code.

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

## Development

```bash
pnpm install && pnpm gate
```

`gate` runs typecheck, tests, layer rules and size budgets. `pnpm bench` and
`pnpm bench:browser` run the performance harnesses.

## Repository layout

```
HANDOVER.md              the seed context — read this first
packages/                eight packages across five layers
bench/                   engine and browser performance harnesses
docs/
├─ decisions/            seven ADRs, accepted — the ones that gate code
└─ research/             the product brief and architecture review, and the
                         Python sources both are generated from
```

## Related

[zoworkhq/oxygenui](https://github.com/zoworkhq/oxygenui) — the component
library this grid composes over. It supplies the design tokens, the FHIR types,
the terminology layer and eight clinical cell components the grid will host
rather than reimplement.

## License

MIT — see [LICENSE](LICENSE). **Provisional.** The intended split is MIT for
everything a security reviewer must read, with a separate commercial licence
only for an enterprise recipe pack. That decision is not made, and no package
publishes until it is ([`HANDOVER.md`](HANDOVER.md) §7).

Support posture is likewise undecided. Until it is stated, assume none.
