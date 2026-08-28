# 0010 — Four wave-six bets, declined or reshaped

**Status:** accepted · 28 August 2026

> **Relates to:** [0006](0006-the-grids-layers-are-named-not-numbered.md) (layer names),
> [0008](0008-what-a-cell-may-decide.md) (what a cell may decide)
>
> **Resolves:** the transposed-layout question left provisional in
> [`HANDOVER.md` §10](../../HANDOVER.md), and the wave-six items in the roadmap

## Context

Wave six was written as *bets*: separately cancellable, none on the critical
path. The plan deliberately did not decide them, because deciding a bet before
you have evidence is just guessing earlier.

There is evidence now. Waves one to four are built, the performance harnesses
run, and both adapters are under 600 bytes with a parity test enforcing it. Four
of these can be settled, and settling them is worth more than leaving them open
— an undecided bet keeps getting re-proposed, and each re-proposal costs a
conversation.

## Decision

### 1 · The transposed layout is a second component, not a `layout` prop

A flowsheet is analytes down and time across; a MAR is orders down and
administration times across. The temptation is `layout="transposed"` on the
existing grid.

**Rejected, on evidence rather than taste.** The virtualiser's geometry is
row-major by construction: a Fenwick tree over row heights, a recycling pool
keyed on row identity, a focus model whose primary axis is the row. Making all
three axis-agnostic doubles the complexity of the hardest and most safety-
critical code in the library, for one recipe family — and it makes every future
change to the virtualiser a change to two modes.

`GridFlowsheet` will be a separate component sharing `grid-core` and the
`grid-dom` cell contract, with its own column-major geometry. It can be wrong
without taking the roster down with it.

This is the API break the plan warned about, decided in the cheap direction:
adding a component later is additive, removing a `layout` prop is not.

### 2 · The Arrow / DuckDB-WASM analytics plugin is declined for now

It is real, it is the only credible client-side answer above 100,000 rows, and
nobody in this category ships it. It is still the wrong thing to build next.

The client-mode refusal already answers "what happens above 100k": the server
owns the set, and it says so. That is the *safer* answer for a clinical surface,
not a worse one — a query the server ran is a query the server can log, and a
cohort the server assembled is one an audit can reconstruct.

Against that, a multi-megabyte WASM payload on a 4 GB shared workstation
contradicts the performance thesis the whole library is organised around. We
would be shipping the thing the budgets exist to prevent.

**Wait for a named customer who has the workstation and the use case.** Recorded
here so the idea is parked with its reasoning rather than forgotten.

### 3 · The AI plugin ships its differentiator and not its features

The review is explicit: the AI *features* are table stakes — Syncfusion and MUI
both ship them — and **provenance and refusal are the differentiator**.

So the differentiator ships and the features do not:

- **Refusal**: natural language compiles to the same `FilterNode` AST as
  everything else, and a query that cannot be compiled **runs nothing** and says
  which part it could not express. That needs no model; it needs the compiler
  that `grid-fhir` already proves the shape of.
- **Provenance**: an AI-derived value is structurally distinguishable from a
  verified one, so no renderer can accidentally present one as the other.

The model integration waits for `copilot-core`, which does not exist in this
workspace. Building against an absent dependency would mean inventing its API
and then discovering we were wrong.

### 4 · Vue gets the custom element, not a package

`grid-element` is 585 bytes, works in Vue today, and the parity test already
holds it to React's accessibility tree. A dedicated Vue package would add a
release surface, a test matrix and a documentation page to bind refs to signals
— for a framework already served.

**On evidence of demand, not on symmetry.** The line for a two-person team.

### 5 · Pivot is deferred with the server contract it needs

Pivot is server-side only, per the plan, and there is no server pivot contract
to build against. It is deferred until there is a source that can serve one,
rather than half-built against a shape we guessed.

## Consequences

**Good.** Four recurring conversations are closed with reasons attached, which
is the actual output of a decision record.

**Good.** The AI split delivers the part that differentiates without taking a
dependency on a package that does not exist. Refusal is testable today.

**Cost.** Declining DuckDB forgoes the one capability nobody else has. If a
competitor ships in-browser columnar analytics and it lands, this record is the
thing to revisit first, and it will look slow in hindsight.

**Cost.** A separate flowsheet component means two virtualisers eventually. That
is the price of not making one virtualiser twice as hard, and it is the cheaper
half.

**Rejected: deciding none of these and leaving wave six open.** An undecided bet
is re-proposed indefinitely, and each re-proposal costs the same conversation
with none of the evidence written down.
