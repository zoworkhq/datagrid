# Architecture decision records

Same convention as [`zoworkhq/oxygenui`](https://github.com/zoworkhq/oxygenui):
one file per decision, numbered, dated, with a status, and **never edited after
acceptance** — a decision that turns out wrong is superseded by a new record,
not rewritten. The point is that someone arriving in three years can read why
the seam is where it is, including the options that were rejected and what they
cost.

Format: **Context** (the forces, stated honestly) → **Decision** (what we do)
→ **Consequences** (good, costs, and rejected alternatives).

| # | Decision | Status |
| --- | --- | --- |
| [0001](0001-the-grid-never-performs-network-io.md) | The grid never performs network I/O | accepted |
| [0002](0002-the-grid-emits-events-not-telemetry.md) | The grid emits events; it does not emit telemetry | accepted |
| [0003](0003-the-signals-dependency.md) | The engine's one runtime dependency is signals, behind a façade | accepted |
| [0004](0004-npm-only-distribution.md) | The grid ships on npm only; dual-channel distribution does not apply | accepted |
| [0005](0005-coverage-may-report-an-unknown-total.md) | Coverage may report an unknown total | accepted |
| [0006](0006-the-grids-layers-are-named-not-numbered.md) | The grid's layers are named, not numbered | accepted |
| [0007](0007-server-rendered-adoption-needs-an-app-owned-host.md) | Server-rendered adoption needs an app-owned host | accepted |
| [0008](0008-what-a-cell-may-decide.md) | A cell renders a clinical state; it never derives one | accepted |
| [0009](0009-the-licence-is-mit-and-the-support-posture-is-stated.md) | MIT for everything, and a stated support posture | accepted |
| [0010](0010-what-wave-six-is-not.md) | Four wave-six bets, declined or reshaped | accepted |
| [0011](0011-framework-agnosticism-holds.md) | Framework agnosticism holds, and here is the evidence | accepted |

## Inherited from Oxygen UI

This repository inherits the accepted decisions of the component library —
including the token contract, the stability tiers and the supply-chain
constraints. The six records above are the ones that **conflict with this
architecture** and had to be settled before code was written:

| This record | Resolves against |
| --- | --- |
| 0001, 0002 | [Oxygen ADR 0009](https://github.com/zoworkhq/oxygenui/blob/main/content/decisions/0009-supply-chain-and-component-constraints.md) — forbids `fetch`, `XMLHttpRequest`, `WebSocket` and telemetry in any package, lint-enforced |
| 0003 | [Oxygen ADR 0009](https://github.com/zoworkhq/oxygenui/blob/main/content/decisions/0009-supply-chain-and-component-constraints.md) — requires a record for every new runtime dependency |
| 0004 | [Oxygen ADR 0002](https://github.com/zoworkhq/oxygenui/blob/main/content/decisions/0002-dual-channel-distribution.md) — makes npm + copy-source registry mandatory for every release |
| 0005 | [Oxygen ADR 0011](https://github.com/zoworkhq/oxygenui/blob/main/content/decisions/0011-summaries-declare-their-boundaries.md) — *amended*, not overridden: the obligation stands, one field's type changes |
| 0006 | [Oxygen `ENGINEERING.md` §2](https://github.com/zoworkhq/oxygenui/blob/main/ENGINEERING.md) — the `L0`–`L4` layer model, whose labels collided with this repository's |
| 0007 | [Oxygen ADR 0009](https://github.com/zoworkhq/oxygenui/blob/main/content/decisions/0009-supply-chain-and-component-constraints.md) — forbids `dangerouslySetInnerHTML`, which is what React would need to adopt a server-rendered page |

## When a change needs a record here

- A new runtime dependency in any shipped package ([0003](0003-the-signals-dependency.md)).
- Anything that changes a public API's shape, a package boundary, or a
  distribution channel.
- Anything that adds a way for the grid to reach the network, the environment,
  or the application ([0001](0001-the-grid-never-performs-network-io.md)).
- Anything that changes what the grid may claim about a set it is showing
  ([0005](0005-coverage-may-report-an-unknown-total.md)).
- A change to the layer model or a `dependency-cruiser` rule
  ([0006](0006-the-grids-layers-are-named-not-numbered.md)).

Everything else is a pull request.

See [`HANDOVER.md`](../../HANDOVER.md) for the context all six were written
from, and [`docs/research/`](../research/) for the deliberation.
