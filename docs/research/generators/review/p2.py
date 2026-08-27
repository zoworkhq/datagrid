# -*- coding: utf-8 -*-
"""Sections 11–21."""
from model import fill
from mocklib import ic
import d_arch, figs, figs2


def s_engine():
    return """
<div class="prose">
<p class="lede2">The core is the part that must never change when a framework does. Everything in it satisfies
three conditions: it has no DOM, no framework and no clinical vocabulary; it is testable without a renderer; and
it can be serialised.</p>

<h4>Two paths, deliberately different</h4>

<p><b>Writes go through actions.</b> A discriminated union reduced into state. This is what makes behaviour
replayable, loggable and property-testable, and it is what lets the devtools panel show why a grid is in the
state it is in.</p>

<p><b>Reads go through signals.</b> Every derived value — the visible window, the group tree, the summary row,
the chip set, the facet counts — is a computed signal, so a hover does not re-run filtering and a filter does not
re-run grouping. This is where TanStack's <b>+79% row processing and −86% heap</b> came from, and it is not a
micro-optimisation: it is the difference between a grid that is usable at 100,000 rows and one that is not.</p>

<pre class="code"><code><span class="c-c">// The write path: explicit, serialisable, replayable.</span>
<span class="c-k">type</span> GridAction =
  | { type: <span class="c-s">"sort/toggle"</span>; key: string; additive: boolean }
  | { type: <span class="c-s">"filter/set"</span>; node: FilterNode | <span class="c-k">null</span> }
  | { type: <span class="c-s">"select/range"</span>; from: RowId; to: RowId }
  | { type: <span class="c-s">"page/next"</span>; cursor: string }
  | { type: <span class="c-s">"view/apply"</span>; view: GridView };

<span class="c-c">// The read path: layered, memoised, pull-based.</span>
<span class="c-k">const</span> filtered   = computed(() =&gt; evaluate(source(), filter()));
<span class="c-k">const</span> sorted     = computed(() =&gt; order(filtered(), sort()));
<span class="c-k">const</span> grouped    = computed(() =&gt; group(sorted(), groupKeys()));
<span class="c-k">const</span> disclosed  = computed(() =&gt; policy().apply(grouped()));   <span class="c-c">// before geometry</span>
<span class="c-k">const</span> window_    = computed(() =&gt; slice(disclosed(), viewport(), heights()));</code></pre>

<div class="note">
<p><b>Why the reactivity lives in its own package.</b> <code>grid-signals</code> is a façade over an
implementation — alien-signals today, native TC39 Signals when it ships. The core imports <em>our</em> interface,
never a vendor's. TC39 Signals is Stage 1; if it lands, one package changes, and if it stalls, nothing does.
That is the whole reason the indirection exists, and it is the only indirection in the core that is not
load-bearing for a feature.</p>
</div>

<h4>Row storage, and the one experiment worth running</h4>

<p>The obvious representation is an array of row objects. It is also the wrong shape for a flowsheet: twenty
analytes by two thousand timepoints allocates forty thousand objects for data that is natively columnar.</p>

<p>The recommendation is a <b>storage interface</b> in core with two implementations — row-oriented by default,
columnar behind a flag — measured on the flowsheet fixture before either is made the default. Columnar storage is
also the precondition for the Arrow/DuckDB path in §@@PERF@@, which is the only credible client-side answer above
100,000 rows. <b>Nobody in this category does either.</b></p>

<h4>What is deliberately not in core</h4>
<ul>
<li><b>Anything that touches the DOM</b>, including measurement. The core computes geometry from heights it is
<em>told</em>; <code>grid-dom</code> measures.</li>
<li><b>Data fetching.</b> Core defines <code>GridQuery</code> and <code>GridPage</code> and nothing else. Whether
that is TanStack Query, SWR or a SMART-on-FHIR client is the application's business.</li>
<li><b>Any clinical vocabulary.</b> Core sorts comparables; it does not know what a reference range is.</li>
<li><b>An IoC container.</b> Plain modules, explicit wiring. AG Grid's core is the cautionary tale.</li>
</ul>
</div>
""".replace("@@PERF@@", "@@N:perf@@")


def s_render():
    return fill("""
<div class="prose">
<p class="lede2">Three rendering strategies exist. Only one is compatible with the product, and the reasons are
worth writing down permanently, because the rejected one is faster and someone will propose it again.</p>
</div>

@@DEC@@

<div class="prose">
<h4>What <code>grid-dom</code> owns</h4>
<ul>
<li><b>Node recycling.</b> Not just windowing. Glide's team left DOM virtualisation because loading and unloading
hundreds of nodes per frame was the bottleneck — so the rows entering and leaving the window are
<em>reused</em>, with their content patched, rather than created and destroyed.</li>
<li><b>Scroll anchoring across dynamic heights.</b> Heights are measured and cached per row; a re-measure adjusts
<code>scrollTop</code> so the anchor row does not move. This is the hardest single problem in the component and
it needs its own acceptance test, not a hope.</li>
<li><b>The whole ARIA contract.</b> <code>role="grid"</code>, absolute <code>aria-rowindex</code> under
windowing, <code>aria-rowcount</code> (or <code>-1</code> when the total is honestly unknown), roving
<code>tabindex</code>, and the live region.</li>
<li><b>Focus that survives virtualisation.</b> The focused cell's identity is <code>{ rowId, columnKey }</code>,
never a node reference — because the node it was on may have been recycled into a different row.</li>
<li><b>The cell renderer interface</b>, which is what adapters marshal framework components into.</li>
</ul>

<h4>The cell renderer interface — the one place the abstraction leaks</h4>

<pre class="code"><code><span class="c-k">interface</span> CellRenderer&lt;T&gt; {
  mount(el: HTMLElement, ctx: CellContext&lt;T&gt;): <span class="c-k">void</span>;
  update(el: HTMLElement, ctx: CellContext&lt;T&gt;): <span class="c-k">void</span>;   <span class="c-c">// recycling calls this, not mount</span>
  unmount(el: HTMLElement): <span class="c-k">void</span>;

  <span class="c-c">// The seven obligations from the brief, plus the eighth.</span>
  measure(ctx: CellContext&lt;T&gt;): { intrinsic: number; growable: boolean };
  read(ctx: CellContext&lt;T&gt;): string;            <span class="c-c">// what the live region announces</span>
  compare(a: T, b: T): number | <span class="c-s">"incomparable"</span>;
  toExport(ctx: CellContext&lt;T&gt;): ExportValue;   <span class="c-c">// carries mask state — see §@@N:security@@</span>
  toPrint(ctx: CellContext&lt;T&gt;): PrintValue;
}

<span class="c-c">// The React adapter's whole job for cells: portal in, and keep identity</span>
<span class="c-c">// stable across recycling so React does not remount on every scroll frame.</span></code></pre>

<p>This is the honest cost of framework independence. A React cell is a React element and the renderer does not
know React, so the adapter portals into the recycled node and must keep the portal's identity stable across
recycling. It is real work, it is confined to one file per adapter, and it is the thing to get right in wave one
because every later decision assumes it.</p>

<h4>How a frame is produced</h4>
</div>

@@FLOW@@

<div class="prose"><div class="note">
<p><b>Read the last step again.</b> The framework adapter appears once, at the end, and does almost nothing. If a
future change puts logic there, the architecture has drifted — and the cross-adapter accessibility assertion in
§@@N:testing@@ is what will catch it.</p>
</div></div>
""", DEC=figs.fig_render(), FLOW=figs.fig_flow())


def s_plugins():
    return fill("""
<div class="prose">
<p class="lede2">You asked for <code>grid.use(plugin)</code> and warned against a plugin system that becomes
impossible to maintain. That warning is the right instinct, and the way to honour it is to make the extension
surface <b>small, closed and typed</b> — six hooks, twelve named slots, and no arbitrary render injection.</p>

<pre class="code"><code><span class="c-k">import</span> { createGrid } <span class="c-k">from</span> <span class="c-s">"@oxygenui-design/grid-core"</span>;
<span class="c-k">import</span> { exportPlugin } <span class="c-k">from</span> <span class="c-s">"@oxygenui-design/grid-export"</span>;
<span class="c-k">import</span> { healthcare } <span class="c-k">from</span> <span class="c-s">"@oxygenui-design/grid-healthcare"</span>;

<span class="c-k">const</span> grid = createGrid({ columns, rowKey: <span class="c-s">"id"</span> })
  .use(healthcare({ coverage, policy }))
  .use(exportPlugin({ formats: [<span class="c-s">"csv"</span>, <span class="c-s">"xlsx"</span>] }));

<span class="c-c">// Types compose: `grid` now knows about `coverage`, `policy` and</span>
<span class="c-c">// `grid.export()`. A plugin that is not registered is not in the type.</span></code></pre>

<h4>The six hooks</h4>
</div>

@@HOOKS@@

<div class="prose">
<h4>Four rules that keep it maintainable</h4>
<ol class="claims">
<li><b>Slots are a closed set.</b> Twelve named regions — toolbar, header menu, column menu, row affix, row
detail, cell overlay, footer, empty state, error state, selection bar, coverage bar, live region. <b>Not
arbitrary render injection.</b> Arbitrary injection is how a plugin system becomes an unversionable API surface
where every internal DOM change is a breaking change for someone.</li>
<li><b>Plugins pull, never push.</b> A plugin contributes selectors and may veto actions. It may not write into
grid state directly. This is what makes the state reconstructable from the action log.</li>
<li><b>A veto carries a renderable reason.</b> When the disclosure plugin blocks a copy, the grid must be able to
tell the user why — so the veto is <code>{ blocked: true, reason: string }</code>, never a silent
<code>false</code>.</li>
<li><b>Every plugin has a <code>teardown()</code> and the memory gate asserts it.</b> A plugin that leaks fails
CI rather than a customer's workstation.</li>
</ol>

<div class="note">
<p><b>What is deliberately not a plugin.</b> Coverage, absence and the disclosure policy are in
<code>grid-healthcare</code> as a package a consumer imports — but they are not <em>optional behaviour</em> once
imported. A <code>hideCoverage</code> plugin would be the escape hatch ADR&nbsp;0011 already rejected: a
component that lets you switch off its safety claim does not have one.</p>
</div>
</div>
""", HOOKS=figs.fig_hooks())


def s_hcarch():
    return """
<div class="prose">
<p class="lede2">The healthcare layer is a package, not a theme. Four things live in it, and none of them may
leak downwards into the engine.</p>

<h4>1 · The vocabulary types</h4>
<pre class="code"><code><span class="c-c">// These three are the whole clinical type system. Everything else</span>
<span class="c-c">// in the healthcare layer is built from them.</span>

<span class="c-k">type</span> Absent =
  | { reason: <span class="c-s">"not-ordered"</span> }
  | { reason: <span class="c-s">"not-resulted"</span>; orderedAt: string }
  | { reason: <span class="c-s">"not-measured"</span> }
  | { reason: <span class="c-s">"not-applicable"</span>; because: string }
  | { reason: <span class="c-s">"declined"</span>; by: <span class="c-s">"patient"</span> | <span class="c-s">"clinician"</span> }
  | { reason: <span class="c-s">"specimen-problem"</span>; detail: string }
  | { reason: <span class="c-s">"withheld"</span>; policy: string; legal?: string }
  | { reason: <span class="c-s">"source-unreachable"</span>; source: string };   <span class="c-c">// ← the new eighth</span>

<span class="c-k">interface</span> Coverage {
  sources: [CoverageSource, ...CoverageSource[]];   <span class="c-c">// non-empty tuple</span>
  total: number | <span class="c-s">"unknown"</span>;                      <span class="c-c">// ← amended for FHIR</span>
  excluded?: { count: number; reason: string }[];
  asOf: string;
}

<span class="c-k">interface</span> DisclosurePolicy {
  column(key: string): <span class="c-s">"visible"</span> | <span class="c-s">"withheld"</span>;
  cell(row: unknown, key: string): <span class="c-s">"visible"</span> | { masked: MaskReason };
  row(row: unknown): <span class="c-s">"visible"</span> | { restricted: RestrictReason };
  mayExport(): boolean; mayPrint(): boolean; mayCopy(): boolean;
}</code></pre>

<h4>2 · The cell host contract</h4>
<p>Eight obligations now, not seven. The eighth is <b>mask state</b>, and adding it is what makes injection-safe,
mask-preserving export possible at all — a cell that returns only a flat value cannot tell the export writer that
the value must not leave.</p>

<h4>3 · The recipes</h4>
<p>Fourteen <code>GridView</code> documents plus column sets: roster, census, board, caseload, registry, work
queue, flowsheet, MAR, chart list, plan, schedule, ledger, cohort, stream. <b>Data, not code</b> — which is what
lets a product declare a caseload rather than build one, and lets a designer edit one.</p>

<h4>4 · The enforced defaults</h4>
<p>This is the part with no competitor equivalent and it is the actual product. In a clinical recipe:</p>
<ul>
<li>the identity column is <code>required: true</code> and cannot be hidden;</li>
<li>clipboard and paste plugins are <b>off by default</b>;</li>
<li>a derived column without <code>provenance</code> <b>does not compile</b>;</li>
<li>aggregation across incompatible units refuses rather than coercing;</li>
<li>live updates are position-stable and arrivals queue;</li>
<li>and <code>coverage</code> is required with no escape hatch.</li>
</ul>

<div class="note">
<p><b>Why these are defaults rather than documentation.</b> Every healthcare product makes these twelve decisions,
in a hurry, differently, and they are exactly the decisions with clinical consequence. Documentation gets read
once. A type error gets read every time.</p>
</div>
</div>
"""


def s_fhir():
    return fill("""
<div class="prose">
<p class="lede2">You asked me to investigate this carefully rather than force it into the architecture. Having
done so: <b>yes, and as a separate package — and the investigation changed the core design</b>, which is the best
possible argument for having done it before writing code.</p>

<h4>What FHIR actually constrains</h4>
<div class="tblwrap"><table class="dtbl">
<thead><tr><th style="width:26%">Constraint</th><th>Consequence for the grid</th></tr></thead>
<tbody>
<tr><td><b>Paging is opaque</b> — servers return <code>link.next</code> and the specification says a client must
not construct its own paging URLs</td><td>Cursor pagination is not a choice; it is the only available model. Offset becomes the special case for non-FHIR sources.</td></tr>
<tr><td><b><code>Bundle.total</code> is optional</b>, and servers omit it or estimate it</td><td><code>Coverage.total</code> becomes <code>number | "unknown"</code>. No page numbers, no jump-to-page, no &ldquo;8 of 1,284&rdquo;.</td></tr>
<tr><td><b>Azure Health Data Services returns only <code>next</code></b> — no <code>first</code>, <code>last</code> or <code>previous</code></td><td>Even &ldquo;previous&rdquo; must degrade. The pagination component needs a capability model, not a fixed set of buttons.</td></tr>
<tr><td><b><code>_count</code> is capped</b> — commonly 100, at most 1,000</td><td>Page size is negotiated, not chosen. The grid must accept a smaller page than it asked for and say so.</td></tr>
<tr><td><b><code>_sort</code> support is server-dependent</b> and some servers silently ignore an unsupported key</td><td>The grid must detect an ignored sort and say so, rather than showing an unsorted list under a sorted header.</td></tr>
<tr><td><b><code>_include</code> is applied after paging</b></td><td>A page of 20 patients may return 140 entries. Any adapter mapping <code>entry.length</code> to a row count is wrong.</td></tr>
</tbody></table></div>

<h4>What the package should provide</h4>
<pre class="code"><code><span class="c-k">import</span> { fhirSource, resource } <span class="c-k">from</span> <span class="c-s">"@oxygenui-design/grid-fhir"</span>;

&lt;DataGrid
  columns={resource.Patient.columns([<span class="c-s">"identity"</span>, <span class="c-s">"birthDate"</span>, <span class="c-s">"generalPractitioner"</span>])}
  dataSource={fhirSource(client, {
    resourceType: <span class="c-s">"Patient"</span>,
    search: { <span class="c-s">"_has:Encounter:patient:status"</span>: <span class="c-s">"in-progress"</span> },
    include: [<span class="c-s">"Patient:general-practitioner"</span>],
  })}
  <span class="c-c">// coverage is DERIVED from the Bundle, including what could not be mapped —</span>
  <span class="c-c">// the obligation ADR 0011 already places on adapters.</span>
/&gt;</code></pre>

<p>Nine resource types cover most of the surface: <code>Patient</code>, <code>Practitioner</code>,
<code>Encounter</code>, <code>Observation</code>, <code>Condition</code>, <code>MedicationRequest</code>,
<code>Appointment</code>, <code>CarePlan</code>, <code>QuestionnaireResponse</code>. Seven of the nine already
have types in <code>@oxygenui-design/fhir</code>.</p>

<h4>What it must not do</h4>
<ul>
<li><b>Not be in core, and not be in <code>grid-healthcare</code>.</b> A behavioural-health platform on a custom
Postgres schema must not pay for FHIR, and an HL7v2-fed customer must not be told FHIR is the only path.</li>
<li><b>Not translate a <code>FilterNode</code> into arbitrary FHIR search.</b> FHIR search cannot express nested
boolean logic; a filter tree that cannot be compiled must be <b>refused with a reason</b>, not approximated. This
is the same rule as the natural-language bar, and for the same reason: a silently narrowed cohort looks exactly
like a correct answer.</li>
<li><b>Not claim SMART on FHIR support.</b> SMART is an authorisation and launch context concern that belongs to
the application. The grid consumes a client; it does not obtain one.</li>
<li><b>Not ship terminology data.</b> §@@N:notbuild@@.</li>
</ul>

<div class="note">
<p><b>The finding worth carrying forward.</b> Investigating FHIR properly did not add a feature — it
<em>removed</em> a claim. That is what a real interoperability investigation looks like, and it is why this
section exists before the code rather than after the first customer.</p>
</div>
</div>
""")


def s_security():
    split = [
      ("PHI masking", "Renders the mask, its reason and its legal basis; masks survive copy, export and print.", "Must not send the value. A client-side mask over a value in the payload is theatre."),
      ("Field / column permissions", "Renders only what the resolved policy allows, and <b>states that a column was withheld</b> rather than dropping it silently.", "Owns the policy. Re-evaluates and pushes on change."),
      ("Row-level security", "Shows the row as restricted and discloses the <em>count</em>.", "Decides restriction — and decides whether the count itself is disclosable, because in a small programme a count can identify."),
      ("Break-glass", "Renders the prompt, requires a structured reason, shows the expiry, emits the event.", "<b>Grants or refuses.</b> The grid must never be the thing that grants access."),
      ("Audit events", "Emits <code>onDisclosure</code> for view, expand, inspect, export, print and copy.", "<b>Records them.</b> A client that logs its own access is a client that can choose not to."),
      ("Export / print / clipboard restrictions", "Asks, states the row and column count, refuses when policy says no.", "Authorises. Watermarks and records server-side if it needs to."),
      ("Session timeout", "Restores the view after re-auth; re-offers a pending write, never silently replays it.", "Owns the clock, the warning and the lock."),
      ("Screenshot risk", "Nothing. It cannot be prevented.", "Policy, training and device management. <b>Say so rather than implying otherwise.</b>"),
    ]
    trs = "".join('<tr><td class="nw"><b>%s</b></td><td>%s</td><td>%s</td></tr>' % s for s in split)
    return fill("""
<div class="prose">
<p class="lede2">The previous brief had a good <em>disclosure</em> model and no <em>software security</em> model
at all. Those are different things, and a healthcare buyer's security review will ask about the second.</p>

<h4>Three defects to fix before the first release</h4>

<ol class="claims">
<li><b>Export is a code-execution path.</b> Formula injection, covered in §@@N:discovered@@. The defence belongs
inside the writer with no way to switch it off, XLSX with typed cells is preferred for anything a human opens,
and there must be a test with the payload in a patient-name fixture asserting the emitted bytes.</li>
<li><b>Telemetry can carry PHI.</b> An exception thrown inside a cell renderer conventionally carries the value
that caused it, and error-tracking services store it. <b>Guarantee it by construction</b>: error objects and
telemetry carry <code>{ columnKey, rowIndex, code }</code> and never a value. A lint rule and a test that throws
inside a renderer and asserts the reported payload contains no fixture string.</li>
<li><b>Custom renderers can inject raw HTML.</b> Every competitor allows it. Our cell contract should make it a
<em>type error</em>: a renderer returns text, a token, or a component — never a markup string. A cell rendering a
note excerpt is rendering attacker-influenced content.</li>
</ol>

<h4>What we own and what the application must</h4>
</div>

<div class="tblwrap"><table class="dtbl">
<thead><tr><th style="width:19%">Concern</th><th style="width:40%">The grid</th><th>The application / server</th></tr></thead>
<tbody>@@TRS@@</tbody></table></div>

<div class="prose">
<h4>The boundary, stated the way it must appear in the README</h4>
<div class="a-alert error" style="font-size:.88rem">@@IC@@<span>
<b>This library does not make an application HIPAA, GDPR or DPDP compliant, is not clinical decision support, and
is not a medical device.</b> It renders a policy; it does not decide one and it cannot enforce one. It cannot
prevent a screenshot, a photograph of a screen, or a forwarded export. Access control, audit storage, data
residency and clinical validation remain the application's.
<b>It helps you build a compliant system. It is not one.</b></span></div>

<p style="margin-top:1rem">That paragraph should appear at the top of the security documentation and in the
README at the same prominence as the capability list — not in a footnote. §@@N:risks@@ marks being mistaken for a
compliance boundary as the one risk here that can damage the company rather than the product.</p>
</div>
""", TRS=trs, IC=ic("shield", "i ic"))


def s_perf():
    return fill("""
<div class="prose">
<p class="lede2">Two changes from the brief, and the first one is an admission.</p>

<div class="a-alert error" style="font-size:.88rem;margin-bottom:1rem">@@IC@@<span>
<b>The 1,000,000-row client-side budget was not achievable and should never have been written.</b> TanStack
Table v9 — the best-measured engine in this category — reports <b>380&nbsp;MB retained heap</b> for one million
rows by eight columns, and that is <em>after</em> an 86% improvement over v8's 2.71&nbsp;GB. A clinical grid has
forty columns and the target device is a shared ward workstation with 4&nbsp;GB running an EHR and two payer
portals. The correct answer is not a smaller number; it is a <b>refusal</b>.</span></div>

<p>The second change: <b>heap is a gate, not a note.</b> It is the column that decides whether client mode is
offered at all.</p>
</div>

@@BUD@@

<div class="prose">
<h4>Where the headroom actually comes from</h4>
<div class="tblwrap"><table class="dtbl">
<thead><tr><th style="width:24%">Technique</th><th class="nw">Gain</th><th>Note</th></tr></thead>
<tbody>
<tr><td><b>Signals in the core</b></td><td class="nw">+79% / −86% heap</td><td>Measured by TanStack across v8→v9. The single largest available win and it is an architectural choice, not an optimisation.</td></tr>
<tr><td><b>Node recycling</b></td><td class="nw">scroll</td><td>The actual scroll cost is nodes entering and leaving, not nodes existing. Glide abandoned DOM virtualisation over exactly this.</td></tr>
<tr><td><b>Column virtualisation</b></td><td class="nw">paint</td><td>Not optional: a flowsheet is 200 columns.</td></tr>
<tr><td><b>Coalesced updates</b></td><td class="nw">streaming</td><td>400 socket messages in two seconds must be one frame, not 400 renders.</td></tr>
<tr><td><b>Request cancellation</b></td><td class="nw">correctness</td><td>Without it, fast typing renders the second-to-last answer.</td></tr>
<tr><td><b>Columnar storage</b></td><td class="nw">allocation</td><td>Behind a flag, measured on the flowsheet fixture. Precondition for the next row.</td></tr>
<tr><td><b>Arrow + DuckDB-WASM</b></td><td class="nw">10–100×</td><td>The P2 bet. Querying Arrow with DuckDB-WASM is an order of magnitude or two faster than querying plain JS objects, and it handles multi-gigabyte data in the browser. <b>Nobody in this category ships it</b>, and it is the only credible client-side answer above 100,000 rows.</td></tr>
<tr><td><b>Web Workers</b></td><td class="nw">INP</td><td>For filter/sort on large client sets. Worth measuring, not worth assuming — structured-clone cost can exceed the saving on small sets.</td></tr>
</tbody></table></div>

<h4>What SSR means here, since the brief did not say</h4>
<p>A virtualised grid renders fifteen of a hundred thousand rows, so server and client markup differ and
hydration fails. The common answer is <code>ssr: false</code>. That is not an architecture.</p>
<p><b>The answer is a documented two-phase boundary:</b> the server renders a real, non-virtualised first page —
correct markup, correct ARIA, indexable, and useful with JavaScript disabled — and the client mounts the
virtualiser over it, taking ownership at a known handoff point. It is more work than a shrug and it is the
difference between a grid a Next.js team can use and one they wrap in a dynamic import and stop trusting.</p>
</div>
""", BUD=figs.fig_budgets(), IC=ic("alert", "i ic"))


def s_a11y():
    return """
<div class="prose">
<p class="lede2">The brief's accessibility work was its strongest section and it survives intact. Three additions,
all of which follow from the architecture change rather than from a gap in the analysis.</p>

<ol class="claims">
<li><b>It lives in <code>grid-dom</code>, once.</b> This is the strongest argument for the whole framework-agnostic
strategy: the keyboard model, the ARIA contract and focus-under-virtualisation are written a single time and are
identical in React, Angular, Vue and vanilla. Every multi-framework component library that puts accessibility in
the adapters ends up with four subtly different implementations, and the fourth one is always the worst.</li>
<li><b>Cross-adapter parity is a test, not a promise.</b> One assertion over the rendered accessibility tree,
run against every adapter, from the day the second adapter exists. OxygenUI already does exactly this in
<code>e2e/bridge-hosts.spec.ts</code>, which renders one application under antd, MUI and neither and asserts the
trees are identical.</li>
<li><b>A remappable keymap.</b> The keymap is data in <code>grid-core</code>, so it can be replaced. A clinician
with nine years of muscle memory in one EHR has something worth more than our defaults, and <b>no competitor
does this well</b>. It is a genuine differentiator for the one user who spends a whole shift in the grid.</li>
</ol>

<h4>The parts that carry over unchanged</h4>
<ul>
<li><b>The body is one tab stop</b> with a roving <code>tabindex</code> inside it. A tab stop per cell is 800
presses to leave a 40×20 grid.</li>
<li><b>Absolute <code>aria-rowindex</code></b> under virtualisation — the defect that makes so many grids announce
&ldquo;row 1 of 20&rdquo; forever. With the FHIR finding, <code>aria-rowcount="-1"</code> also becomes a real
case rather than a theoretical one: it is the correct value when the server genuinely does not report a total.</li>
<li><b>Every operation reachable by keyboard</b>, asserted by tests that never dispatch a pointer event — the
construction that makes the Signature component's Level A claim a test rather than a sentence. WCAG 2.2 SC 2.5.7
makes drag-only column reorder a failure, and no competitor has a complete keyboard path for resize, reorder,
hide and pin.</li>
<li><b>Focus not obscured (SC 2.4.11)</b> — the grid-specific trap, where a sticky header covers the focused cell
when you arrow upward.</li>
<li><b>Forced colors, reduced motion, 200% zoom, 320&nbsp;px reflow, RTL via logical properties</b> — all already
gated in OxygenUI CI across three engines.</li>
<li><b>The screen-reader matrix is the release gate</b>, published <em>with its gaps</em>. NVDA, JAWS and
VoiceOver × Chromium, Firefox and WebKit, against the 40,000-row virtualised fixture. It cannot be automated and
should be planned as work rather than discovered as a blocker.</li>
</ul>

<div class="note">
<p><b>One thing to add that the brief did not mention:</b> voice control. Dragon and Voice Control drive by
accessible name, so every interactive element in the grid needs a name a person would actually say — &ldquo;sort
by risk&rdquo;, not &ldquo;button&rdquo;. It costs nothing if the names are right from the start and is a
retrofit if they are not. Clinical settings have a higher-than-average density of voice-control users.</p>
</div>
</div>
"""


def s_api():
    return """
<div class="prose">
<p class="lede2">Two APIs, one engine. A junior developer should never meet the imperative one; an enterprise
integrator should never be blocked by its absence.</p>

<h4>The declarative surface</h4>
<pre class="code"><code><span class="c-c">// Four lines. This must stay four lines.</span>
&lt;DataGrid data={patients} columns={columns} rowKey=<span class="c-s">"id"</span> coverage={coverage.local()} /&gt;</code></pre>

<h4>Columns: objects with inference, never JSX</h4>
<pre class="code"><code><span class="c-k">const</span> columns = defineColumns&lt;Patient&gt;([
  { key: <span class="c-s">"name"</span>,  value: (p) =&gt; p.name },              <span class="c-c">// value: string  → text ops</span>
  { key: <span class="c-s">"age"</span>,   value: (p) =&gt; p.age },               <span class="c-c">// value: number  → numeric ops</span>
  { key: <span class="c-s">"k"</span>,     cell: { type: <span class="c-s">"result"</span>, observation: (p) =&gt; p.potassium } },
  { key: <span class="c-s">"risk"</span>,  cell: { type: <span class="c-s">"risk"</span>, value: (p) =&gt; p.risk },
    derived: <span class="c-k">true</span>, provenance: riskNet },              <span class="c-c">// omit → compile error</span>
]);

<span class="c-c">// The inference that matters, and the reason to match TanStack here:</span>
<span class="c-c">//   filter("age",  { gt: 40 })      ✔</span>
<span class="c-c">//   filter("age",  { contains: "x" }) ✘  operator not valid for number</span>
<span class="c-c">//   filter("nope", …)                ✘  no such column</span>
<span class="c-c">//   sort("k")                        ✘  quantity: needs a unit to compare</span></code></pre>

<h4>The imperative surface</h4>
<pre class="code"><code><span class="c-k">const</span> api = useGridApi(ref);
api.dispatch({ type: <span class="c-s">"filter/set"</span>, node });   <span class="c-c">// every mutation is an action</span>
api.view.apply(savedView);                    <span class="c-c">// …and a few typed conveniences</span>
api.selection.resolve();                      <span class="c-c">// re-resolve predicate → ids</span>
api.export.csv();                             <span class="c-c">// only if the plugin is registered</span></code></pre>

<p>Deliberately <b>not</b> AG Grid's hundreds-of-methods <code>GridApi</code>. There is one general mutation path
— <code>dispatch</code> — and a small set of typed conveniences over it. That keeps the imperative surface
versionable, keeps it replayable, and keeps the devtools panel honest.</p>

<h4>The data-source interface</h4>
<pre class="code"><code><span class="c-k">interface</span> GridDataSource&lt;T&gt; {
  getRows(q: GridQuery, signal: AbortSignal): Promise&lt;GridPage&lt;T&gt;&gt;;
  updateRow?(p: UpdateParams&lt;T&gt;): Promise&lt;T&gt;;
  cache?: GridCache | <span class="c-k">null</span>;        <span class="c-c">// MUI's shape: set/get/clear + TTL</span>
  capabilities?: {                     <span class="c-c">// ← what FHIR forced us to add</span>
    total: <span class="c-s">"exact"</span> | <span class="c-s">"estimate"</span> | <span class="c-s">"none"</span>;
    paging: <span class="c-s">"offset"</span> | <span class="c-s">"cursor"</span> | <span class="c-s">"forward-only"</span>;
    sortableKeys?: string[];           <span class="c-c">// a server may refuse a key</span>
    maxPageSize?: number;              <span class="c-c">// _count is capped</span>
  };
}</code></pre>

<p><code>capabilities</code> is the most important addition in this section. It is what lets the pagination
control render the right buttons, lets coverage tell the truth about totals, and lets the grid detect that a
sort it asked for was ignored. <b>Without it the grid has to guess, and guessing is how a sorted header ends up
over an unsorted list.</b></p>

<h4>Events</h4>
<pre class="code"><code>onAction        <span class="c-c">// every state transition — the audit and devtools feed</span>
onQueryChange   <span class="c-c">// the serialised query: cache key, URL, export header</span>
onDisclosure    <span class="c-c">// view · expand · inspect · export · print · copy</span>
onRowActivate · onCellEdit · onSelectionChange · onViewChange · onError</code></pre>

<div class="note">
<p><b>The DX principle behind all of it.</b> Strong inference should make the <em>wrong</em> code fail to compile,
not make the right code shorter. Every one of the four failing examples above is a real bug a healthcare team
would otherwise ship — and TanStack's inference quality is why developers who could use anything choose it.</p>
</div>
</div>
"""


def s_testing():
    layers = [
      ("Engine unit", "no renderer", "Sort stability, filter evaluation, selection algebra, cursor arithmetic, group and tree assembly, aggregation refusal.", "Milliseconds, and where the 40,000-row cases live."),
      ("Property", "no renderer", "Live updates never move the row under the pointer. Sorting is stable and reversible. A re-resolved selection yields the same set. Cursor paging never duplicates or drops a row across a mutation.", "<b>The highest-value suite.</b> These are the bugs that only appear at scale."),
      ("Renderer", "jsdom + real browser", "Recycling correctness, anchor stability on re-measure, focus identity across recycling, absolute row indices.", "Recycling bugs are invisible until a row shows another row's data — the worst possible failure here."),
      ("Cross-adapter parity", "all adapters", "<b>One</b> accessibility-tree assertion, run against React, Angular, Vue and the custom element.", "The single test that makes the framework-agnostic claim enforceable."),
      ("Keyboard", "real browser", "Every operation driven by <code>tab()</code> and <code>keyboard()</code> only, never dispatching a pointer event.", "A grid operation with no keyboard path fails here rather than in an audit."),
      ("Accessibility", "axe + manual", "axe per story × 3 themes × 4 densities, plus the NVDA/JAWS/VoiceOver × 3-engine matrix.", "axe cannot tell you a row index is announced wrong."),
      ("Visual regression", "3 engines", "3 themes × 4 densities × 14 recipes × the state set, including forced-colors and the reduced-motion still state.", ""),
      ("Performance", "CPU-throttled", "First paint, sort, filter keystroke, frame time and heap at 1k/10k/100k, ratcheted.", "A budget measured on an M-series laptop has not been measured."),
      ("Memory", "heap snapshots", "Mount and unmount 200 times; assert heap growth below a threshold; assert every plugin's <code>teardown</code> releases.", "<b>Nobody in this category gates on this.</b> A ward workstation keeps one session for a fortnight."),
      ("Security", "unit + e2e", "Formula-injection payload in a patient-name fixture asserting emitted bytes. A throwing renderer asserting the telemetry payload contains no fixture string. A masked cell asserting the clipboard.", "<b>Three tests that would have caught three defects.</b>"),
      ("Network", "mocked transport", "Slow, failing, partial, out-of-order and cancelled responses; a source timing out mid-scroll; a server ignoring a sort key; a server reporting no total.", "Partial failure is a normal case here, not an error case."),
      ("Concurrency", "mocked socket", "400 updates in 2s. Out-of-order corrections. A row leaving the predicate between selection and confirmation. Two clients editing one row.", ""),
      ("SSR / hydration", "per framework", "Server-rendered first page, client handoff, no hydration mismatch.", "Once per adapter, because each framework hydrates differently."),
    ]
    trs = "".join(
      '<tr><td class="nw"><b>%s</b></td><td class="nw t3 xs">%s</td><td>%s</td><td class="t3">%s</td></tr>' % l
      for l in layers)
    return fill("""
<div class="prose">
<p class="lede2">Thirteen layers. Four of them did not exist in the brief, and three of those four exist because
of defects this review found.</p>
</div>

<div class="tblwrap"><table class="dtbl">
<thead><tr><th style="width:15%">Layer</th><th class="nw">Where</th><th style="width:42%">What</th><th>Why it earns its place</th></tr></thead>
<tbody>@@TRS@@</tbody></table></div>

<div class="prose">
<h4>The most dangerous tests to be missing</h4>
<ol class="claims">
<li><b>Recycling puts one row's data on another row.</b> The worst possible failure in a clinical grid, invisible
to every other test, and it is a direct consequence of the performance choice in §@@N:render@@.</li>
<li><b>A masked cell exports masked.</b></li>
<li><b>The export writer neutralises a formula payload</b>, asserted on the bytes.</li>
<li><b>A throwing renderer reports no PHI.</b></li>
<li><b>A live update does not move the row under the pointer.</b></li>
<li><b>Absolute <code>aria-rowindex</code> at row 19,998 of 40,000</b>, and <code>aria-rowcount="-1"</code> when
the source reports no total.</li>
<li><b>Two adapters produce identical accessibility trees.</b></li>
<li><b>Heap does not grow across 200 mount/unmount cycles.</b></li>
</ol>
<div class="note">
<p><b>And a lesson already paid for.</b> The Timeline review in OxygenUI found six real defects with every CI gate
green, and three shared one shape: <em>a test that asserts a class name passes while the class does nothing.</em>
A grid has more of those hooks than anything else in the catalogue. <b>Assert the behaviour, not the hook</b> —
and look at the rendered page.</p>
</div>
</div>
""", TRS=trs)


def s_docs():
    return fill("""
<div class="prose">
<p class="lede2">Documentation is the reason a developer picks TanStack over a better-featured grid, and it is the
cheapest competitive advantage available to us. Four principles, then the tree.</p>

<ol class="claims">
<li><b>Generated, never hand-written.</b> Prop tables come from the TypeScript types; performance numbers come
from the last green benchmark run; the feature matrix comes from the same data that drives the tests. A
performance claim in hand-written prose has a half-life of about six weeks.</li>
<li><b>Concepts before API.</b> The API reference is what people search; <em>concepts</em> is what makes them
correct. &ldquo;What a row is&rdquo;, &ldquo;coverage&rdquo;, &ldquo;absence&rdquo;, &ldquo;row models&rdquo; and
&ldquo;views and precedence&rdquo; are the five pages that decide whether someone uses this well.</li>
<li><b>One page per framework, not one tree per framework.</b> AG Grid maintains four parallel documentation
trees. Everything conceptual here is framework-free; only installation, mounting and cell rendering differ, and
those are four short pages.</li>
<li><b>Publish the gaps.</b> The screen-reader matrix with its failures, the FHIR constraints we cannot work
around, the row counts we refuse. It is the single strongest trust signal available, and MUI's published
limitation about <code>dataSourceKeepPreviousData</code> is a good model.</li>
</ol>
</div>

@@TREE@@

<div class="prose"><div class="note">
<p><b>Three additions to your proposed tree.</b> <code>ssr/</code>, because the hydration boundary needs a page
rather than a footnote. <code>security/boundaries</code> as the <em>first</em> page in that section, because a
reader arriving at the security docs must meet the limits before the capabilities. And
<code>concepts/what-a-row-is</code>, because it is the idea the whole product rests on and it is not obvious.</p>
</div></div>
""", TREE=figs2.fig_docstree())
