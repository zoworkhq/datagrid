# 0002 — The grid emits events; it does not emit telemetry

**Status:** accepted · 27 August 2026

> **Relates to:** [Oxygen ADR 0009](https://github.com/zoworkhq/oxygenui/blob/main/content/decisions/0009-supply-chain-and-component-constraints.md)
> (no telemetry, no logging of props), [0001](0001-the-grid-never-performs-network-io.md)
> (no network I/O), [Oxygen ADR 0011](https://github.com/zoworkhq/oxygenui/blob/main/content/decisions/0011-summaries-declare-their-boundaries.md)
> (summaries declare their boundaries)
>
> **Deliberation:** [`2026-08-27-architecture-review.html`](../research/2026-08-27-architecture-review.html)
> §06 (missing capabilities discovered), §16 (security and privacy architecture)

## Context

Oxygen ADR 0009 forbids a component from emitting telemetry or analytics of any
kind, and separately forbids `console.*` with a prop-derived argument — with the
reason stated plainly: *a component logging a `Patient` writes PHI to a browser
console and, through error reporting, onward to a third-party service.*

The grid is where that rule stops being about `console.log`.

An exception thrown inside a cell renderer conventionally carries the value that
caused it. That is not bad practice; it is what every error message in the
JavaScript ecosystem does, and it is what a developer needs in order to fix the
bug. `Cannot read property 'value' of undefined` is useless;
`Cannot format quantity "3.7 mmol/L" for patient 4471-882` is actionable — and
is a lab result and an identifier in a third-party error-tracking service, with
a retention policy nobody in this project has read.

The path is short and entirely conventional. A renderer throws. The framework's
error boundary catches it. The application's Sentry integration reports it. The
value is in the stack frame, the error message, or the component props snapshot,
and it is now stored in Ireland or Oregon under someone else's DPA.

Nothing in the previous design prevented this, no competitor addresses it, and
it is a question a healthcare buyer's security review will certainly ask —
because it is the failure mode that produces a breach notification without
anyone having been attacked.

## Decision

**Every object the grid hands to the caller carries coordinates, never
content.**

1. **The error contract is `{ code, columnKey, rowIndex, phase }` and admits no
   value field.** `code` is a stable string from a closed union. `columnKey` is
   the developer's own column identifier. `phase` is where it happened —
   `measure`, `render`, `compare`, `export`, `print`. There is no `value`, no
   `row`, no `props` and no `cause` carrying either.

2. **It is `rowIndex`, not `rowId`.** A `rowKey` in this library is very often
   an MRN, an NHS number or an account number, because that is what the
   application already has. An index is positional and meaningless outside the
   current query; an identifier is a direct identifier. The distinction is the
   whole point of the field and is asserted by a test.

3. **The grid throws its own error type, and swallows the original.** A
   renderer's thrown error is caught at the cell boundary, its `message` and
   `stack` are discarded, and a `GridError` is emitted in its place. The
   discarded original is available **only** through the devtools panel, which
   runs in the developer's browser and has no transport ([0001](0001-the-grid-never-performs-network-io.md)).

4. **Emission is to the caller, never outward.** `onError`, `onAction`,
   `onQueryChange` and `onDisclosure` are props. The application decides what,
   if anything, reaches a service, and is the only party that knows whether its
   Sentry instance is inside its BAA. The grid ships no integration with any
   analytics or error-reporting vendor and never will.

5. **`onDisclosure` is an audit *feed*, not an audit *log*.** It fires for view,
   expand, inspect, export, print and copy, carrying the same coordinate shape.
   The server records it. A client that stores its own access record is a client
   that can choose not to.

6. **Three enforcement mechanisms, because prose is not one.** A lint rule
   forbidding a value-typed field on any exported error or event type; a
   type-level constraint making `GridError` structurally closed; and a test that
   throws a fixture string from inside a renderer and asserts the reported
   payload does not contain it.

## Consequences

**Good.** The claim is testable in bytes rather than argued in review. The
security test is three lines and it fails loudly the first time somebody adds a
helpful `value` field to an error type.

**Good.** It composes with the disclosure model without a second vocabulary.
Audit events and error events have the same shape, so the application's handler
that redacts, batches or forwards is written once.

**Good.** It survives the adapters. Because the contract is in `grid-core` and
the boundary is in `grid-dom`, a React error boundary, an Angular
`ErrorHandler` and the custom element all receive the same object — which is
what makes the cross-adapter parity test meaningful here rather than only for
accessibility.

**Cost.** Debugging a cell renderer is genuinely harder. `column "potassium",
row 418, phase "measure"` requires the developer to go and look at row 418,
where the value would have told them immediately. This is a real, daily,
permanent tax on developer experience, accepted deliberately, and it is why the
devtools panel is a P1 rather than a nice-to-have: it is the compensating
control.

**Cost.** A row index is unstable across a re-sort or a live update, so an error
reported and read five minutes later may point at a different row. The
`onError` payload therefore also carries the serialised query, which is
coordinate data and safe, and which makes the row reproducible.

**Rejected: a `redact` function the consumer supplies.** Redaction is a
blocklist, and a blocklist over free-text clinical data is a guess. It is also
opt-out shaped: the safe behaviour would depend on a prop being passed, which is
the exact structure Oxygen ADR 0011 rejected for `coverage` and for the same
reason.

**Rejected: including the value in development builds only.** Development and
production would then differ in precisely the one behaviour whose failure is a
breach, and `process.env` is forbidden in Oxygen packages anyway. A staging
environment loaded with a copy of production data is the normal case in this
industry, and it is a "development build".

**Rejected: an opt-in `verboseErrors` flag.** Someone will enable it while
debugging a production incident, at exactly the moment when the data on screen
is real and the pressure to leave it on afterwards is highest.
