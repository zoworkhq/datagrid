# 0006 — The grid's layers are named, not numbered

**Status:** accepted · 27 August 2026

> **Relates to:** [Oxygen `ENGINEERING.md` §2](https://github.com/zoworkhq/oxygenui/blob/main/ENGINEERING.md)
> (architecture invariants — the `L0`–`L4` layer model),
> [0003](0003-the-signals-dependency.md) (the signals façade),
> [0004](0004-npm-only-distribution.md) (npm-only distribution)
>
> **Deliberation:** [`2026-08-27-architecture-review.html`](../research/2026-08-27-architecture-review.html)
> §08 (proposed architecture), §10 (package and repository structure);
> [`HANDOVER.md` §4](../../HANDOVER.md)

## Context

Oxygen UI's `ENGINEERING.md` §2 defines a layer model as its first architecture
invariant, enforced by `dependency-cruiser`:

```
L0 foundation → L1 behaviour → L2 components → L3 composition → L4 distribution
```

The architecture review for this repository reused the same labels with
different meanings:

```
L0 foundation → L1 engine → L2 render + domain → L3 adapters → L4 plugins
```

`L1` through `L4` denote different things in the two documents. Only `L0`
agrees. This is a naming collision in the one vocabulary that is
machine-enforced in both repositories, and the failure mode is quiet: a
`dependency-cruiser` rule copied from Oxygen and adapted here — or a reviewer
saying "that belongs in L2" in a pull request — is wrong in a way that reads as
correct. It is cheap to fix now and becomes a rewrite of two lint configurations
and a documentation set later.

A second, smaller problem with the review's model: it puts the DOM renderer and
the healthcare layer together at `L2`, but the healthcare layer imports the
renderer. A layer whose members import each other is not a layer.

## Decision

**This repository's layers have names. It does not use `L0`–`L4` in any
document, diagram, lint rule, package field or review comment.**

```
foundation → engine → render → domain → { adapter | plugin }
```

| Layer | Packages | Rule |
| --- | --- | --- |
| `foundation` | Oxygen `tokens`, `fhir`, `intl`, `utils` | Reused, never re-created. Not published from this repository. |
| `engine` | `grid-signals`, `grid-core` | Pure logic. No DOM, no framework, no clinical vocabulary. Within the layer, `grid-core` imports `grid-signals`; the reverse is a build failure. |
| `render` | `grid-dom` | Framework-free DOM, ARIA, focus, recycling, anchoring. Imports `engine`. |
| `domain` | `grid-healthcare`, `grid-fhir` | Clinical meaning. Imports `engine` and `render`. Nothing below it may import it. |
| `adapter` | `grid-react`, `grid-angular`, `grid-vue`, `grid-element` | Binding only. Imports `engine` and `render`. **No grid logic.** |
| `plugin` | `grid-export`, `grid-filters`, `grid-analytics`, `grid-ai` | Optional behaviour, registered explicitly. Imports `engine`. |

Four rules, all enforced by `dependency-cruiser` with this record's number in
each rule's comment:

1. **A package imports from its own layer or below, never above.**
2. **`adapter` and `plugin` are siblings and may not import each other.** A
   plugin that imports an adapter is framework-specific and has left the
   architecture; an adapter that imports a plugin makes an optional package
   mandatory.
3. **No package below `domain` may import `domain`.** Generic sorting must not
   know what a reference range is, and a non-healthcare consumer must not pay a
   byte for one.
4. **The grid may depend on Oxygen `foundation` packages and nothing above
   them.** If it needs something higher, that thing moves down to Oxygen's `L0`
   or is inlined here. This is the rule that keeps a two-repository split
   affordable.

**The mapping, for anyone holding both models at once.** Oxygen's layers
describe a component library's internal structure; this repository's describe an
engine's. They are not the same axis and there is no row-by-row correspondence.
The only relationship that matters is the one in rule 4: **from Oxygen's point
of view the entire grid is a consumer of `L0` and sits outside its model.** When
a document must refer to Oxygen's layers, it writes "Oxygen `L0`" in full.

## Consequences

**Good.** One vocabulary per repository, and a `dependency-cruiser` rule cannot
be miscopied between them, because the names do not overlap at all — a rule
mentioning `L2` in this repository fails to resolve rather than silently
matching the wrong set.

**Good.** The names carry their own justification into review. "That belongs in
`domain`" is an argument; "that belongs in L2" is a lookup. This is the same
reason Oxygen's own layers are named rather than only numbered.

**Good.** Splitting `render` from `domain` removes the ambiguity in the review's
model and makes the direction between them explicit and enforceable.

**Cost.** The architecture review's diagrams and prose use `L0`–`L4` throughout
and are now stale in their labels. They are dated research documents, superseded
in this respect by this record; the fix is this mapping rather than regenerating
the reports, and [`docs/research/README.md`](../research/README.md) carries the
pointer.

**Cost.** Six names is one more concept than five numbers, and `adapter` and
`plugin` being siblings rather than stacked means the model is a small graph
rather than a stack. That is what the dependencies actually are, and pretending
otherwise is what produced the collision.

**Rejected: renumbering the grid's layers to `G0`–`G5`.** Still numbers, still
collide the moment someone writes "L2" from memory or pastes a rule, and they
carry no meaning into a code review.

**Rejected: adopting Oxygen's five names unchanged.** `behaviour`, `components`
and `composition` do not describe an engine, a framework-free renderer or a
plugin registry. Forcing this architecture into that vocabulary would make every
layer name a small lie.

**Rejected: publishing a mapping table and keeping both numbering schemes.**
This was the alternative named in the handover. It documents the collision
rather than removing it, and it requires every reader of every rule to know
which document they are in — which is precisely the state that produces the bug.
