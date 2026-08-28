# 0011 — Framework agnosticism holds, and here is the evidence

**Status:** accepted · 28 August 2026

> **Relates to:** [0006](0006-the-grids-layers-are-named-not-numbered.md) (layer names),
> [0007](0007-server-rendered-adoption-needs-an-app-owned-host.md) (SSR adoption)
>
> **Resolves:** the stop condition in [`HANDOVER.md` §7](../../HANDOVER.md)

## Context

The handover set a condition for abandoning the whole framework-agnostic
strategy, and set it deliberately in advance, at a point where it could still be
acted on:

> If, at the end of wave 4, the Angular adapter is larger than ~8 KB or contains
> any logic the React adapter also contains, the abstraction is in the wrong
> place. **Stop at one framework and say so** — do not keep paying a multiplier
> for a claim we cannot honour.

Until now it could not be evaluated. React and the custom element both exist,
but they exercise the same renderer through different *mount* paths. Angular is
the one that exercises a different *reactivity system* against core signals,
which is the half that validates the reactivity choice.

Building it turned up the toolchain problem that had been holding it: Angular 22
requires TypeScript >=6.0 <6.1, and the workspace is on 5.7. That is a real
conflict, and dragging ten packages onto a new compiler for one adapter would be
the tail wagging the dog.

## Decision

**The condition is met on both clauses. Framework agnosticism holds, and the
Angular adapter ships.**

### The evidence

| | |
| --- | --- |
| Threshold | ~8 KB, no logic the React adapter also contains |
| Angular adapter | **1.09 KB** |
| React adapter | 456 B |
| Custom element | 585 B |

Size is the easy half and the size gate covers it. The second clause — *contains
any logic the React adapter also contains* — is the one a size check misses
entirely, because an adapter can be small and still be reimplementing something.

So it is a test. `no-grid-logic.test.ts` reads the **built bundle** and asserts
none of the grid's own vocabulary appears in it: `aria-rowindex`, `columnheader`,
`localeCompare`, `incomparable`, `scrollTop`, `ArrowDown`, and the rest. Sorting,
filtering, ARIA, virtualisation and the keyboard model all live below the
adapters, so a hit means one of them has been copied up.

It was verified by planting a `localeCompare` in the adapter and watching it
fail. A gate that has never been seen to fail has not been tested.

### The toolchain

**TypeScript 6 is scoped to `grid-angular` alone**, as a package-local
devDependency. The other packages stay on 5.7. ng-packagr compiles in partial
mode inside that package, and a small script normalises its output to the
`dist/index.js` layout every other package uses — so the size gate, the exports
map and the documentation do not learn that one adapter is special.

The Angular toolchain is therefore entirely inside one directory. Nothing else
in the workspace knows it exists, and removing the adapter would remove the
toolchain with it.

### What this does not yet cover

`grid-angular` is **not in the cross-adapter parity test**, and the reason is
now specific rather than estimated. It was attempted:

- The test suite transpiles with vitest 4's **oxc** pipeline, which cannot parse
  Angular's decorators at all — a file containing nothing but an empty
  `@Directive()` class fails with `SyntaxError: Invalid or unexpected token`.
  Legacy-decorator options for oxc did not change it.
- The published output is **partial-compiled**, so importing `dist` into a test
  yields declarations the Angular linker still has to process.
- Instantiating the directive directly does not work either: `input()` and
  `effect()` require an Angular injection context.

So it is not a matter of adding two dependencies. Angular in the parity harness
needs **Angular's own build in the test path** — either the linker as a
transform, or a separate test project compiled by ngtsc. That is a real piece of
work, and the right home for it is the wave-5 documentation site, which will
build a real Angular app anyway.

Until then `grid-angular` is verified by two things and not by a third: the size
gate, and `no-grid-logic.test.ts` reading the built bundle. The
accessibility-tree comparison runs against React and the custom element only.
**That is a gap, stated so nobody mistakes the parity test's green tick for
covering three adapters.**

## Consequences

**Good.** The claim can be made in public. Three adapters exist, the largest is
1.09 KB, and the reason they are all small is structural rather than
disciplined: there is nothing in them to be large, because `grid-dom` owns the
DOM and `grid-core` owns the logic.

**Good.** The decision was made against a threshold written before the evidence,
which is the only way a stop condition is worth anything. It would have been
very easy, at 1.09 KB, to decide the threshold had always been generous.

**Good.** Angular's `effect()` bridging to core signals is one function. That is
the reactivity claim tested rather than asserted — a second reactivity system
integrated without the engine noticing.

**Cost.** A second TypeScript version in the workspace. It is pinned, scoped to
one package, and visible in that package's manifest, but it is a version skew
and someone will eventually be confused by it.

**Cost.** ng-packagr is a build tool the rest of the repository does not use, so
`grid-angular` builds differently from its ten siblings. Contained, but not
free.

**Rejected: upgrading the workspace to TypeScript 6.** Ten packages moved for
one adapter, and a compiler change is exactly the kind of thing that produces a
week of unrelated breakage at the wrong moment.

**Rejected: shipping Angular support as "use the custom element".** It would
have been honest and nearly free, and it would have left the stop condition
permanently unevaluable — which is the same as not having set one.
