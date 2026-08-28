# 0003 — The engine's one runtime dependency is signals, behind a façade

**Status:** accepted · 27 August 2026

> **Relates to:** [Oxygen ADR 0009](https://github.com/zoworkhq/oxygenui/blob/main/content/decisions/0009-supply-chain-and-component-constraints.md)
> (every new runtime dependency requires a record), [0006](0006-the-grids-layers-are-named-not-numbered.md)
> (layer names)
>
> **Deliberation:** [`2026-08-27-architecture-review.html`](../research/2026-08-27-architecture-review.html)
> §11 (core engine architecture), §17 (performance architecture)

## Context

Oxygen ADR 0009 requires a record for every new runtime dependency in a shipped
package, with the reason stated: at 500 components, dependency creep is the
primary driver of both bundle size and CVE exposure. Oxygen's own runtime
surface is three packages — `clsx`, `tailwind-merge`, `lucide-react` — and is
small on purpose.

This record covers the grid engine's only one.

The engine is signal-based rather than reducer-only, and the reason is measured
rather than architectural taste. TanStack Table v9, released 4 August 2026 on
the alien-signals architecture, reports **+79% row processing**, **+52%
grouping** and **up to 86% less retained heap** against v8 — 380 MB for one
million rows by eight columns, down from 2.71 GB. Those are the numbers that
decide whether this grid is usable at 100,000 rows, and they came from the
reactivity substrate rather than from optimisation.

The forces pulling against a dependency here are real. A pure-function core with
no dependency at all is easier to audit and impossible to break by someone
else's release. And the ecosystem is mid-migration: TC39 Signals is at Stage 1,
with Angular, Vue, Solid, Preact, Ember and MobX contributors behind it. A
bespoke observer layer written in 2026 would be legacy by 2029; so, possibly,
would a direct dependency on any one library's API.

## Decision

**`@oxygenui-design/grid-signals` is a façade over a signals implementation, it
is the only package in the repository permitted to import one, and it is the
engine's only runtime dependency.**

1. **The façade exports our interface, not a vendor's.** `signal`, `computed`,
   `effect`, `batch`, `untrack` — the intersection of what alien-signals,
   TC39 Signals and every framework implementation agree on. Nothing
   vendor-specific is re-exported, including types.

2. **`grid-core` imports `@oxygenui-design/grid-signals` and nothing else.**
   Zero other runtime dependencies in the engine layer. This is the claim the
   README makes and the one pnpm's strict linking exists here to keep honest.

3. **`dependency-cruiser` forbids any other package importing the vendor
   directly**, by name, as a rule with this record's number in its comment. A
   direct import elsewhere is a build failure, not a review note.

4. **The implementation is alien-signals today.** It is what TanStack v9
   measured, it is small, and it has no transitive dependencies.

5. **When TC39 Signals ships, one package changes.** The migration is a rewrite
   of one file plus its tests. If the proposal stalls or changes shape, nothing
   downstream is affected — which is the entire purpose of the indirection and
   the reason it is permitted to exist despite adding a package.

6. **The adapters do not use this package.** An adapter bridges *framework*
   reactivity — React's `useSyncExternalStore`, Angular signals, Vue refs — to
   core signals. It does not import the façade and must not create signals of
   its own.

## Consequences

**Good.** The measured win is available without the lock-in. We get TanStack's
architecture without adopting TanStack's API, and without betting the engine on
a Stage 1 proposal landing.

**Good.** The supply-chain answer is a single sentence with a number in it: one
runtime dependency in the engine, zero transitive, imported from one file.
That is a materially better answer than any competitor can give, and it is the
kind of claim a security reviewer can verify in under a minute.

**Good.** It makes the reactivity choice reversible. If alien-signals is
abandoned or develops a CVE, the blast radius is one file.

**Cost.** A façade that is not load-bearing for any feature is exactly the
indirection a future engineer deletes while tidying — it looks like a pointless
re-export. The mitigation is a header comment in the package's entry point
naming this record and the reason, because the cost of the deletion is only
visible years later.

**Cost.** The intersection API is smaller than any single implementation. If
alien-signals ships something genuinely useful that TC39 lacks, we either forgo
it or widen the façade and accept a migration cost we said we were avoiding.
That trade is made case by case, and widening requires a superseding record.

**Rejected: writing our own signals implementation.** Fine-grained reactivity
with correct glitch-freedom, cycle detection and disposal is a subtle, adversarial
problem that several teams have spent years on. Writing one to avoid a 3 KB
dependency would be the worst trade in the architecture, and the resulting code
would be the least reviewable part of the engine.

**Rejected: importing alien-signals directly throughout core.** Cheaper today by
one package, and it makes the TC39 migration a change across every file in the
engine rather than one. The cost of the façade is paid once; the cost of not
having it is paid at the worst possible moment.

**Rejected: a reducer-only core with no reactivity substrate.** Actions are kept
as the write path precisely because they are replayable and property-testable —
that decision stands. But recomputing a derived view on every action is where
v8's 2.71 GB came from. Both paths exist because they solve different problems:
actions for writes, signals for reads.
