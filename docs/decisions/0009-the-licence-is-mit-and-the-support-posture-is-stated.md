# 0009 — MIT for everything, and a support posture that is stated rather than implied

**Status:** accepted · 28 August 2026

> **Relates to:** [0004](0004-npm-only-distribution.md) (npm-only distribution),
> [Oxygen ADR 0002](https://github.com/zoworkhq/oxygenui/blob/main/content/decisions/0002-dual-channel-distribution.md)
>
> **Resolves:** [`HANDOVER.md` §7](../../HANDOVER.md) condition 4 and §10

## Context

`HANDOVER.md` condition 4 says to decide the licence and support posture before
the repository is public, and recommends MIT for everything a security reviewer
must read, with a separate commercial licence for an enterprise recipe pack.
Nothing has published since, because every package is `private: true` behind
this decision.

Two things have changed since that recommendation was written.

**The enterprise recipe pack does not exist.** Fourteen recipes are described in
the research and none is built. Splitting a licence around a product that has
not been designed means guessing at the seam, and a licence boundary is
expensive to move once customers are on both sides of it.

**The thing being sold turned out to be the decisions, not the cells.** The
review's own conclusion — *"the product is the decisions, not the cells"* — cuts
against a recipe pack as the commercial artefact. A cell catalogue is copyable
in a quarter. Refusing to aggregate incompatible units, refusing to approximate
a filter FHIR cannot express, refusing to claim a total the server never gave:
those are enforced by types and tests that live in the MIT core, and they are
what a clinical safety officer signs off on.

The HyperFormula trap remains the thing to avoid: GPLv3 unless licensed, which
would make our position radioactive for exactly the buyers we want. Nothing here
vendors it, and §8 keeps it on the never-build list.

## Decision

**MIT for all ten packages. No dual licence, and no commercial pack today.**

1. **Every published package is MIT**, including the healthcare and FHIR layers.
   The audience is a security reviewer at a healthcare buyer, and a single
   permissive licence across everything they must read is the strongest trust
   signal available to us.

2. **No commercial split until there is something built to split.** When an
   enterprise recipe pack exists and someone has asked to buy it, that is the
   moment to draw a boundary — and it gets its own superseding record, naming
   the seam and why it falls there.

3. **The support posture is stated, in the README, in these words:** issues are
   triaged weekly; support is not guaranteed and is not a contract. Silence
   implies an SLA nobody agreed to, and an implied SLA is worse than a stated
   absence of one.

4. **Publishing stays a deliberate act.** This record unblocks it; it does not
   perform it. Packages remain `private: true` until someone runs the release
   deliberately, because a first publish claims names on a public registry and
   npm unpublishing is time-limited and partial.

5. **The compliance boundary appears at the same prominence as the capability
   list**, in the README and in the security documentation, per §16 of the
   review. A permissive licence makes it more likely, not less, that somebody
   reads this library as a compliance boundary.

## Consequences

**Good.** The security questionnaire gets shorter. "MIT, one runtime
dependency, no network calls, no telemetry" is four facts a reviewer can check
in a minute, and none of them has an asterisk.

**Good.** It removes a decision that was blocking work rather than informing it.
Nothing about the architecture changes if a commercial pack appears later; the
packages are already separate, and per-package versioning already exists.

**Cost.** It forgoes revenue that a Pro tier might have captured, and re-adding
a paid boundary later is harder than starting with one — customers on the free
side will experience it as something being taken away.

**Cost.** MIT on the healthcare layer means a competitor can lift the absence
taxonomy and the coverage contract wholesale. That is accepted: the types are
the cheap part, and the tests, the gates and the reasoning in these records are
what make them hold.

**Rejected: dual licence now, with the recipes reserved.** It draws a boundary
through a product nobody has built, and it makes the healthcare layer — the part
a clinical reviewer most needs to read — the part behind a licence.

**Rejected: a runtime licence-key checker.** Already on the never-build list:
user-hostile, trivially removable, and it puts a console warning in a
clinician's browser.

**Rejected: staying private until an enterprise pack exists.** That is
indefinite, and it keeps the work invisible to the engineers whose adoption
would tell us whether a pack is worth building.
