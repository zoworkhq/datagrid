# -*- coding: utf-8 -*-
"""Sections 01–10."""
from model import fill
from mocklib import ic
import d_gap, d_comp, d_arch, d_plan
import figs, figs2
from collections import Counter


def s_summary():
    p0 = sum(1 for g in d_gap.GAPS if g[9] == "P0")
    gap = sum(1 for g in d_gap.GAPS if g[7] == "none")
    nobody = sum(1 for g in d_gap.GAPS if max(g[2:7]) <= 1)
    tw = sum(s[3] for s in d_plan.SCORE)
    cur = sum(s[1] * s[3] for s in d_plan.SCORE) / tw
    new = sum(s[2] * s[3] for s in d_plan.SCORE) / tw
    return fill("""
<div class="prose">
<div class="a-alert error" style="margin-bottom:1.2rem;font-size:0.9rem">@@ICA@@<span>
<b>First, the thing you need to know before reading anything else.</b>
<code>github.com/zoworkhq/datagrid</code> <b>does not exist.</b> I checked it directly, then checked five plausible
variants and listed every repository in the <code>zoworkhq</code> organisation. There is no code, no README, no demo,
no API and nothing to migrate. §@@N:audit@@ sets out what actually exists.
That changes this review from an audit into a design review — and, on balance, it is <em>good news</em>, because
five of the twelve problems found below are the kind that cannot be fixed after the first release.</span></div>

<p class="lede2">The previous brief was a good healthcare product document and a weak library-architecture document.
It assumed React, assumed a single package, assumed a row model that FHIR cannot supply, claimed a performance
tier that is not physically available, and left three security defects unaddressed. This review keeps the clinical
thesis — which is still the reason to build this — and replaces the engineering underneath it.</p>

<h4>The six findings that change the plan</h4>

<ol class="claims">
<li><b>The core must be framework-agnostic, and the renderer must sit below the adapters.</b> Not because
framework agnosticism is fashionable — it is expensive, and §@@N:risks@@ costs it honestly — but because the
accessibility model and the virtualiser are the parts nobody should write twice. AG Grid and TanStack both prove
the shape; the variation that makes it affordable is putting a <b>framework-free DOM renderer</b> between the
engine and the adapters, so an adapter is 4&nbsp;KB of binding with no grid logic in it.</li>

<li><b>The engine should be signal-based.</b> TanStack Table v9 shipped on 4 August 2026 on the alien-signals
architecture and measured <b>+79% row processing</b>, <b>+52% grouping</b>, and <b>up to 86% less retained
heap</b>. TC39 Signals is at Stage 1 with Angular, Vue, Solid, Preact, Ember and MobX contributors behind it. A
bespoke observer layer written in 2026 would be legacy by 2029.</li>

<li><b>Client-side one million rows was never available.</b> The same TanStack release reports <b>380&nbsp;MB
retained</b> for one million rows by eight columns — the best number in the category, down from 2.71&nbsp;GB. A
clinical grid has forty columns and runs on a shared workstation with 4&nbsp;GB and an EHR already open. The
brief's performance table had a 1M+ client row in it. <b>It should be deleted and replaced with a refusal.</b></li>

<li><b>FHIR breaks the coverage sentence.</b> Servers return opaque <code>link.next</code> URLs and the
specification is explicit that a client must not construct its own. <code>Bundle.total</code> is optional; major
servers omit or estimate it. So &ldquo;Showing 8 of 1,284&rdquo; — the sentence the entire coverage argument was
built on — <b>cannot be said against a large share of real FHIR servers</b>, and neither can a page number.
§@@N:discovered@@ shows what it has to degrade to.</li>

<li><b>Three security defects, one of which is remote code execution.</b> A patient's preferred name is free text
they supply. Exported to CSV it is a formula, and Excel, Sheets and LibreOffice all execute it — OWASP's own note
is that quoting fails once Excel re-saves the file. Separately: nothing prevented telemetry from carrying PHI, and
nothing prevented a custom cell renderer from injecting raw HTML. None of these is a feature request. They are
defects in the design as written.</li>

<li><b>Our assumed AI differentiator has already gone.</b> Syncfusion ships semantic filtering and anomaly
detection in its grid today; MUI X v9 ships an AI assistant in Premium. The differentiator is not the AI
features. It is <b>provenance and refusal</b> — being the only grid where an AI-derived value cannot be mistaken
for a verified one, and where an uncompilable query runs nothing rather than approximating.</li>
</ol>

<h4>The numbers</h4>

<div class="tblwrap"><table class="dtbl">
<tbody>
<tr><td class="nw"><b>@@NGAP@@ capabilities</b> compared</td><td>across six grid systems, architecture-first rather than feature-first. @@NAREA@@ areas.</td></tr>
<tr><td class="nw"><b>@@NP0@@ are P0</b></td><td>and every one of them is a type-system or DOM-structure decision that cannot be retrofitted.</td></tr>
<tr><td class="nw"><b>@@NNEW@@ we had not considered</b></td><td>including three security defects and one physical impossibility.</td></tr>
<tr><td class="nw"><b>@@NNOBODY@@ nobody has</b></td><td>and those are the product. Everything else is table stakes done carefully.</td></tr>
<tr><td class="nw"><b>@@NPKG@@ packages</b></td><td>in five layers, of which four ship in wave one.</td></tr>
<tr><td class="nw"><b>26–32 weeks</b>, six waves</td><td>wave one alone is a shippable, framework-agnostic grid with every gate already in place.</td></tr>
<tr><td class="nw"><b>Score @@CUR@@ → @@NEW@@ / 10</b></td><td>weighted across ten dimensions. §@@N:verdict@@.</td></tr>
</tbody></table></div>

<h4>The recommendation, in one paragraph</h4>

<p><b>Yes to a separate repository — and no to it being a separate product.</b> Create
<code>zoworkhq/datagrid</code> as a pnpm workspace of small packages, framework-agnostic from the first commit,
depending on OxygenUI's L0 packages and nothing above them. Ship <b>React only</b> in wave one and do not claim
agnosticism in public until the Angular adapter exists, because until a second adapter exists the claim is
untested. Keep the clinical thesis intact. Fix the three security defects before the first export ships. Delete
the 1M client-side row. And write the <code>limitations</code> copy before writing the disclosure code, because
the one risk here that can damage the company rather than the product is being mistaken for a compliance
boundary.</p>
</div>
""", ICA=ic("alert", "i ic"),
     NGAP=str(len(d_gap.GAPS)), NAREA=str(len(d_gap.AREAS)), NP0=str(p0),
     NNEW=str(gap), NNOBODY=str(nobody), NPKG=str(len(d_arch.PACKAGES)),
     CUR="%.1f" % cur, NEW="%.1f" % new)


def s_audit():
    return fill("""
<div class="prose">
<p class="lede2">You asked me to inspect the repository, its architecture, implementation, documentation, demos,
APIs and README before proposing changes. Here is exactly what I did and exactly what I found.</p>

<h4>What I checked</h4>
<div class="tblwrap"><table class="dtbl">
<thead><tr><th style="width:34%">Check</th><th>Result</th></tr></thead>
<tbody>
<tr><td><code>gh repo view zoworkhq/datagrid</code></td><td><code>Could not resolve to a Repository</code> — a 404, not a permissions error.</td></tr>
<tr><td>Five name variants</td><td><code>datagrid</code>, <code>data-grid</code>, <code>DataGrid</code>, <code>oxygen-datagrid</code>, <code>grid</code> — all 404.</td></tr>
<tr><td>Every repository in <code>zoworkhq</code></td><td>Ten: <code>oxygenui</code>, <code>fb</code>, <code>EHRUI</code>, <code>comp</code>, <code>theweb</code>, <code>formbuilder</code>, <code>zolink</code>, <code>zobox</code>, and forks of <code>quill</code> and <code>delta</code>. <b>No grid.</b></td></tr>
<tr><td>Authentication</td><td>Both the <code>rahulrajeevan</code> and <code>zoworkhq</code> accounts are authenticated with <code>repo</code> scope, so a private repository would have resolved.</td></tr>
<tr><td><code>zoworkhq/EHRUI</code></td><td>A Next.js clickable mockup — 48 behavioural-health components, explicitly mock data, no FHIR endpoint, no grid engine. Useful as a requirements source, not as an implementation.</td></tr>
<tr><td><code>zoworkhq/comp</code></td><td>An earlier snapshot of the OxygenUI workspace.</td></tr>
<tr><td>npm scope</td><td><code>@oxygenui-design/fhir</code> is published. <b>The <code>@oxygenui/*</code> names in your proposal are not the scope we own</b>; memory records that <code>@oxygenui</code> ownership was never confirmed. Unscoped <code>datagrid</code> is taken.</td></tr>
</tbody></table></div>

<h4>So what <em>is</em> the current state?</h4>

<p>One artefact: <code>oxygen-data-grid-brief.html</code> — 711&nbsp;kB, 32 sections, 23 prototypes — sitting
uncommitted in an OxygenUI worktree. It is a design document, not an implementation. There is no engine, no
adapter, no package, no test and no benchmark.</p>

<p>Plus the assets a grid would compose over, all of which are real and at Stable in OxygenUI: six clinical
primitives (<code>ClinicalStatus</code>, <code>ResultValue</code>, <code>RiskIndicator</code>,
<code>AllergyChip</code>, <code>TrendIndicator</code>, <code>ProvenanceChip</code>), the identity package with
<code>disambiguate()</code>, <code>CareTeamPresence</code>, <code>ChartCommandPalette</code>,
<code>@oxygenui-design/fhir</code>, the three-tier token pipeline, and the CI gates — contrast, axe across three
engines, 320&nbsp;px reflow, forced-colors, <code>size-limit</code>, dependency-cruiser.</p>

<div class="note">
<p><b>Why this is the best possible position to be in.</b> Of the @@NNEW@@ gaps found in this review,
<b>@@NP0GAP@@ are P0 and unretrofittable</b> — a required prop's shape, a discriminated absence union, the DOM
structure that carries <code>role="grid"</code>, a renderer contract that makes raw HTML a type error, a telemetry
contract that cannot carry a value. Every one of them is free to fix today and expensive to fix after the first
release. <b>Finding them before there is code is the whole return on this review.</b></p>
</div>

<div class="a-alert warning" style="font-size:0.87rem">@@ICW@@<span>One consequence worth stating plainly:
<b>§@@N:migration@@ &ldquo;migration from our existing Data Grid&rdquo; has no code to migrate.</b> I have written
it as a migration of the <em>design</em> — which claims survive, which are amended, which are deleted — plus the
migration path for consumers coming from antd, MUI and AG&nbsp;Grid, which is the migration that will actually
matter commercially.</span></div>
</div>
""", NNEW=str(sum(1 for g in d_gap.GAPS if g[7] == "none")),
     NP0GAP=str(sum(1 for g in d_gap.GAPS if g[7] == "none" and g[9] == "P0")),
     ICW=ic("alert", "i ic"))


def s_assess():
    rows = [
      ("The clinical thesis", "keep",
       "A grid is a claim about a population; the row is a person; sorting is a clinical act; live data must not move under the hand; the grid hosts cells rather than owning them.",
       "Still correct, still unmatched by any competitor, and still the only reason to build this rather than buy AG Grid."),
      ("Coverage as a required prop", "amend",
       "Required, no default, rendered in a fixed place, printed.",
       "Keep the requirement. <b>Amend the type</b>: <code>total</code> becomes <code>number | \"unknown\"</code> because FHIR cannot always supply one, and the sentence must be true when it does not."),
      ("Typed absence taxonomy", "keep", "Seven reasons a cell is empty.",
       "Correct and cheap. Add an eighth — <code>source-unreachable</code> — so a per-cell failure escalates into coverage."),
      ("Single React package", "replace",
       "<code>DataGrid</code> as one antd-compatible React component in the OxygenUI registry.",
       "<b>The largest change in this review.</b> Replaced by five layers and @@NPKG@@ packages. The antd props-parity idea survives as an <em>adapter-level</em> compatibility surface, not as the architecture."),
      ("Reducer-based state", "amend", "A reducer over a discriminated action union.",
       "Right instinct, wrong substrate. Keep actions as the write path — they are what makes behaviour replayable — and put <b>signals underneath</b> for the read path, which is where TanStack's 79% came from."),
      ("Performance table", "replace",
       "Budgets from 100 to 1,000,000+ rows, client and server.",
       "<b>Delete the 1M client-side row.</b> Add heap as a gate rather than a note, make the refusal threshold explicit, and measure CPU-throttled. §@@N:perf@@."),
      ("Pagination model", "replace", "Offset or cursor, chosen by the consumer.",
       "Against FHIR there is no choice: opaque cursor only, no totals, no page numbers. Cursor becomes the default and offset becomes the special case."),
      ("Cell host contract", "keep",
       "Seven obligations: measure, truncate, focus, read, sort, export, print.",
       "The best engineering idea in the brief. Add an eighth: <b>mask state</b>, which is what makes injection-safe and mask-preserving export possible at all."),
      ("Security", "replace", "Masking, break-glass, disclosure events.",
       "The <em>disclosure</em> model was good. The <em>software security</em> model was absent: no export-injection defence, no telemetry contract, no renderer safety contract. §@@N:security@@."),
      ("AI", "amend", "NL filtering, proposals, summaries, anomaly marks.",
       "The features are now table stakes — Syncfusion and MUI both ship them. Re-scope the section around provenance, refusal and confirmation, which nobody has."),
      ("Testing", "keep", "Property tests, keyboard-only tests, axe, VRT, benchmarks.",
       "Add three: <b>memory-leak regression</b>, <b>cross-adapter accessibility parity</b>, and <b>an export payload test</b> with a formula-injection fixture."),
      ("Documentation", "keep", "Generated pages, schema-driven.",
       "Correct, and now it needs a site of its own rather than a page in the OxygenUI catalogue."),
    ]
    trs = "".join(
      '<tr><td class="nw"><b>%s</b></td><td class="nw"><span class="dec-v %s">%s</span></td>'
      '<td class="t3">%s</td><td>%s</td></tr>' % (
        n, {"keep": "adopt", "amend": "partial", "replace": "reject"}[v], v, was, now)
      for n, v, was, now in rows)
    return fill("""
<div class="prose">
<p class="lede2">Twelve judgements on the previous brief. Four survive unchanged, four need amendment, and four
should be replaced. The pattern is consistent and worth naming: <b>the clinical reasoning was strong and the
library engineering was thin</b> — which is what you would expect from a document written to answer a product
question rather than an architecture one.</p>
</div>

<div class="tblwrap"><table class="dtbl">
<thead><tr><th style="width:15%">Decision</th><th class="nw">Verdict</th><th style="width:29%">What it said</th><th>What it should say</th></tr></thead>
<tbody>@@TRS@@</tbody></table></div>

<div class="prose"><div class="note">
<p><b>The honest summary.</b> The brief would have produced a very good React table for one product. It would not
have produced a library another engineering team evaluates against AG&nbsp;Grid — because it had no answer for
Angular, no answer for a million rows, no answer for FHIR paging, no answer for CSV injection, and no answer for
what happens when the second consumer arrives.</p>
</div></div>
""", TRS=trs, NPKG=str(len(d_arch.PACKAGES)))


def s_competitors():
    cards = []
    for c in d_comp.COMPETITORS:
        arch = "".join(
          '<tr><td class="nw"><b>%s</b></td><td>%s</td></tr>' % (k, v) for k, v in c["arch"])
        steal = "".join("<li>%s</li>" % s for s in c["steal"])
        avoid = "".join("<li>%s</li>" % s for s in c["avoid"])
        hard = ('<div class="a-alert warning" style="margin-top:.75rem;font-size:.85rem">%s'
                '<span><b>The number that matters:</b> %s</span></div>') % (
          ic("activity", "i ic"), c["hard_number"]) if c.get("hard_number") else ""
        cards.append(
          '<div class="eng" id="c-%s"><div class="eng-h"><b>%s</b><span class="st">%s</span>'
          '<span style="flex:1 1 auto"></span><span class="st">%s</span></div>'
          '<div class="eng-b">'
          '<p style="margin:0 0 .7rem;color:var(--ink-2);font-size:.89rem">%s</p>'
          '<div class="tblwrap" style="margin:.4rem 0"><table class="dtbl tight" style="margin:0">'
          '<tbody>%s</tbody></table></div>'
          '<div class="g2" style="gap:1rem;margin-top:.7rem">'
          '<div class="blk"><span class="k">What to take</span><ul>%s</ul></div>'
          '<div class="blk"><span class="k">What to avoid</span><ul>%s</ul></div></div>%s'
          "</div></div>" % (
            c["id"], c["name"], c["ver"], c["license"], c["one_line"], arch, steal, avoid, hard))
    return fill("""
<div class="prose">
<p class="lede2">Six systems, not five. I added <b>Glide Data Grid</b> because it is the most architecturally
interesting of all of them and because it settles a question that would otherwise keep being reopened: whether to
render on canvas.</p>

<p>Everything dated or numbered below was checked in August 2026 against documentation, release notes,
repositories or installed source. Where a claim could be measured rather than described, it was — the Ant Design
rows in the previous brief came from reading <code>antd@6.6.0</code> and
<code>@rc-component/table@1.11.1</code> in <code>node_modules</code>, and the same discipline applies here.</p>
</div>

@@CARDS@@

<div class="prose"><h4>Where the differences actually are</h4>
<p>Not features — everyone has features. The bottom half of this matrix is where nobody scores, and that is the
product.</p></div>

@@HEAT@@

<div class="prose"><div class="note">
<p><b>The honest reading.</b> AG&nbsp;Grid will beat us on the top half for at least two years; it has a decade in
its virtualiser and the only mature server-side row model in the category. TanStack has the best engine numbers
and the best type inference. MUI has the best server-data contract. <b>We should copy all three of those and
compete on the bottom half</b> — and if we ever find ourselves chasing AG&nbsp;Grid's feature list, we are
building a worse AG&nbsp;Grid.</p>
</div></div>
""", CARDS="".join(cards), HEAT=figs.fig_heat())


def s_gapmatrix():
    return fill("""
<div class="prose">
<p class="lede2">@@N@@ capabilities across @@A@@ areas, each scored against five competitors and against what the
previous brief actually specified. The matrix is filterable — the three lenses at the top are the ones worth
using.</p>

<ul>
<li><b>P0 + Not considered</b> is the shortest and most important list in this document: things that cannot be
retrofitted and that we had not thought about.</li>
<li><b>Nobody has it</b> is the differentiation surface. If those rows are excellent and the rest are merely
good, this is the right grid for a healthcare team.</li>
<li><b>Healthcare-driven</b> shows which requirements come from the domain rather than from the category —
@@HC@@ of @@N@@, which is the honest measure of how much of this is a healthcare product versus a grid.</li>
</ul>
</div>

@@FIG@@
""", N=str(len(d_gap.GAPS)), A=str(len(d_gap.AREAS)),
     HC=str(sum(1 for g in d_gap.GAPS if g[8])), FIG=figs.fig_gapmatrix())


def s_discovered():
    items = []
    for i, (title, sev, what, why) in enumerate(d_arch.DISCOVERED, 1):
        items.append(
          '<div class="eng"><div class="eng-h"><span class="sev %s">%s</span><b>%s</b></div>'
          '<div class="eng-b"><div class="blk"><span class="k">What is true</span><p>%s</p></div>'
          '<div class="blk"><span class="k">Why it matters here</span><p>%s</p></div></div></div>' % (
            sev, sev, title, what, why))
    return fill("""
<div class="prose">
<p class="lede2">Twelve things the previous brief did not consider. Four are marked critical, meaning the design
as written would have shipped a defect rather than merely missed a feature. Two of them invalidate claims the
brief made prominently.</p>
</div>

@@ITEMS@@

<div class="prose"><h4>The two that invalidate a claim</h4></div>

@@FHIR@@

<div class="prose" style="margin-top:1.6rem"><h4>And the one that is a vulnerability rather than a gap</h4>
<p>This is not a missing feature. A grid that exports what a patient typed into a name field, without defending
against formula interpretation, is a remote-code-execution path from a patient into a biller's workstation. It
would have shipped with the first export.</p></div>

@@CSV@@
""", ITEMS="".join(items), FHIR=figs2.fig_fhir(), CSV=figs2.fig_csv())


def s_hcopp():
    cells = [
      ("Patient identity", "PatientChip + disambiguate()", "ships", "Avatar, name, two identifiers, five photograph-absence states, and the newborn-twins case that colour and initials both fail."),
      ("Clinical status", "ClinicalStatus", "ships", "18 states across 5 scales including preliminary, corrected, entered-in-error, restricted, Part 2, break-glass, stale, self-reported and AI draft."),
      ("Lab / result", "ResultValue", "ships", "Value, unit, reference range, interpretation, delta, and thirteen absence and qualification states. Refuses to imply normality."),
      ("Risk", "RiskIndicator", "ships", "Score, band, drivers, percentile with cohort, model card, not-scored and expired. Supplies the sort-provenance metadata."),
      ("Allergy", "AllergyChip / AllergyList", "ships", "Criticality, refuted, unconfirmed, unable-to-assess, no-known-allergies and not-recorded as distinct states."),
      ("Trend", "TrendIndicator", "ships", "Direction, significance, reference band, assay change, unit change. Refuses a continuous line across an assay change."),
      ("Provenance", "ProvenanceChip", "ships", "Clinic, home device, patient-reported, external, extracted, extracted-and-confirmed, amended, stale, and the chain."),
      ("Care team", "CareTeamPresence", "ships", "Availability, coverage resolution, and who else is looking at this chart now."),
      ("Resolution", "GridResolutionCell", "new", "What is owed, by whom, by when. Nothing in the catalogue expresses an obligation and seven of the fourteen recipes are built on one."),
      ("Chip overflow", "GridChipOverflow", "new", "Two chips and a counted, accessible remainder — generalised over diagnoses, programmes, insurances, care team, authorisations and appointment types."),
      ("Scheduled dose", "GridDoseCell", "new", "Due, given, late, not given, held, refused, and <em>no dose scheduled</em> — the one that must not look like the others."),
      ("Masked region", "GridMaskedCell", "new", "Mask, reason, legal basis, accessible description, break-glass affordance, and <b>column spanning</b>, which our own mockup used and the brief never specified."),
      ("Eligibility", "GridEligibilityCell", "new", "Per-row async fetch from a payer that may time out. Three states the brief never covered: verified, stale, unreachable."),
      ("Claim / authorisation", "GridLedgerCell", "new", "Units remaining, expiry, denial reason and an ageing clock — all derived, all needing provenance."),
    ]
    trs = "".join(
      '<tr><td class="nw"><b>%s</b></td><td class="nw"><code>%s</code></td>'
      '<td class="nw"><span class="lay %s">%s</span></td><td>%s</td></tr>' % (
        n, c, "clin" if s == "ships" else "shell", "ships today" if s == "ships" else "new", d)
      for n, c, s, d in cells)
    return fill("""
<div class="prose">
<p class="lede2">You asked for a healthcare-aware platform rather than a generic grid with a healthcare theme, and
listed roughly thirty specialised cells. The important finding is that <b>eight of them already exist, at Stable,
with tests that assert their safety claims</b> — and that building a second set inside the grid would be the
worst outcome available: two implementations of &ldquo;is this result critical&rdquo; that can disagree.</p>

<p>So the healthcare layer's real job is not a cell catalogue. It is <b>the contract that lets an existing
catalogue live inside a virtualised, exportable, printable, screen-reader-navigable grid without being
rewritten</b> — plus the six cells that genuinely do not exist yet.</p>
</div>

<div class="tblwrap"><table class="dtbl">
<thead><tr><th style="width:16%">Concern</th><th style="width:19%">Component</th><th class="nw">Status</th><th>What it already knows</th></tr></thead>
<tbody>@@TRS@@</tbody></table></div>

<div class="prose">
<h4>The opportunity nobody in the category is addressing</h4>

<p>Every competitor treats healthcare as a rendering problem: you supply a <code>cellRenderer</code> and a CSS
class and you are on your own. The consequence is that <b>every healthcare product rebuilds the same twelve
decisions</b> — what an empty cell means, whether a preliminary result may be sorted with final ones, whether a
masked value exports, whether a risk score may be a default sort, whether a filtered list may claim to be
complete. Those decisions get made in a hurry by whoever is on the ticket, differently in each product, and they
are exactly the decisions with clinical consequence.</p>

<p><b>The product is the decisions, not the cells.</b> A cell catalogue is copyable in a quarter. A set of
enforced defaults about what a grid may and may not claim — expressed in types, gated by tests, and argued in
documentation — is not, and it is what makes a clinical safety officer sign off in an afternoon instead of a
month.</p>

<div class="note">
<p><b>One thing the brief and this review both under-weight.</b> Behavioural health is currently four of fourteen
recipes and it is still an unvalidated bet on the buyer. It has now been flagged in three documents without an
answer. If the buyer is general digital health rather than a behavioural-health platform, the right shape is two
BH recipes and two more in revenue-cycle — and that changes what wave three builds.</p>
</div>
</div>
""", TRS=trs)


def s_proposed():
    return fill("""
<div class="prose">
<p class="lede2">Five layers. The rule is the one OxygenUI already enforces with dependency-cruiser: a module may
import from its own layer or any layer below it, never above. Two additions specific to this architecture, both
load-bearing.</p>

<ol class="claims">
<li><b>The DOM renderer sits <em>below</em> the framework adapters, not inside them.</b> This is the decision that
makes framework agnosticism affordable. Accessibility, focus management, node recycling and scroll anchoring are
written once. An adapter that contains grid logic is a bug, and the cross-adapter parity test is what makes that
statement enforceable rather than aspirational.</li>
<li><b>The healthcare layer sits beside the renderer, never inside the engine.</b> Generic sorting must not know
what a reference range is, and a non-healthcare consumer must not pay a byte for one. This is the rule that keeps
the core reusable and the clinical logic reviewable.</li>
</ol>
</div>

@@LAYERS@@

<div class="prose">
<h4>What moves where, compared with the brief</h4>
<div class="tblwrap"><table class="dtbl tight">
<thead><tr><th style="width:26%">Concern</th><th style="width:24%">Brief</th><th>This proposal</th></tr></thead>
<tbody>
<tr><td>Sorting, filtering, selection</td><td><code>grid-core</code></td><td>Unchanged. Correct already.</td></tr>
<tr><td>Reactivity</td><td>implicit in React</td><td><code>grid-signals</code> — a façade, so TC39 Signals changes one file.</td></tr>
<tr><td>Virtualisation</td><td>&ldquo;the component&rdquo;</td><td><b>Split</b>: geometry in <code>grid-core</code>, DOM in <code>grid-dom</code>. Geometry is property-testable at 40,000 rows with no renderer.</td></tr>
<tr><td>ARIA, focus, keyboard</td><td>React component</td><td><code>grid-dom</code> — <b>once, for all frameworks</b>.</td></tr>
<tr><td>Cells</td><td>React components</td><td>A renderer interface in <code>grid-dom</code>; the adapter marshals framework components into it.</td></tr>
<tr><td>Coverage, absence, disclosure</td><td>props on <code>DataGrid</code></td><td><code>grid-healthcare</code>, so they cannot contaminate core and cannot be dropped by a consumer.</td></tr>
<tr><td>FHIR</td><td>not addressed</td><td><code>grid-fhir</code> — one interoperability profile among several.</td></tr>
<tr><td>Export, filters, AI, analytics</td><td>&ldquo;plugins&rdquo;</td><td>Real packages with a real registration contract. §@@N:plugins@@.</td></tr>
</tbody></table></div>
</div>
""", LAYERS=figs.fig_layers())


def s_agnostic():
    return """
<div class="prose">
<p class="lede2">This is the question with the highest cost attached, so it deserves the most honest answer in
the document. <b>Yes — but not the way the diagram in your brief draws it, and not in wave one.</b></p>

<h4>How the two credible models actually work</h4>

<p><b>AG Grid</b> is framework-agnostic by having no framework at all: a TypeScript core with its own IoC
container, its own component abstraction and its own data binding, wrapped by thin per-framework packages. It
works, it has for a decade, and the cost is a large unreadable core that nobody outside the company contributes
to.</p>

<p><b>TanStack Table v9</b> is agnostic by being <em>headless</em>: a pure core exposing state as atoms and
selectors, with ten adapters binding those atoms to each framework's native reactivity — Solid signals, Vue refs,
Svelte runes, Angular signals. It is a better shape, and the cost is that it renders nothing, so every consumer
owns accessibility and most get it wrong.</p>

<h4>The variation this proposal makes</h4>

<p>Neither model is right for us, for the same reason: <b>the part we most need to write once is the part
neither of them shares.</b> AG Grid shares a renderer but hides it behind a framework nobody wants to learn.
TanStack shares state but shares no rendering at all. Our differentiators — the ARIA contract, the keyboard
model, the focus behaviour under virtualisation, the masking that survives copy and export — all live in the
render layer.</p>

<p>So: <b>a framework-free DOM renderer as a first-class package, below the adapters.</b></p>

<pre class="code"><code>          grid-core          <span class="c-c">pure logic · signals · no DOM</span>
                ↓
          grid-dom           <span class="c-c">DOM, ARIA, focus, recycling, anchoring</span>
                ↓
   ┌────────┬───┴────┬────────┐
 react   angular    vue    element      <span class="c-c">~4 KB each · binding only</span>
</code></pre>

<p>An adapter's entire job is three things: own the mount point, marshal framework components into the
renderer's cell interface, and bridge framework reactivity to core signals. <b>If an adapter grows a fourth
job, the strategy has failed</b> and should be abandoned rather than nursed — which is a testable statement,
because the cross-adapter accessibility-tree assertion will catch it.</p>

<h4>The cost, stated honestly</h4>

<div class="tblwrap"><table class="dtbl">
<thead><tr><th style="width:26%">Cost</th><th>Reality</th></tr></thead>
<tbody>
<tr><td><b>Release surface ×4</b></td><td>Four packages to version, changelog and publish. Mitigated by changesets and one release workflow, but it is real.</td></tr>
<tr><td><b>Test matrix ×4</b></td><td>Mitigated by making it <em>one</em> test run four times, not four suites. This is the single most important discipline in the whole strategy.</td></tr>
<tr><td><b>Documentation ×4</b></td><td>Mitigated by <b>one page per framework</b>, not one documentation tree per framework. Everything conceptual is framework-free.</td></tr>
<tr><td><b>Cell rendering is genuinely harder</b></td><td>A React cell is a React element; a renderer that does not know React must portal into it. This is the one place the abstraction actually leaks, and the adapter is where the leak is handled.</td></tr>
<tr><td><b>SSR differs per framework</b></td><td>Next.js App Router, Angular Universal and Nuxt all hydrate differently. §@@SSR@@.</td></tr>
</tbody></table></div>

<h4>The recommendation</h4>

<ol class="claims">
<li><b>Build the core and renderer framework-free from the first commit.</b> This costs almost nothing at the
start and is close to impossible to retrofit.</li>
<li><b>Ship React only in wave one.</b> One adapter, fully supported.</li>
<li><b>Do not claim agnosticism publicly until Angular exists.</b> A README that lists four frameworks and
supports one is the fastest way to lose the trust of exactly the engineering teams we want. Until a second
adapter exists, the claim is untested.</li>
<li><b>Angular second, not Vue.</b> Behavioural-health and payer platforms skew Angular more than the React-first
world assumes, and Angular's signals make it the adapter that best validates the reactivity choice.</li>
<li><b>Vue, Svelte, Qwik and Solid are served by the custom element</b>, not by four more packages. That is where
a two-person team draws the line.</li>
</ol>

<div class="note">
<p><b>And the condition under which I would abandon this.</b> If, at the end of wave four, the Angular adapter is
larger than ~8&nbsp;KB or contains any logic the React adapter also contains, the abstraction is in the wrong
place. The correct response then is to stop at one framework and say so — not to keep paying a multiplier for a
claim we cannot honour.</p>
</div>
</div>
""".replace("@@SSR@@", "@@N:perf@@")


def s_repo():
    return fill("""
<div class="prose">
<p class="lede2"><b>Yes, a separate repository is correct</b> — for three reasons, none of which is
&ldquo;it has become large&rdquo;.</p>

<ol class="claims">
<li><b>Different release cadence and different consumers.</b> OxygenUI ships components as copy-source that a
customer owns and forks. A grid cannot work that way: it is a versioned dependency with a semver contract, a
deprecation policy and a five-year support window. Those two distribution models do not belong in one
repository.</li>
<li><b>Different dependency direction.</b> The grid depends on OxygenUI's L0 packages — tokens, FHIR types,
intl. Nothing in OxygenUI should depend on the grid. Making that a repository boundary makes it enforceable
rather than a convention.</li>
<li><b>Different audience.</b> A public repository with issues, benchmarks, a playground and a README written for
an engineer evaluating AG&nbsp;Grid is a different artefact from a private design system.</li>
</ol>

<p><b>And one reason it is risky:</b> two repositories means a cross-repo dependency on
<code>@oxygenui-design/tokens</code> that will drift, plus double the CI and governance overhead for a team that
is currently one person and an agent. §@@N:risks@@ prices that. The mitigating rule is narrow and should be
written into the repository's own contributing guide: <b>the grid may depend on OxygenUI L0 and nothing above
it.</b> If it needs an L2 component, that component moves down to L0 or is inlined.</p>

<h4>Monorepo, not single package</h4>
<p>A single package would force every consumer to ship the FHIR adapter, the AI plugin and the analytics WASM
bundle. A workspace of small packages with subpath exports is the only shape that lets a patient directory stay
at 26&nbsp;KB while a claims ledger takes everything.</p>
</div>

@@TREE@@

<div class="prose"><h4>The packages</h4>
<p>Fifteen at maturity. Four ship in wave one. Note the naming: <b><code>@oxygenui-design</code>, not
<code>@oxygenui</code></b> — the scope in your proposal is not the one we own, and
<code>@oxygenui-design/fhir</code> is already published there.</p></div>

@@PKGS@@

<div class="prose"><div class="note">
<p><b>On tooling, since you asked for justification rather than fashion.</b> <b>pnpm workspaces</b> — already in
use, and its strict linking catches phantom dependencies, which matters when the whole claim is that core has
none. <b>Turborepo</b> — already in use, and remote caching genuinely matters when the benchmark suite is on the
critical path. <b>TypeScript project references</b> — yes, because fifteen packages without them means a full
rebuild per change. <b>Changesets</b> — already in use and correct for independent per-package versioning.
<b>Nx</b> — no; Turborepo already does what we need and Nx's generators would be unused ceremony.
<b>CJS builds</b> — no, unless a named customer asks; ESM-only is the correct 2026 default and dual-publishing is
a permanent tax.</p>
</div></div>
""", TREE=figs2.fig_repotree(), PKGS=figs.fig_packages())
