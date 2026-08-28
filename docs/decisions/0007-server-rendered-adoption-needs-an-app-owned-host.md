# 0007 — Server-rendered adoption needs an app-owned host

**Status:** accepted · 28 August 2026

> **Relates to:** [Oxygen ADR 0009](https://github.com/zoworkhq/oxygenui/blob/main/content/decisions/0009-supply-chain-and-component-constraints.md)
> (forbids `dangerouslySetInnerHTML`), [0006](0006-the-grids-layers-are-named-not-numbered.md)
> (layer names — why this lives in `render`, not in an adapter)
>
> **Deliberation:** [`2026-08-27-architecture-review.html`](../research/2026-08-27-architecture-review.html)
> §06 (SSR and hydration were not addressed at all), §17 (performance architecture)

## Context

The architecture review found that server rendering had not been addressed at
all, and named the failure precisely: a virtualised grid renders fifteen of a
hundred thousand rows, so server and client markup differ and hydration fails.
The common answer in this category is to mark the grid client-only. That is not
an architecture — it is the reason a Next.js team wraps a grid in a dynamic
import and stops trusting it.

The designed answer is a two-phase boundary. The server renders a real,
non-virtualised **first page** — correct markup, correct ARIA, correct absolute
row indices, indexable, useful with JavaScript disabled. The client then mounts
the virtualiser **over that markup**, adopting the existing nodes rather than
replacing them, and takes ownership at a known point.

Both halves are built and framework-free, in `grid-dom`, written once rather
than once per adapter. `renderToString` emits the structure `createGridRenderer`
builds, including inline positioning, and a test parses that output and compares
its accessibility tree to a client render of the same model.

**Then React refused to play.**

React deletes children it did not render. `suppressHydrationWarning` only
silences the *warning*; it does not preserve the subtree. This was verified
rather than assumed — a probe hydrating a container holding server markup found
the subtree gone, not merely un-warned about. React 19 does not even discard it
quietly: it **throws a hydration mismatch and falls back to a full client
render**, which the test now captures through `onRecoverableError`.

So adopting server markup inside a React-owned container requires
`dangerouslySetInnerHTML`, and **Oxygen ADR 0009 forbids it in any Oxygen
package, lint-enforced**. This repository inherits that rule and [0001](0001-the-grid-never-performs-network-io.md)
adopts its siblings verbatim with no exemption list.

That is a genuine conflict between a designed capability and an accepted
decision, and it is the kind that gets resolved quietly and wrongly if it is not
written down.

## Decision

**The server-rendered page is adopted only when its host is an element React
does not own. We do not take an exemption from Oxygen ADR 0009.**

1. **`grid-dom` owns both halves.** `renderToString` produces the first page;
   `createGridRenderer` adopts a `.oxg-root` it finds in its host. Neither is
   framework-specific, so the custom element, Angular and Vue get the same
   behaviour without a second implementation.

2. **A live root is never adopted.** Adoption matches `.oxg-root:not([data-oxg-live])`,
   and a renderer stamps its root on mount. Two renderers sharing one tree would
   recycle each other's rows — the worst failure this library has.

3. **React has two supported modes, and the difference is documented rather
   than discovered:**

   - **App-owned host (adoption).** The application renders the markup into an
     element outside the React tree and passes it as `host`. `DataGrid` then
     renders nothing and drives the renderer on that element. No flash, no
     mismatch, full adoption.
   - **React-owned container (replacement).** `DataGrid` renders its own
     container. The server page is still delivered — indexable, readable
     without JavaScript, correctly announced — and React clears it on mount,
     after which the renderer builds fresh. **This is a visible flash, and it is
     the default.**

4. **`renderToString` returning a markup string does not contradict the
   renderer safety contract.** That contract forbids a *cell renderer* returning
   markup, because a cell renders attacker-influenced content. Here the library
   serialises its own DOM from typed values, and every interpolation goes
   through `escapeText` or `escapeAttr`. Escaping is ours, and it is tested with
   a `<script>` payload in a note field.

5. **The limits are stated in the API, not only in prose.** `hydrationNotes` is
   exported from `grid-dom` as data, so the documentation site renders the same
   sentences the implementation is written against, and a stale doc is a failing
   test rather than a surprise.

## Consequences

**Good.** The security reviewer's grep for `dangerouslySetInnerHTML` finds
nothing in any published bundle. That is a short conversation; "we use it, but
only on our own escaped output" is a long one, and it is a conversation we would
have to have with every buyer rather than once.

**Good.** The capability is real for every framework that can hand markup over
intact, which includes the custom element and any server template. React is the
constrained case, not the general one.

**Good.** The two modes make the trade explicit at the call site. A team that
wants adoption opts into an app-owned host deliberately; a team that does not
still gets an indexable, no-JavaScript first page.

**Cost.** The default React path flashes. The server page is painted, then
cleared, then rebuilt. It is correct at every instant and it looks worse than a
grid that never server-rendered at all — which will be reported as a bug, and
the answer is this record.

**Cost.** The app-owned host is awkward. The grid lives outside the React tree,
so it does not compose with React context, error boundaries or Suspense in the
way a normal component would. That is an honest consequence of a DOM library
under a framework, and pretending otherwise is what produces four subtly
different adapters.

**Rejected: exempting the SSR path from Oxygen ADR 0009.** The markup really is
ours and really is escaped, so the exemption would be *safe*. It would also be
the first entry in a lint exemption list, and a lint rule with an exemption list
is a lint rule that grows one. The rule's value is that it is absolute.

**Rejected: rendering the first page as React elements in the adapter.** It
would hydrate perfectly, and it would put grid rendering logic in an adapter —
the one thing [0006](0006-the-grids-layers-are-named-not-numbered.md) forbids,
and the thing that makes the fourth adapter the worst one.

**Rejected: no server rendering at all.** `ssr: false` and a shrug is what the
review called out. An indexable, readable first page has value even when it is
replaced a moment later.

**Rejected: waiting for React to support it.** There is no proposal to wait for,
and the boundary shapes the renderer's construction. Discovering it after wave 4
would mean rewriting adoption in four adapters instead of designing it in one.
