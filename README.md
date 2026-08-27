<div align="center">

<h1>Oxygen&nbsp;Data&nbsp;Grid</h1>

**The data grid that knows a row is a person.**

A framework-agnostic, virtualised enterprise data grid with a healthcare layer<br />
built in — for EHR, behavioural-health, clinical, operational and billing workflows.

[![Status](https://img.shields.io/badge/status-design%20phase-orange.svg)](HANDOVER.md)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Part of](https://img.shields.io/badge/part%20of-Oxygen%20UI-0E7C66.svg)](https://github.com/zoworkhq/oxygenui)

</div>

---

> ### ⚠️ There is no code here yet
>
> This repository is in the **design phase**. It contains the research and the
> architecture that the implementation will be built from, and nothing else.
> Nothing is published to npm. Nothing runs.
>
> **Start with [`HANDOVER.md`](HANDOVER.md)** — it is the complete context,
> written to be read cold.

---

## Why this will exist

Most data grids render a value. They have no opinion about a result that came
back preliminary, a reference range that does not exist, a record flagged
restricted, or a filter someone set six days ago and forgot.

In healthcare those are the normal working set, and each one fails the same way:
**it renders perfectly and says something false.**

Three things no other grid in the category does, and which this one is being
built around:

1. **It declares what the query did not reach.** A required `coverage` prop,
   rendered in a fixed place, and printed. A filtered list looks complete —
   *"no results"* is otherwise indistinguishable from *"no patients have this
   problem"*.
2. **Every empty cell carries a typed reason.** Not ordered, not resulted, not
   measured, declined, specimen problem, withheld, source unreachable — eight
   reasons, eight different next actions.
3. **A sort by a model-derived column names the model in the header.** Sorting a
   worklist by a risk score is triage. The model's version, validation and
   population belong where the decision is made, not in a tooltip.

## Architecture, in one line

```
grid-core  →  grid-dom  →  react · angular · vue · element
 (signals,     (DOM, ARIA,      (~4 KB each,
  no DOM)       focus,           no grid logic)
                recycling)
```

A framework-free DOM renderer sits **below** the framework adapters, so the
accessibility model and the virtualiser are written once rather than four times.
See [`HANDOVER.md` §0](HANDOVER.md).

## What this is not

**This library does not make an application HIPAA, GDPR or DPDP compliant.** It
is not clinical decision support and it is not a medical device. It renders a
policy; it does not decide one and it cannot enforce one. Access control, audit
storage, data residency and clinical validation remain the application's.

It helps you build a compliant system. It is not one.

**Nothing here has been reviewed by a clinician.** Every clinical rule in the
research is derived from published literature and general knowledge, and is
labelled that way.

## Repository layout

```
HANDOVER.md              the seed context — read this first
docs/
├─ decisions/            ADRs (five to write before code)
└─ research/
   ├─ 2026-08-27-product-brief.html         product research · partly superseded
   ├─ 2026-08-27-architecture-review.html   architecture review · current
   └─ generators/        the Python sources both reports are generated from
```

## Related

- [zoworkhq/oxygenui](https://github.com/zoworkhq/oxygenui) — the component
  library this grid composes over. It supplies the design tokens, the FHIR types,
  the terminology layer and eight clinical cell components the grid will host
  rather than reimplement.

## License

MIT — see [LICENSE](LICENSE). Provisional while the repository is private and
unreleased; see [`HANDOVER.md` §7](HANDOVER.md) for the intended split between an
MIT core and a separately-licensed enterprise recipe pack.
