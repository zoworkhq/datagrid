# -*- coding: utf-8 -*-
"""Figures: README, playground, FHIR, security, trees."""
from mocklib import ic


# --------------------------------------------------------------- README
def fig_readme():
    badge = lambda k, v, c: '<span class="badge2"><span class="k">%s</span><span class="v %s">%s</span></span>' % (k, c, v)
    tabs = [("react", "React"), ("angular", "Angular"), ("vue", "Vue"), ("vanilla", "Vanilla")]
    code = {
      "react": """import { DataGrid } from "@oxygenui-design/grid-react";
import { coverage } from "@oxygenui-design/grid-healthcare";

<DataGrid
  data={patients}
  columns={columns}
  rowKey="id"
  coverage={coverage.local()}
/>""",
      "angular": """import { OxDataGrid } from "@oxygenui-design/grid-angular";

&lt;ox-data-grid
  [data]="patients"
  [columns]="columns"
  rowKey="id"
  [coverage]="coverage.local()" /&gt;""",
      "vue": """&lt;script setup&gt;
import { DataGrid } from "@oxygenui-design/grid-vue";
&lt;/script&gt;

&lt;DataGrid :data="patients" :columns="columns"
          row-key="id" :coverage="coverage.local()" /&gt;""",
      "vanilla": """import { createGrid } from "@oxygenui-design/grid-dom";

const grid = createGrid(document.querySelector("#grid"), {
  data: patients,
  columns,
  rowKey: "id",
  coverage: coverage.local(),
});""",
    }
    panes = "".join(
      '<pre data-ghpane="%s">%s</pre>' % (k, code[k]) for k, _ in tabs)
    tabbar = "".join(
      '<span class="gh-tab%s" data-ghtab="%s" role="tab" tabindex="0" aria-selected="%s">%s</span>' % (
        " on" if k == "react" else "", k, "true" if k == "react" else "false", n) for k, n in tabs)

    return (
      '<div class="gh" data-ghscope>'
      '<div class="gh-bar">%s<span class="path">zoworkhq / <b>datagrid</b></span>'
      '<span style="flex:1 1 auto"></span><span>README.md</span></div>'
      '<div class="gh-body">'

      '<div class="gh-hero">'
      '<div style="font-family:var(--font-mono);font-size:.66rem;letter-spacing:.14em;'
      'text-transform:uppercase;color:var(--accent)">Oxygen UI</div>'
      '<h1>Data Grid</h1>'
      '<div class="tag">The data grid that knows a row is a person.</div>'
      '<p class="subtag">A framework-agnostic, virtualised enterprise data grid with a healthcare layer built in. '
      'It declares what the query did not reach, refuses to render an absence as a normal value, and puts a model&rsquo;s '
      'provenance where the sort happens.</p>'
      '<div class="gh-badges">%s</div>'
      '<div style="margin-top:1rem;border:1px dashed var(--rule-2);border-radius:8px;padding:2.4rem 1rem;'
      'color:var(--muted);font-size:.8rem;background:var(--surface-2)">'
      '%s<div style="margin-top:.4rem">Animated capture: 100,000-row caseload · keyboard-only · light and dark</div></div>'
      "</div>"

      '<h2>Why this exists</h2>'
      '<p>Most grids render a value. They have no opinion about a result that came back preliminary, a reference range '
      'that does not exist, a record flagged restricted, or a filter someone set six days ago. In healthcare those are '
      'the normal working set — and each one fails the same way: <b>it renders perfectly and says something false</b>.</p>'
      '<div class="gh-note">Three things no other grid does: it takes a required <code>coverage</code> declaration and '
      'renders it; every empty cell carries a typed reason; and a sort by a model-derived column names the model, its '
      'version and its validation in the header.</div>'
      '<div class="gh-note warn2"><b>What this is not.</b> Installing this does not make an application HIPAA, GDPR or '
      'DPDP compliant. It is not clinical decision support and it is not a medical device. Access control, audit and '
      'clinical validation remain yours. See <code>docs/security/boundaries</code>.</div>'

      '<h2>60-second quick start</h2>'
      '<pre>npm i @oxygenui-design/grid-react</pre>'
      '<div class="gh-tabs" role="tablist">%s</div>%s'
      '<p style="font-size:.8rem;color:var(--muted)">One engine, four bindings. The adapter is ~4&nbsp;KB and contains '
      'no grid logic — the keyboard model, the ARIA contract and the virtualiser are identical in all four.</p>'

      '<h2>At a glance</h2>'
      '<div class="tblwrap"><table class="dtbl tight" style="margin:0">'
      '<tbody>'
      '<tr><td class="nw"><b>Scale</b></td><td>100,000 rows client-side, unbounded server-side. Row and column '
      'virtualisation with node recycling. Budgets asserted CPU-throttled in CI.</td></tr>'
      '<tr><td class="nw"><b>Accessibility</b></td><td>WCAG 2.2 AA, <code>role="grid"</code>, absolute '
      '<code>aria-rowindex</code> under virtualisation, 24 keyboard bindings, every operation reachable without a pointer. '
      'Screen-reader matrix published <em>with its gaps</em>.</td></tr>'
      '<tr><td class="nw"><b>Healthcare</b></td><td>Coverage, typed absence, identity safety, disclosure policy, '
      'sort provenance, position-stable live updates, fourteen recipes, FHIR adapters.</td></tr>'
      '<tr><td class="nw"><b>Security</b></td><td>Injection-safe export, PHI-free telemetry by construction, '
      'a renderer contract that makes raw HTML a type error.</td></tr>'
      '<tr><td class="nw"><b>Size</b></td><td>22&nbsp;KB core + 18&nbsp;KB renderer + 4&nbsp;KB adapter, ESM, '
      'tree-shaken per feature. Budgets are public and gated.</td></tr>'
      "</tbody></table></div>"

      '<h2>Playground</h2>'
      '<p>Every capability has a live example. Change the data, the columns, the density, the theme and the row count '
      'to a million, then copy the generated code. <a href="#">datagrid.oxygenui.design/play</a></p>'

      '<h2>Documentation</h2>'
      '<p>Getting started · Concepts · Columns · Rows · Filtering · Sorting · Grouping · Editing · Selection · '
      'Virtualisation · Server-side · Accessibility · Healthcare · FHIR · Security · Performance · Theming · Plugins · '
      'API · Recipes · Migration.</p>'

      '<h2>Migrating</h2>'
      '<pre>npx @oxygenui-design/grid-codemod from-antd    # or: from-mui, from-aggrid</pre>'

      '<h2>Support, versioning and licence</h2>'
      '<p>Semantic versioning with a published deprecation policy. Issues triaged weekly; support is not guaranteed and '
      'is not a contract. Core, renderer, adapters and the healthcare layer are MIT. The enterprise recipe pack is '
      'separately licensed and every file says so.</p>'

      "</div></div>"
    ) % (ic("grid", "i i-14"),
         badge("build", "passing", "g") + badge("coverage", "92%", "g") + badge("a11y", "WCAG 2.2 AA", "t") +
         badge("core", "22 kB", "b") + badge("types", "strict", "b") + badge("FHIR", "R4", "p") +
         badge("licence", "MIT", "g") + badge("frameworks", "4", "o"),
         ic("activity", "i i-20"), tabbar, panes)


# --------------------------------------------------------------- playground
def fig_playground():
    left = (
      '<div style="border-inline-end:1px solid var(--line);padding:10px;display:grid;gap:11px;'
      'align-content:start;background:var(--sunken);min-width:0">'
      '<div><span class="lbl">Dataset</span>'
      '<div class="row" style="gap:4px;flex-wrap:wrap;margin-top:5px">%s</div></div>'
      '<div><span class="lbl">Recipe</span>'
      '<div class="row" style="gap:4px;flex-wrap:wrap;margin-top:5px">%s</div></div>'
      '<div><span class="lbl">Density</span>'
      '<div class="row" style="gap:4px;flex-wrap:wrap;margin-top:5px">%s</div></div>'
      '<div><span class="lbl">Features</span>'
      '<div class="col" style="gap:4px;margin-top:5px">%s</div></div>'
      '<div><span class="lbl">Policy</span>'
      '<div class="row" style="gap:4px;flex-wrap:wrap;margin-top:5px">%s</div></div>'
      "</div>"
    ) % (
      "".join('<span class="qfp%s">%s</span>' % (" on" if t == "10k" else "", t)
              for t in ["100", "1k", "10k", "100k", "1M"]),
      "".join('<span class="qfp%s">%s</span>' % (" on" if t == "caseload" else "", t)
              for t in ["roster", "caseload", "queue", "flowsheet", "MAR", "ledger"]),
      "".join('<span class="qfp%s">%s</span>' % (" on" if t == "compact" else "", t)
              for t in ["comfortable", "standard", "compact", "ultra"]),
      "".join('<label class="row" style="gap:6px;font-size:12px;color:var(--ink-2)">'
              '<span class="cbx%s">%s</span>%s</label>' % (
                " on" if on else "", ic("check", "i i-14"), n)
              for n, on in [("Virtualisation", True), ("Grouping", False), ("Tree data", False),
                            ("Inline editing", False), ("Selection", True), ("Inspector", True),
                            ("AI filter bar", False)]),
      "".join('<span class="qfp%s">%s</span>' % (" on" if t == "clinician" else "", t)
              for t in ["clinician", "front desk", "billing", "no relationship"]),
    )
    right = (
      '<div style="display:grid;grid-template-rows:auto 1fr auto;min-width:0">'
      '<div class="dg-bar"><span class="lbl">Preview</span>'
      '<span class="row" style="gap:4px">%s</span>'
      '<span style="flex:1 1 auto"></span>'
      '<span class="t3 sm mono">first paint 142 ms · scroll 60 fps · heap 41 MB</span>'
      '<span class="row" style="gap:5px">%s%s</span></div>'
      '<div style="padding:12px;background:var(--sunken);min-height:150px;display:grid;place-items:center;'
      'color:var(--ink-3);font-size:12px">%s<span style="margin-inline-start:8px">the grid, live, at 10,000 rows</span></div>'
      '<div style="border-top:1px solid var(--line)">'
      '<div class="dg-bar sub"><span class="lbl">Generated code</span>'
      '<span class="row" style="gap:3px;margin-inline-start:8px">%s</span>'
      '<span style="flex:1 1 auto"></span>%s</div>'
      '<pre class="code" style="margin:0;border-radius:0;border:0;font-size:11.5px;max-height:132px">'
      '<code><span class="c-k">const</span> columns = defineColumns&lt;Patient&gt;([\n'
      '  { key: <span class="c-s">"patient"</span>, cell: { type: <span class="c-s">"identity"</span> }, pinned: <span class="c-s">"start"</span>, required: <span class="c-k">true</span> },\n'
      '  { key: <span class="c-s">"phq9"</span>,    cell: { type: <span class="c-s">"measure"</span>, instrument: <span class="c-s">"phq-9"</span> } },\n'
      '  { key: <span class="c-s">"change"</span>,  derived: <span class="c-k">true</span>, provenance: reliableChange },\n'
      ']);</code></pre></div></div>'
    ) % (
      "".join('<span class="qfp%s">%s</span>' % (" on" if t == "light" else "", t) for t in ["light", "dark", "forced colours"]),
      '<button class="a-btn sm" type="button">%s Keyboard mode</button>' % ic("hash", "i i-14"),
      '<button class="a-btn sm" type="button">%s Profile</button>' % ic("activity", "i i-14"),
      ic("grid", "i i-20"),
      "".join('<span class="qfp%s" style="height:20px;font-size:11px">%s</span>' % (" on" if t == "React" else "", t)
              for t in ["React", "Angular", "Vue", "Vanilla"]),
      '<button class="a-btn sm">%s Copy</button>' % ic("check", "i i-14"),
    )
    return ('<div class="dg standard" style="overflow:hidden">'
            '<div style="display:grid;grid-template-columns:236px minmax(0,1fr)">%s%s</div></div>'
            '<div class="hint2" style="margin-top:10px">%s<span>Four controls do the work: <b>row count</b> proves the '
            'performance claim, <b>recipe</b> proves the configuration claim, <b>framework</b> proves the agnosticism '
            'claim, and <b>policy</b> proves the disclosure claim. A playground that cannot be switched to a million '
            'rows and a different framework is a screenshot.</span></div>') % (
      left, right, ic("info", "i i-14"))


# --------------------------------------------------------------- FHIR pagination
def fig_fhir():
    bad = (
      '<div class="dg standard">'
      '<div class="dg-bar"><span class="lbl">What the brief assumed</span>'
      '<span style="flex:1 1 auto"></span><span class="a-tag red">not available against FHIR</span></div>'
      '<div style="padding:12px 12px 0;overflow-x:auto"><table class="dgt"><thead><tr>'
      '<th><div class="thin"><span class="lbl-t">Patient</span></div></th>'
      '<th><div class="thin"><span class="lbl-t">Programme</span></div></th></tr></thead>'
      '<tbody><tr><td>Aisha Bello</td><td>Behavioural Health</td></tr>'
      '<tr><td>Daniel Okonkwo</td><td>Behavioural Health</td></tr></tbody></table></div>'
      '<div class="dg-foot"><span><b>8</b> of <b>1,284</b> rows · page <b>1 of 161</b></span>'
      '<span class="row" style="gap:4px"><button class="a-btn sm">Previous</button>'
      '<button class="a-btn sm">1</button><button class="a-btn sm">2</button>'
      '<button class="a-btn sm">…</button><button class="a-btn sm">161</button>'
      '<button class="a-btn sm">Next</button></span></div>'
      '<div class="covbar alert">%s<div><b>Every bold number here is unavailable.</b> '
      '<code>Bundle.total</code> is optional and several major servers omit it or estimate it; page numbers require an '
      'offset the specification tells you not to construct; and Azure&rsquo;s FHIR service returns only a '
      '<code>next</code> link — no <code>first</code>, <code>last</code> or <code>previous</code>.</div></div>'
      "</div>") % ic("alert", "i i-14 ic")
    good = (
      '<div class="dg standard">'
      '<div class="dg-bar"><span class="lbl">What it must degrade to</span>'
      '<span style="flex:1 1 auto"></span><span class="a-tag green">honest</span></div>'
      '<div style="padding:12px 12px 0;overflow-x:auto"><table class="dgt"><thead><tr>'
      '<th><div class="thin"><span class="lbl-t">Patient</span></div></th>'
      '<th><div class="thin"><span class="lbl-t">Programme</span></div></th></tr></thead>'
      '<tbody><tr><td>Aisha Bello</td><td>Behavioural Health</td></tr>'
      '<tr><td>Daniel Okonkwo</td><td>Behavioural Health</td></tr></tbody></table></div>'
      '<div class="dg-foot"><span>Rows <b>1–8</b> · <span class="t3">more available</span></span>'
      '<span class="row" style="gap:4px">'
      '<button class="a-btn sm" disabled aria-disabled="true">Previous</button>'
      '<button class="a-btn sm">Next</button></span></div>'
      '<div class="covbar">%s<div>Showing <b>the first 8 rows this query reached</b> from Riverside FHIR R4, '
      'newest first. <b>The server does not report a total</b>, so no count is claimed. Paging follows the '
      'server&rsquo;s own <code>link.next</code>; there is no page number because there is no offset to name one with. '
      '<b>2 of 10 bundle entries were <code>_include</code>d Practitioner resources</b> and are not rows.</div></div>'
      "</div>") % ic("info", "i i-14 ic")
    return ('<div class="g2" style="gap:14px;align-items:start"><div>%s</div><div>%s</div></div>'
            '<div class="a-alert warning" style="margin-top:12px;font-size:12.5px">%s<span>'
            '<b>This invalidates a flagship claim of the previous brief.</b> &ldquo;Showing 8 of 1,284&rdquo; was the '
            'sentence the whole coverage argument was built on, and against a large share of real FHIR servers it '
            'cannot be said. The fix is not cosmetic: <code>Coverage.total</code> becomes '
            '<code>number | "unknown"</code>, pagination loses page numbers whenever the source cannot supply an '
            'offset, and the grid must never invent a count it did not receive.</span></div>') % (
      bad, good, ic("alert", "i ic"))


# --------------------------------------------------------------- CSV injection
def fig_csv():
    return (
      '<div class="g2" style="gap:14px;align-items:start">'
      '<div class="dec"><div class="dec-h"><b>What a naive writer emits</b>'
      '<span class="dec-v reject">remote code execution</span></div>'
      '<div class="dec-b">'
      '<p style="margin:0 0 .5rem;font-size:.83rem">A patient sets their preferred name. It is free text, it is '
      'patient-supplied, and it lands in a worklist column.</p>'
      '<pre class="code" style="margin:.4rem 0;font-size:11.5px"><code>name,mrn,programme\n'
      '<span class="c-s">=cmd|\' /C powershell -c "iwr $env:X"\'!A0</span>,AR-40182,BH\n'
      'Daniel Okonkwo,AR-40915,BH</code></pre>'
      '<p style="margin:.5rem 0 0;font-size:.83rem">Excel, Google Sheets and LibreOffice all evaluate it on open. '
      'The exporter is a biller on a workstation inside the network.</p>'
      '<p style="margin:.5rem 0 0;font-size:.83rem;color:var(--muted)">OWASP adds two details that defeat the obvious '
      'fixes: <b>quoting is not enough</b> — Excel can strip escaping when the file is saved and reopened, re-arming the '
      'payload — and <b>full-width variants</b> (<code>＝</code>, <code>＋</code>) execute in some locales.</p>'
      "</div></div>"
      '<div class="dec"><div class="dec-h"><b>What the writer must do</b>'
      '<span class="dec-v adopt">non-optional</span></div>'
      '<div class="dec-b">'
      '<pre class="code" style="margin:.4rem 0;font-size:11.5px"><code><span class="c-c">// Not a setting. Not a plugin option.</span>\n'
      '<span class="c-c">// Part of the writer, with no way to turn it off.</span>\n'
      '<span class="c-k">const</span> RISKY = /^[\\t\\r=+\\-@\\uFF1D\\uFF0B\\uFF0D\\uFF20]/;\n'
      '<span class="c-k">function</span> cell(v: string) {\n'
      '  <span class="c-k">const</span> s = String(v).replace(/[\\r\\n]/g, <span class="c-s">" "</span>);\n'
      '  <span class="c-k">return</span> RISKY.test(s) ? <span class="c-s">"\'"</span> + s : s;  <span class="c-c">// leading apostrophe</span>\n'
      '}</code></pre>'
      '<ul style="margin:.5rem 0 0;padding-inline-start:1.1rem;font-size:.83rem;color:var(--ink-2)">'
      '<li>Prefer <b>XLSX with typed cells</b> for anything a human opens — a text-typed cell cannot become a formula, '
      'which is a structural fix rather than an escaping one.</li>'
      '<li>Apply the same rule <b>after</b> the delimiter, not only at field start.</li>'
      '<li>A <b>test with the payload in a patient name fixture</b>, asserting the emitted bytes.</li>'
      '<li>The same rule for the clipboard, which is the other path out of the audited surface.</li>'
      "</ul></div></div></div>"
    )


# --------------------------------------------------------------- repo tree
def fig_repotree():
    return """<pre class="tree"><b>zoworkhq/datagrid</b>
├─ <b>packages/</b>
│  ├─ <em>grid-core</em>          <i>L1 · engine. no DOM, no framework, no clinical vocabulary</i>
│  ├─ <em>grid-signals</em>       <i>L1 · reactivity façade. the only file TC39 Signals will change</i>
│  ├─ <em>grid-dom</em>           <i>L2 · framework-free renderer. owns ARIA, focus, recycling, anchoring</i>
│  ├─ <em>grid-healthcare</em>    <i>L2 · coverage, absence, identity, disclosure, recipes</i>
│  ├─ <em>grid-fhir</em>          <i>L2 · resource adapters, Bundle data source</i>
│  ├─ <em>grid-react</em>         <i>L3 · adapter (wave 1)</i>
│  ├─ <em>grid-angular</em>       <i>L3 · adapter (wave 4 — this is what tests the claim)</i>
│  ├─ <em>grid-vue</em>           <i>L3 · adapter (wave 6, on demand)</i>
│  ├─ <em>grid-element</em>       <i>L3 · &lt;ox-data-grid&gt;, light DOM</i>
│  ├─ <em>grid-export</em>        <i>L4 · CSV/XLSX/print. injection defence is not optional</i>
│  ├─ <em>grid-filters</em>       <i>L4 · visual builder</i>
│  ├─ <em>grid-analytics</em>     <i>L4 · Arrow + DuckDB-WASM (P2 bet)</i>
│  ├─ <em>grid-ai</em>            <i>L4 · NL filter, proposals, anomaly lens</i>
│  ├─ <em>grid-testing</em>       <i>assertions over the accessibility tree; fixture generator</i>
│  ├─ <em>grid-devtools</em>      <i>action log, resolved view, active query, frame timings</i>
│  └─ <em>grid-codemod</em>       <i>from-antd · from-mui · from-aggrid</i>
├─ <b>apps/</b>
│  ├─ docs              <i>the documentation site — built on the grid itself</i>
│  ├─ play              <i>the playground</i>
│  └─ smoke/            <i>react18 · react19 · angular · vue · vanilla — one app per adapter</i>
├─ <b>bench/</b>            <i>CPU-throttled budgets, 1k → 1M, ratcheted in CI</i>
├─ <b>e2e/</b>              <i>a11y · keyboard · VRT · cross-adapter parity · memory · SSR</i>
├─ <b>fixtures/</b>         <i>synthetic FHIR, deterministic, over-representing the hard states</i>
├─ <b>docs/</b>             <i>markdown source; the site is generated from it and from the types</i>
└─ <b>.changeset/</b>       <i>one changelog per package</i>
</pre>"""


def fig_docstree():
    return """<pre class="tree"><b>docs/</b>
├─ getting-started/     <i>install · 60-second start · your first clinical grid</i>
├─ concepts/            <i><em>the section that does the work</em></i>
│  ├─ what-a-row-is         <i>person · obligation · bed · dose · claim line</i>
│  ├─ coverage              <i>what the query reached, and unknown totals</i>
│  ├─ absence               <i>seven reasons a cell is empty</i>
│  ├─ views-and-precedence  <i>default → org → role → team → personal → session</i>
│  ├─ the-filter-tree
│  └─ row-models            <i>client · windowed · server · when each is wrong</i>
├─ columns/ · rows/ · filtering/ · sorting/ · grouping/ · editing/ · selection/
├─ virtualization/      <i>recycling, anchoring, dynamic heights, the refusal threshold</i>
├─ server-side/         <i>GridQuery/GridPage · cursors · unknown totals · cancellation</i>
├─ ssr/                 <i><em>new</em> · the hydration boundary, and why it exists</i>
├─ accessibility/       <i>keymap · ARIA contract · <em>the screen-reader matrix, with its gaps</em></i>
├─ healthcare/          <i>identity · status · results · medications · the fourteen recipes</i>
├─ fhir/                <i>resources · search mapping · <em>what FHIR cannot tell you</em></i>
├─ security/
│  ├─ boundaries            <i><em>read first</em> · what we do and do not enforce</i>
│  ├─ disclosure-policy · masking · break-glass
│  ├─ export-safety         <i>formula injection, clipboard, print</i>
│  └─ telemetry             <i>how error reporting stays PHI-free</i>
├─ performance/         <i>budgets · benchmarks · <em>numbers generated from CI, never typed</em></i>
├─ theming/ · plugins/ · api/ · recipes/
├─ frameworks/          <i>react · angular · vue · vanilla — <em>one page each, not one tree each</em></i>
└─ migration/           <i>from antd Table · from MUI X · from AG Grid · version upgrades</i>
</pre>"""
