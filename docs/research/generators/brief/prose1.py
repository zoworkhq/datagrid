# -*- coding: utf-8 -*-
"""Sections 01–08."""
from model import Section, Fig, figlink, fill
from mocklib import ic
import data_use, data_feat
import mocks_a, mocks_b, mocks_c, mocks_d

# --------------------------------------------------------------- figures
F_ROSTER = Fig("f-roster", "Patient directory", "anatomy",
  "Sort a column. Shift-click a second. Turn on a quick filter and watch the predicate sentence, the chips and the "
  "coverage line all change together — they are three renderings of one value. Select a row; select a range with "
  "shift. Sort by <b>Risk</b> and a provenance banner appears, because sorting a worklist by a model output is a "
  "triage decision and the model&rsquo;s own quality belongs where the decision is made, not in a tooltip.",
  mocks_a.fig_roster(), tags=("core","clin","shell"))

F_QUEUE = Fig("f-queue", "Clinical work queue", "ux",
  "The row is <b>not a patient</b>. It is a thing owed, by someone, by a time — so one person can legitimately "
  "appear three times, and the two columns that matter are <em>what</em> and <em>when</em>. This is the single "
  "biggest divergence between a healthcare grid and a table: most clinical grids are queues of obligations wearing "
  "a list of people as a disguise.",
  mocks_a.fig_queue(), tags=("clin","core"))

F_CASELOAD = Fig("f-caseload", "Behavioural-health caseload — a CoCM registry", "cells",
  "The registry is not a report; under CPT 99492–99494 it is the billable artefact, actively maintained and used "
  "for weekly population-based caseload review. So the grid <em>is</em> the workflow. Note what the cells refuse "
  "to do: a change of −7 on PHQ-9 is labelled <b>reliable</b> because it clears the 5-point reliable-change "
  "threshold; +4 is labelled <b>within noise</b>; and a client with no baseline reads <b>not yet measured</b>, "
  "never 0.",
  mocks_a.fig_caseload(), tags=("clin","bh"))

F_LABS = Fig("f-labs", "Lab results", "cells",
  "Ten analytes, and <b>two of them are not results</b>. Vitamin D was not ordered; CRP&rsquo;s specimen "
  "haemolysed. Both render as typed absences with their reason, because a blank cell is indistinguishable from a "
  "rendering bug — and a number with no reference range renders as <em>uninterpreted</em>, never as normal. "
  "Every one of these cells is the shipped <code>ResultValue</code> component, which already has an "
  "<em>InAGrid</em> story.",
  mocks_a.fig_labs(), tags=("clin","core"))

F_APPTS = Fig("f-appts", "Appointment grid", "shapes",
  "Two rows share 11:00 and one room. <b>Conflict is a render state on both rows</b>, not a validation error on "
  "one — the grid does not get to decide which booking was the mistake. The cancelled 11:00 stays visible, "
  "because removing it hides the reason the conflict exists. Day boundaries are the facility&rsquo;s, not the "
  "reader&rsquo;s.",
  mocks_d.fig_appts(), tags=("clin","shell"))

F_MAR = Fig("f-mar", "Medication administration record", "shapes",
  "The axes are transposed: orders down, time across. The interesting cell is the one at 22:00 on the enoxaparin "
  "row — <b>an unfilled scheduled dose is a fact with a consequence</b>, so it renders as <em>not given</em> with "
  "a reason required, not as blank. Columns are instants rather than wall-clock labels, which is the only way a "
  "2 a.m. dose can be recorded truthfully on the day the clocks go back.",
  mocks_d.fig_mar(), tags=("clin","core"))

F_BEDS = Fig("f-beds", "Bed board", "shapes",
  "Same engine, same selection model, same keyboard map, same coverage contract — a different <code>layout</code>. "
  "It is not a list of rows because <b>the empty beds are the answer</b>, and a filter that hid them would destroy "
  "the artefact. A bed whose housekeeping status is 40 minutes old renders as <em>unknown</em>, never as available.",
  mocks_d.fig_beds(), tags=("clin","shell"))

F_TREE = Fig("f-tree", "Treatment plan — tree data and honest aggregation", "shapes",
  "Three things a normal grid gets wrong. A branch that has not been fetched renders as <b>unresolved</b>, because "
  "a node with unknown children is not a node with no children. Two rows are <b>excluded from the parent&rsquo;s "
  "progress</b> and say so on the row, because their units are incomparable. And a goal with no verified measure "
  "shows no percentage at all rather than a comforting zero.",
  mocks_d.fig_tree(), tags=("clin","core"))


# --------------------------------------------------------------- 01
def s_summary():
    f = data_feat.FEATURES
    core = sum(1 for x in f if x[1] == "core")
    clin = sum(1 for x in f if x[1] == "clin")
    app = sum(1 for x in f if x[1] == "app")
    body = r"""
<div class="prose">
<p class="lede2">This document proposes <b>DataGrid</b> — not a table component, but the surface almost every
enterprise healthcare workflow is actually made of. A patient directory, a results inbox, a behavioural-health
caseload, a bed board, a claims worklist and a medication administration record are all the same engine wearing
different recipes, and today every product in this market rebuilds each of them from a generic grid plus six
months of cell renderers.</p>

<p>The research below covers @@NCASES@@ healthcare scenarios across @@NFAM@@ families, a @@NFEAT@@-item feature inventory split across
five layers, seven competitor systems measured rather than described, @@NEDGE@@ edge cases, a complete keyboard model,
and @@NFIG@@ live prototypes you can operate in this page (three more are static).</p>

<h4>The five claims this brief rests on</h4>

<ol class="claims">
<li><b>A clinical grid is not a view of rows; it is a claim about a population.</b> Every worklist answers &ldquo;who
needs something from me, and what?&rdquo; — and the most dangerous property of a grid is that it looks complete
whether or not it is. ADR&nbsp;0011 already requires a component that shows some of a set to declare that set&rsquo;s
boundaries. The grid is the case that ADR was written about, and a <em>filtered</em> grid is a worse liar than a
paginated one, because the filter was set by a human who has since forgotten it.</li>

<li><b>The row is a person, so row identity is a safety control.</b> Everywhere else <code>rowKey</code> is a
reconciliation hint. Here, acting on the wrong row is the wrong-patient error that the NQF-endorsed
retract-and-reorder measure exists to count — and identity re-entry interventions cut those errors by 30–41%.
That makes selection, bulk action and inline edit identity-carrying operations, not list operations.</li>

<li><b>Sorting is a clinical act.</b> Sorting a worklist by a risk score reorders who gets seen first: that is
triage. When the score is a model output, the sort silently converts the model&rsquo;s quality into a queue
discipline. The Epic Sepsis Model shipped to hundreds of hospitals and, on external validation, achieved an AUC of
0.63 against the 0.76–0.83 cited internally — missing two-thirds of sepsis cases while generating roughly 109
alerts per true positive. <b>A sort by a derived column names its source in the header.</b> Nobody else does this.</li>

<li><b>Live data must never move under the hand.</b> Standard grids re-sort on change. In a census that is a
wrong-patient generator: you aim at row four and an admission inserts at row two. Sort position freezes while a
pointer or focus is inside the body; arrivals queue behind a divider until you ask for them.</li>

<li><b>The grid does not own the cells.</b> Six clinical primitives already ship in this repository, and two of
them — <code>ClinicalStatus</code> and <code>ResultValue</code> — already carry stories called
<em>GridAffix</em> and <em>InAGrid</em>. They were built for a host that did not exist yet. The grid&rsquo;s job is
to be that host: a cell contract covering measurement, truncation, focus, print and export, so the catalogue drops
in unchanged and stays independently useful.</li>
</ol>

<h4>What is being proposed, concretely</h4>

<div class="tblwrap"><table class="dtbl">
<thead><tr><th style="width:30%">Layer</th><th>What it is</th></tr></thead>
<tbody>
<tr><td><code>@oxygenui-design/grid-core</code> <span class="lay core">engine</span></td>
<td>@@NCORE@@ features. No React, no DOM, no dependencies — matching the <code>*-core</code> convention that
<code>tabs-core</code>, <code>signature-core</code> and <code>identity-core</code> already follow. Sorting,
filtering, selection, pagination, grouping, virtualisation geometry, and the query/page contract.</td></tr>
<tr><td><code>DataGrid</code> <span class="lay shell">presentation</span></td>
<td>Prop-compatible with Ant Design&rsquo;s <code>Table</code> at the <code>columns</code> /
<code>dataSource</code> / <code>rowSelection</code> / <code>onChange</code> surface, so an existing antd table is a
one-line swap — and it takes no dependency on antd, for the same measured reason ADR&nbsp;0010 gave for the Switch.
Plus the semantics antd has not got: <code>role="grid"</code>, absolute row indices under virtualisation, and a
two-dimensional keyboard model.</td></tr>
<tr><td>Healthcare layer <span class="lay clin">clinical</span></td>
<td>@@NCLIN@@ features. Coverage, absence taxonomy, identity safety, disclosure policy, sort provenance, arrivals,
resolution cells, and the recipes: roster, census, board, caseload, registry, work queue, flowsheet, MAR, chart
list, plan, schedule, ledger, cohort, stream.</td></tr>
<tr><td>Not ours <span class="lay app">application</span></td>
<td>@@NAPP@@ things named explicitly so nobody assumes otherwise: audit logging, the personalisation store, import, and
the session clock. A component cannot be an audit log.</td></tr>
</tbody></table></div>

<p>Effort is <b>23–29 weeks across seven phases</b>, and Phase&nbsp;1 alone — four weeks — produces something you
could ship a patient directory on that already tells the truth about what it is showing. §@@N:roadmap@@ carries the phasing;
§@@N:risks@@ carries eight decisions I have made unsupervised and would reverse on request.</p>
</div>
"""
    return fill(body,
                NCASES=str(len(data_use.USE_CASES)),
                NFAM=str(len(data_use.FAMILIES)),
                NFEAT=str(len(f)),
                NEDGE=str(NEDGES),
                NFIG=str(NFIGS),
                NCORE=str(core), NCLIN=str(clin), NAPP=str(app))


# --------------------------------------------------------------- 02
def s_vision():
    return """
<div class="prose">
<p class="lede2">The brief for this component was &ldquo;not a generic table with sorting and filtering&rdquo;.
Agreed — but that is a statement about ambition, not about architecture. The architectural claim has to be
sharper, and it is this: <b>almost every enterprise healthcare screen is a grid, and almost none of them are
tables.</b></p>

<p>A table is a set of rows you read. The surfaces this component has to power are not that. A results inbox is a
queue of obligations with statutory clocks. A bed board is a capacity artefact whose empty cells carry the
meaning. A CoCM registry is a billable instrument. An MAR is a time axis you act on. A claims worklist is a ledger
where the totals must foot. Rendering each of these as &ldquo;rows with clinical words in them&rdquo; is what every
existing product does, and it is why every existing product needs six months of cell renderers per screen.</p>

<h4>Three things a generic grid gets wrong, and healthcare cannot afford</h4>

<p><b>It treats absence as nothing.</b> A blank cell in AG Grid means the accessor returned undefined. In a
chart it could mean not ordered, not resulted, not measured, refused, not applicable, withheld under a consent
rule, or the source that would have answered timed out four seconds ago. Those are seven different next actions.
This library&rsquo;s founding lint rule already makes <code>{value ?? "—"}</code> an error; a grid that renders a
thousand of those per screen is the largest possible violation of it.</p>

<p><b>It treats completeness as the caller&rsquo;s problem.</b> Roughly 13.6% of primary-care consultations proceed
with clinical information missing, and it adversely affects care in about half of them; one emergency study found
records missing or incomplete on admission for 27% of patients, with unnecessary procedures — lumbar punctures
among them — performed on 5% as a result. The literature&rsquo;s term is <em>informative missingness</em>: a NULL
read as a negative. A grid is the highest-volume producer of that reading in any health product, and it produces
it while looking perfect.</p>

<p><b>It treats configuration as chrome.</b> Column sets, sort orders and filters are stored inside the grid as
imperative API state, so &ldquo;save this view&rdquo; is bespoke serialisation every time, role presets are a
different mechanism from saved views, and the product&rsquo;s own default is a third. They are one artefact. Making
them one artefact is most of what makes fifty different healthcare grids buildable from one system.</p>

<h4>Why not just theme Ant Design&rsquo;s Table</h4>

<p>Because it was measured, and the measurement is decisive. <code>@rc-component/table@1.11.1</code>, the engine
under antd&nbsp;v6&rsquo;s <code>Table</code>, emits <b>exactly one <code>aria-*</code> attribute in its entire ES
build</b> — <code>aria-hidden</code> — no <code>role</code>, and <b>zero keyboard handlers</b>. antd&rsquo;s own
layer adds <code>aria-sort</code>, <code>aria-description</code>, <code>aria-expanded</code> and five
<code>aria-label</code>s. Across both packages there is no <code>aria-rowcount</code>, no
<code>aria-rowindex</code>, no <code>aria-colindex</code>, no cell focus and no arrow-key navigation. A virtualised
antd table tells a screen-reader user nothing at all about where they are in forty thousand rows.</p>

<div class="note">
<p><b>This is the same argument that settled the Switch.</b> ADR&nbsp;0010&rsquo;s rule is that primitives match Ant
Design&rsquo;s public API exactly and take no dependency on it, and its second reason was &ldquo;nothing expensive
to inherit&rdquo;. <code>rc-switch</code> was a button with <code>aria-checked</code> and two key handlers.
<code>@rc-component/table</code> is a renderer with one ARIA attribute and no key handlers. Wrapping it would mean
shadowing the render to add grid semantics — paying for a dependency you route around — and it would put antd into
every future data surface, ending copy-source distribution for the whole family.</p>
<p><b>Keep the API. Replace the semantics.</b> Same <code>columns</code>, same <code>dataSource</code>, same
<code>onChange(pagination, filters, sorter)</code>, with a props-parity table in the test suite so an antd rename
fails our build rather than a customer&rsquo;s. Everything it adds is additive, and every divergence is listed in
<code>limitations</code>.</p>
</div>

<h4>The thing it should become</h4>

<p>Not a component. A <b>healthcare data interaction framework</b>: one engine, one presentation layer, one
disclosure policy, and a growing set of recipes. A recipe is data — a typed, serialisable
<code>GridView</code> — which means the product&rsquo;s default grid, the nurse&rsquo;s role preset and Dr
Smith&rsquo;s saved view are <em>the same artefact from three sources</em>, resolved by a stated precedence. That
single decision is what turns &ldquo;build me a caseload screen&rdquo; from a sprint into an afternoon.</p>
</div>
"""


# --------------------------------------------------------------- 03
def s_usecases():
    rows = []
    last = None
    for fam, name, unit, diff, axis, preset, vol in data_use.USE_CASES:
        famcell = ('<td rowspan="%d" class="famcell"><b>%s</b></td>' %
                   (sum(1 for u in data_use.USE_CASES if u[0] == fam), fam)) if fam != last else ""
        last = fam
        rows.append(
          '<tr>%s<td><b>%s</b><div class="xs t3" style="color:var(--muted);margin-top:2px">a row is %s</div></td>'
          '<td>%s</td><td class="nw"><span class="lay clin">%s</span></td>'
          '<td class="nw"><code>%s</code></td><td class="nw mono">%s</td></tr>' % (
            famcell, name, unit, diff, data_use.AXES[axis][0], preset, vol))
    axes = "".join(
      '<tr><td><b>%s</b></td><td>%s</td><td class="nw">%s</td></tr>' % (
        t, d, ", ".join(sorted({u[5] for u in data_use.USE_CASES if u[4] == k})))
      for k, (t, d) in data_use.AXES.items())
    presets = "".join(
      '<tr><td><code>%s</code></td><td><b>%s</b></td><td>%s</td><td class="nw num">%d</td></tr>' % (
        k, t, d, sum(1 for u in data_use.USE_CASES if u[5] == k))
      for k, (t, d) in data_use.PRESETS.items())
    TPL_USECASES = """
<div class="prose">
<p class="lede2">Thirty-nine scenarios, seven families. The column that matters is <b>&ldquo;a row is…&rdquo;</b>,
because it is the question no grid API asks and the one that determines everything downstream. When a row is an
obligation rather than a person, the same patient legitimately appears three times and deduplicating them is a
bug. When a row is a bed, the empty ones are the point. When a row is a claim line, the totals have to foot.</p>
</div>

<div class="tblwrap"><table class="dtbl">
<thead><tr><th style="width:9%">Family</th><th style="width:19%">Scenario</th>
<th style="width:38%">What makes its grid different</th><th style="width:12%">Hardest axis</th>
<th style="width:10%">Recipe</th><th style="width:12%">Typical rows</th></tr></thead>
<tbody>@@ROWS@@</tbody></table></div>

<div class="prose"><h4>The sixteen axes, derived from the scenarios above</h4>
<p>Each of these is the capability some scenario is the hardest test of. Together they are the actual requirement
list — more useful than a feature checklist, because each one names a way the obvious implementation is wrong.</p></div>

<div class="tblwrap"><table class="dtbl">
<thead><tr><th style="width:20%">Axis</th><th style="width:52%">What it demands</th><th>Recipes that need it</th></tr></thead>
<tbody>@@AXES@@</tbody></table></div>

<div class="prose"><h4>Fourteen recipes cover all thirty-nine</h4>
<p>A recipe is a <code>GridView</code> document plus a column set — data, not code. That is the whole
configurability story: a product does not build a caseload <em>component</em>, it declares a caseload
<em>view</em>. §@@N:api@@ has the type.</p></div>

<div class="tblwrap"><table class="dtbl tight">
<thead><tr><th style="width:12%">Recipe</th><th style="width:16%">Name</th><th>Shape</th><th class="nw">Scenarios</th></tr></thead>
<tbody>@@PRESETS@@</tbody></table></div>

<div class="prose"><div class="note">
<p><b>The one to notice is the work queue.</b> Seven scenarios collapse onto it, and it is the recipe with no
equivalent in any general-purpose grid, because it inverts what a row is. Everything else in this document is
table stakes done carefully; the resolution row is the idea that is actually new.</p>
</div></div>
"""
    return fill(TPL_USECASES, ROWS="".join(rows), AXES=axes, PRESETS=presets)


# --------------------------------------------------------------- 04
def s_anatomy():
    parts = [
      ("Toolbar", "Search, quick filters, view switcher, column control, export. Everything here is optional and "
       "everything here is a plugin except search.", "shell"),
      ("Quick-filter bar", "Named clinical shortcuts that are really saved predicates. <em>My patients</em>, "
       "<em>High risk</em>, <em>Needs review</em>. Each one carries its own count.", "clin"),
      ("Active-filter chips", "One chip per condition, individually removable, plus <em>clear all</em>. The chips "
       "are a rendering of the filter tree, not a parallel state.", "shell"),
      ("Sort-provenance banner", "Appears only when the primary sort is a derived or model column. Names the model, "
       "its version, its validation and the population it was validated on.", "clin"),
      ("Selection bar", "Replaces the toolbar when anything is selected. Shows the count in words and the actions "
       "that apply to a set rather than to a row.", "shell"),
      ("Arrivals divider", "&ldquo;3 new admissions — click to insert&rdquo;. The queue that exists so live data "
       "never reorders under a pointer.", "clin"),
      ("Header row", "Sort state with ordinals for multi-sort, a resize grip, a column menu, and pinning. Header "
       "cells are <code>role=\"columnheader\"</code> with <code>aria-sort</code> and are keyboard-operable for "
       "sort, move and resize.", "core"),
      ("Pinned columns", "Logical, not physical: <code>inline-start</code>, so RTL pins to the reading start. "
       "Identity pins by default in every clinical recipe.", "shell"),
      ("Rows and cells", "One tab stop for the whole body, a roving <code>tabindex</code> inside it, and "
       "<code>aria-rowindex</code> that is absolute rather than window-relative.", "core"),
      ("Status rail", "A 3px inline-start border carrying severity — the second, non-colour structural cue that "
       "pairs with the worded status chip.", "clin"),
      ("Detail row", "Master–detail expansion in place. Never a modal, never a navigation.", "shell"),
      ("Footer", "Row range, page controls, and the count that the coverage sentence quotes.", "shell"),
      ("Coverage bar", "<b>Required.</b> What this query reached, which sources answered, what is excluded and why, "
       "and the active predicate in words. It renders in a fixed place and it prints.", "clin"),
      ("Live region", "A polite <code>role=\"status\"</code> that announces sort, filter, selection, focus movement "
       "and arrivals. The prototypes below expose it so you can read what a screen reader hears.", "core"),
    ]
    rows = "".join('<tr><td class="nw"><b>%s</b></td><td>%s</td><td class="nw"><span class="lay %s">%s</span></td></tr>' % (
      n, d, l, data_feat.LAYERS[l][0]) for n, d, l in parts)
    return fill("""
<div class="prose">
<p class="lede2">Fourteen regions, in a fixed order. Three of them do not exist in any other grid — the
sort-provenance banner, the arrivals divider and the coverage bar — and those three are where most of this
document&rsquo;s argument lives.</p>
</div>

@@FIG@@

<div class="tblwrap"><table class="dtbl">
<thead><tr><th style="width:19%">Region</th><th>What it does, and the rule attached to it</th><th style="width:14%">Owner</th></tr></thead>
<tbody>@@ROWS@@</tbody></table></div>

<div class="prose"><div class="note">
<p><b>The coverage bar is the one that will generate complaints.</b> Every other grid in the world takes an array
and renders it; this one takes an array and an account of the array. That friction is deliberate and it is
ADR&nbsp;0011&rsquo;s stated cost. The mitigation is that the honest minimum is one line —
<code>coverage={coverage.local()}</code> for a single-source query — and it is <em>true</em>, which is more than
a default could ever be. §@@N:risks@@ argues the alternative and rejects it.</p>
</div></div>
""", FIG=F_ROSTER.render(), ROWS=rows)


# --------------------------------------------------------------- 05
def s_features():
    rows = []
    for name, layer, phase, note in data_feat.FEATURES:
        rows.append('<tr><td><b>%s</b>%s</td><td class="nw"><span class="lay %s">%s</span></td>'
                    '<td class="nw t3">%s</td></tr>' % (
          name, '<div class="xs" style="color:var(--muted);margin-top:2px">%s</div>' % note if note else "",
          layer, data_feat.LAYERS[layer][0],
          data_feat.PHASES[phase] if phase else "—"))
    layers = "".join('<tr><td class="nw"><span class="lay %s">%s</span></td><td>%s</td><td class="num nw">%d</td></tr>' % (
      k, t, d, sum(1 for f in data_feat.FEATURES if f[1] == k)) for k, (t, d) in data_feat.LAYERS.items())
    return fill("""
<div class="prose">
<p class="lede2">Seventy-five capabilities, each assigned to exactly one layer. The assignment is the interesting
part: it is what stops the grid becoming a 400&nbsp;KB monolith, and it is what stops the application assuming the
component is doing something it cannot.</p>

<p>The rule for the split is simple. If it can be computed without a DOM, it is engine. If it is markup, tokens,
motion or ARIA, it is presentation. If most grids will never use it, it is a plugin and it costs nothing when it
is not imported. If it encodes a clinical or regulatory meaning, it is the healthcare layer. And if it requires a
server to be correct, <b>it is not ours, and we say so</b> — a component that appears to enforce an audit
requirement it cannot enforce is worse than one that never mentions it.</p>
</div>

<div class="tblwrap"><table class="dtbl">
<thead><tr><th style="width:16%">Layer</th><th>Meaning</th><th class="nw">Count</th></tr></thead>
<tbody>@@LAYERS@@</tbody></table></div>

<div class="prose"><h4>The inventory</h4></div>

<div class="tblwrap"><table class="dtbl tight">
<thead><tr><th style="width:56%">Capability</th><th style="width:22%">Layer</th><th style="width:22%">Ships in</th></tr></thead>
<tbody>@@ROWS@@</tbody></table></div>

<div class="prose"><div class="note">
<p><b>Four rows say &ldquo;application&rdquo;, and they are the most important rows in the table.</b> Audit
logging must be server-side or it is not an audit log — a client that records its own access is a client that can
choose not to. Import is a mapping and validation problem, not a rendering one. The personalisation store is
yours because where a view lives is a data-residency decision. And the session clock belongs to the app; the grid
only promises to restore its view afterwards and to re-offer, never silently replay, a pending write.</p>
</div></div>
""", LAYERS=layers, ROWS="".join(rows))


# --------------------------------------------------------------- 06
def s_ux():
    rules = [
      ("The row is whatever the work is about.",
       "A work queue&rsquo;s row is an obligation, not a patient. Two obligations on one person are two rows and "
       "must not be merged. The identity cell then becomes context rather than subject — which is why it is a "
       "cell, not a special case."),
      ("Every row states what it is waiting for and from whom.",
       "The resolution cell is three facts in one column: <em>what</em> is owed, <em>who</em> owes it, "
       "<em>when</em> it is due. It replaces the four-column reconstruction a clinician currently performs in "
       "their head, twelve times a minute."),
      ("Two identifiers before any action.",
       "The Joint Commission&rsquo;s NPSG.01.01.01 requires two person-specific identifiers before a care action, "
       "and the identity package already makes fewer than two a compile error. In a grid the same rule means the "
       "identity cell carries name plus one identifier at every density — at ultra-dense the secondary line drops "
       "and the MRN moves inline, rather than the identifier being the thing that disappears."),
      ("Disambiguate rather than deduplicate.",
       "Two patients sharing a name and a date of birth is not an edge case on a worklist; it is Tuesday. "
       "<code>disambiguate()</code> already adds the minimum that separates them and handles the newborn-twins "
       "case that colour and initials both fail."),
      ("Colour is never the only cue.",
       "Every status is a glyph, a word and a rail. The contrast gate and the forced-colors tests already run "
       "across three engines, and a status that survives neither is a status that disappears in high-contrast "
       "mode — which is exactly where an at-risk reader is."),
      ("Progressive disclosure has three steps, not two.",
       "Cell &rarr; row expansion &rarr; inspector &rarr; chart. Each step costs more attention and each is "
       "reversible without losing position. §@@N:detail@@ argues where each one is correct."),
      ("Never more than two chips before an overflow.",
       "A patient with eleven problems is common. Eleven chips is a colour field with a table behind it. Two plus "
       "<em>+9</em>, with an accessible popover and the full list in the accessible name, keeps the row scannable "
       "and keeps the count honest."),
      ("A destructive or clinical action on many people shows the people.",
       "Not the count. The count is the confirmation; the names are the check. §@@N:bulk@@."),
    ]
    items = "".join('<li><b>%s</b> %s</li>' % (t, d) for t, d in rules)
    return fill("""
<div class="prose">
<p class="lede2">Interaction cost is the whole game. Physicians spend an average of <b>16 minutes 14 seconds per
patient encounter</b> in the EHR, roughly a third of it on chart review, and <b>5.9 hours of EHR work for every
8 hours of scheduled care</b>; primary-care physicians average 2.7 hours a day of uncompensated after-hours
charting. A grid that saves four seconds per row, forty times an hour, is not a nicety.</p>

<p>But speed is not the only constraint, and this is the trap the category has fallen into. The FDA&rsquo;s
revised clinical-decision-support guidance (6 January 2026) added, as criterion 4, that software should
<em>prioritise decision-relevant details and avoid information overload</em> — a user-interface requirement
sitting inside a device-classification document. Density without hierarchy is now a regulatory concern, not only a
design one.</p>

<h4>Eight interaction rules</h4>
<ol class="claims">@@ITEMS@@</ol>
</div>
""", ITEMS=items) + F_QUEUE.render() + """
<div class="prose"><div class="note">
<p><b>What the resolution row replaces.</b> A conventional results inbox gives you patient, test, value, flag,
ordered-by, resulted-at, status — seven columns from which the reader derives &ldquo;I have seven minutes to
acknowledge a potassium of 6.8 on Aisha Bello&rdquo;. The derivation is the work, it happens once per row, and it
is where attention leaks. Making it a column is the single highest-leverage change in this document.</p>
</div></div>
"""


# --------------------------------------------------------------- 07
def s_cells():
    exists = [
      ("ClinicalStatus", "clinical-status", "18 states across 5 scales, including <em>preliminary</em>, "
       "<em>corrected</em>, <em>entered-in-error</em>, <em>restricted</em>, <em>Part 2</em>, <em>break-glass</em>, "
       "<em>stale</em>, <em>self-reported</em> and <em>AI draft</em>.",
       "<code>shape=\"affix\"</code>, <code>density=\"compact\"</code> — and a story literally called "
       "<b>&ldquo;Grid affix, at forty rows&rdquo;</b>, whose test asserts that forty chips would be a colour "
       "field with a table behind it."),
      ("ResultValue", "result-value", "Value, unit, reference range, interpretation, delta, and thirteen absence "
       "and qualification states.",
       "<code>density=\"compact\"</code>, <code>hideAnalyte</code> — and a story called <b>&ldquo;Compact, in a "
       "grid&rdquo;</b>. It was designed for this component before this component existed."),
      ("RiskIndicator", "risk-indicator", "Score, band, drivers, percentile with cohort, model card, "
       "<em>not scored</em> and <em>expired</em>.",
       "Supplies the model metadata that the sort-provenance banner renders. The banner is not new data — it is "
       "this component&rsquo;s <code>ModelCard</code>, hoisted to the header."),
      ("AllergyChip / AllergyList", "allergy-chip", "Criticality, intolerance, refuted, unconfirmed, unable to "
       "assess, no-known-allergies and not-recorded as distinct states.",
       "<code>AllergyList</code> is already the overflow pattern; the grid&rsquo;s chip-overflow cell is a thin "
       "host around it."),
      ("TrendIndicator", "trend-indicator", "Direction, significance, reference band, assay change, unit change, "
       "one-point and no-result states.",
       "The sparkline cell. It already refuses to draw a continuous line across an assay change, which is the "
       "defect every grid sparkline has."),
      ("ProvenanceChip", "provenance-chip", "Clinic, home device, patient-reported, external, extracted, "
       "extracted-and-confirmed, amended, stale, document vintage, and the chain.",
       "The AI/provenance layer for every cell. §@@N:ai@@ uses nothing else."),
      ("PatientChip / PatientBanner / disambiguate()", "identity", "Avatar, name, identifiers, five absence states "
       "for a photograph, and the disambiguation algorithm.",
       "The identity cell composes <code>PatientChip</code> and calls <code>disambiguate()</code> across the "
       "<em>visible page</em> — which is the correct scope, and a subtle one."),
      ("CareTeamPresence", "care-team-presence", "Availability, coverage resolution, co-presence — who else is "
       "looking at this chart right now.",
       "The owner column in a work queue, and the &ldquo;someone else is editing this row&rdquo; signal."),
    ]
    rows = "".join(
      '<tr><td><b>%s</b><div class="xs t3" style="color:var(--muted);margin-top:2px"><code>%s</code></div></td>'
      '<td>%s</td><td>%s</td></tr>' % (n, s, w, g) for n, s, w, g in exists)
    contract = [
      ("Measurement", "A cell declares an intrinsic height and whether it may grow. The virtualiser measures once "
       "and caches; a re-measure adjusts <code>scrollTop</code> so the anchor row does not move."),
      ("Truncation", "A cell says how it degrades: ellipsis, chip overflow, drop the secondary line, or refuse. "
       "The identity cell refuses to drop its identifier — it drops the date of birth first."),
      ("Focus delegation", "One tab stop per cell from the grid&rsquo;s perspective. A cell with several "
       "interactive elements exposes them on <span class=\"k2\">Enter</span>, then <span class=\"k2\">Esc</span> "
       "returns focus to the cell."),
      ("Reading", "A cell supplies its own accessible text, which is what the live region announces on focus and "
       "what a screen reader reads — never the raw DOM text, which for a sparkline is nothing at all."),
      ("Sorting", "A cell supplies a comparable value and its type. A cell whose value is not comparable declares "
       "the column unsortable rather than sorting by rendered string."),
      ("Export", "A cell supplies a flat value <em>and</em> its mask state. This is the rule that stops a masked "
       "cell exporting its underlying value."),
      ("Print", "A cell supplies a print form. Sparklines print; popovers do not, so their content moves into a "
       "footnote."),
    ]
    crows = "".join('<tr><td class="nw"><b>%s</b></td><td>%s</td></tr>' % (a, b) for a, b in contract)
    return fill("""
<div class="prose">
<p class="lede2">The brief asked for a catalogue of healthcare cells — patient identity, clinical status, chips
with overflow, medication, lab result, provider, appointment, progress, actions. <b>Six of them already ship in
this repository</b>, at Stable, with tests that assert their safety claims. Building a second set inside the grid
would be the worst outcome available: two implementations of &ldquo;is this result critical&rdquo; that can
disagree.</p>

<p>So the proposal is the inverse of the brief. The grid does not define cells. <b>It defines the contract a cell
must satisfy to live in a grid</b>, and the catalogue satisfies it.</p>

<h4>What already exists</h4>
</div>

<div class="tblwrap"><table class="dtbl">
<thead><tr><th style="width:19%">Component</th><th style="width:40%">What it already knows</th>
<th>How the grid uses it</th></tr></thead>
<tbody>@@ROWS@@</tbody></table></div>
""", ROWS=rows) + F_LABS.render() + F_CASELOAD.render() + fill("""
<div class="prose"><h4>The cell host contract — seven obligations</h4>
<p>This is the actual new engineering in the healthcare layer. It is what makes a cell that was written for a
chart panel work correctly inside a virtualised, exportable, printable, screen-reader-navigable grid without
being rewritten.</p></div>

<div class="tblwrap"><table class="dtbl">
<thead><tr><th style="width:17%">Obligation</th><th>What the cell must supply</th></tr></thead>
<tbody>@@CROWS@@</tbody></table></div>

<div class="prose"><h4>The four cells that do not exist yet</h4>
<div class="tblwrap"><table class="dtbl">
<thead><tr><th style="width:20%">Cell</th><th>Why it is new</th></tr></thead>
<tbody>
<tr><td><b>Resolution cell</b></td><td>What is owed, by whom, by when. Nothing in the catalogue expresses an
obligation, and seven of the fourteen recipes are built on one.</td></tr>
<tr><td><b>Identity cell</b></td><td>A thin host: <code>PatientChip</code> plus page-scoped
<code>disambiguate()</code> plus density-aware degradation. Thin, but it must exist, because the degradation order
is a safety rule and cannot be left to each product.</td></tr>
<tr><td><b>Chip-overflow cell</b></td><td>Two chips and a counted, accessible remainder, generalised over
diagnoses, programmes, insurances, care team, authorisations and appointment types.</td></tr>
<tr><td><b>Dose cell</b></td><td>The MAR&rsquo;s scheduled-dose state machine: due, given, late, not given, held,
refused, and <em>no dose scheduled</em> — which is the one that must not look like the others.</td></tr>
</tbody></table></div>
<p>Medication, provider and appointment cells are compositions of what already exists plus the chip-overflow
cell. They are recipes, not components — which is the test that the architecture is working.</p>
</div>
""", CROWS=crows)


# --------------------------------------------------------------- 08
def s_shapes():
    return """
<div class="prose">
<p class="lede2">If the architecture is right, four of the hardest healthcare surfaces should be recipes rather
than components. Here they are, all four built from the same engine, the same selection model, the same keyboard
map and the same coverage contract — differing only in <code>layout</code>, columns and cell types.</p>
</div>
""" + F_APPTS.render() + F_MAR.render() + F_BEDS.render() + F_TREE.render() + """
<div class="prose"><div class="note">
<p><b>The transposed pair is the open question.</b> The flowsheet and the MAR invert the axes — analytes or orders
down, time across, and the <em>header</em> becomes the scrolling axis. That is either a <code>layout</code> prop
or a second component, and I do not think the answer can be settled from a document. My recommendation is one
component with <code>layout="transposed"</code>, decided at the end of Phase&nbsp;3 on evidence, recorded as
provisional — because getting it wrong is a public API break, and because column virtualisation over a
two-thousand-column time axis is a genuinely different problem from row virtualisation over two thousand rows.</p>
</div></div>
"""
