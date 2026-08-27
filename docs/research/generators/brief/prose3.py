# -*- coding: utf-8 -*-
"""Sections 20–32."""
from model import Fig, fill
from mocklib import ic
import data_spec, data_bench
import mocks_b, mocks_c, mocks_d

F_MASK = Fig("f-mask", "Masking, restriction and break-glass", "privacy",
  "Viewed as a care navigator — a role with no treatment relationship. <b>Five rows are shown and two are "
  "masked</b>, because omitting a restricted row would let anyone probe for its existence by elimination. The "
  "count is always disclosed; the content is not. The break-glass card renders the prompt and emits the event; "
  "the decision is the server&rsquo;s, and the masked value must never have been in the payload.",
  mocks_c.fig_masking(), tags=("clin",))

F_PRINT = Fig("f-print", "Print sheet and export rules", "privacy",
  "The coverage sentence and the predicate print on <b>every page</b>, because print is where &ldquo;see "
  "all&rdquo; stops existing. The table on the right is the whole export contract in one place — and the row that "
  "matters is <b>masked values export masked</b>. A mask that is only a render concern is not a mask.",
  mocks_d.fig_print(), interactive=False, tags=("clin","plug"))

F_NL = Fig("f-nl", "Natural-language filter and AI provenance", "ai",
  "Press <b>Compile</b>. The sentence becomes chips — the same <code>FilterNode</code> the visual builder makes — "
  "and only then is there a button to run it. Edit the sentence to something the grid has no field for and it "
  "refuses rather than approximating. Below, four values with three provenances: none of them is distinguished by "
  "colour alone, and an AI-derived value can never satisfy the same assertion as a verified one.",
  mocks_d.fig_nl(), tags=("ai","clin"))

F_LOADING = Fig("f-loading", "Loading and loading-more", "states",
  "The coverage sentence is rendered <b>before the rows are</b>, because what the query is reaching is known "
  "before what it returns. A skeleton that hides it teaches the reader to ignore it.",
  mocks_c.fig_loading(), interactive=False, tags=("shell",))

F_EMPTY = Fig("f-empty", "Six empty states", "states",
  "Six sentences, not one &ldquo;No data&rdquo; card. <b>Nobody matched</b>, <b>nobody matched here</b>, and "
  "<b>you may not see who matched</b> are three different facts with three different next actions — and the "
  "buttons differ accordingly. The sixth is a partial failure, which is an alert rather than a footnote because "
  "the reader is about to convert an absence into a clinical fact.",
  mocks_c.fig_empty(), interactive=False, tags=("shell","clin"))


# --------------------------------------------------------------- 20 privacy
def s_privacy():
    split = [
      ("Minimum necessary", "Renders only the columns the resolved policy allows, and <b>states that a column was withheld</b> rather than silently dropping it.", "Decides what minimum necessary means for this role, this patient, this purpose. The policy is the server&rsquo;s."),
      ("Sensitive-field masking", "Renders the mask, its reason, and an accessible description. Masks survive copy, export and print.", "Must not send the value. A client-side mask over a value in the payload is theatre."),
      ("Permission-based columns", "Re-evaluates on policy change while open, removes the columns, and announces the change.", "Owns the policy and pushes changes."),
      ("Restricted records", "Shows the row as restricted, discloses the <em>count</em>, hides the content.", "Decides restriction. Also decides whether the count itself is disclosable — in a small programme, a count can identify."),
      ("Break-glass", "Renders the prompt, requires a structured reason, shows the expiry, emits the event.", "Grants or refuses, records, notifies, expires. <b>The grid must never be the thing that grants access.</b>"),
      ("Audit logging", "Emits <code>onDisclosure</code> for view, expand, inspect, export, print and copy.", "<b>Records it.</b> A client that logs its own access is a client that can choose not to. This is the clearest line in the table."),
      ("Export permission", "Asks, states the row and column count, and refuses when the policy says no.", "Authorises. Ideally also watermarks and records the export server-side."),
      ("Print restriction", "Renders the print sheet with its warning, and can be disabled by policy.", "Cannot actually stop a screenshot. Nobody can. Say so rather than implying otherwise."),
      ("Clipboard restriction", "Copies what is on screen, masks included; can be disabled by policy.", "Same limit, same honesty."),
      ("Session timeout", "Restores the view after re-auth; re-offers a pending write, never silently replays it.", "Owns the clock, the warning and the lock."),
      ("PHI in URLs", "Serialises a <em>view id</em>, not a predicate containing an MRN.", "Chooses whether view ids are shareable across users at all."),
    ]
    rows = "".join('<tr><td class="nw"><b>%s</b></td><td>%s</td><td>%s</td></tr>' % s for s in split)
    reg = [
      ("42 CFR Part 2", "Substance-use-disorder records need patient consent to redisclose, and enforcement of the aligned rule began <b>16 February 2026</b>.",
       "A Part 2 segment is a masked <em>region</em> of a row, not a hidden row, and its mask carries the legal reason — because a clinician who does not know why they cannot see it will call someone who can."),
      ("HIPAA minimum necessary", "Use and disclosure limited to what is needed for the purpose.",
       "Role presets are the operational expression of this. A front-desk view with no clinical columns is not a simplification — it is the rule."),
      ("Information blocking", "Practices that unreasonably interfere with access, exchange or use of EHI.",
       "Over-restricting is a compliance risk in the <em>other</em> direction. The grid&rsquo;s job is to render the policy honestly, never to invent restriction."),
      ("HTI-1 DSI transparency", "Predictive decision-support interventions must expose <b>31 source attributes</b>.",
       "Exactly what the sort-provenance banner and <code>RiskIndicator</code>&rsquo;s model card render. A risk column in a worklist <em>is</em> a decision-support intervention."),
      ("Minor consent", "Adolescent records with age- and jurisdiction-dependent disclosure rules.",
       "Column-level masking that varies per row — the case that proves masking cannot be a static column property."),
      ("Joint Commission NPSG.01.01.01", "Two person-specific identifiers before a care action.",
       "The identity cell&rsquo;s degradation order, and why the identifier is never what density removes."),
    ]
    rrows = "".join('<tr><td class="nw"><b>%s</b></td><td>%s</td><td>%s</td></tr>' % r for r in reg)
    return fill("""
<div class="prose">
<p class="lede2">This section exists to draw one line clearly, because getting it wrong in either direction is
harmful. <b>The component renders a policy. It never decides one, and it can never enforce one.</b></p>

<p>Oxygen UI is not a compliance boundary, and a grid is the component most likely to be mistaken for one. The
mitigation is that the split below is written before the code, and that every clause in the component&rsquo;s
<code>limitations</code> says what it does not do.</p>

<h4>What the component owns, and what the application must</h4>
</div>

<div class="tblwrap"><table class="dtbl">
<thead><tr><th style="width:17%">Concern</th><th style="width:41%">The grid</th><th>The application / server</th></tr></thead>
<tbody>@@ROWS@@</tbody></table></div>

@@FIGA@@

<div class="prose">
<h4>One policy evaluation, six behaviours</h4>
<p>The healthcare-50 brief identified an <b>Access &amp; Disclosure Kernel</b> as its most under-appreciated shared
engine, and the grid is its largest consumer. One <code>DisclosurePolicy</code> resolved per row × column feeds
column visibility, cell masking, row restriction, break-glass availability, export permission and the disclosure
events. Six behaviours from one evaluation means <b>six surfaces that cannot disagree</b> about who may see what —
and disagreement is the actual failure mode, not absence.</p>

<h4>Six regulatory anchors that change the UI</h4>
</div>

<div class="tblwrap"><table class="dtbl">
<thead><tr><th style="width:17%">Anchor</th><th style="width:36%">What it says</th><th>What it changes in the grid</th></tr></thead>
<tbody>@@RROWS@@</tbody></table></div>

@@FIGB@@

<div class="prose"><div class="note">
<p><b>The honest limits, stated where a reader will find them.</b> The grid cannot prevent a screenshot, cannot
prevent a photograph of a screen, cannot guarantee an export is not forwarded, and cannot make a printed sheet
traceable. It can make each of those a deliberate act with a visible consequence, and it can emit an event the
server records. Anything more would be a claim the component cannot keep — and per this library&rsquo;s own
standard, <b>a safety control trusted beyond its actual guarantee is worse than none</b>.</p>
</div></div>
""", ROWS=rows, FIGA=F_MASK.render(), RROWS=rrows, FIGB=F_PRINT.render())


# --------------------------------------------------------------- 21 ai
def s_ai():
    caps = [
      ("Natural-language filter", "high", "Compiles to <code>FilterNode</code>, renders as chips, runs only after a human sees it. <b>Refuses rather than approximates.</b>", "An AI filter that quietly narrows a cohort produces a result that looks exactly like a correct answer."),
      ("AI-proposed columns", "medium", "A proposal channel: <em>&ldquo;most of these rows differ on last contact — add it?&rdquo;</em> Never applied automatically.", "Low risk because a column is additive and visible."),
      ("Row summary", "medium", "One sentence per row, provenance-tagged, generated on demand rather than for every row.", "It is a pointer into the record, never a substitute for it. It must not be the only place a fact appears."),
      ("Anomaly marks", "medium", "A lens you turn on, marking rows that differ from the cohort.", "<b>Never a default sort.</b> Sorting by anomaly is triage by a model that was not validated for triage."),
      ("Smart grouping", "low", "Suggests a grouping column from cardinality and distribution.", "Statistical, not clinical. Safe because it changes presentation only."),
      ("Suggested actions", "high", "<em>&ldquo;9 of these 12 usually get a follow-up booked&rdquo;</em> as a proposal on a selection.", "This is one step from automating a clinical decision. It should be last, and it should be gated on a clinician reviewer."),
      ("AI-assisted column creation", "high", "A derived column from a described rule, shown as its compiled expression.", "The expression must be readable and editable. A derived column nobody can read is an unreviewable claim in a clinical list."),
    ]
    rows = "".join('<tr><td class="nw"><b>%s</b></td><td class="nw"><span class="sev %s">%s</span></td><td>%s</td><td class="t3">%s</td></tr>' % (
      n, {"high":"critical","medium":"high","low":"medium"}[r], r, w, d) for n, r, w, d in caps)
    return fill("""
<div class="prose">
<p class="lede2">Four rules, and they are the whole section. Everything else is application.</p>

<ol class="claims">
<li><b>AI output is a provenance state of a value, not a kind of column.</b> The catalogue already has the states:
<code>ClinicalStatus</code> has <em>AI draft</em>, <code>ResultValue</code> has <em>AI extracted</em>, and
<code>ProvenanceChip</code> has <em>extracted</em>, <em>extracted and confirmed</em>, and the whole chain. Nothing
new is needed to render AI honestly. Anything that <em>does</em> invent a new treatment for it is creating a
second vocabulary for the same idea.</li>
<li><b>Never mix generated and verified values in one cell.</b> A cell is one provenance. A row may mix; a cell
may not, because a reader reads a cell as one fact.</li>
<li><b>Distinguishable without colour.</b> A glyph and a word, like every other status in this library. An AI
treatment that is a purple tint disappears in forced-colors mode, which is exactly where it must not.</li>
<li><b>The proposal channel never writes.</b> AI may propose a filter, a column, a grouping or an action. Applying
it is always a human act, and the applied thing is always the same kind of object a human could have made by hand
— which is what makes it reviewable and reversible.</li>
</ol>
</div>

@@FIG@@

<div class="prose"><h4>Seven capabilities, ranked by how much they can hurt</h4></div>

<div class="tblwrap"><table class="dtbl">
<thead><tr><th style="width:17%">Capability</th><th class="nw">Risk</th><th style="width:36%">Treatment</th><th>Why</th></tr></thead>
<tbody>@@ROWS@@</tbody></table></div>

<div class="prose"><div class="note">
<p><b>The strongest argument for all of this is a published one.</b> The Epic Sepsis Model was deployed at
hundreds of hospitals; external validation found an AUC of 0.63 against the 0.76–0.83 cited internally, missing
two-thirds of sepsis cases and generating enough false alarms to require roughly 109 alerts per true positive. And
alert-override rates in clinical decision support run <b>46–96%</b> across studies, with acceptance dropping about
30% for each additional reminder in an encounter. A grid that adds a model column without adding the model&rsquo;s
provenance is contributing to exactly that, at scale, in the surface clinicians look at most.</p>
<p>Which is why the sort-provenance banner is not a nicety. It is the one place in a worklist where a model&rsquo;s
quality can be read at the moment it is being used to decide who is seen first.</p>
</div></div>
""", FIG=F_NL.render(), ROWS=rows)


# --------------------------------------------------------------- 22 tech
def s_tech():
    return """
<div class="prose">
<p class="lede2">Three layers, and the brief&rsquo;s question — headless engine versus styled component versus
healthcare extension — has a clear answer here: <b>all three, with the middle one replaceable.</b></p>

<p>That is not a compromise; it is the shape this repository&rsquo;s layer model already mandates. L1 exists so
that L2 is skinnable, and the reason is stated in <code>ARCHITECTURE.md</code>: when a customer needs their own
visual language they rebuild L2 and keep L1, <em>which is where the accessibility correctness lives</em>. For a
grid that is not a nice property — it is the whole value, because the keyboard model and the ARIA contract are the
parts nobody should be rewriting.</p>
</div>

<div class="arch">
  <div class="arch-l"><div class="hd"><span>L3 · composition</span><b>Recipes &amp; shells</b></div>
    <div class="bd"><span class="u new">InspectorLayout</span><span class="u new">roster</span><span class="u new">census</span>
      <span class="u new">board</span><span class="u new">caseload</span><span class="u new">registry</span><span class="u new">queue</span>
      <span class="u new">flowsheet</span><span class="u new">mar</span><span class="u new">list</span><span class="u new">plan</span>
      <span class="u new">schedule</span><span class="u new">ledger</span><span class="u new">cohort</span><span class="u new">stream</span></div>
    <div class="note2">A recipe is a <code>GridView</code> document plus a column set. <b>Data, not code</b> — which is why a
      product declares a caseload rather than building one, and why a recipe can be edited by a designer.</div>
  </div>
  <div class="arch-down">↑</div>
  <div class="arch-l"><div class="hd"><span>L2 · components</span><b>DataGrid — the presentation layer</b></div>
    <div class="bd"><span class="u hot new">DataGrid</span><span class="u new">DataGridToolbar</span><span class="u new">DataGridHeaderCell</span>
      <span class="u new">DataGridRow</span><span class="u new">DataGridCell</span><span class="u new">DataGridInspector</span>
      <span class="u new">DataGridSelectionBar</span><span class="u new">FilterBuilder</span><span class="u new">SavedViews</span>
      <span class="u new">ColumnPanel</span><span class="u new">GridCoverage</span>
      <span class="u">ClinicalStatus</span><span class="u">ResultValue</span><span class="u">RiskIndicator</span>
      <span class="u">AllergyChip</span><span class="u">TrendIndicator</span><span class="u">ProvenanceChip</span>
      <span class="u">PatientChip</span><span class="u">CareTeamPresence</span><span class="u">ChartCommandPalette</span></div>
    <div class="note2">Solid chips already ship at Stable. The grid is a <b>host</b> for them, not a replacement — which is why the
      cell host contract in §@@N:cells@@ is the real new engineering here.</div>
  </div>
  <div class="arch-down">↑</div>
  <div class="arch-l"><div class="hd"><span>L1 · behaviour</span><b>@oxygenui-design/grid-core — headless</b></div>
    <div class="bd"><span class="u hot new">createGrid()</span><span class="u new">rowModel</span><span class="u new">sortModel</span>
      <span class="u new">filterModel</span><span class="u new">FilterNode</span><span class="u new">selectionModel</span>
      <span class="u new">groupModel</span><span class="u new">treeModel</span><span class="u new">aggregation</span>
      <span class="u new">virtualiser</span><span class="u new">GridQuery / GridPage</span><span class="u new">GridView</span>
      <span class="u new">keymap</span><span class="u">useCommitPhase()</span><span class="u">disambiguate()</span></div>
    <div class="note2">No React, no DOM, no dependencies — matching <code>tabs-core</code>, <code>signature-core</code> and
      <code>identity-core</code>. Everything here is testable without a renderer, which is what makes 40,000-row property tests cheap.</div>
  </div>
  <div class="arch-down">↑</div>
  <div class="arch-l"><div class="hd"><span>L0 · foundation</span><b>Types, tokens, terminology</b></div>
    <div class="bd"><span class="u">@oxygenui-design/fhir</span><span class="u">@oxygenui-design/tokens</span>
      <span class="u">@oxygenui-design/intl</span><span class="u new">DisclosurePolicy</span><span class="u new">Coverage</span>
      <span class="u new">Absence</span></div>
    <div class="note2">All three new types belong here, not in the grid, because a timeline, a results list and a medication list
      need the same three and must not each invent one.</div>
  </div>
</div>

<div class="prose">
<h4>Why not build on TanStack Table v9</h4>
<p>It is the strongest candidate and it deserves a real answer rather than a reflex. v9 went stable on 4 August
2026: modular, tree-shaken, roughly 25&nbsp;KB min+brotli for the full package, with up to 90% memory savings on
large tables and adapters that bind to each framework&rsquo;s native reactivity. It is MIT and it is genuinely
well-made.</p>
<p><b>The recommendation is still no dependency</b>, for three reasons in order of weight:</p>
<ol>
<li><b>Our row model is not its row model.</b> A row here carries a disclosure evaluation, an absence taxonomy per
cell, a coverage contribution and an identity that is a safety control. Those are not decorations on a row —
they participate in filtering, aggregation, export and announcement. Bolting them on means shadowing most of the
pipeline, which is paying for a dependency you route around: <b>the exact argument ADR&nbsp;0010 used to settle
the Switch.</b></li>
<li><b>Copy-source distribution requires self-contained files.</b> ADR&nbsp;0002 preserves a channel where a
customer receives readable source. A registry component that pulls a large external state library is a different
product.</li>
<li><b>Virtualisation is separate there.</b> The two hardest problems — the row-model pipeline and windowing —
live in different repositories with different mental models, and scroll anchoring across dynamic row heights sits
exactly in the seam.</li>
</ol>
<p><b>Read its pipeline closely, though.</b> The layered row-model design is the right shape and v9&rsquo;s
memory work is exactly our problem at 100,000 rows. Borrow the architecture; do not take the dependency.</p>

<div class="note">
<p><b>What antd compatibility means concretely.</b> <code>columns</code>, <code>dataSource</code>,
<code>rowKey</code>, <code>rowSelection</code>, <code>expandable</code>, <code>pagination</code>,
<code>scroll</code>, <code>sticky</code>, <code>virtual</code>, <code>size</code>, <code>bordered</code>,
<code>loading</code> and <code>onChange(pagination, filters, sorter, extra)</code> all keep their antd meanings,
asserted by a props-parity table in the test suite so an antd rename fails our build. Three divergences, all
listed in <code>limitations</code>: <code>coverage</code> is required and antd has no equivalent;
<code>size</code> gains a fourth value; and <code>loading</code> does not disable interaction — the same
divergence the Switch already declared, for the same reason.</p>
</div>
</div>
"""


# --------------------------------------------------------------- 23 hierarchy
def s_hierarchy():
    tree = [
      (0,"DataGrid","The only component most consumers import. Owns the store and the context.","new"),
      (1,"DataGridToolbar","Slot. Search, quick filters, views, columns, export.","new"),
      (2,"DataGridSearch","Narrow, in-place. Composes ChartCommandPalette for the wide case.","new"),
      (2,"DataGridQuickFilters","Named predicates with counts computed against the other filters.","new"),
      (2,"DataGridViewSwitcher","Six-source precedence resolution, rendered as a menu.","new"),
      (2,"DataGridColumnPanel","Visibility, order, pinning. Keyboard-operable.","new"),
      (1,"DataGridFilterBar","Chips over the FilterNode tree. Individually removable.","new"),
      (1,"DataGridFilterBuilder","The nested and/or/not editor. Lazy — a plugin.","new"),
      (1,"DataGridSortProvenance","Renders only when the primary sort is derived or model-backed.","new"),
      (1,"DataGridSelectionBar","Replaces the toolbar while a selection exists.","new"),
      (2,"DataGridBulkReview","Names the people, re-resolves the predicate, reports per-row outcomes.","new"),
      (1,"DataGridArrivals","The queue that keeps live data from moving the ground.","new"),
      (1,"DataGridViewport","role=grid. Owns scroll, focus and the virtualiser.","new"),
      (2,"DataGridHeader","aria-rowindex 1. Sticky.","new"),
      (3,"DataGridHeaderCell","Sort, resize, reorder, pin, menu — all with keyboard paths.","new"),
      (2,"DataGridBody","One tab stop. Roving tabindex inside.","new"),
      (3,"DataGridRow","aria-rowindex absolute. Status rail. Selection.","new"),
      (4,"DataGridCell","The cell host: measure, truncate, focus, read, sort, export, print.","new"),
      (5,"<i>any catalogue component</i>","ClinicalStatus · ResultValue · RiskIndicator · AllergyChip · TrendIndicator · ProvenanceChip · PatientChip · CareTeamPresence","ship"),
      (5,"GridIdentityCell","PatientChip + page-scoped disambiguate() + density degradation.","new"),
      (5,"GridResolutionCell","What is owed, by whom, by when.","new"),
      (5,"GridChipOverflow","Two chips and a counted, accessible remainder.","new"),
      (5,"GridDoseCell","The MAR's scheduled-dose state machine.","new"),
      (5,"GridMaskedCell","Mask, reason, accessible description, break-glass affordance.","new"),
      (3,"DataGridDetailRow","In-place expansion. Declares what fraction of the record it shows.","new"),
      (3,"DataGridGroupHeader","Sticky. Count and aggregates, with unit refusal.","new"),
      (2,"DataGridSummary","Footer aggregates that must foot exactly.","new"),
      (1,"DataGridStates","Skeleton · six empty states · partial failure · error · offline · restricted.","new"),
      (1,"DataGridPagination","Offset or cursor. Never both.","new"),
      (1,"GridCoverage","Required. Fixed place. Prints.","new"),
      (1,"DataGridLiveRegion","role=status, plus two justified uses of role=alert.","new"),
      (0,"InspectorLayout","Composition-layer sibling, not a child. The grid is its first consumer.","new"),
    ]
    rows = "".join(
      '<tr><td style="padding-inline-start:%dpx"><code>%s</code></td><td>%s</td>'
      '<td class="nw">%s</td></tr>' % (
        d * 18, n, w,
        '<span class="lay clin">ships today</span>' if k == "ship" else '<span class="lay shell">new</span>')
      for d, n, w, k in tree)
    return fill("""
<div class="prose">
<p class="lede2">Thirty-two components, and the brief&rsquo;s proposed list was close. Six changes are worth
arguing.</p>

<ol class="claims">
<li><b>No <code>PatientCell</code>, <code>StatusCell</code>, <code>LabResultCell</code>,
<code>MedicationCell</code>, <code>ClinicalAlertCell</code> or <code>ProviderCell</code>.</b> Those are the
catalogue&rsquo;s existing components inside a cell host. Duplicating them would create two implementations of
&ldquo;is this result critical&rdquo; that can disagree, which is the failure this library exists to prevent.</li>
<li><b><code>DataGridColumn</code> is not a component.</b> Column-as-JSX is antd&rsquo;s
<code>&lt;Table.Column&gt;</code> and it is the API that makes a column set unserialisable — you cannot store JSX
in a saved view. A column is a <b>typed object</b>. This is the single most consequential API decision in the
document.</li>
<li><b><code>DataGridVirtualizer</code> is not a component either.</b> It is geometry, and it belongs in
<code>grid-core</code> where it can be property-tested at 40,000 rows without a renderer.</li>
<li><b>Add <code>DataGridArrivals</code> and <code>DataGridSortProvenance</code>.</b> Neither exists in any other
grid, and both carry an argument from §@@N:live@@ and §@@N:ai@@.</li>
<li><b><code>GridCoverage</code> is a child of the grid, not an option.</b> Making it a sibling would let a
product forget it, which is precisely what ADR&nbsp;0011 forbids.</li>
<li><b><code>InspectorLayout</code> is a sibling, not a child.</b> It is a platform pattern that a timeline, a
document list and a claim should also use. Building it inside the grid guarantees the second consumer copies
it.</li>
</ol>
</div>

<div class="tblwrap"><table class="dtbl tight">
<thead><tr><th style="width:32%">Component</th><th>Responsibility</th><th class="nw">Status</th></tr></thead>
<tbody>@@ROWS@@</tbody></table></div>
""", ROWS=rows)


# --------------------------------------------------------------- 24 state
def s_state():
    slices = [
      ("<code>columns</code>", "engine", "Definition, order, width, visibility, pinning.", "Serialisable. Part of GridView."),
      ("<code>sort</code>", "engine", "Ordered list of { key, direction }.", "Serialisable. Empty is a valid, reachable state."),
      ("<code>filter</code>", "engine", "One FilterNode tree.", "Serialisable. The single source for chips, URL, export and NL."),
      ("<code>selection</code>", "engine", "{ predicate, includedIds, excludedIds }.", "<b>Not</b> serialisable into a view — a selection is not a preference."),
      ("<code>pagination</code>", "engine", "Offset or cursor, never both.", "Page size is serialisable; position is not."),
      ("<code>grouping</code>", "engine", "Keys plus expansion set.", "Serialisable."),
      ("<code>expansion</code>", "engine", "Expanded row ids and tree node states.", "Session only, plus one row in the URL."),
      ("<code>focus</code>", "shell", "{ rowIndex, colIndex } in <em>absolute</em> coordinates.", "Session only. Absolute so it survives a scroll that unmounts the row."),
      ("<code>viewport</code>", "shell", "Scroll offsets, measured heights, the rendered window.", "Derived. Never persisted."),
      ("<code>data</code>", "async", "Rows, total, cursor, per-source status.", "Owned by the query layer. <b>Never in a view.</b>"),
      ("<code>coverage</code>", "prop", "What the query reached.", "A required prop, not state. It comes from the caller because the caller is what knows a source timed out."),
      ("<code>policy</code>", "prop", "The resolved disclosure evaluation.", "A prop, and it may change while open."),
      ("<code>editing</code>", "shell", "Commit phase per cell, per row.", "Session only, and survives re-auth as a pending write."),
      ("<code>pending</code>", "async", "Optimistic updates awaiting confirmation.", "Rolled back with the server's value, never with the previous local one."),
    ]
    rows = "".join('<tr><td class="nw">%s</td><td class="nw"><span class="lay %s">%s</span></td><td>%s</td><td>%s</td></tr>' % (
      n, {"engine":"core","shell":"shell","async":"plug","prop":"clin"}[k], k, w, d) for n, k, w, d in slices)
    return fill("""
<div class="prose">
<p class="lede2">Fourteen slices, four owners, and one rule that decides where each lives: <b>if it can be
serialised into a saved view, it belongs to the engine.</b> Everything else is session or derived.</p>

<p>The engine is a reducer over a discriminated union of actions. Not because reducers are fashionable, but
because three properties fall out of it that a grid genuinely needs: every state transition is a value that can be
logged, replayed and property-tested; the whole engine is testable with no renderer; and undo/redo is a stack of
actions rather than a bespoke feature.</p>
</div>

<div class="tblwrap"><table class="dtbl">
<thead><tr><th class="nw">Slice</th><th class="nw">Owner</th><th style="width:30%">What it holds</th><th>Rule</th></tr></thead>
<tbody>@@ROWS@@</tbody></table></div>

<div class="prose">
<h4>Two rules that prevent the classic grid bugs</h4>
<ul>
<li><b>Data is never state.</b> The grid does not own rows; it renders what it is given and asks for more through
one contract. This is what makes client mode and server mode the same consumer API, and it is what stops a
&ldquo;refresh&rdquo; button from being subtly different from a filter change.</li>
<li><b>Derived values are selectors, not stored fields.</b> The visible row window, the group tree, the summary
row and the chip set are all derived through memoised, layered selectors. A stored derived field is a cache
invalidation bug with a date on it.</li>
</ul>
<div class="note">
<p><b>Where the query lives is deliberately not our decision.</b> The grid takes a <code>GridQuery</code> and
returns a <code>GridPage</code>; whether that is TanStack Query, SWR, RTK Query, a plain fetch or a
SMART-on-FHIR client is the application&rsquo;s business. The grid supplies the cache key — the serialised
<code>GridQuery</code> — which is the only part it is uniquely able to get right, and it is the same value the
URL and the saved view use.</p>
</div>
</div>
""", ROWS=rows)


# --------------------------------------------------------------- 25 api
def s_api():
    return """
<div class="prose">
<p class="lede2">The test for this API is the one this repository already applies: a simple grid should be four
lines, and every advanced capability should be reachable without leaving the type system. Ten examples, in the
order a developer meets them.</p>

<h4>1 · The simplest honest grid</h4>
</div>

<pre class="code"><code><span class="c-k">import</span> { DataGrid, coverage } <span class="c-k">from</span> <span class="c-s">"@/components/oxygen/data-grid"</span>;

&lt;DataGrid
  data={patients}
  columns={columns}
  rowKey=<span class="c-s">"id"</span>
  coverage={coverage.local()}   <span class="c-c">// "8 of 8, from this application"</span>
/&gt;</code></pre>

<div class="prose"><p><code>coverage.local()</code> is the honest one-line minimum for a single-source query. It
is not a default — the caller states it — but it is one line, which is the mitigation ADR&nbsp;0011 asks for.</p>

<h4>2 · Columns are objects, never JSX</h4>
<p>The most consequential decision in the API. A column set must be serialisable, because a saved view stores one
and a server may supply one. <code>&lt;Table.Column&gt;</code> makes that impossible.</p></div>

<pre class="code"><code><span class="c-k">const</span> columns: GridColumn&lt;Patient&gt;[] = [
  {
    key: <span class="c-s">"patient"</span>,
    header: <span class="c-s">"Patient"</span>,
    <span class="c-c">// Identity is a cell type, not a renderer — so the grid can enforce</span>
    <span class="c-c">// its degradation order and its disambiguation scope.</span>
    cell: { type: <span class="c-s">"identity"</span>, patient: (r) =&gt; r.resource, identifiers: [{ kind: <span class="c-s">"mrn"</span> }] },
    width: 240,
    pinned: <span class="c-s">"start"</span>,
    required: <span class="c-k">true</span>,          <span class="c-c">// may not be hidden — it is who the row is about</span>
    priority: 1,               <span class="c-c">// responsive · print · export · card, all from this</span>
  },
  {
    key: <span class="c-s">"potassium"</span>,
    header: <span class="c-s">"Potassium"</span>,
    cell: { type: <span class="c-s">"result"</span>, observation: (r) =&gt; r.latest.potassium },
    sort: { kind: <span class="c-s">"quantity"</span>, unit: <span class="c-s">"mmol/L"</span> },   <span class="c-c">// refuses to sort across units</span>
    filter: { kind: <span class="c-s">"clinical-range"</span> },
    align: <span class="c-s">"end"</span>,
    priority: 3,
  },
  {
    key: <span class="c-s">"risk"</span>,
    header: <span class="c-s">"Risk"</span>,
    cell: { type: <span class="c-s">"risk"</span>, value: (r) =&gt; r.risk },
    <span class="c-c">// A derived or model column MUST declare its provenance. The type</span>
    <span class="c-c">// requires it: `derived: true` without `provenance` does not compile.</span>
    derived: <span class="c-k">true</span>,
    provenance: {
      model: <span class="c-s">"Zowork RiskNet"</span>, version: <span class="c-s">"3.2"</span>,
      validatedOn: <span class="c-s">"2026-02-11"</span>, cStatistic: 0.71,
      population: <span class="c-s">"adult behavioural health, this network"</span>,
      attributes: 31,                    <span class="c-c">// HTI-1 DSI source attributes</span>
    },
    priority: 2,
  },
];</code></pre>

<div class="prose"><h4>3 · The absence taxonomy is in the type, not in the renderer</h4></div>

<pre class="code"><code><span class="c-k">type</span> Absent =
  | { reason: <span class="c-s">"not-ordered"</span> }
  | { reason: <span class="c-s">"not-resulted"</span>; orderedAt: string }
  | { reason: <span class="c-s">"not-measured"</span> }
  | { reason: <span class="c-s">"not-applicable"</span>; because: string }
  | { reason: <span class="c-s">"declined"</span>; by: <span class="c-s">"patient"</span> | <span class="c-s">"clinician"</span> }
  | { reason: <span class="c-s">"specimen-problem"</span>; detail: string }
  | { reason: <span class="c-s">"withheld"</span>; policy: string }        <span class="c-c">// renders as masked</span>
  | { reason: <span class="c-s">"source-unreachable"</span>; source: string }; <span class="c-c">// escalates to the coverage bar</span>

<span class="c-c">// A cell value is a value, or a reason there isn't one. There is no third</span>
<span class="c-c">// option, and `undefined` is a type error rather than an em dash.</span>
<span class="c-k">type</span> CellValue&lt;T&gt; = { value: T } | { absent: Absent };</code></pre>

<div class="prose"><h4>4 · Coverage — the required prop</h4></div>

<pre class="code"><code>&lt;DataGrid
  coverage={{
    sources: [
      { id: <span class="c-s">"ehr"</span>,      label: <span class="c-s">"Riverside EHR"</span>,      status: <span class="c-s">"ok"</span> },
      { id: <span class="c-s">"pdmp"</span>,     label: <span class="c-s">"State PDMP"</span>,         status: <span class="c-s">"partial"</span>,
        reason: <span class="c-s">"2 counties not covered"</span> },
      { id: <span class="c-s">"exchange"</span>, label: <span class="c-s">"Regional exchange"</span>,  status: <span class="c-s">"unreachable"</span>,
        reason: <span class="c-s">"timed out after 4s"</span> },   <span class="c-c">// → role="alert", not a footnote</span>
    ],
    total: 1284,
    excluded: [{ count: 3, reason: <span class="c-s">"restricted to the treating team"</span> }],
    asOf: serverTime,
  }}
/&gt;</code></pre>

<div class="prose"><p><code>sources</code> is a non-empty tuple in the type, so an empty array cannot satisfy it —
the same construction <code>CareTimeline</code> already uses. A source in any state other than <code>ok</code>
must carry a <code>reason</code>, and <code>validateCoverage()</code> returns a problem when it does not, which
the grid renders rather than rendering around.</p>

<h4>5 · Server-side: one query in, one page out</h4></div>

<pre class="code"><code><span class="c-k">interface</span> GridQuery {
  filter: FilterNode | <span class="c-k">null</span>;
  sort: { key: string; direction: <span class="c-s">"asc"</span> | <span class="c-s">"desc"</span> }[];
  group: string[];
  page: { kind: <span class="c-s">"offset"</span>; offset: number; limit: number }
      | { kind: <span class="c-s">"cursor"</span>; after: string | <span class="c-k">null</span>; limit: number };
  search: { term: string; scopes: SearchScope[] } | <span class="c-k">null</span>;
}

<span class="c-k">interface</span> GridPage&lt;T&gt; {
  rows: T[];
  total: number | <span class="c-s">"unknown"</span>;   <span class="c-c">// "unknown" is honest; 0 is not</span>
  cursor: string | <span class="c-k">null</span>;
  coverage: Coverage;               <span class="c-c">// the server owns this, and it should</span>
}

&lt;DataGrid
  mode=<span class="c-s">"server"</span>
  query={<span class="c-k">async</span> (q, signal) =&gt; fetchPatients(q, { signal })}
  <span class="c-c">// The cache key IS the serialised query — same value the URL and</span>
  <span class="c-c">// the saved view use. One idea, three consumers.</span>
/&gt;</code></pre>

<div class="prose"><h4>6 · A view is a document</h4></div>

<pre class="code"><code><span class="c-k">interface</span> GridView {
  version: 1;                       <span class="c-c">// versioned from the first commit, not the first migration</span>
  id: string;
  name: string;
  scope: <span class="c-s">"default"</span> | <span class="c-s">"organisation"</span> | <span class="c-s">"role"</span> | <span class="c-s">"team"</span> | <span class="c-s">"personal"</span>;
  locked?: <span class="c-k">boolean</span>;
  columns: { key: string; width?: number; pinned?: <span class="c-s">"start"</span> | <span class="c-s">"end"</span>; hidden?: <span class="c-k">boolean</span> }[];
  sort: GridQuery[<span class="c-s">"sort"</span>];
  filter: FilterNode | <span class="c-k">null</span>;
  group: string[];
  density: <span class="c-s">"comfortable"</span> | <span class="c-s">"standard"</span> | <span class="c-s">"compact"</span> | <span class="c-s">"ultra"</span>;
  pageSize: number;
  <span class="c-c">// Deliberately absent: data, selection, scroll, focus. A view is a</span>
  <span class="c-c">// question, never a cached answer.</span>
}

<span class="c-c">// The product default, the role preset and the user's saved view are the</span>
<span class="c-c">// SAME type from three sources. Later wins; the result names its origin.</span>
<span class="c-k">const</span> view = resolveView([productDefault, orgView, rolePreset, teamView, personalView]);</code></pre>

<div class="prose"><h4>7 · Filters are one tree</h4></div>

<pre class="code"><code><span class="c-k">type</span> FilterNode =
  | { op: <span class="c-s">"and"</span> | <span class="c-s">"or"</span>; children: FilterNode[] }
  | { op: <span class="c-s">"not"</span>; child: FilterNode }
  | { field: string; operator: FilterOperator; value: unknown };

<span class="c-c">// Every producer returns this shape and nothing else:</span>
filterFromChips(chips)          <span class="c-c">// the chip bar</span>
filterFromBuilder(builderState) <span class="c-c">// the visual builder</span>
filterFromUrl(searchParams)     <span class="c-c">// a shared link</span>
filterFromNaturalLanguage(text) <span class="c-c">// → { ok: true, node } | { ok: false, unmatched }</span>

<span class="c-c">// ...and one consumer renders it as the sentence that prints:</span>
describeFilter(node, { terminology })
<span class="c-c">// "Programme is Behavioural Health AND Risk is any of High, Imminent</span>
<span class="c-c">//  AND (Last encounter is before 24 Jul 2026 OR Next appointment is none)"</span></code></pre>

<div class="prose"><p>The natural-language compiler returns a <b>result type, not a node</b>. It cannot fail
silently, and it cannot approximate — an unmatched clause is returned so the UI can say what it could not
understand.</p>

<h4>8 · Editing has a commit phase</h4></div>

<pre class="code"><code>&lt;DataGrid
  editing={{
    mode: <span class="c-s">"cell"</span>,
    canEdit: (row, col) =&gt; policy.allows(row, col, <span class="c-s">"write"</span>),
    validate: (draft) =&gt; validateDose(draft),
    <span class="c-c">// Reuses useCommitPhase() from the Switch: idle → pending → committed,</span>
    <span class="c-c">// with `stale` when the server saw a newer version.</span>
    commit: <span class="c-k">async</span> (draft, { signal }) =&gt; api.update(draft, { signal }),
    <span class="c-c">// Two clinicians, two values, NO preselection. Same rule as the Switch.</span>
    onConflict: (mine, theirs) =&gt; ({ resolution: <span class="c-s">"ask"</span>, mine, theirs }),
    optimistic: <span class="c-k">false</span>,   <span class="c-c">// never optimistic for a clinically consequential write</span>
  }}
/&gt;</code></pre>

<div class="prose"><h4>9 · Disclosure is a policy, not a set of booleans</h4></div>

<pre class="code"><code>&lt;DataGrid
  policy={policy}                      <span class="c-c">// one evaluation, six behaviours</span>
  onDisclosure={(e) =&gt; audit.record(e)} <span class="c-c">// view · expand · inspect · export · print · copy</span>
/&gt;

<span class="c-c">// The policy answers per row × column, and it may change while the grid is</span>
<span class="c-c">// open — a role change removes columns and the grid announces that it did.</span>
<span class="c-k">interface</span> DisclosurePolicy {
  column(col: string): <span class="c-s">"visible"</span> | <span class="c-s">"withheld"</span>;
  cell(row: unknown, col: string): <span class="c-s">"visible"</span> | { masked: { reason: string; legal?: string } };
  row(row: unknown): <span class="c-s">"visible"</span> | { restricted: { reason: string; breakGlass: <span class="c-k">boolean</span> } };
  mayExport(): <span class="c-k">boolean</span>;
  mayPrint(): <span class="c-k">boolean</span>;
  mayCopy(): <span class="c-k">boolean</span>;
}</code></pre>

<div class="prose"><h4>10 · A recipe is four lines</h4>
<p>Which is the point of the whole architecture.</p></div>

<pre class="code"><code><span class="c-k">import</span> { DataGrid, recipes } <span class="c-k">from</span> <span class="c-s">"@/components/oxygen/data-grid"</span>;

&lt;DataGrid
  {...recipes.caseload({ terminology: <span class="c-s">"client"</span>, instruments: [<span class="c-s">"phq-9"</span>, <span class="c-s">"gad-7"</span>] })}
  mode=<span class="c-s">"server"</span>
  query={fetchCaseload}
  policy={policy}
/&gt;</code></pre>

<div class="prose"><div class="note">
<p><b>The plugin surface.</b> <code>filterBuilder</code>, <code>rangeSelection</code>, <code>clipboard</code>,
<code>export</code>, <code>print</code>, <code>urlSync</code>, <code>undo</code>, <code>contextMenu</code>,
<code>anomalyLens</code>, <code>naturalLanguage</code>. Each is an import that registers reducers, key bindings and
slots. Not imported means <b>zero bytes</b>, which is how a patient directory stays small while a claims ledger
gets everything.</p>
</div></div>
"""


# --------------------------------------------------------------- 26 states
def s_states():
    return fill("""
<div class="prose">
<p class="lede2">These are not afterthoughts here; three of them are the reason the component exists. A grid
spends a meaningful share of its life not showing rows, and every one of those moments is a chance to say
something false.</p>
</div>

@@FIGA@@
@@FIGB@@

<div class="prose">
<h4>Four more, and the rule for each</h4>
<ul>
<li><b>Refreshing.</b> The old rows stay, dimmed, with a progress indicator — never a skeleton. Replacing content
the reader is using with a skeleton is a regression disguised as feedback, and it loses their place.</li>
<li><b>Offline.</b> The grid keeps rendering what it has and stamps it: <em>&ldquo;offline since 09:41 — this is
what you had then&rdquo;</em>. It does not clear, and it does not pretend.</li>
<li><b>Timeout.</b> Distinct from an error, because the action differs: a timeout offers a retry with a longer
budget and a narrower query. An error offers a report.</li>
<li><b>Restricted.</b> Its own state, not an empty state. <em>&ldquo;3 people match, and you may not see
them&rdquo;</em> — the count is disclosed because hiding it lets a filter be used to probe who exists.</li>
</ul>
<div class="note">
<p><b>The one rule that unifies all of them.</b> Every state answers <em>what do I now know that I did not
before?</em> &ldquo;No data&rdquo; answers nothing. &ldquo;No rows match this query, and here is the query&rdquo;
answers it. That is why there are six empty states rather than one, and it is the same argument the timeline made
for its three.</p>
</div></div>
""", FIGA=F_LOADING.render(), FIGB=F_EMPTY.render())


# --------------------------------------------------------------- 27 docs
def s_docs():
    regions = [
      ("Hero + live playground", "The grid, operable, with a schema-driven control panel — density, mode, row count, policy, coverage state. <b>Not a code sandbox</b>: a sandbox cannot resolve our registry, tokens and fixtures, so it opens broken."),
      ("When to use it", "First, because it is what AI engines quote. Includes when <em>not</em> to: under ~20 static rows a description list is better."),
      ("Install", "The exact CLI line, copy-to-clipboard, plus the npm alternative."),
      ("Basic example", "Four lines. Must actually be four lines."),
      ("Healthcare examples", "One per recipe. Patient roster · caseload · work queue · results · appointments · MAR · flowsheet · bed board · claims ledger."),
      ("Large dataset", "100 · 1k · 10k · 100k · 1M, each with its measured budgets rendered from the benchmark output rather than typed by hand."),
      ("Server-side", "The full <code>GridQuery</code> / <code>GridPage</code> contract with a mock server you can throttle and fail."),
      ("Filtering &amp; search", "The builder, the AST, and the sentence."),
      ("Editing", "Commit phase, validation, conflict."),
      ("Coverage &amp; absence", "The section that will decide whether a developer understands this component. Every absence reason, rendered."),
      ("Disclosure", "Policy, masking, break-glass — and the boundary, stated as prominently as the capability."),
      ("Accessibility", "The full keyboard table, the ARIA contract, and the screen-reader matrix with its results."),
      ("API", "Props, types, events, plugins — <b>extracted from TypeScript</b>, never hand-written."),
      ("Performance guidance", "When to use which mode, and the row-count constant."),
      ("Do / Don't", "Twelve pairs, drawn from §@@N:edges@@."),
      ("Related", "Reciprocal edges to every catalogue component the grid hosts."),
    ]
    rows = "".join('<tr><td class="nw"><b>%s</b></td><td>%s</td></tr>' % r for r in regions)
    return fill("""
<div class="prose">
<p class="lede2">The Component Library Standard already settled the shape: a component page is a
<b>projection of a schema</b>, generated and never hand-written, in fifteen fixed regions. The grid needs
sixteen — it adds one — and it stresses that architecture harder than anything before it, which is useful,
because the stated fragile assumption in that document is exactly this: every consistency guarantee depends on
pages being generated. <b>The correct response to a component that needs a bespoke region is to add a schema
field, not a page.</b></p>
</div>

<div class="tblwrap"><table class="dtbl">
<thead><tr><th style="width:22%">Region</th><th>What it must contain</th></tr></thead>
<tbody>@@ROWS@@</tbody></table></div>

<div class="prose">
<h4>Three things this page must do that no other component page does</h4>
<ul>
<li><b>The playground has to be real.</b> A grid demo with eight rows teaches nothing about a grid. The 100k
fixture ships with the docs and the playground renders it, so a developer can feel the difference between client
and server mode rather than reading about it.</li>
<li><b>Performance numbers come from CI, not from prose.</b> The budgets table on the page is generated from the
benchmark output on the last green build. A performance claim in hand-written prose has a half-life of about six
weeks.</li>
<li><b>The screen-reader matrix is published with its gaps.</b> Including the combinations that do not work
yet. That is what the Switch does with <code>aria-checked="mixed"</code>, and it is the reason anyone believes
the rest of the claims.</li>
</ul>
<div class="note">
<p><b>The one region to fight for.</b> <em>Coverage &amp; absence</em> is the region a developer will skip and it
is the one that determines whether they use the component correctly. It should sit above the API table, it should
lead with the failure it prevents, and it should show the four-line minimum before it shows the full shape —
otherwise the required prop reads as bureaucracy rather than as the point.</p>
</div></div>
""", ROWS=rows)


# --------------------------------------------------------------- 28 testing
def s_testing():
    layers = [
      ("Engine unit tests", "grid-core, no renderer", "Sort stability, filter evaluation, selection algebra, cursor arithmetic, group and tree assembly, aggregation refusal.", "Fast, and they are where the 40,000-row cases live."),
      ("Property tests", "grid-core", "<b>The most valuable suite.</b> A live update never changes the index of the row under the pointer. Sorting is stable and reversible. A selection predicate re-resolved yields the same set given the same data. Cursor pagination never duplicates or drops a row across a mutation.", "These catch the bugs that only appear at scale, and they catch them in milliseconds."),
      ("Component tests", "React Testing Library", "Every operation driven by <code>tab()</code> and <code>keyboard()</code> only, <b>never dispatching a pointer event</b> — the same construction that makes the Signature component's Level A claim a test rather than a sentence.", "A grid operation with no keyboard path fails here rather than in an audit."),
      ("Contract tests", "story-derived", "Each story asserts the safety claim in <em>words</em>: 'shows a withheld column as withheld, never as absent'.", "<code>expectStatedInWords</code> already exists for this."),
      ("Props-parity", "against installed antd", "A table asserting our prop names and meanings against antd's <code>Table</code>.", "An antd rename fails our build, not a customer's."),
      ("Accessibility", "axe + manual", "axe per story × 3 themes × 4 densities. Plus the NVDA/JAWS/VoiceOver × 3-engine matrix, run manually before leaving <code>experimental</code>.", "axe cannot tell you a row index is announced wrong. A person has to listen."),
      ("Visual regression", "Playwright", "3 themes × 4 densities × 14 recipes × the state set, in three engines.", "Including forced-colors and the reduced-motion still state."),
      ("Performance", "Playwright, CPU-throttled", "First paint, sort, filter keystroke, scroll frame time and heap at 1k / 10k / 100k, asserted against §@@N:scale@@ with a ratchet.", "A budget measured on an M-series laptop has not been measured."),
      ("Network", "mocked transport", "Slow, failing, partial, out-of-order and cancelled responses; a source that times out mid-scroll.", "Partial failure is a normal case here, not an error case."),
      ("Concurrency", "mocked socket", "400 updates in 2s. Out-of-order corrections. A row that leaves the predicate between selection and confirmation. Two clients editing one row.", "Every one of these is in §@@N:edges@@ because it has a specific wrong answer."),
      ("Permission change", "policy harness", "A role change while the grid is open, mid-scroll, mid-edit, mid-selection.", "The scenario most likely to leak, and the one nobody writes a test for."),
      ("Cross-framework", "smoke apps", "The React 18 / React 19 split that already exists, plus the elements build if the grid ever ships as a custom element.", "The smoke apps found real bugs on day one; they will again."),
    ]
    rows = "".join('<tr><td class="nw"><b>%s</b></td><td class="nw t3 xs">%s</td><td>%s</td><td class="t3">%s</td></tr>' % l
                   for l in layers)
    return fill("""
<div class="prose">
<p class="lede2">The convention this repository already holds is that <b>a test asserts the safety claim the
component exists to make, not that it renders</b> — because the failures worth catching all look fine on screen.
For a grid that principle is load-bearing, because a grid can be wrong in a way that is invisible to every
automated check: it can render forty perfect rows and be showing the wrong forty.</p>

<p>And there is a specific lesson on file worth repeating here. The Timeline review found six real defects with
every CI gate green, and three shared one shape: <b>a test that asserts a class name passes while the class does
nothing.</b> A grid has more of those hooks than anything else in the catalogue. <em>Assert the behaviour, not the
hook</em> — and <em>look at the rendered page</em>.</p>
</div>

<div class="tblwrap"><table class="dtbl">
<thead><tr><th style="width:15%">Layer</th><th class="nw">Where</th><th style="width:42%">What</th><th>Why it earns its place</th></tr></thead>
<tbody>@@ROWS@@</tbody></table></div>

<div class="prose">
<h4>The eight most dangerous tests to be missing</h4>
<ol class="claims">
<li><b>A masked cell exports masked.</b> One assertion; without it, the mask is a render concern and the CSV is a breach.</li>
<li><b>A live update does not move the row under the pointer.</b> Property test, and it is the wrong-patient one.</li>
<li><b>A stale selection is caught before a bulk write.</b> Rows leave the predicate between selection and confirmation.</li>
<li><b>Absolute <code>aria-rowindex</code> at row 19,998 of 40,000.</b> The defect every virtualised grid has.</li>
<li><b>Every operation reachable by keyboard, asserted with no pointer events dispatched.</b></li>
<li><b>Aggregation refuses mixed units,</b> asserted in words rather than by exception type.</li>
<li><b>A permission change while open removes columns and announces it.</b></li>
<li><b>A source that timed out produces an alert, not a quiet short list.</b></li>
</ol>
<div class="note">
<p><b>And one gate that is not a test.</b> <code>@oxygenui-design/grid-testing</code> — assertions that read a
grid's accessibility tree, matching the <code>tabs-testing</code> precedent. It is what lets a <em>customer</em>
assert that their grid announces what it should, which is the only way this scales past the components we
write ourselves.</p>
</div></div>
""", ROWS=rows)


# --------------------------------------------------------------- 29 edges
def s_edges():
    rows = "".join(
      '<tr><td class="nw"><span class="sev %s">%s</span></td><td><b>%s</b></td>'
      '<td class="t3">%s</td><td>%s</td></tr>' % (sev, sev, sc, wrong, right)
      for _id, sc, wrong, right, sev in data_spec.EDGES)
    return fill("""
<div class="prose">
<p class="lede2">Twenty-eight cases. The third column is what a competent, generic grid does; the fourth is what
this one must do. Thirteen are marked critical, meaning the generic behaviour is capable of contributing to
patient harm rather than merely being wrong.</p>
</div>

<div class="tblwrap"><table class="dtbl tight">
<thead><tr><th class="nw">Severity</th><th style="width:26%">Scenario</th><th style="width:24%">What a normal grid does</th>
<th>What ours must do</th></tr></thead>
<tbody>@@ROWS@@</tbody></table></div>

<div class="prose"><div class="note">
<p><b>Read the critical rows as a specification, not a list.</b> Every one of them is a case where the generic
behaviour is <em>defensible in isolation</em> and wrong in a clinical context — which is why they will be
reintroduced by a well-meaning refactor unless each one is a test with a comment explaining the failure it
prevents.</p>
</div></div>
""", ROWS=rows)


# --------------------------------------------------------------- 30 bench
def s_bench():
    cards = []
    for c in data_bench.COMPETITORS:
        cards.append((
          '<div class="eng"><div class="eng-h"><b>%s</b><span class="st">%s</span>'
          '<span style="flex:1 1 auto"></span><span class="st">%s</span></div>'
          '<div class="eng-b">'
          '<div class="g2" style="gap:1rem">'
          '<div><span class="lbl">What it does well</span><ul style="margin:.4rem 0 0;padding-inline-start:1.1rem">%s</ul></div>'
          '<div><span class="lbl">What it does poorly</span><ul style="margin:.4rem 0 0;padding-inline-start:1.1rem">%s</ul></div>'
          "</div>"
          '<div class="a-alert" style="margin-top:.8rem;font-size:12.5px">' + ic("sparkles", "i ic") +
          '<span><b>What Oxygen can do better:</b> %s</span></div>'
          "</div></div>") % (
            c["name"], c["ver"], c["model"],
            "".join("<li>%s</li>" % x for x in c["good"]),
            "".join("<li>%s</li>" % x for x in c["bad"]),
            c["better"]))
    m = "".join(
      '<tr><td>%s</td>%s</tr>' % (r[0], "".join(
        '<td class="c">%s</td>' % {"y":'<span class="yes">●</span>',
                                   "p":'<span class="meh">◐</span>',
                                   "n":'<span class="no">○</span>'}[v] for v in r[1:]))
      for r in data_bench.MATRIX)
    return fill("""
<div class="prose">
<p class="lede2">Seven systems. Where a claim could be measured rather than described, it was — the Ant Design
rows come from reading <code>antd@6.6.0</code> and <code>@rc-component/table@1.11.1</code> in
<code>node_modules</code>, not from the documentation, which disagrees with the source often enough to be
unreliable.</p>

<p>One finding is worth stating before the table. <b>Terra UI, Cerner&rsquo;s React design system and the only
serious healthcare component library, was archived on 28 June 2024</b> along with the whole Cerner GitHub
organisation. There is no maintained healthcare grid to benchmark against. The category is abandoned with
residual demand — which reframes the strategy from &ldquo;compete&rdquo; to &ldquo;occupy&rdquo;.</p>
</div>

@@CARDS@@

<div class="prose"><h4>Where the differences actually are</h4>
<p>Not features — everyone has features. The bottom seven rows are the ones no general-purpose grid has, because
none of them makes sense outside a domain where a wrong row is a patient.</p></div>

<div class="tblwrap"><table class="dtbl tight">
<thead><tr><th style="width:34%">Capability</th><th class="c nw">AG&nbsp;Grid</th><th class="c nw">TanStack</th>
<th class="c nw">MUI&nbsp;X</th><th class="c nw">antd</th><th class="c nw">Oxygen</th></tr></thead>
<tbody>@@MATRIX@@</tbody></table></div>

<div class="prose"><div class="note">
<p><b>The honest reading of that table.</b> The top nine rows are table stakes and AG Grid does most of them
better than we will for two years — it has a decade of work in its virtualiser and a server-side row model we
should study rather than out-build. <b>The bottom seven are the product.</b> If those seven are excellent and the
top nine are merely good, this is the right grid for a healthcare team; if we chase the top nine, we will build a
worse AG Grid.</p>
</div></div>
""", CARDS="".join(cards), MATRIX=m)


# --------------------------------------------------------------- 31 roadmap
def s_roadmap():
    cards = []
    for p in data_spec.ROADMAP:
        cards.append((
          '<div class="rmphase"><div class="eng-h"><span class="num">%d</span><b>%s</b>'
          '<span class="st">%s weeks</span><span style="flex:1 1 auto"></span>'
          '<span class="t3 xs">%s</span></div>'
          '<div class="eng-b">'
          '<div class="blk"><span class="k">Engineering</span><ul>%s</ul></div>'
          '<div class="g2" style="gap:1rem;margin-top:.7rem">'
          '<div class="blk"><span class="k">Components</span><div class="tagrow">%s</div></div>'
          '<div class="blk"><span class="k">Depends on</span><div class="tagrow">%s</div></div>'
          "</div>"
          '<div class="g2" style="gap:1rem;margin-top:.7rem">'
          '<div class="blk"><span class="k">Risks</span><ul>%s</ul></div>'
          '<div class="blk"><span class="k">Testing</span><ul>%s</ul></div>'
          "</div>"
          '<div class="a-alert" style="margin-top:.8rem;font-size:12.5px">' + ic("check", "i ic") +
          '<span><b>Acceptance:</b> %s</span></div>'
          "</div></div>") % (
            p["n"], p["name"], p["weeks"], p["goal"],
            "".join("<li>%s</li>" % t for t in p["tasks"]),
            "".join('<span class="tg">%s</span>' % c for c in p["components"]),
            "".join('<span class="tg">%s</span>' % c for c in p["deps"]),
            "".join("<li>%s</li>" % t for t in p["risks"]),
            "".join("<li>%s</li>" % t for t in p["tests"]),
            p["accept"]))
    return fill("""
<div class="prose">
<p class="lede2">Seven phases, 23–29 weeks. The brief proposed six; this adds one and reorders two, for reasons
worth stating.</p>

<ul>
<li><b>Coverage and the absence taxonomy move into Phase&nbsp;1</b>, not a later &ldquo;healthcare layer&rdquo;.
They are the type system. Retrofitting a required prop and a discriminated absence union onto a shipped API is a
breaking change, and retrofitting them onto a shipped <em>mental model</em> is worse.</li>
<li><b>Accessibility is not a hardening phase.</b> The keyboard model and the ARIA contract are Phase&nbsp;1,
because they determine the DOM structure. A grid that adds <code>role="grid"</code> in month five is a grid that
rewrites its focus management in month five.</li>
<li><b>Disclosure gets its own phase.</b> The brief folded it into hardening. It is a policy engine feeding six
behaviours and it deserves four weeks and its own acceptance criteria — and it is the phase most likely to be
mistaken for a compliance guarantee, so the <code>limitations</code> copy is written before the code.</li>
<li><b>Intelligence is second-to-last, not last.</b> Hardening must come after it, because an AI surface that has
not been through the accessibility and visual-regression gates is exactly the surface that ships a purple tint as
its only signal.</li>
</ul>
</div>

<div class="rmphases">@@CARDS@@</div>

<div class="prose"><div class="note">
<p><b>Phase&nbsp;1 is shippable on its own,</b> and that is the point of the ordering. Four weeks produces a grid
that sorts, filters, selects, paginates, is fully keyboard-operable, passes axe in three engines, and tells the
truth about what it is showing. A team could build a patient directory on it while Phase&nbsp;2 is being written.
Nothing after Phase&nbsp;1 changes its consumer API.</p>
</div></div>
""", CARDS="".join(cards))


# --------------------------------------------------------------- 32 risks
def s_risks():
    q = "".join(
      '<div class="eng"><div class="eng-h"><b>%s</b><span style="flex:1 1 auto"></span>'
      '<span class="st %s">%s</span></div>'
      '<div class="eng-b">%s</div></div>' % (
        t, "new" if k == "recommend" else "part",
        "my recommendation" if k == "recommend" else "blocked on you",
        b)
      for t, b, k in data_spec.OPEN)
    risks = [
      ("This is the largest component in the catalogue by a wide margin.", "high",
       "23–29 weeks against a catalogue where the last ten components took one session each. The mitigation is that "
       "Phase&nbsp;1 ships alone and nothing after it changes the consumer API — so the project can stop after any "
       "phase and still have delivered something whole."),
      ("Scroll anchoring across dynamic row heights.", "high",
       "The hardest engineering problem here, and the one most likely to be subtly wrong for months. It is also the "
       "one AG Grid has a decade of work in. Budget for it explicitly in Phase&nbsp;2 rather than discovering it."),
      ("The required <code>coverage</code> prop is real adoption friction.", "high",
       "It is the prop most likely to make an evaluator choose a different library, and unlike the timeline, a grid "
       "is a surface every product has. Mitigation is <code>coverage.local()</code> and leading the documentation "
       "with the failure rather than the requirement. But the friction is real and it is deliberate."),
      ("Being mistaken for a compliance boundary.", "critical",
       "A grid with masking, break-glass and disclosure events looks like it enforces HIPAA minimum necessary. It "
       "does not and cannot. Every one of those features needs its limitation written before its code, and the "
       "documentation must be as prominent about the boundary as about the capability."),
      ("The behavioural-health weighting is a bet.", "high",
       "Four of the fourteen recipes assume a behavioural-health buyer — the same assumption the healthcare-50 "
       "brief flagged as its largest, and it is still unsettled. If the buyer is general digital health, the right "
       "list is two BH recipes and two more in revenue."),
      ("No clinician reviewer.", "critical",
       "Every clinical rule in this document is derived from literature and general knowledge, not from a "
       "clinician's screen. The MAR, the CoCM registry and the disclosure copy are the three that most need "
       "review. This is the third brief to raise it."),
      ("The screen-reader matrix cannot be automated.", "medium",
       "It is the gate on leaving <code>experimental</code> and it needs a person with NVDA, JAWS and VoiceOver. "
       "Plan it as work in Phase&nbsp;7, not as a discovery."),
      ("Transposed mode may want to be a second component.", "medium",
       "Recorded as provisional. Deciding wrongly is a public API break, so the decision is deferred to the end of "
       "Phase&nbsp;3 and made on evidence."),
      ("The react barrel budget.", "medium",
       "It has been raised three times already and <code>.size-limit.md</code> now says plainly that the number has "
       "stopped modelling a real consumer. A grid will break it decisively. This is the forcing function to split "
       "the budget per layer — which two previous briefs have recommended and nobody has done."),
    ]
    rrows = "".join('<tr><td class="nw"><span class="sev %s">%s</span></td><td><b>%s</b></td><td>%s</td></tr>' % (
      s, s, t, d) for t, s, d in risks)
    return fill("""
<div class="prose">
<p class="lede2">Nine risks and eight decisions. Every decision below was mine, made while writing this document,
and any of them is open to reversal — which is the point of listing them rather than burying them in the
architecture.</p>

<h4>Risks and trade-offs</h4>
</div>

<div class="tblwrap"><table class="dtbl">
<thead><tr><th class="nw">Severity</th><th style="width:30%">Risk</th><th>Trade-off and mitigation</th></tr></thead>
<tbody>@@RROWS@@</tbody></table></div>

<div class="prose"><h4>Eight open questions</h4>
<p>Six carry a recommendation. Two are blocked on something only you can supply.</p></div>

@@Q@@

<div class="prose">
<h4>Final recommendations</h4>
<ol class="claims">
<li><b>Build it, and build the engine first.</b> The grid is the single most valuable component this library can
ship and the one with the clearest differentiation, because the category has no healthcare-native incumbent —
Terra UI is archived and nothing replaced it.</li>
<li><b>Ship Phase&nbsp;1 as its own release.</b> Four weeks to something a product can build a patient directory
on, that already tells the truth. Then stop, use it, and let the second phase be informed by that.</li>
<li><b>Keep the whole safety surface free, forever, in every tier.</b> Coverage, absence, the keyboard model, the
ARIA contract, masking. Gate the recipes and <code>grid-testing</code> if anything is gated. A safety control
behind a paywall is a bad look and a worse product.</li>
<li><b>Do not chase AG Grid on features.</b> Chase it on honesty. The bottom seven rows of the comparison matrix
are the product.</li>
<li><b>Get a clinician reviewer before Phase&nbsp;3.</b> It now blocks three briefs. Until then, everything
clinical in this document is a well-researched proposal and should be labelled as one.</li>
<li><b>Write the <code>limitations</code> copy for Phase&nbsp;5 before writing Phase&nbsp;5.</b> It is the
cheapest possible insurance against the one risk here that is marked critical and is not about patients.</li>
</ol>
</div>
""", RROWS=rrows, Q=q)
