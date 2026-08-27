# Architecture decision records

Same convention as [`zoworkhq/oxygenui`](https://github.com/zoworkhq/oxygenui):
numbered, dated, with a status, and amended by a superseding record rather than
edited in place.

## Inherited from Oxygen UI

This repository inherits the accepted decisions of the component library —
including the layer model, the token contract, the stability tiers and the
supply-chain constraints. **Five of them conflict with this architecture** and
each needs a record here before code is written. See
[`HANDOVER.md` §4](../../HANDOVER.md).

## To write, in order

| # | Record | Resolves |
| --- | --- | --- |
| 0001 | The grid never performs network I/O | Oxygen ADR 0009 forbids `fetch`, `XMLHttpRequest` and `WebSocket` in any package, **lint-enforced**. The grid has a server row model, a FHIR source and live updates. The design already complies — it takes a caller-supplied `dataSource` and receives *pushed* updates — but it is nowhere stated. |
| 0002 | The grid emits events, not telemetry | Oxygen ADR 0009 forbids emitting telemetry of any kind. The PHI-safe error contract must be framed as emitting to the caller, who decides what to send. |
| 0003 | The signals dependency | Oxygen ADR 0009 requires a record for every new runtime dependency. Covers why it sits behind a façade package so that TC39 Signals landing changes one file. |
| 0004 | npm-only distribution | Oxygen ADR 0002 makes npm + copy-source registry mandatory for every release. A multi-package grid with cross-dependencies cannot ship copy-source. |
| 0005 | Coverage may report an unknown total | Amends Oxygen ADR 0011, which is *accepted*. `Coverage.total` becomes `number \| "unknown"` because FHIR cannot always supply one. |

## Also settle before the first lint rule

**The layer names collide.** Oxygen UI's `ENGINEERING.md` §2 defines
`L0 foundation → L1 behaviour → L2 components → L3 composition → L4 distribution`.
The architecture review reuses `L0`–`L4` with different meanings —
`L0 foundation → L1 engine → L2 render+domain → L3 adapters → L4 plugins`.

`L1` through `L4` all mean different things in the two documents, and a
`dependency-cruiser` rule written against one is wrong for the other. Rename this
repository's layers — `engine / render / domain / adapter / plugin` reads better
than a number — or publish an explicit mapping. **Do it before the first lint
rule, not after.**
