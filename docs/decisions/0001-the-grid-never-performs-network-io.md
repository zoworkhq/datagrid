# 0001 — The grid never performs network I/O

**Status:** accepted · 27 August 2026

> **Relates to:** [Oxygen ADR 0009](https://github.com/zoworkhq/oxygenui/blob/main/content/decisions/0009-supply-chain-and-component-constraints.md)
> (component capability is constrained by lint), [0002](0002-the-grid-emits-events-not-telemetry.md)
> (events, not telemetry), [0005](0005-coverage-may-report-an-unknown-total.md) (unknown totals)
>
> **Deliberation:** [`2026-08-27-architecture-review.html`](../research/2026-08-27-architecture-review.html)
> §15 (FHIR and interoperability), §19 (API design)

## Context

Oxygen ADR 0009 forbids, by lint rather than by review, any component in any
Oxygen package from making a network call — no `fetch`, no `XMLHttpRequest`, no
`WebSocket`. The rule is enforced by `@oxygenui/no-forbidden-capability` and
re-checked at registry build, and it is one of the two things that make a
customer's vendor security review short.

This grid has a server-side row model, a FHIR data source, cursor pagination
and live updates. Read from the package list alone, it looks like a direct
violation of an accepted decision — and the lint rule will fire on the first
commit that mentions a URL.

It is not a violation. The design already complies, by a route that is nowhere
written down:

- The grid takes a caller-supplied `dataSource` and calls a method on it. It
  never constructs a request, never holds a base URL, never knows a hostname.
- Live updates are **pushed in** by the application. The grid has no socket, no
  polling loop and no reconnect logic.
- `grid-fhir` consumes a FHIR client the application already built and
  authorised. It maps `Bundle` to rows and `link.next` to a cursor. It does not
  open a connection.

The gap is documentation, not architecture — and an undocumented compliance is
indistinguishable from an accident. The first engineer to need a refresh button
will add a `fetch`, the lint rule will fire, and the fix that looks obvious in
the moment is an exemption in the lint config.

## Decision

**The grid defines the shape of a request and never issues one.**

1. **`grid-core` defines `GridQuery` and `GridPage` and nothing else about
   transport.** Whether the caller uses TanStack Query, SWR, a SMART-on-FHIR
   client or `XMLHttpRequest` is the application's business and is invisible to
   the engine.

2. **Data arrives through `GridDataSource`.** The interface is
   `getRows(q, signal)` returning a promise, plus optional `updateRow`, `cache`
   and `capabilities`. The `AbortSignal` is supplied by the grid — the grid owns
   *cancellation semantics*, because that is a correctness property of the row
   model, and owns nothing about the request itself.

3. **Live updates are pushed, never pulled.** The application calls
   `api.dispatch({ type: "rows/upsert", … })`. There is no subscription API in
   any grid package. Position stability, coalescing on an animation frame and
   the arrivals queue are all grid concerns; the connection is not.

4. **`grid-fhir` consumes a client; it does not obtain one.** It takes an object
   with a `request` method. SMART on FHIR is an authorisation and launch-context
   concern belonging to the application, and this package will not claim SMART
   support.

5. **Oxygen ADR 0009's lint rule is adopted verbatim in this repository**,
   applied to every package including `grid-fhir`, with no exemption list. A
   package that needs an exemption has a design error, not a lint problem.

## Consequences

**Good.** The security questionnaire answer is structural rather than a promise:
the grid cannot exfiltrate, cannot phone home and cannot be pointed at a
hostname by a malicious column definition, because there is no code path that
reaches a network. That is checkable by grepping the published bundle, which is
what a reviewer will actually do.

**Good.** The engine is testable without a network, a server or a mock server.
The 40,000-row property tests in the wave 1 suite are possible at all because
`GridDataSource` is an object literal in the test file.

**Good.** It keeps the FHIR investigation's finding enforceable. A server that
caps `_count`, ignores `_sort` or omits `Bundle.total` is reported through
`capabilities` rather than worked around in a transport layer the grid owns.

**Cost.** There is no five-second demo. Every competitor can show
`<DataGrid url="/api/patients" />`; ours needs a data source first, and the
README's first example is therefore four lines longer than AG Grid's. The
mitigation is a documented `arraySource()` helper for the client-mode case,
which is still a pure function over an array the caller already has.

**Cost.** Retry, backoff and reconnection are the application's, and every
consumer will implement them slightly differently. This is the correct place for
that variance — a retry policy in a clinical system is a product decision about
staleness, not a grid default — but it is real work pushed outward.

**Rejected: an optional built-in fetcher for the common REST case.** It would
be used by everyone, which makes it the de-facto transport, which makes the lint
exemption permanent and the claim in this record false. The moment the grid has
a URL, "the grid cannot reach the network" stops being a sentence we can say.

**Rejected: an exemption for `grid-fhir` on the grounds that FHIR is special.**
FHIR is one interoperability profile among several. A customer fed by HL7v2 or a
nightly CSV must not be told the network layer only works one way, and a
package that opens connections is the wrong place to discover that.

**Rejected: a `transport` plugin implementing `fetch` inside the plugin
boundary.** It relocates the capability without removing it. The published
bundle would still contain a network call, and the grep that a security reviewer
runs does not care which package it was in.
