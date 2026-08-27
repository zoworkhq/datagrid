# -*- coding: utf-8 -*-
"""Sections 09–20."""
from model import Fig, fill
from mocklib import ic
import data_spec
import mocks_a, mocks_b, mocks_c, mocks_d

F_BUILDER = Fig("f-builder", "Advanced filter builder", "filters",
  "Toggle <b>or</b> / <b>and</b> on either group and watch three things change together: the tree, the sentence, "
  "and (in the real component) the chips, the URL and the export header. There is <b>one</b> filter representation "
  "in this system. A visual builder that produces a different shape from the chip bar is how a product ends up "
  "with two filters that disagree.",
  mocks_b.fig_builder(), tags=("core","shell"))

F_LIVE = Fig("f-live", "Live census — arrivals that do not move the ground", "live",
  "Press <b>Simulate an admission</b> a few times. Nothing moves. The arrivals strip counts what is waiting and "
  "inserting is <em>your</em> action, on <em>your</em> timing. Then click the strip: the rows insert, animate once, "
  "and the row you were pointing at is still where it was. This is the single most important behaviour in the "
  "document, because the alternative is a wrong-patient click.",
  mocks_c.fig_live(), tags=("clin","core"))

F_EXPANDED = Fig("f-expanded", "Expanded patient row", "detail",
  "Expansion in place: the row keeps its position, its selection and the grid&rsquo;s scroll offset, and the URL "
  "gains <code>?row=AR-40915</code>. Note the footer — <b>five of eleven sections</b>. An expansion is a preview "
  "and says so, because a clinician who believes they have seen the chart has seen the chart.",
  mocks_b.fig_expanded(), tags=("shell","clin"))

F_INSPECTOR = Fig("f-inspector", "Grid + inspector", "detail",
  "Click any row. The grid keeps its focus, its scroll and its filters; the panel takes the detail. One URL, two "
  "regions, no navigation — which is what makes &ldquo;work down a list of forty&rdquo; possible at all. This is "
  "a reusable Oxygen pattern, not a grid feature: the same shell should host a timeline, a document list or a "
  "claim.",
  mocks_b.fig_inspector(), tags=("shell","clin"))

F_BULK = Fig("f-bulk", "Bulk clinical workflow", "bulk",
  "Select rows, then read the review card. It names <b>the people</b>, not the count — and it catches the case "
  "that makes bulk actions dangerous: one row left the selection&rsquo;s predicate while you were deciding. That "
  "check is only possible because a selection is <code>{ predicate, includedIds, excludedIds }</code> rather than "
  "&ldquo;the checkboxes that were ticked&rdquo;.",
  mocks_b.fig_bulk(), tags=("shell","clin"))

F_VIEWS = Fig("f-views", "Saved views", "views",
  "Switch between the four views. Each one restores filters, sort, density and columns — and <b>nothing about the "
  "data</b>. A view is a question, never a cached answer; restoring one always re-runs the query, which is why a "
  "six-day-old saved view can still produce today&rsquo;s empty result and say so.",
  mocks_b.fig_views(), tags=("core","shell"))

F_COLUMNS = Fig("f-columns", "Column customisation", "views",
  "Toggle columns and pin them. Identity is marked <em>required</em> and cannot be removed — in a clinical grid "
  "the ability to hide who a row is about is not a feature. Reordering has a keyboard path "
  "(<span class=\"k2\">Ctrl</span>+<span class=\"k2\">Alt</span>+<span class=\"k2\">←</span>) because a "
  "drag-only affordance is unreachable for a whole class of user.",
  mocks_b.fig_columns(), tags=("shell",))

F_MOBILE = Fig("f-mobile", "Mobile card transformation", "responsive",
  "Not a shrunken grid. Column <b>priority</b> — a property of the column, declared once — drives the responsive "
  "drop order, the print sheet, the export column order and what survives into a card. One number, four consumers.",
  mocks_c.fig_mobile(), tags=("shell",))

F_DENSITY = Fig("f-density", "Four densities", "density",
  "Switch density and watch the identity cell degrade in a defined order: the date of birth goes first, the MRN "
  "moves inline, and <b>the identifier never disappears</b>. Type never drops below 12px, because that is where "
  "200% zoom on a clinical workstation stops working.",
  mocks_c.fig_density(), tags=("shell",))

F_KEYBOARD = Fig("f-keyboard", "Keyboard navigation", "a11y",
  "Click a cell, then use the arrow keys, <span class=\"k2\">Home</span>, <span class=\"k2\">End</span> and "
  "<span class=\"k2\">Space</span>. The panel below shows what a screen reader is told. The row numbers are "
  "<b>19,995–19,999 of 40,000</b> — absolute, not window-relative, which is the single most common defect in "
  "virtualised grids and the reason so many of them announce &ldquo;row 1 of 20&rdquo; forever.",
  mocks_c.fig_keyboard(), tags=("core",))


# --------------------------------------------------------------- 09 filters
def s_filters():
    types = [
      ("Text", "contains · starts with · exact · is empty · is not empty", "Fuzzy on names. <b>Never fuzzy on an identifier</b> — an MRN is exact or nothing."),
      ("Number", "= · ≠ · &lt; · ≤ · &gt; · ≥ · between · is not recorded", "<em>Is not recorded</em> is a first-class operator, not the absence of a filter."),
      ("Date", "on · before · after · between · relative · is not recorded", "Relative dates resolve against the caller&rsquo;s clock, at query time, and the resolved absolute date is what the sentence prints."),
      ("Date range", "overlaps · contains · within", "Necessary because half of clinical data is a period, not an instant."),
      ("Time of day", "before · after · between", "For shift and clinic-session filters, independent of the date."),
      ("Boolean", "is · is not · is not recorded", "Three-valued, matching the Switch. A NULL boolean is not false."),
      ("Enum", "is · is not · is any of · is none of", "The option list carries its own display terms from <code>@oxygenui-design/intl</code>."),
      ("Multi-select", "is any of · is all of · is none of", "<em>Is all of</em> matters: a patient with depression <em>and</em> a substance-use disorder is a different cohort from either."),
      ("Coded concept", "is · is any of · descends from", "<b>Descends from</b> is the clinical one: SNOMED and ICD hierarchies mean &ldquo;diabetes&rdquo; must optionally include its 60 children."),
      ("Reference", "is · is any of · is unassigned", "Provider, facility, programme, care team. <em>Unassigned</em> is the highest-value option and is usually forgotten."),
      ("Measure", "value · band · change since baseline · reliable change", "PHQ-9, GAD-7, blood pressure. Filtering on <em>reliable change</em> rather than raw delta is what makes a registry work."),
      ("Clinical range", "in range · above · below · critical · not interpreted", "Derived from the observation&rsquo;s own reference range, per result, per lab — never from a global constant."),
      ("Risk", "band · score · percentile · not scored · expired", "<em>Not scored</em> and <em>expired</em> must be filterable, or a cohort silently means &ldquo;people the model has an opinion about&rdquo;."),
      ("Status", "is · is any of · has ever been", "<em>Has ever been</em> is a history query and needs the server. It is listed so it is not accidentally implemented client-side."),
    ]
    trows = "".join('<tr><td class="nw"><b>%s</b></td><td class="mono xs">%s</td><td>%s</td></tr>' % t for t in types)
    quick = [
      ("My patients", "Assigned clinician = me", "The default first pill on every clinician-facing recipe."),
      ("High risk", "Risk band ∈ {high, imminent}", "Carries the model provenance with it — a quick filter on a model output is still a model claim."),
      ("Needs review", "Status = needs-review OR unsigned documentation exists", "The one that is really a union of two different tables."),
      ("Missing documentation", "Encounter exists AND signed note does not", "Derived, and expensive; it is a server predicate, always."),
      ("Discharge today", "Planned discharge = today", "Drives the bed board and the transport queue simultaneously."),
      ("New admissions", "Admitted since my last visit to this list", "Per-user state layered over shared data — the only quick filter that is personal by definition."),
      ("No follow-up", "Next appointment = none AND episode is open", "The highest-yield behavioural-health filter in the set."),
      ("Authorisation expiring", "Authorisation end &lt; now + 14 days AND units remaining &gt; 0", "Two conditions, and both are needed: an expiring authorisation with no units left is not an action."),
      ("Labs pending", "Order exists AND result does not, ordered &gt; 24h ago", "The time clause is what turns a list into a worklist."),
      ("Critical results", "Interpretation = critical AND acknowledgement is absent", "Cannot be dismissed, cannot be paged past, and clears only on acknowledgement."),
      ("Unassigned", "Owner = none", "Applies to referrals, tasks, intakes and beds. Four recipes, one predicate."),
      ("Overdue", "Due &lt; now", "Relative to the <em>facility&rsquo;s</em> clock, not the reader&rsquo;s."),
      ("Appointment today", "Appointment date = today, facility-local", "The front-desk default."),
    ]
    qrows = "".join('<tr><td class="nw"><b>%s</b></td><td class="mono xs">%s</td><td>%s</td></tr>' % q for q in quick)
    return fill("""
<div class="prose">
<p class="lede2">Filtering deserves to be treated as its own component, and this section argues something
stronger: <b>there must be exactly one filter representation in the system</b>. A <code>FilterNode</code> tree —
a discriminated union of conditions and groups with <code>and</code> / <code>or</code> / <code>not</code>. The
visual builder produces it. The chip bar renders it. The quick-filter pills are named instances of it. The URL
serialises it. The saved view stores it. The export header prints it. The natural-language bar compiles to it and
<b>cannot express anything it cannot express</b>.</p>

<p>Every product that has two filter mechanisms eventually ships two filters that disagree, and in a clinical
product the disagreement is a cohort that is quietly wrong.</p>

<h4>The second rule: a filtered grid must render its predicate in words</h4>

<p>This is where a grid is more dangerous than the timeline ADR&nbsp;0011 was written about. A paginated list is
obviously partial. A <em>filtered</em> list looks complete, the filter was set by a human who has since forgotten
it, and views restore filters set six days ago. &ldquo;No results&rdquo; after a filter is indistinguishable from
&ldquo;no patients have this problem&rdquo; — and one of those is a clinical finding.</p>

<p>So: the active query renders as a sentence, in the coverage bar, always, and it prints. Not chips alone —
chips lose the grouping, and <code>(A or B) and C</code> is a different cohort from <code>A or (B and C)</code>.</p>
</div>

@@FIG@@

<div class="prose"><h4>Fourteen filter types</h4>
<p>Each type is a module. A grid that never filters a coded concept does not pay for SNOMED descendant expansion.</p></div>

<div class="tblwrap"><table class="dtbl">
<thead><tr><th style="width:14%">Type</th><th style="width:32%">Operators</th><th>The clinical rule attached to it</th></tr></thead>
<tbody>@@TROWS@@</tbody></table></div>

<div class="prose"><h4>Thirteen healthcare quick filters</h4>
<p>A quick filter is not a shortcut in the UI sense; it is a <b>named, shareable predicate</b> — the same object a
saved view stores, promoted to a pill with a live count. That is why the counts can be trusted: they come from the
same query the pill would run.</p>
<p>Two design rules. <b>Counts are computed against the other active filters</b>, not against the whole set, so a
pill reading <em>0</em> means &ldquo;nothing here, given what else you have selected&rdquo; — which is the useful
answer and the one that makes the pill row a navigational instrument. And <b>a count that could not be computed
renders as absent, never as zero</b>.</p></div>

<div class="tblwrap"><table class="dtbl">
<thead><tr><th style="width:17%">Pill</th><th style="width:36%">Predicate</th><th>Why it is not obvious</th></tr></thead>
<tbody>@@QROWS@@</tbody></table></div>

<div class="prose"><div class="note">
<p><b>Saved, recent and favourite filters are the same object at three lifetimes.</b> A recent filter is an
unnamed one held for the session; a favourite is a named one pinned by a user; a saved view is a named one with
columns and sort attached. Building them as three features is how a filter panel becomes 4,000 lines. §@@N:views@@
treats all three as <code>GridView</code>.</p>
</div></div>
""", FIG=F_BUILDER.render(), TROWS=trows, QROWS=qrows)


# --------------------------------------------------------------- 10 search
def s_search():
    scopes = [
      ("Identifier", "MRN, NHS number, account number, claim number, order number",
       "<b>Exact, never fuzzy, never partial-prefix by default.</b> A fuzzy MRN match that returns the wrong "
       "patient at the top of the list is a wrong-patient error with a search box in front of it. A typed "
       "identifier that matches nothing says so; it does not offer a similar one."),
      ("Name", "Given, family, preferred, previous, phonetic",
       "Fuzzy, with the matched substring highlighted. Must search <em>previous</em> names — a person who has "
       "changed name is exactly the person a search fails on. Two matches with the same name are disambiguated in "
       "the result list, not merged."),
      ("Free text", "Note bodies, reasons, comments",
       "Server-side, and <b>off by default in any grid with a disclosure policy</b>, because free-text search over "
       "notes will find Part 2 content in a general-purpose note."),
      ("Coded", "Diagnosis, medication, allergy, procedure",
       "Searches the display term <em>and</em> the code, and offers descendant expansion as an explicit choice "
       "rather than a silent behaviour."),
      ("Column", "Any filterable column",
       "The narrow, in-place search in a header menu. Produces a <code>FilterNode</code> like everything else."),
    ]
    rows = "".join('<tr><td class="nw"><b>%s</b></td><td class="xs t3">%s</td><td>%s</td></tr>' % s for s in scopes)
    return fill("""
<div class="prose">
<p class="lede2">Three surfaces, and the recommendation is that the grid owns only one of them.</p>

<p><b>The in-grid search box</b> is narrow and honest: it searches the columns that are visible and the
identifiers that are indexed, and it says which. That last part matters — a search box that silently does not
search free text is a search box that teaches a clinician the note does not exist.</p>

<p><b>Column search</b> lives in the header menu and produces a filter condition. There is nothing special about
it beyond scoping.</p>

<p><b>The command palette is not the grid&rsquo;s.</b> <code>ChartCommandPalette</code> already ships in this
repository, at Stable, with scoped search, frequency weighting, an out-of-scope count, and a break-glass-aware
unavailable state. Building a second palette inside the grid would produce two search surfaces with different
behaviour, and the one people learn would be whichever they hit first. The grid should <b>compose</b> it: press
<span class="k2">Ctrl</span>+<span class="k2">K</span> anywhere in a grid and the palette opens scoped to that
grid, with the grid&rsquo;s own actions registered as commands.</p>

<h4>Five search scopes, and the rule for each</h4>
</div>

<div class="tblwrap"><table class="dtbl">
<thead><tr><th style="width:13%">Scope</th><th style="width:24%">Fields</th><th>Rule</th></tr></thead>
<tbody>@@ROWS@@</tbody></table></div>

<div class="prose"><div class="note">
<p><b>The one rule to take from this section.</b> Search results must state their scope in the same breath as
their count: <em>&ldquo;3 matches in name, preferred name, MRN and NHS number. Note text was not searched.&rdquo;</em>
It is the coverage sentence again, applied to a search box, and it is the difference between a clinician
concluding &ldquo;there is no such patient&rdquo; and &ldquo;I did not look everywhere&rdquo;.</p>
</div></div>
""", ROWS=rows)


# --------------------------------------------------------------- 11 scale
def s_scale():
    prows = "".join(
      '<tr><td class="nw mono"><b>%s</b></td><td>%s</td><td class="nw mono">%s</td><td class="nw mono">%s</td>'
      '<td class="nw mono">%s</td><td class="nw mono">%s</td><td class="nw mono">%s</td></tr>' % p
      for p in data_spec.PERF)
    rules = "".join('<li><b>%s</b> %s</li>' % (a, b) for a, b in data_spec.PERF_RULES)
    strategies = [
      ("Row virtualisation", "Windowed rendering with a buffer above and below, and node recycling.",
       "Heights are <b>measured and cached</b>, not assumed. A chip row that wraps at 90% zoom is a different "
       "height from the same row at 100%, and a grid that assumes a constant row height jumps under the reader."),
      ("Scroll anchoring", "On re-measure, adjust <code>scrollTop</code> so the anchor row stays put.",
       "The hardest engineering problem in the component, and the one most likely to be wrong for two months."),
      ("Column virtualisation", "Windowed columns with pinned columns always rendered.",
       "Not optional: a flowsheet is 200 time columns and a claims ledger is 60 fields."),
      ("Cursor pagination", "Opaque cursor, stable ordering key, no offsets.",
       "Over a mutating set, offset pagination duplicates and drops rows. On an ADT feed that means a patient "
       "appears twice or not at all — the second is the dangerous one."),
      ("Server-side operations", "One <code>GridQuery</code> in, one <code>GridPage</code> out.",
       "Sort, filter, group and aggregate move to the server together, as one contract, so a product cannot end up "
       "with server sorting and client filtering silently disagreeing about the set."),
      ("Request cancellation", "Every query carries an <code>AbortSignal</code>; a superseded query is cancelled.",
       "Without it, fast typing in a filter box produces out-of-order responses and the grid renders the "
       "second-to-last answer."),
      ("Debounce and coalesce", "Typing debounced; live updates coalesced onto an animation frame.",
       "A code in progress can deliver 400 WebSocket messages in two seconds. 400 renders is a frozen tab."),
      ("Prefetch", "Fetch the next window when scroll velocity predicts arrival within ~300 ms.",
       "Cheap, and it is the difference between &ldquo;instant&rdquo; and &ldquo;instant except when it isn&rsquo;t&rdquo;."),
      ("Typed cache keys", "The cache key is the serialised <code>GridQuery</code>.",
       "Which means the cache, the URL, the saved view and the export are keyed by the same value. One idea, four uses."),
      ("Optimistic update", "Apply, mark the row as pending, roll back with the server&rsquo;s value on failure.",
       "Never optimistic for a signed, transmitted or clinically consequential write. Those show a commit phase."),
      ("Memoised selectors", "Row models derive through memoised, layer-by-layer selectors.",
       "Filtering must not re-run because a hover changed."),
      ("Refuse rather than crawl", "Past a measured row-count constant, client mode throws in development and "
       "degrades to server mode in production.",
       "A four-second sort with no explanation is worse than a clear error. The constant is measured, not chosen — "
       "see §@@N:risks@@."),
    ]
    srows = "".join('<tr><td class="nw"><b>%s</b></td><td>%s</td><td>%s</td></tr>' % s for s in strategies)
    return fill("""
<div class="prose">
<p class="lede2">Five orders of magnitude, one component, one consumer API. The row count changes what happens
inside; it must not change what the product writes.</p>

<h4>Budgets</h4>
<p>Every interaction budget below is an <b>INP budget</b>. A good Interaction to Next Paint is ≤200&nbsp;ms at the
75th percentile; 43% of sites still fail it, and it is now the most commonly failed Core Web Vital. These numbers
sit well inside it, deliberately, so that the grid is never the reason a page fails.</p>
</div>

<div class="tblwrap"><table class="dtbl">
<thead><tr><th class="nw">Rows</th><th style="width:22%">Mode</th><th class="nw">First paint</th><th class="nw">Sort</th>
<th class="nw">Filter keystroke</th><th class="nw">Scroll</th><th class="nw">JS heap</th></tr></thead>
<tbody>@@PROWS@@</tbody></table></div>

<div class="prose"><ol class="claims">@@RULES@@</ol>

<h4>Twelve strategies</h4></div>

<div class="tblwrap"><table class="dtbl">
<thead><tr><th style="width:16%">Strategy</th><th style="width:34%">What it is</th><th>Why it is not optional here</th></tr></thead>
<tbody>@@SROWS@@</tbody></table></div>

<div class="prose"><div class="note">
<p><b>Memory is a budget because clinical workstations are not developer laptops.</b> A shared ward workstation
runs the EHR, two payer portals and this grid in one browser profile on 4&nbsp;GB and a decade-old CPU. The
benchmark runs CPU-throttled for the same reason: a budget measured on an M-series laptop is a budget that has not
been measured.</p>
</div></div>
""", PROWS=prows, RULES=rules, SROWS=srows)


# --------------------------------------------------------------- 12 live
def s_live():
    events = [
      ("New lab result", "Cell updates in place, marked changed for 30s.", "A critical result also raises a row-level alert and cannot be scrolled away silently."),
      ("Patient status change", "Cell updates; the row does not move.", "If the status is the sort key, the row is marked as <em>out of order</em> rather than re-sorted under the pointer."),
      ("Bed status change", "Card updates.", "A bed whose source has not reported inside the staleness budget renders <em>unknown</em>, never <em>available</em>."),
      ("Appointment cancellation", "Row stays, status changes, strikethrough.", "Removing it hides the reason the slot is free."),
      ("New admission", "<b>Queued</b> behind the arrivals divider.", "Never inserted while a pointer or focus is in the body."),
      ("Discharge", "Row marked, then removed on the next explicit refresh.", "A row disappearing under a click is the same defect as one appearing."),
      ("Task assignment", "Owner cell updates; if it becomes yours, a polite announcement.", "If it stops being yours, the row is marked rather than vanishing from a <em>Mine</em> filter."),
      ("Authorisation update", "Units and expiry update; the derived clock recomputes.", "The derived value must recompute from the new source, not be patched."),
      ("Someone else editing", "Row shows co-presence.", "<code>CareTeamPresence</code> already renders this."),
      ("Correction / supersede", "The superseded row is struck; the correction is a new row.", "An ADT correction that arrives <em>before</em> the event it corrects must not be overwritten by the stale event — rows carry a version and an older version is dropped."),
    ]
    rows = "".join('<tr><td class="nw"><b>%s</b></td><td>%s</td><td>%s</td></tr>' % e for e in events)
    return fill("""
<div class="prose">
<p class="lede2">The rule is one sentence: <b>the ground never moves under a human who is aiming at it.</b>
Everything else in this section follows from it.</p>

<p>The failure it prevents is concrete and it is a patient-safety event, not an annoyance. A charge nurse moves the
pointer toward row four of a census. An admission arrives and sorts to row two. The click lands on the wrong
patient. That is the same class of error the wrong-patient retract-and-reorder measure counts, and it has a UI
cause rather than a human one.</p>

<p>So: while a pointer is over the grid body, or keyboard focus is inside it, <b>sort position is frozen</b>.
Updates to visible cells still apply, because a stale value is its own hazard; what is suspended is
<em>reordering</em> and <em>insertion</em>. Arrivals queue behind a divider with a count, and inserting them is
the reader&rsquo;s action, on the reader&rsquo;s timing.</p>
</div>

@@FIG@@

<div class="prose"><h4>Ten kinds of change, and what each one does</h4></div>

<div class="tblwrap"><table class="dtbl">
<thead><tr><th style="width:16%">Event</th><th style="width:34%">Behaviour</th><th>The rule</th></tr></thead>
<tbody>@@ROWS@@</tbody></table></div>

<div class="prose">
<h4>The other half: never look live when you are not</h4>
<p>A grid that keeps rendering relative timestamps after its socket has dropped is lying with confidence. Three
behaviours, all cheap:</p>
<ul>
<li><b>A connection state in the header</b> — <em>live</em>, <em>reconnecting</em>, or <em>last updated
09:41</em>. Never nothing.</li>
<li><b>Relative time becomes absolute past the staleness budget.</b> A row that says <em>2 minutes ago</em> for
forty minutes is worse than one that says <em>09:41</em>.</li>
<li><b>A reconnect refreshes and says so</b>, because the gap is exactly where a missed event lives, and the
coverage sentence is the only honest place to put that.</li>
</ul>
<div class="note">
<p><b>Conflict resolution takes the Switch&rsquo;s rule, unchanged.</b> Two clinicians edit the same row: the
second write is refused, both values are shown, and there is <b>no preselection</b>. Last-write-wins discards the
first clinician&rsquo;s reason; first-write-wins discards a deliberate more recent change. Neither is safe to
choose automatically, and the Switch has already argued this at length.</p>
</div></div>
""", FIG=F_LIVE.render(), ROWS=rows)


# --------------------------------------------------------------- 13 detail
def s_detail():
    matrix = [
      ("Expand the row in place",
       "The extra information is <b>a few fields</b>, it is about <b>this row alone</b>, and the reader wants to "
       "compare it with the rows above and below.",
       "Medication detail, a claim&rsquo;s line items, why a task is overdue, an authorisation&rsquo;s units.",
       "It costs vertical space, which is the scarcest resource in a dense grid, and it makes row height dynamic — "
       "which is the hardest thing for the virtualiser."),
      ("Open the inspector",
       "The reader will work down a list, needing <b>rich context per row</b> but staying in the list.",
       "A caseload review, a results inbox, an intake triage session, a bed-management round.",
       "It costs ~320px of width, so it is a desktop-and-tablet pattern; on a phone it becomes a sheet."),
      ("Navigate to the chart",
       "The reader is going to <b>do</b> something substantial, or needs the record rather than a summary.",
       "Writing a note, placing an order, reviewing a whole history.",
       "It loses the list. The grid must restore exactly — scroll, focus, selection, filters — on return, or the "
       "reader loses their place forty times a shift."),
    ]
    rows = "".join('<tr><td class="nw"><b>%s</b></td><td>%s</td><td class="t2">%s</td><td class="t3">%s</td></tr>' % m
                   for m in matrix)
    return fill("""
<div class="prose">
<p class="lede2">Three ways to show more, and the question is not which is best but which is correct for a given
column set. The rule that decides it: <b>how far is the reader from the list they are working?</b></p>
</div>

<div class="tblwrap"><table class="dtbl">
<thead><tr><th style="width:15%">Pattern</th><th style="width:31%">Correct when</th><th style="width:24%">Examples</th><th>What it costs</th></tr></thead>
<tbody>@@ROWS@@</tbody></table></div>

@@FIGA@@

<div class="prose">
<h4>The rule an expansion must not break</h4>
<p>An expansion is a <b>preview</b>, and the reader must know it. A clinician who believes they have seen the
chart has seen the chart — so the panel states what fraction of the record it is showing, and offers the way to
the rest. This is ADR&nbsp;0011 again, one level down: a component that shows some of a set declares the set.</p>
</div>

@@FIGB@@

<div class="prose">
<h4>The inspector should be a platform pattern, not a grid feature</h4>
<p>&ldquo;A list on the left, a detail panel on the right, one URL, no navigation&rdquo; is not specific to grids.
It is the right shell for a timeline, a document list, a claim, a message thread and a work queue. The
recommendation is that it ships as <code>InspectorLayout</code> in the composition layer with the grid as its
first consumer — otherwise the second consumer copies it, and the two drift on focus management, which is the part
that is hard.</p>
<p>Three properties it must have, and all three are focus-management problems rather than layout problems:</p>
<ul>
<li><b>Selecting a row does not move focus.</b> Focus stays in the grid so <span class="k2">↓</span> moves to the
next row and the panel follows. Working down forty rows is one keystroke each, not four.</li>
<li><b>The panel is reachable in one keystroke and returns in one.</b> <span class="k2">F6</span> cycles
landmarks; <span class="k2">Esc</span> in the panel returns focus to the row it describes.</li>
<li><b>It is not a dialog.</b> No focus trap, no modal semantics, no inert background — the grid stays operable,
because operating the grid is the point.</li>
</ul>
</div>
""", ROWS=rows, FIGA=F_EXPANDED.render(), FIGB=F_INSPECTOR.render())


# --------------------------------------------------------------- 14 bulk
def s_bulk():
    acts = [
      ("Assign / reassign provider", "clinical", "Names the people. Requires a reason. Emits a clinical-responsibility change event."),
      ("Change status", "clinical", "Refused where a status change implies a clinical judgement per person — a bulk &ldquo;mark as stable&rdquo; is not a thing that should exist."),
      ("Add to programme", "clinical", "Names the people. Checks eligibility per row and reports the ones that fail rather than failing the batch."),
      ("Schedule follow-up", "clinical", "Produces per-row proposals, not one appointment. Shows conflicts before writing."),
      ("Send reminder", "outward", "<b>Confirmation is mandatory and lists the recipients.</b> An outward message cannot be undone."),
      ("Add task", "safe", "Idempotent, reversible, no confirmation beyond the count."),
      ("Update facility / location", "operational", "Names the people, because a location change moves a person in the physical world."),
      ("Export", "disclosure", "Confirmation states row count, column count, and that it is a disclosure event."),
      ("Print", "disclosure", "Same, plus the warning that printed copies are not tracked once they leave the device."),
      ("Delete / archive", "destructive", "Not offered in any clinical recipe. Clinical records are amended and superseded, never deleted; <em>entered-in-error</em> is a state, not an absence."),
    ]
    rows = "".join('<tr><td class="nw"><b>%s</b></td><td class="nw"><span class="lay %s">%s</span></td><td>%s</td></tr>' % (
      n, {"clinical":"clin","outward":"plug","safe":"core","operational":"shell","disclosure":"clin","destructive":"app"}[k],
      k, d) for n, k, d in acts)
    return fill("""
<div class="prose">
<p class="lede2">Bulk actions are where a grid stops being a view and becomes a write surface, and it is where
the failure modes get expensive. Three rules.</p>

<h4>1. A selection is a predicate, not a list of ticked boxes</h4>
<p>The value is <code>{ predicate, includedIds, excludedIds }</code>. That shape is what makes &ldquo;select all
240,000 matching&rdquo; expressible at all, and — more importantly — it is what lets the confirmation step
<b>re-resolve</b> the selection and notice that a row left the predicate while the user was deciding. Without it,
that check is impossible and a bulk write silently applies to rows that no longer qualify.</p>

<p><b>Select-all is two affordances, not one.</b> <span class="k2">Ctrl</span>+<span class="k2">A</span> and the
header checkbox select <em>the rows on this page</em> and say so. Selecting every matching row is a separate,
explicitly worded action — <em>&ldquo;Select all 240,000 rows matching this query&rdquo;</em> — because the two
have completely different consequences and one of them is a page-sized accident.</p>

<h4>2. A clinical or destructive action shows the people, not the count</h4>
<p>The count is the confirmation; the names are the check. A reviewer who reads &ldquo;12 patients&rdquo; confirms
a number. A reviewer who reads twelve names notices the one that should not be there. This costs one card and it
is the single cheapest safety control in the document.</p>
</div>

@@FIG@@

<div class="prose"><h4>3. Not every action should be bulk-able</h4>
<p>Some are refused on purpose, and the refusal is the design.</p></div>

<div class="tblwrap"><table class="dtbl">
<thead><tr><th style="width:20%">Action</th><th style="width:14%">Class</th><th>Treatment</th></tr></thead>
<tbody>@@ROWS@@</tbody></table></div>

<div class="prose"><div class="note">
<p><b>Partial success is the normal case, and must be renderable.</b> Twelve writes, nine succeed, two fail
validation, one is refused by policy. A grid that reports &ldquo;error&rdquo; has thrown away the nine, and one
that reports &ldquo;success&rdquo; has hidden the three. The result is a <em>per-row outcome set</em> rendered
back into the grid: three rows marked with their reason, an action to retry only those, and the nine left alone.
Anything less makes the user re-derive what happened by reading the data.</p>
</div></div>
""", FIG=F_BULK.render(), ROWS=rows)


# --------------------------------------------------------------- 15 views
def s_views():
    prec = [
      ("Product default", "Shipped with the recipe", "Always exists. Cannot be deleted, so a user can always get back to a known state."),
      ("Organisation view", "Set by an administrator", "Overrides the default for everyone. May be marked <em>locked</em> — a compliance-mandated column set."),
      ("Role preset", "Set per role", "Doctor, nurse, behavioural-health clinician, front desk, billing. §@@N:views@@ table below."),
      ("Team view", "Shared, owned by a team", "The one that actually gets used, because clinical teams standardise on a worklist together."),
      ("Personal view", "The user&rsquo;s own", "Wins over everything except a locked organisation view."),
      ("Session state", "Unsaved changes", "Wins over all of the above, is held per tab, and offers to be saved. Never silently persisted, because a filter set in a hurry is not a preference."),
    ]
    prows = "".join('<tr><td class="nw num">%d</td><td class="nw"><b>%s</b></td><td class="nw t2">%s</td><td>%s</td></tr>' % (
      i + 1, a, b, c) for i, (a, b, c) in enumerate(prec))
    roles = [
      ("Doctor", "Patient · Clinical status · Active problems · Medications · Recent results · Risk · Last encounter",
       "Risk desc, then last encounter asc", "compact", "Results and medications are the two columns they open the list to see."),
      ("Nurse", "Patient · Location · Tasks due · Vitals due · Medications due · Isolation · Fall risk",
       "Tasks due asc", "compact", "Everything is a clock. This is a work queue that looks like a roster."),
      ("Behavioural-health clinician", "Client · Programme · Week · Instrument scores · Change · Treatment-plan status · Next session",
       "Change desc", "standard", "Measurement-based care means the instrument <em>is</em> the primary column."),
      ("Front desk", "Patient · Appointment · Confirmation · Insurance · Eligibility · Contact · Balance",
       "Appointment time asc", "standard", "No clinical columns at all — and that is minimum-necessary, not a simplification."),
      ("Billing", "Claim · Patient · Payer · Status · Balance · Age · Authorisation · Denial reason",
       "Age desc", "ultra", "Ultra-dense, because a biller works 300 rows and never reads a name twice."),
      ("Care manager", "Person · Programme · Last contact · Attempts · Next action · Owner · Care gaps",
       "Last contact desc", "standard", "Attempts accumulate on the row and are the reason it is still open."),
    ]
    rrows = "".join('<tr><td class="nw"><b>%s</b></td><td class="xs">%s</td><td class="nw xs t2">%s</td>'
                    '<td class="nw"><code>%s</code></td><td>%s</td></tr>' % r for r in roles)
    return fill("""
<div class="prose">
<p class="lede2">This is the section with the highest leverage per line of code, and it rests on one decision:
<b>the product&rsquo;s default grid, the role preset and the user&rsquo;s saved view are the same artefact from
three sources.</b></p>

<p>One serialisable document — <code>GridView</code> — carrying columns, widths, order, pinning, visibility, sort,
filter tree, grouping, density and page size. Not the data. Never the data.</p>

<p>Every commercial grid gets this wrong in the same way: view state lives inside the grid as imperative API
state, so saving a view is bespoke serialisation, role presets are a second mechanism, and the product default is
a third. Making it one artefact means role-based grids, saved views, URL sharing, defaults and admin-locked
column sets are <b>one feature</b>, and it is the reason fifty healthcare grids become tractable from one system.</p>
</div>

@@FIGA@@

<div class="prose"><h4>Six sources, one precedence, stated once</h4>
<p>Later wins. The resolved view names its source, so a user can always see <em>why</em> their grid looks like
this — which is the question that generates support tickets.</p></div>

<div class="tblwrap"><table class="dtbl">
<thead><tr><th class="nw">#</th><th style="width:16%">Source</th><th style="width:20%">Set by</th><th>Rule</th></tr></thead>
<tbody>@@PROWS@@</tbody></table></div>

<div class="prose"><h4>Role presets are views, not components</h4>
<p>The brief asked whether the grid should change by role. It should — and the answer is that it changes by
<em>view</em>, and a role simply selects one. Six worked examples:</p></div>

<div class="tblwrap"><table class="dtbl">
<thead><tr><th class="nw">Role</th><th style="width:32%">Columns</th><th class="nw">Default sort</th><th class="nw">Density</th><th>The interesting part</th></tr></thead>
<tbody>@@RROWS@@</tbody></table></div>

@@FIGB@@

<div class="prose"><div class="note">
<p><b>Three rules that make this survive contact with production.</b> A <code>GridView</code> is
<b>versioned from the first commit</b>, because the day you add a field is the day you need a migration and by
then a thousand of them exist in a database you do not own. A view that references a column the user may not see
<b>renders without it and says so</b>, rather than failing to load. And restoring a view <b>always re-runs the
query</b> — a view is a question, never a cached answer.</p>
</div></div>
""", FIGA=F_VIEWS.render(), PROWS=prows, RROWS=rrows, FIGB=F_COLUMNS.render())


# --------------------------------------------------------------- 16 responsive
def s_responsive():
    targets = [
      ("Large operational display", "≥2560px, viewed from 3m", "Ultra-dense, no interaction, no hover, larger type than compact despite the density. A census board on a wall is read, not used."),
      ("Clinical workstation", "1280–1920px, often at 125–150% OS scaling", "The real default. Design at 1280 <em>effective</em> pixels, not 1920 — the scaling is what makes so many EHR screens feel cramped."),
      ("Desktop / laptop", "1440–1920px", "Full grid, inspector optional."),
      ("Tablet", "768–1180px, often held one-handed at a bedside", "Reduced columns plus inspector; pointer targets go to 44px; hover states must have a tap equivalent."),
      ("Phone", "&lt;768px", "Cards, not a grid. Bulk selection stays — a care manager triaging on a phone is a real workflow."),
      ("Print", "Fixed width, no interaction", "Its own target, not an afterthought. §@@N:privacy@@."),
    ]
    rows = "".join('<tr><td class="nw"><b>%s</b></td><td class="nw t2 xs">%s</td><td>%s</td></tr>' % t for t in targets)
    return fill("""
<div class="prose">
<p class="lede2">&ldquo;Do not simply shrink the desktop grid&rdquo; is right, but the useful version of that
instruction is a mechanism rather than a warning: <b>column priority is a property of the column, declared once,
and four different consumers read it.</b> Responsive drop order, print column set, export column order, and what
survives into a card — all one number.</p>
</div>

@@FIG@@

<div class="prose"><h4>Six targets</h4></div>

<div class="tblwrap"><table class="dtbl">
<thead><tr><th style="width:19%">Target</th><th style="width:22%">Reality</th><th>Treatment</th></tr></thead>
<tbody>@@ROWS@@</tbody></table></div>

<div class="prose">
<h4>Three transformations, and why the middle one is the hard one</h4>
<ul>
<li><b>Desktop → tablet</b> is column dropping by priority plus the inspector. Mechanical.</li>
<li><b>Tablet → phone</b> is the hard one, because it is a change of <em>form</em>, not of size. A row becomes a
card, columns become a title, a chip and two fact lines, and the ordering is priority order. The trap is that a
card invites more information than a row did; the discipline is that a card shows <em>fewer</em> facts than the
tablet grid, not more.</li>
<li><b>Anything → print</b> drops every interactive affordance and gains two: the coverage sentence and the
predicate, on every page.</li>
</ul>
<div class="note">
<p><b>The reflow requirement is not negotiable and it is already tested here.</b> WCAG 2.2 requires content to
reflow at 320px equivalent width, and this repository already runs 320px reflow and 200% zoom across three
engines. A grid is the component most likely to break it, so the rule is explicit: <b>the page never scrolls
horizontally; only the grid&rsquo;s own scroller does.</b> A grid that makes the whole document scroll sideways
has failed, however well it renders.</p>
</div></div>
""", FIG=F_MOBILE.render(), ROWS=rows)


# --------------------------------------------------------------- 17 density
def s_density():
    variants = [
      ("Zebra rows", "Alternating row tint.", "Helps horizontal tracking past ~7 columns; hurts when combined with a status tint, because two backgrounds compete. Off by default, on in ledger and flowsheet recipes."),
      ("Divided", "Vertical rules between columns.", "The right answer for numeric grids where column identity matters more than row identity — MAR, flowsheet, claims."),
      ("Borderless", "No row rules; separation by spacing.", "Comfortable density only. Below 40px rows it stops working."),
      ("Card-like", "Each row a surface with a hairline.", "Patient-facing and phone. Never at compact or below."),
      ("Grouped", "Sticky group headers with counts and aggregates.", "The default for anything grouped by ward, programme, payer or owner."),
      ("Clinical dashboard", "Comfortable, borderless, zebra off, status rails on, ≤6 columns.", "Read, not worked. Optimised for the glance."),
      ("Operational work queue", "Compact, divided, zebra on, status rails on, 8–12 columns.", "Worked all day. Optimised for the twentieth row, not the first."),
    ]
    rows = "".join('<tr><td class="nw"><b>%s</b></td><td class="t2">%s</td><td>%s</td></tr>' % v for v in variants)
    return fill("""
<div class="prose">
<p class="lede2">Four densities, and the rule that makes them a system rather than a preference: <b>a density that
breaks a floor is not offered.</b> Not discouraged — removed from the control. Type never goes below 12px, the
contrast floors hold at every step, and pointer targets stay at 24px minimum (44px on touch), so ultra-dense
<em>cannot</em> be selected on a touch device where its targets would fail.</p>

<p>Density therefore composes with the three density tiers already in <code>@oxygenui-design/tokens</code>, plus
one new step. The identity cell degrades in a defined order — date of birth first, then the secondary line, with
the MRN moving inline — and <b>the identifier is never what disappears</b>, because two identifiers before a care
action is the rule the identity package already enforces at compile time.</p>
</div>

@@FIG@@

<div class="prose"><h4>Seven visual variants, all token-level</h4>
<p>None of these is a component. Each is a set of token overrides on the same markup, which is the test of whether
this is a design system: <b>if re-skinning needs component edits, it was never a system.</b> That claim was
already proved once in this repository — the healthcare-50 catalogue re-themed from stock antd to the Oxygen token
layer with zero markup change.</p></div>

<div class="tblwrap"><table class="dtbl">
<thead><tr><th style="width:16%">Variant</th><th style="width:28%">What it is</th><th>When it is right, and when it is not</th></tr></thead>
<tbody>@@ROWS@@</tbody></table></div>

<div class="prose"><div class="note">
<p><b>Light and dark are not two designs.</b> Every colour in the prototypes above is a semantic token; the theme
swaps the token values and nothing else. Dark mode in a clinical setting is not a preference — night shift on a
ward is a lighting condition — so the same contrast gate runs on both, and the status hues keep 60° of separation
in both so the direction of an abnormal result survives colour-vision deficiency. Use the <b>theme</b> control at
the top of this page: every prototype re-themes at once.</p>
</div></div>
""", FIG=F_DENSITY.render(), ROWS=rows)


# --------------------------------------------------------------- 18 motion
def s_motion():
    m = [
      ("Row hover", "90ms background", "Confirms the hit area. It must be a background change and not a lift — a lifting row in a dense grid produces visible reflow."),
      ("Selection", "90ms background + checkbox", "Instant enough to feel like a switch, not an animation."),
      ("Sort", "no row animation", "<b>Deliberately none.</b> Animating 200 rows to new positions is 200 elements moving at once; it is slow, it is nauseating at ultra-dense, and it teaches nothing. The header changes; the body redraws."),
      ("Filter", "no row animation", "Same reasoning. The count and the predicate animate; the rows do not."),
      ("Column resize", "no transition", "Direct manipulation must track the pointer exactly. Any easing here reads as lag."),
      ("Column reorder", "140ms translate", "The one place a positional animation earns its place, because the reader is tracking one object."),
      ("Row expand", "280ms height + 140ms content fade", "The longest duration in the set, because the layout below genuinely moves and the reader must follow it."),
      ("Inline edit commit", "140ms field → 200ms confirmation", "Two phases: the field settles, then the row confirms. Merging them makes a failed write look like a successful one."),
      ("Validation error", "no shake", "A shake is a punishment. The field marks, the message appears, and the message is the information."),
      ("Live row update", "2.6s attention decay", "Long, because the reader was not looking when it changed. It decays rather than switching off."),
      ("Arrivals appearing", "200ms + a 2.2s pulse", "The pulse is the only looping animation in the component and it stops under <code>prefers-reduced-motion</code>."),
      ("Bulk selection bar", "140ms slide", "Replaces the toolbar, so a change of position tells the reader the toolbar changed meaning."),
    ]
    rows = "".join('<tr><td class="nw"><b>%s</b></td><td class="nw mono xs">%s</td><td>%s</td></tr>' % x for x in m)
    return fill("""
<div class="prose">
<p class="lede2">Four durations, two curves, no springs — the motion system already established in this
repository. The grid adds nothing to the palette and removes a great deal from the usual grid vocabulary, because
the honest answer for most grid interactions is <b>no animation at all</b>.</p>

<p>The test for every entry below: <em>does this communicate a state change the reader would otherwise miss?</em>
Sorting fails that test — the reader caused it and is looking at it. A row updating under a live feed passes it —
the reader was not looking.</p>
</div>

<div class="tblwrap"><table class="dtbl">
<thead><tr><th style="width:19%">Interaction</th><th style="width:22%">Motion</th><th>Why</th></tr></thead>
<tbody>@@ROWS@@</tbody></table></div>

<div class="prose"><div class="note">
<p><b><code>prefers-reduced-motion</code> gets a designed still state, not a paused one</b> — the rule the loaders
established. The arrivals pulse becomes a solid dot; the attention decay becomes a persistent left rule that
clears on interaction; the expand becomes instant. Nothing loses information; it stops moving.</p>
</div></div>
""", ROWS=rows)


# --------------------------------------------------------------- 19 a11y
def s_a11y():
    krows = "".join('<tr><td class="nw"><span class="k2">%s</span></td><td class="nw t3 xs">%s</td><td>%s</td>'
                    '<td class="t3">%s</td></tr>' % k for k in data_spec.KEYS)
    aria = [
      ("<code>role=\"grid\"</code> on the scroller", "Not <code>table</code>. A grid is interactive; a table is read."),
      ("<code>aria-rowcount</code> = the full result count", "Not the DOM count. <code>-1</code> when the total is genuinely unknown — which is honest for a cursor-paged stream and is what the attribute is for."),
      ("<code>aria-rowindex</code> = the absolute row number", "The defect that makes virtualised grids announce &ldquo;row 1 of 20&rdquo; forever."),
      ("<code>aria-colcount</code> / <code>aria-colindex</code>", "Same, for column virtualisation and for hidden columns — a grid showing columns 1, 2 and 7 must say 7."),
      ("<code>aria-sort</code> on the sorted header", "Plus the precedence ordinal in the accessible name for multi-sort: <em>&ldquo;Risk, sorted descending, first of two&rdquo;</em>."),
      ("<code>aria-selected</code> on rows", "Row selection, not cell selection, unless the range plugin is loaded."),
      ("<code>aria-expanded</code> on expandable rows", "And <code>aria-level</code> / <code>aria-posinset</code> / <code>aria-setsize</code> on tree rows."),
      ("<code>aria-describedby</code> on a masked cell", "Pointing at the reason. A mask with no announced reason is a blank cell to a screen-reader user."),
      ("<code>role=\"status\"</code> live region", "Sort, filter, selection count, page change, focus movement, arrivals. Polite."),
      ("<code>role=\"alert\"</code>", "Reserved for a failed data source and a critical unacknowledged result. Two uses, both justified — anything more is an alert nobody reads."),
    ]
    arows = "".join('<tr><td class="nw">%s</td><td>%s</td></tr>' % a for a in aria)
    return fill("""
<div class="prose">
<p class="lede2">A data grid is the hardest accessibility problem in a component library, and virtualisation makes
it harder in a way that is easy to get wrong invisibly: <b>the DOM no longer contains the data</b>, so every
positional statement has to be asserted rather than inferred.</p>

<p>The measured baseline is worth restating. <code>@rc-component/table</code> emits one <code>aria-*</code>
attribute and has no keyboard handlers; antd&rsquo;s layer adds five labels, <code>aria-sort</code>,
<code>aria-description</code> and <code>aria-expanded</code>. Nothing in either package emits
<code>aria-rowcount</code>, <code>aria-rowindex</code> or <code>aria-colindex</code>, and neither has cell focus.
That is the category standard for the most popular React table in the world, and it is why this cannot be a
wrapper.</p>
</div>

@@FIG@@

<div class="prose"><h4>The keyboard model — 24 bindings</h4>
<p>The fourth column is the important one: it names the obvious implementation that is wrong.</p></div>

<div class="tblwrap"><table class="dtbl tight">
<thead><tr><th style="width:16%">Key</th><th class="nw">Context</th><th style="width:36%">Action</th><th>Why not the obvious thing</th></tr></thead>
<tbody>@@KROWS@@</tbody></table></div>

<div class="prose"><h4>ARIA contract</h4></div>

<div class="tblwrap"><table class="dtbl">
<thead><tr><th style="width:32%">Attribute</th><th>Rule</th></tr></thead>
<tbody>@@AROWS@@</tbody></table></div>

<div class="prose">
<h4>The rest of WCAG 2.2 AA, as it applies here</h4>
<ul>
<li><b>Focus visible (2.4.7) and focus not obscured (2.4.11, new in 2.2).</b> The second one is the grid-specific
trap: a sticky header can cover the focused cell when you arrow upward. Focus movement must scroll the cell clear
of both the sticky header and any pinned column.</li>
<li><b>Target size (2.5.8).</b> 24×24 minimum, which is why ultra-dense drops its inline controls to an overflow
menu rather than shrinking them.</li>
<li><b>Dragging movements (2.5.7, new in 2.2).</b> Column reorder and resize must both have a keyboard path.
They do — <span class="k2">Ctrl</span>+<span class="k2">Alt</span>+arrows.</li>
<li><b>Reflow (1.4.10) and text spacing (1.4.12).</b> Already gated in this repository at 320px and 200%.</li>
<li><b>Forced colors.</b> Status survives because it is glyph + word + rail, never colour.</li>
<li><b>Reduced motion.</b> A designed still state, per §@@N:motion@@.</li>
</ul>
<div class="note">
<p><b>The gate on leaving <code>experimental</code> is a screen-reader matrix, not a test suite.</b> NVDA, JAWS
and VoiceOver × Chromium, Firefox and WebKit, against the virtualised 40,000-row fixture. Automated tools cannot
tell you that JAWS announces a row index correctly in browse mode; a person has to listen. This is the same
unfinished obligation the Switch carries for <code>aria-checked="mixed"</code>, and it should be planned as work
rather than discovered as a blocker.</p>
</div></div>
""", FIG=F_KEYBOARD.render(), KROWS=krows, AROWS=arows)
