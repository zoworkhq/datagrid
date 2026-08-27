# 0004 — The grid ships on npm only; dual-channel distribution does not apply

**Status:** accepted · 27 August 2026

> **Relates to:** [Oxygen ADR 0002](https://github.com/zoworkhq/oxygenui/blob/main/content/decisions/0002-dual-channel-distribution.md)
> (npm is the source of truth; the registry is generated from it),
> [Oxygen ADR 0016](https://github.com/zoworkhq/oxygenui/blob/main/content/decisions/0016-the-installer-is-ours.md)
> (the installer is ours), [Oxygen ADR 0006](https://github.com/zoworkhq/oxygenui/blob/main/content/decisions/0006-stability-tiers-and-deprecation.md)
> (stability tiers and deprecation)
>
> **Deliberation:** [`2026-08-27-architecture-review.html`](../research/2026-08-27-architecture-review.html)
> §10 (package and repository structure), §27 (migration strategy)

## Context

Oxygen ADR 0002 makes both channels mandatory for every release: component
source lives in npm packages, and the copy-source registry is a generated
projection of the same files. Neither is a hand-maintained parallel copy.

The rationale is genuine and this record does not dispute it. A healthcare buyer
who must review what renders a potassium result gets to read it, own it and fork
it. The README sells that deliberately.

Copy-source works because an Oxygen component is *a file*. `ResultValue` is one
`.tsx`, its specifiers are rewritten from `@oxygenui/utils` to `@/lib/utils`,
and it lands in the customer's repository as something they can open.

The grid is not a file. It is fifteen packages across six layers with
cross-package dependencies, a plugin registration contract that composes types
across package boundaries, TypeScript project references, and a virtualiser
whose correctness depends on `grid-dom` and `grid-core` being the same version.
There is no specifier rewrite that makes `grid-react` find a copy-sourced
`grid-dom` in a customer's `components/` directory, and if there were, the first
customer to patch their copy of the renderer would own an accessibility model
that diverges from ours silently.

The deeper conflict is with what the grid promises. Oxygen ADR 0002 states
plainly that installing from the registry means forgoing updates — the customer
has forked, deliberately. The grid's stated commitments are versioning, a
deprecation policy, codemods and a five-year support window. Those are not
implementable over a fork.

Not doing this quietly is the failure mode. An accepted ADR that a sibling
repository silently ignores is worse than an exemption, because the next person
reads 0002, assumes both channels, and discovers the gap when a customer asks.

## Decision

**The grid publishes to npm only. The exemption from Oxygen ADR 0002 is
explicit, and the auditability that ADR was protecting is delivered by other
means.**

1. **Every grid package ships as a versioned npm dependency** under
   `@oxygenui-design`, ESM only, with independent per-package versioning via
   changesets. There is no registry projection and no `grid` entry in the
   Oxygen registry.

2. **Auditability is preserved, by a different route.** The repository is public
   and MIT ([still to settle — see §7 of the handover](../../HANDOVER.md));
   every package publishes declaration files and source maps with sources
   included, so a reviewer reads the actual source in their editor from
   `node_modules`; and a CycloneDX SBOM is generated per release, as Oxygen
   ADR 0009 already requires. What a reviewer loses is the ability to *edit* it
   in place — and editing the virtualiser in place is the outcome this record
   exists to prevent.

3. **Publishing follows Oxygen ADR 0009 unchanged:** from CI only, npm trusted
   publishing over OIDC, `--provenance`, dependencies pinned, `pnpm audit` as a
   gate.

4. **The exemption is stated in the README and in the docs' distribution page**,
   at the same prominence as the install instructions, with a link to this
   record. A reader who knows Oxygen's model must not have to discover the
   difference.

5. **Extension is by plugin, not by fork.** The six hooks and twelve named slots
   are the supported answer to "we need it to do something else". That contract
   is versioned; a fork is not.

## Consequences

**Good.** Patches reach consumers. The concrete failure Oxygen ADR 0002 was
written about — a comparator dropping a `<` so that `<0.01` renders as `0.01`,
"undetectable" becoming "detected at 0.01", with no channel to fix it — is
exactly the class of bug a grid ships. A recycling bug that puts one row's data
on another row is the same shape and worse. On npm it is a patch release and an
advisory; on copy-source it is unreachable.

**Good.** Codemods work. The migration story from antd `Table`, MUI `DataGrid`
and AG Grid depends on being able to transform against a known version, and
per-package versioning is what makes a codemod's applicability decidable.

**Good.** The version-skew failure is impossible. `grid-core` and `grid-dom`
cannot drift apart in a consumer's tree the way two copy-sourced files can,
because peer ranges are enforced at install.

**Cost.** We lose the strongest line in Oxygen's pitch for the single most
security-scrutinised component in the catalogue. "Yours to read, audit and
change" becomes "yours to read and audit", and the difference will come up in a
procurement conversation.

**Cost.** An Oxygen customer now holds two mental models — copy-source for
components, dependency for the grid — and will get it wrong at least once.
Mitigated only by saying so loudly and early, which is point 4.

**Cost.** A customer whose policy genuinely forbids third-party runtime
dependencies cannot use the grid at all. That customer exists in this market. We
are choosing not to serve them rather than shipping a fork we cannot support.

**Rejected: a bundled single-file copy-source build.** A 70 KB minified bundle
in a customer's repository satisfies the letter of dual-channel and none of its
intent — it is not auditable in the sense that mattered, and it still forks the
accessibility model beyond our reach. It would let us claim compliance with 0002
while delivering the opposite.

**Rejected: copy-source for `grid-healthcare` alone**, on the grounds that the
clinical logic is the part a reviewer wants to read. The clinical rules are
worthless without the engine that enforces them, and a forked disclosure policy
sitting over a versioned renderer is the worst of both. If a reviewer wants to
read the absence taxonomy, it is a public repository.

**Rejected: waiting to decide until the first release.** The distribution model
determines the package boundaries, the build outputs and the specifier style in
every source file. Deciding it after wave 1 means rewriting wave 1.
