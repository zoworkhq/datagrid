# 0005 — Coverage may report an unknown total

**Status:** accepted · 27 August 2026

> **Amends [Oxygen ADR 0011](https://github.com/zoworkhq/oxygenui/blob/main/content/decisions/0011-summaries-declare-their-boundaries.md)**
> (a component that summarises a set declares the set's boundaries), which is
> *accepted*. The obligation stands in full; one field's type changes and the
> rendering rules extend. Nothing here weakens the requirement.
>
> **Relates to:** [0001](0001-the-grid-never-performs-network-io.md) (no network I/O),
> [Oxygen ADR 0001](https://github.com/zoworkhq/oxygenui/blob/main/content/decisions/0001-fhir-typed-props.md) (FHIR-typed props)
>
> **Deliberation:** [`2026-08-27-architecture-review.html`](../research/2026-08-27-architecture-review.html)
> §06 (missing capabilities discovered), §15 (FHIR and interoperability)

## Context

Oxygen ADR 0011 requires that a component rendering a subset of a larger set
take a required, undefaulted description of that set and render it in a fixed
place, in words, in print. The grid is the case that record was written about —
it names the worklist and the results list explicitly as the next components to
meet the same question.

The product brief carried that through into a flagship sentence:

> Showing 8 of 1,284

Investigating FHIR properly before writing code found that this sentence
**cannot be said against a large share of real FHIR servers**, and that no
amount of client work makes it available:

- **Paging is opaque.** A server returns a `link.next` URL and the specification
  is explicit that a client must not construct its own paging URLs. There is no
  offset to increment and therefore no arithmetic that yields a page number.
- **`Bundle.total` is optional.** Major servers omit it, and some return an
  estimate rather than a count — which is worse than omitting it, because an
  estimate rendered as a total is a false claim in a component whose entire
  purpose is to make claims checkable.
- **Azure Health Data Services returns only `next`** — no `first`, `last` or
  `previous`. Even "previous" must degrade.
- **`_count` is capped**, commonly at 100. The page size is negotiated, not
  chosen; the grid must accept a smaller page than it asked for.

So the honest position is not a smaller number or a better estimate. It is that
for a real and permanent class of sources, **the total is unknown, and saying so
is the only true sentence available**.

The failure this prevents is specific. A clinician filters a caseload, sees
twenty rows and a confident "Showing 20 of 20", and concludes that twenty
clients are overdue for review. The server capped `_count` at 20, reported no
total, and there are ninety. Nothing was wrong on screen — which is the exact
sentence Oxygen ADR 0011's context section uses about the timeline, one layer
further out.

## Decision

**`Coverage.total` is `number | "unknown"`, and every surface that renders it
must be true when it is unknown.**

1. **The type changes; the requirement does not.** `coverage` remains required
   with no default, `sources` remains a non-empty tuple, it still renders in a
   fixed place, in words, and it still prints. There is still no
   `hideCoverage`. Oxygen ADR 0011's five other clauses apply unchanged.

2. **`"unknown"` is a value, not an absent field.** `total?: number` was
   available and is rejected below. An absent field reads as *we forgot to pass
   it*; `"unknown"` reads as *we asked and the server does not know*. Only the
   second is a claim, and this record exists to keep it a claim.

3. **The unknown sentence states what is known and stops.** "Showing 20 of 20
   loaded, more available; 3 excluded as restricted; as of 09:12" — never
   "Showing 20 of many", never "20+", never an estimate rendered as a count. The
   sentence is produced by one exported `describeCoverage`, so the print header,
   the CSV header and the audit record carry the same words.

4. **`aria-rowcount="-1"` is the correct value when the total is unknown**, per
   the ARIA specification, and is asserted by test rather than left to the
   renderer's discretion. `aria-rowindex` remains absolute in every case.

5. **Pagination renders from a capability model, not a fixed button set.**
   `GridDataSource.capabilities` declares `total: "exact" | "estimate" | "none"`
   and `paging: "offset" | "cursor" | "forward-only"`. An `"estimate"` total is
   rendered with its uncertainty in words or not at all; it is never rendered as
   a count. Jump-to-page and "last" exist only when the capability says so.

6. **Cursor is the default paging model** and offset is the special case for
   non-FHIR sources — the inverse of the brief's position, because against FHIR
   there is no offset to choose.

7. **An unreachable source escalates into coverage.** `source-unreachable` is
   the eighth reason in the absence taxonomy, and a cell that carries it makes
   its source's status non-`ok` in the coverage line. This is Oxygen ADR 0011's
   clause 4 — a failed source becomes an interruption, `role="alert"` — reached
   from a per-cell failure rather than from a top-level fetch.

8. **A sort the server ignored is a coverage-class failure, not a UI state.**
   `capabilities.sortableKeys` declares what the server will honour; a sort
   outside it is refused with a reason rather than rendered as a sorted header
   over an unsorted list. Once the column is a risk score, a false sort claim is
   a clinical claim.

## Consequences

**Good.** The claim survives contact with real servers. A safety control that is
true only against a cooperative backend is not a safety control, and the version
in the brief would have been quietly false at the first Azure deployment.

**Good.** It makes the FHIR package possible without an exception. `grid-fhir`
derives coverage from the `Bundle` — including what it could not map, which is
the obligation Oxygen ADR 0011 clause 6 already places on adapters — and needs
no escape from the type.

**Good.** The `"unknown"` case is now a first-class tested path rather than a
theoretical one, which is what makes `aria-rowcount="-1"` a test in wave 1
instead of a bug found by a screen-reader user in wave 4.

**Cost.** A large class of sources gets no "of N", no jump-to-page and no last
page, permanently. Product will ask for these repeatedly, and the answer each
time is that the specification forbids the arithmetic. That conversation is
cheaper than the alternative, but it recurs.

**Cost.** Two rendering paths for every coverage surface — known and unknown —
across the coverage bar, the print header, the export header and the live
region. Mitigated by `describeCoverage` being the only place the sentence is
built.

**Cost.** Consumers who genuinely have an exact total must now write
`total: 1284` where a bare number was previously implied, and the union will
surface in their own code. That is the type system doing its job, and it is a
one-character-wider annotation.

**Rejected: `total?: number`.** Optionality reads as forgetfulness. The whole
apparatus of Oxygen ADR 0011 rests on the difference between *not stated* and
*stated as unknown*, and an optional field erases exactly that difference —
in the one field where it matters most.

**Rejected: estimating the total from page size × pages seen.** It would be the
component inventing a claim, which Oxygen ADR 0011 already rejected under
"inferring gaps from the data". An estimate rendered in the position where
readers expect a count is a false count, and the reader has no way to tell.

**Rejected: falling back to offset paging to obtain a total.** The specification
forbids constructing paging URLs, and a server that tolerates it today may not
next release. The grid would be deriving its central safety claim from
undefined behaviour.

**Rejected: rendering "Showing 20 of many" or "20+".** Both read as quantities.
"More available" is a fact; "many" is a flourish that a clinician will convert
into an impression of scale, and the impression is not ours to create.
