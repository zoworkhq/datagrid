# -*- coding: utf-8 -*-
"""Competitive benchmark. Every claim here was checked in August 2026 and the
antd/rc-table rows were measured against the installed source, not the docs."""

COMPETITORS = [
 {
  "name": "AG Grid",
  "ver": "36.1.0 · 5 Aug 2026",
  "model": "Community MIT · Enterprise US$999/dev perpetual (1 yr updates); bundle with AG Charts US$1,598",
  "good": [
    "The deepest feature set in the category, and the only one whose virtualisation is genuinely battle-tested at millions of rows: rows and columns both windowed, a configurable rowBuffer, and node recycling.",
    "Server-side row model with grouping, aggregation and pivot pushed to the server — the only one that treats the server as the source of truth by default.",
    "Framework-agnostic core with thin adapters, so behaviour does not fork per framework.",
  ],
  "bad": [
    "Enterprise licensing is per developer, which is a procurement conversation before the first prototype.",
    "The API is imperative and enormous (a grid API object with hundreds of methods); state lives inside the grid, so 'save this view' is a bespoke serialise/restore each time.",
    "Styling is a theming system rather than your design system; matching an existing token surface is an ongoing tax.",
    "No domain semantics at all — every clinical meaning is a cellRenderer you write and maintain.",
  ],
  "better": "State that is data, not an API object. A GridView is a JSON document; saving, sharing and role-presetting are the same mechanism.",
 },
 {
  "name": "TanStack Table",
  "ver": "v9 stable · 4 Aug 2026",
  "model": "MIT",
  "good": [
    "Genuinely headless: the state and row-model pipeline with no opinion about markup, which is the correct shape for a design system to build on.",
    "v9 is modular and tree-shaken — register only the features and row models you use; ~25 KB min+brotli for the full package, with up to 90% memory savings on large tables.",
    "Adapters now bind to each framework's native reactivity rather than React-shaped assumptions.",
  ],
  "bad": [
    "Headless means you own every accessibility decision, and most consumers get that wrong — there is no keyboard model in the box.",
    "No virtualisation (it is a separate library), so the two hardest problems — row models and windowing — are solved in different repositories with different mental models.",
    "Server-side operations are a convention, not a contract.",
  ],
  "better": "Ship the engine AND the correct accessible presentation, and make the presentation the part you are allowed to replace.",
 },
 {
  "name": "MUI X Data Grid",
  "ver": "v9 · 2026",
  "model": "Community MIT · Pro US$299/dev/yr · Premium US$599/dev/yr",
  "good": [
    "The cleanest declarative API of the commercial grids, and a genuinely good default look.",
    "The Data Source layer in v8/v9 gives lazy loading, caching and invalidation a real shape, including server-side row grouping.",
    "Premium now bundles an AI assistant and charts integration, which is where the category is heading.",
  ],
  "bad": [
    "The free/paid boundary runs straight through table stakes: column pinning, tree data and row grouping are all paid, so the free grid is a demo.",
    "Tied to MUI's styling engine and theme, which is a second design system inside yours.",
    "Row-level semantics stop at `getRowClassName` — the same clinical-meaning-as-CSS-class problem.",
  ],
  "better": "No feature gate inside the safety surface. Coverage, absence, masking and the keyboard model are free, in every tier, forever.",
 },
 {
  "name": "Ant Design Table",
  "ver": "antd 6.6.0 · @rc-component/table 1.11.1",
  "model": "MIT",
  "good": [
    "Excellent API ergonomics — `columns` + `dataSource` + `onChange` is still the most teachable table API in React, which is exactly why we match it.",
    "`virtual` with `scroll.x/y` works, backed by @rc-component/virtual-list, which does measure dynamic row heights via ResizeObserver and a height cache.",
    "Fixed columns are real `position: sticky`, so they survive zoom and reflow.",
  ],
  "bad": [
    "Measured, not asserted: the engine under it — @rc-component/table@1.11.1 — emits exactly one `aria-*` attribute in its entire ES build (`aria-hidden`), no `role`, and has zero keyboard handlers. antd's own layer adds `aria-sort`, `aria-description`, `aria-expanded` and five `aria-label`s, and that is the whole accessibility surface.",
    "No `aria-rowcount`, `aria-rowindex`, `aria-colindex` or `aria-colcount` anywhere in either package — so a virtualised antd Table tells a screen-reader user nothing about where they are in 40,000 rows.",
    "No cell-level focus and no arrow-key navigation: a keyboard user reaches a table's contents only through whatever interactive elements happen to be inside cells.",
    "`sticky` and `virtual` together is a long-standing layout defect.",
  ],
  "better": "Keep the API, replace the semantics. Same `columns`/`dataSource`/`onChange`, plus a real `role=\"grid\"`, absolute row indices under virtualisation, and a two-dimensional keyboard model.",
 },
 {
  "name": "Handsontable",
  "ver": "2026",
  "model": "Commercial (free for non-commercial)",
  "good": [
    "The spreadsheet metaphor done properly: range selection, fill handle, formulas, and paste that behaves like Excel.",
    "The right answer when the user's mental model genuinely is a spreadsheet — charge capture, bulk coding.",
  ],
  "bad": [
    "The spreadsheet metaphor is wrong for almost every clinical surface, and it invites bulk paste into fields that carry clinical consequence.",
    "Heavy, and its accessibility story assumes a spreadsheet user, not a screen-reader user.",
  ],
  "better": "Offer the spreadsheet affordances as an opt-in plugin, off by default in every clinical preset, so nobody pastes 400 cells into a medication list.",
 },
 {
  "name": "Salesforce Lightning / enterprise CRM grids",
  "ver": "—",
  "model": "Platform",
  "good": [
    "List views are first-class, shareable objects with owners and permissions — the strongest precedent for treating a view as data.",
    "Mass actions with an explicit selected-count and a review step are a solved, well-worn pattern.",
    "Inline edit with a batch save and a per-row error report is the right shape for bulk correction.",
  ],
  "bad": [
    "Density is poor for clinical scanning; the surface is designed for a sales rep with ten rows, not a nurse with two hundred.",
    "Configuration is admin-mediated, so a clinician cannot shape their own worklist without a ticket.",
  ],
  "better": "Take shareable views and mass-action review; reject the density and the admin gate.",
 },
 {
  "name": "EHR-native worklists (Epic, Cerner, Meditech patterns)",
  "ver": "—",
  "model": "Platform",
  "good": [
    "Column sets per role are the norm and clinicians expect them, which validates recipes over bespoke screens.",
    "Status columns carry glyph + colour + text, because these products learned the hard way that colour alone fails.",
    "Patient identity in a worklist row routinely carries two identifiers, matching NPSG.01.01.01.",
  ],
  "bad": [
    "Information density has drifted into information overload; the FDA's revised CDS guidance (6 Jan 2026) now explicitly asks software to prioritise decision-relevant details and avoid overload — a UI requirement inside a device-classification document.",
    "Risk scores are shown as bare numbers. The Epic Sepsis Model's external validation (JAMA Internal Medicine, 2021) found an AUC of 0.63 against the 0.76–0.83 cited internally, missing two-thirds of sepsis cases while generating enough false alarms to require ~109 alerts per true positive — a number that a column of bare scores makes impossible to reason about.",
    "Terra UI, Cerner's React design system and the only serious healthcare component library, was archived on 28 June 2024 along with the Cerner GitHub organisation. There is no maintained healthcare grid to copy from.",
  ],
  "better": "Make the model's own quality visible where the sort happens, and make 'what am I not seeing' a permanent, printed part of the surface.",
 },
]

# axis, aggrid, tanstack, mui, antd, oxygen  ("y" full, "p" partial, "n" none)
MATRIX = [
 ("Virtualised rows",                 "y","n","y","y","y"),
 ("Virtualised columns",              "y","n","y","n","y"),
 ("Server-side sort/filter/page",     "y","p","y","p","y"),
 ("Cursor pagination as a first class","p","n","p","n","y"),
 ("role=\"grid\" + 2-D keyboard model","y","n","y","n","y"),
 ("Absolute aria-rowindex under virtualisation","y","n","y","n","y"),
 ("Headless engine you may keep",     "n","y","n","n","y"),
 ("View state as a serialisable document","p","p","p","p","y"),
 ("Free tier includes pinning/grouping/tree","n","y","n","y","y"),
 ("Declares what the query did not reach","n","n","n","n","y"),
 ("Typed absence taxonomy per cell",  "n","n","n","n","y"),
 ("Column-level disclosure policy",   "n","n","n","n","y"),
 ("Sort provenance on derived columns","n","n","n","n","y"),
 ("Position-stable live updates",     "p","n","p","n","y"),
 ("FHIR-typed cells out of the box",  "n","n","n","n","y"),
 ("Print sheet carrying the query",   "p","n","p","n","y"),
]
