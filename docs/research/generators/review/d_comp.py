# -*- coding: utf-8 -*-
"""Deep competitor analysis. Architecture, not feature lists.

Everything dated or numbered here was checked in August 2026 against docs,
release notes, repositories or the installed source — not marketing pages.
"""

COMPETITORS = [
 {
  "id": "aggrid",
  "name": "AG Grid",
  "ver": "36.1.0 · 5 Aug 2026",
  "license": "Community MIT · Enterprise US$999/dev perpetual (1 yr updates) · bundle with AG Charts US$1,598",
  "one_line": "The category's reference implementation. Ten years of work in the virtualiser and the only genuinely mature server-side row model.",
  "arch": [
    ("Core", "Framework-agnostic TypeScript core with an <b>IoC container</b>, auto-wired services and its own internal component/data-binding framework. The framework packages are thin wrappers."),
    ("Rendering", "DOM virtualisation on both axes with a configurable <code>rowBuffer</code> (default 10 rows above and below the viewport) and <b>node recycling</b> — rendered nodes are cached and reused rather than unmounted."),
    ("State", "State lives inside the grid, reached through a large imperative <code>GridApi</code> object."),
    ("Modules", "v33 refactored module registration for tree-shaking: register only the feature modules you use. From v33 all community features export directly from <code>ag-grid-community</code>."),
    ("Data", "<b>Four row models</b> — Client-Side (everything in memory), Infinite (flat, block-loaded), Server-Side (Enterprise; lazy groups + server aggregation), Viewport (Enterprise; server knows your exact first and last row)."),
    ("Theming", "v33 introduced a JS Theming API; legacy CSS themes now need <code>{ theme: \"legacy\" }</code> — a breaking change for every existing consumer."),
  ],
  "steal": [
    "<b>The four-row-model framing.</b> It is the clearest mental model in the category and it names the trade-off honestly. Our brief collapsed all four into a single <code>mode</code> prop, which is a worse API.",
    "<b>The v33 module registry.</b> Explicit feature registration with real tree-shaking is exactly the plugin shape we want.",
    "<b>Node recycling.</b> Windowing alone is not enough; the cost is reconciliation of rows entering and leaving.",
    "<b>The docs' honesty about the Viewport row model</b> — their own guidance is that people implement it when they should not. That kind of anti-recommendation builds more trust than a feature list.",
  ],
  "avoid": [
    "<b>The IoC container.</b> It is why the core is large, why stack traces are unreadable, and why nobody contributes.",
    "<b>State inside the grid, reached imperatively.</b> Every 'save this view' becomes bespoke serialise/restore, and role presets end up a second mechanism.",
    "<b>Per-developer perpetual licensing.</b> It puts a procurement conversation before the first prototype.",
    "<b>A theming migration that breaks every consumer</b> in a minor-looking major.",
    "No domain semantics — every clinical meaning is a <code>cellRenderer</code> the customer writes and maintains.",
  ],
 },
 {
  "id": "tanstack",
  "name": "TanStack Table",
  "ver": "v9 stable · 4 Aug 2026",
  "license": "MIT",
  "one_line": "The right shape for a design system to build on, and now the strongest engine numbers in the category — but it stops at the engine.",
  "arch": [
    ("Core", "<code>@tanstack/table-core</code> is pure logic, framework-independent, exposing state as atoms and selectors."),
    ("State", "<b>TanStack Store on the alien-signals architecture</b>, giving fine-grained reactivity; components subscribe to slices rather than to the whole table."),
    ("Features", "Explicit registration via <code>tableFeatures()</code> — a table that only paginates client-side declares exactly that feature and that row model. Dead-code elimination that v8 could not do."),
    ("Adapters", "Ten adapters bind table atoms to native framework reactivity — Solid signals, Vue refs, Svelte runes, Angular signals — rather than working around React-shaped assumptions."),
    ("Numbers", "Core row processing <b>+79%</b>, grouping/aggregation +52%, sorting +37%, filtering +34%. Retained heap <b>up to 86% lower</b>: 380&nbsp;MB versus 2.71&nbsp;GB on a one-million-row, eight-column paginated case. Package 25&nbsp;KB unminified, modular."),
    ("Gaps", "No virtualisation (separate library). No rendering. No accessibility. Server-side operations are a convention, not a contract."),
  ],
  "steal": [
    "<b>Signals in the core.</b> This is the most important single finding in this review: the best-measured engine in the category moved to signal-based reactivity and got 79% faster with 86% less memory. TC39 Signals is at Stage 1 with Angular, Vue, Solid, Preact, Ember and MobX contributors behind it.",
    "<b>Feature registration as the tree-shaking unit</b> — the same idea as AG Grid's modules, expressed in a type-safe way.",
    "<b>Adapters that bind to native reactivity</b> rather than forcing a React mental model on Angular.",
    "<b>The type inference.</b> It is the best in the category and it is why developers who could use anything choose it.",
  ],
  "avoid": [
    "<b>Headless-only.</b> Most consumers get accessibility wrong; shipping no keyboard model means the ecosystem is full of inaccessible tables built on an excellent engine.",
    "<b>Virtualisation in a different repository</b> with a different mental model. The two hardest problems — row models and windowing — meet at scroll anchoring, and nobody owns that seam.",
  ],
  "hard_number": "380&nbsp;MB retained heap for 1M rows × 8 columns, in the <em>best</em> engine in the category.",
 },
 {
  "id": "muix",
  "name": "MUI X Data Grid",
  "ver": "v9 · 2026",
  "license": "Community MIT · Pro US$299/dev/yr · Premium US$599/dev/yr",
  "one_line": "The best-designed declarative API and the best-designed server-data contract — inside a paywall that runs through table stakes.",
  "arch": [
    ("API", "Declarative props, clean defaults, the most teachable of the commercial grids."),
    ("Data Source", "<code>GridDataSource</code> with a single required <code>getRows()</code> returning <code>GridGetRowsResponse</code>, an optional <code>updateRow()</code>, and a real cache contract: <code>set</code>/<code>get</code>/<code>clear</code>, 5-minute default TTL, chunking to the smallest <code>pageSize</code>, per-request <code>skipCache</code>, background revalidation via <code>dataSourceRevalidateMs</code>, and typed <code>GridGetRowsError</code> / <code>GridUpdateRowError</code>."),
    ("Server features", "Server-side tree data, row grouping, lazy loading, aggregation and pivoting via extended data-source methods."),
    ("Styling", "Tied to MUI's styling engine and theme."),
    ("Tiering", "Column pinning, tree data, row grouping and aggregation are paid. v9 adds an AI assistant and charts integration in Premium."),
  ],
  "steal": [
    "<b>The Data Source contract.</b> One required method, a typed error union, an explicit cache interface with a TTL, and documented invalidation — the best server-data design in the category, and better than what our brief specified.",
    "<b>The documented limitation</b> that <code>dataSourceKeepPreviousData</code> applies only to flat data because tree and grouped data would show stale ordering. Publishing that kind of constraint is a mark of a serious library.",
  ],
  "avoid": [
    "<b>A free/paid boundary that runs through table stakes.</b> A grid without column pinning is a demo, and a healthcare grid without pinned identity is unsafe.",
    "<b>A styling-engine dependency.</b> It is the most-cited reason teams reject MUI X, and it is fatal for a component distributed as copy-source.",
    "<b>Row semantics that stop at <code>getRowClassName</code></b> — clinical meaning as a CSS class.",
  ],
 },
 {
  "id": "hot",
  "name": "Handsontable",
  "ver": "2026",
  "license": "Commercial; free only for non-commercial use. HyperFormula is <b>GPLv3</b> or proprietary.",
  "one_line": "The best spreadsheet metaphor on the web, and the wrong metaphor for almost every clinical surface.",
  "arch": [
    ("Model", "Spreadsheet-first: a cell coordinate system, range selection, a fill handle, Excel-compatible paste."),
    ("Formulas", "HyperFormula — a headless TypeScript spreadsheet engine, 400+ functions, CRUD, undo/redo, clipboard, sorting."),
    ("Frameworks", "React, Angular and Vue wrappers over one core."),
    ("Licensing", "<b>The important architectural fact.</b> HyperFormula is GPLv3 unless you buy a proprietary licence; Handsontable itself is commercial for any commercial use."),
  ],
  "steal": [
    "<b>Range selection, the fill handle and Excel-compatible paste</b> are genuinely the right answer when the user's mental model really is a spreadsheet — charge capture and bulk coding.",
    "<b>A headless formula engine as a separate product</b> is a good architectural pattern in itself.",
  ],
  "avoid": [
    "<b>GPLv3 by default.</b> Vendoring or depending on HyperFormula would make our licence position radioactive for exactly the enterprise buyers we want. This is a legal landmine, not a preference.",
    "<b>The spreadsheet metaphor in clinical surfaces.</b> It invites bulk paste into fields with clinical consequence.",
    "<b>Accessibility designed for a spreadsheet user</b>, not a screen-reader user.",
  ],
 },
 {
  "id": "syncfusion",
  "name": "Syncfusion DataGrid",
  "ver": "2026",
  "license": "Platform licence from roughly US$395/month, quote-based; community licence under US$1M revenue / ≤5 developers / ≤10 employees",
  "one_line": "The broadest feature surface and the one competitor already shipping AI in the grid — which retires one of our assumed differentiators.",
  "arch": [
    ("Frameworks", "One SDK across JavaScript, React, Angular, Vue, Blazor, ASP.NET Core and MVC — the widest framework reach in the category."),
    ("Features", "Excel-like filtering, PDF/Excel export with formatting preserved, chart integration, virtualisation."),
    ("AI", "<b>Ships semantic filtering and anomaly detection in the grid today.</b>"),
    ("Licensing", "Platform-wide, unlimited deployments, no runtime fees — but not transparently priced."),
  ],
  "steal": [
    "<b>Platform licensing with unlimited deployment.</b> For a healthcare vendor shipping to many provider sites, per-deployment fees are a deal-breaker and Syncfusion has removed that objection.",
    "<b>Export that preserves formatting.</b> A stripped CSV is not what a biller wants.",
  ],
  "avoid": [
    "<b>Opaque pricing.</b> It forces a sales call before evaluation, which is the opposite of the developer-led adoption we need.",
    "<b>Breadth over depth.</b> 1,600+ controls means no single one gets the attention a data grid needs.",
  ],
  "hard_number": "AI filtering and anomaly detection are <b>already shipping</b> in a competitor. Our AI section must be re-scoped around provenance, not features.",
 },
 {
  "id": "glide",
  "name": "Glide Data Grid",
  "ver": "current",
  "license": "MIT",
  "one_line": "Not on the brief's list, and the most architecturally interesting of all of them — because it proves the road we must not take.",
  "arch": [
    ("Rendering", "<b>HTML Canvas.</b> No DOM nodes per cell. Visible cells are painted; scrolling repaints and discards."),
    ("Memory", "Flat regardless of dataset size — 100 rows or 10 million cost the same."),
    ("History", "It began as DOM virtualisation with <code>react-virtualized</code> on both axes. The team moved to canvas specifically because loading and unloading hundreds of DOM nodes per frame was the bottleneck."),
    ("Accessibility", "Every cell is outside the accessibility tree by construction. What exists is a bolted-on overlay."),
  ],
  "steal": [
    "<b>The diagnosis.</b> Their stated reason for abandoning DOM virtualisation — per-frame node churn — is exactly why we must specify node recycling rather than assuming windowing is enough.",
    "<b>Damage-based repaint.</b> Repainting only the changed region is the right model for a high-frequency clinical feed, and it maps onto DOM as targeted cell updates.",
  ],
  "avoid": [
    "<b>Canvas itself.</b> For a surface a clinician uses for a full shift under WCAG 2.2 AA, taking every cell out of the accessibility tree is disqualifying. <b>This rejection should be written down</b>, because someone will propose canvas again the first time a scroll benchmark disappoints.",
  ],
 },
]

# axis, ag, tan, mui, hot, syn, ours-proposed
SUMMARY = [
 ("Framework-agnostic core",            3, 3, 1, 2, 2, 3),
 ("Signal-based reactivity",            1, 3, 1, 1, 1, 3),
 ("Rendering included and accessible",  3, 0, 3, 2, 3, 3),
 ("Server row model maturity",          3, 1, 3, 1, 3, 2),
 ("Type inference quality",             2, 3, 2, 1, 2, 3),
 ("Free tier is actually usable",       2, 3, 1, 1, 2, 3),
 ("Design-token theming, no CSS-in-JS", 2, 0, 1, 2, 2, 3),
 ("Domain semantics",                   1, 1, 1, 1, 1, 3),
 ("Declares what it did not reach",     1, 1, 1, 1, 1, 3),
 ("Disclosure / PHI model",             1, 1, 1, 1, 1, 3),
 ("Export is injection-safe",           1, 0, 1, 1, 1, 3),
 ("Memory-leak regression gate",        1, 1, 1, 1, 1, 3),
 ("Docs as a product",                  3, 3, 3, 2, 3, 2),
 ("Migration path from a competitor",   2, 1, 2, 1, 1, 3),
]
