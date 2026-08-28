# 0008 — A cell renders a clinical state; it never derives one

**Status:** accepted · 28 August 2026

> **Relates to:** [Oxygen ADR 0011](https://github.com/zoworkhq/oxygenui/blob/main/content/decisions/0011-summaries-declare-their-boundaries.md)
> (summaries declare their boundaries), [0002](0002-the-grid-emits-events-not-telemetry.md)
> (events, not telemetry), [0005](0005-coverage-may-report-an-unknown-total.md) (unknown totals)
>
> **Deliberation:** [`2026-08-27-architecture-review.html`](../research/2026-08-27-architecture-review.html)
> §07 (healthcare opportunity), §14 (healthcare architecture); [`HANDOVER.md` §7](../../HANDOVER.md)
> condition 5

## Context

`HANDOVER.md` condition 5 says: *name a clinician reviewer and budget for them
before wave 3.* Until now that has been read as blocking the entire healthcare
layer, and three planned items have sat untouched behind it.

That reading is too broad, and holding everything behind it has a cost of its
own: the eight clinical components that already ship at Stable in `oxygenui`
have nowhere to live, and every week they do not, the chance grows that somebody
rebuilds them inside a product — which is the two-implementations-of-"is-this-
critical" failure this library exists to prevent.

The condition is about **clinical claims**. So the question is not "is this in
the healthcare package" but "does this code decide something a clinician would
have to check". Those are different sets, and separating them is the whole of
this record.

Three kinds of thing were bundled together under "the cell catalogue":

1. **The host contract.** Measurement, truncation, focus delegation, the live
   region read, comparison, export, print, and mask state. It is an interface.
   It contains no clinical vocabulary and decides nothing.
2. **Cells whose states are administrative.** What is owed and by when. Two
   chips and a counted remainder. A masked region and its legal basis. A payer
   eligibility check that may be stale or unreachable. Units remaining on an
   authorisation, with an expiry and an ageing clock. These are workflow,
   disclosure and billing states. A biller or a service manager is the reviewer
   for these, not a clinician.
3. **Cells whose states are clinical.** The scheduled-dose cell is the clear
   case: *given*, *late*, *not given*, *held*, *refused* and *no dose scheduled*
   are not six labels, they are six medico-legal facts with different
   consequences, and the difference between "held" and "not given" is a clinical
   judgement recorded by a clinician.

## Decision

**Build (1) and (2) now. Hold (3). And make the boundary structural rather than
a matter of care.**

1. **The cell host contract ships.** Eight obligations, unchanged from the
   review. It is the thing that lets the eight already-Stable components drop
   into a virtualised, exportable, printable, screen-reader-navigable grid
   without being rewritten, and it needs no clinical review because it makes no
   clinical claim.

2. **Five cells ship**: resolution, chip overflow, masked region, eligibility,
   and ledger. Each renders an administrative state.

3. **`GridDoseCell` is not built.** It is named here, in the plan, and in the
   package's own documentation as awaiting clinical review, so that its absence
   is a visible decision rather than an oversight.

4. **The rule that makes the rest safe — and it is the load-bearing clause:**

   > **A cell renders a state the application supplies. It never derives one.**

   No cell in this package computes whether a result is critical, whether a
   value is abnormal, whether an authorisation is exhausted, or whether an
   eligibility check is too old to trust. It is *told*, and it renders what it
   is told, including telling the reader when it was told nothing.

   That is the same boundary the whole library already draws — the grid renders
   a policy, it does not decide one — applied one level down. A cell that only
   renders carries no clinical claim of its own, so the clinical claim stays
   where it belongs: in the application, reviewed by whoever reviews that
   application.

5. **Staleness is declared, never computed.** A cell shows "as of 09:12" and,
   if the caller says so, "stale". It does not decide that forty minutes is too
   old, because that threshold is clinical and varies by field, by site and by
   patient.

## Consequences

**Good.** The unblocked work is unblocked, and the still-blocked work is
smaller, named, and obviously blocked. "The cell catalogue needs a clinician" is
untrue and stops conversations; "the scheduled-dose cell needs a clinician"
is true and starts one.

**Good.** The clause in point 4 is checkable. A cell that starts computing a
clinical state is a diff you can see: it grows a threshold, a comparison, or a
branch on a value. There is a test asserting each shipped cell's output is a
pure function of its declared input.

**Good.** It matches where the expertise actually is. A revenue-cycle lead can
review the ledger cell today; waiting for a clinician to review a denial-reason
chip would be waiting for the wrong person.

**Cost.** Five cells now exist that a clinician has still not seen. They make no
clinical claim by construction, but "by construction" is an argument, and an
argument is weaker than a review. Every one of them carries the same limitation
note, and the reviewer, when named, should still read them.

**Cost.** The dose cell is the one most products want first, and it is the one
not shipping. That is the correct order and it will be unpopular.

**Rejected: build everything and label it unreviewed.** A label is not a
control. The review's own footer already labels every clinical rule as
literature-derived, and that has not stopped the material being read as
authoritative — which is exactly why condition 5 exists.

**Rejected: keep holding the whole layer.** It blocks work that needs no
clinician, and it makes the real blocker invisible by hiding it inside a much
larger one. A blocker that stops five safe things and one unsafe thing gets
argued about; a blocker that stops one unsafe thing gets resolved.

**Rejected: let cells derive state behind a `strict` flag.** Any flag that
switches a safety property off is the escape hatch Oxygen ADR 0011 already
rejected. A component that lets you turn its safety claim off does not have one.
