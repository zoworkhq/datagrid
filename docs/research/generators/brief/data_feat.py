# -*- coding: utf-8 -*-
"""Feature inventory.

layer:  core  = in @oxygenui-design/grid-core, always paid for in bytes
        shell = in the DataGrid presentation layer
        plug  = an opt-in plugin; costs nothing if not imported
        clin  = healthcare extension
        app   = deliberately NOT ours; the application owns it
phase:  which roadmap phase ships it
"""

# name, layer, phase, note
FEATURES = [
 # ---- reading the data ------------------------------------------------
 ("Column model & typed accessors",      "core",  1, "The column is the unit of configuration and must be serialisable."),
 ("Row model & stable identity",         "core",  1, "rowKey is a safety control, not a reconciliation hint."),
 ("Single-column sort",                  "core",  1, ""),
 ("Multi-column sort",                   "core",  1, "Precedence rendered as ordinals in the headers, never implied by click order alone."),
 ("Sort provenance",                     "clin",  3, "A sort by a derived or model column names its source in the header."),
 ("Column filters",                      "core",  1, ""),
 ("Filter AST (AND/OR/NOT, nested)",     "core",  2, "One tree; the builder, the chips, the URL and the NL parser all produce it."),
 ("Predicate sentence",                  "clin",  2, "The active query rendered in words, printed and exported."),
 ("Global search",                       "shell", 1, ""),
 ("Per-column search",                   "shell", 2, ""),
 ("Command-palette search",              "clin",  4, "Composes the shipped ChartCommandPalette rather than a second search."),
 ("Fuzzy match + highlight",             "plug",  2, "Never fuzzy on MRN or an identifier — exact or nothing."),

 # ---- moving through it ----------------------------------------------
 ("Offset pagination",                   "core",  1, ""),
 ("Cursor pagination",                   "core",  2, "The only correct choice over a mutating set."),
 ("Row virtualisation",                  "core",  2, "Dynamic heights measured, not assumed."),
 ("Column virtualisation",               "core",  2, "Needed at 60+ columns, i.e. every flowsheet."),
 ("Infinite / windowed scroll",          "core",  2, ""),
 ("Prefetch on scroll velocity",         "plug",  2, ""),
 ("Sticky header",                       "shell", 1, ""),
 ("Sticky / pinned columns",             "shell", 2, "Identity column pins by default in every clinical preset."),
 ("Sticky group headers",                "shell", 3, ""),
 ("Frozen sort under the pointer",       "clin",  3, "Live data may not reorder while a human is aiming."),

 # ---- shaping it ------------------------------------------------------
 ("Column resize",                       "shell", 2, ""),
 ("Column reorder",                      "shell", 2, ""),
 ("Column visibility",                   "shell", 2, ""),
 ("Header column groups",                "shell", 3, ""),
 ("Row grouping",                        "core",  3, ""),
 ("Tree data / nested rows",             "core",  3, "Partial trees are the normal case; a missing child is not an empty child."),
 ("Master–detail expansion",             "shell", 3, ""),
 ("Aggregation & summary rows",          "core",  3, "Refuses to aggregate across incompatible units."),
 ("Group summaries",                     "core",  3, ""),
 ("Transposed / flowsheet mode",         "clin",  4, "Analytes down, time across; the header is the scrolling axis."),
 ("Density (4 steps)",                   "shell", 1, "A density that breaks a contrast or target floor is not offered."),
 ("Full-screen mode",                    "shell", 4, ""),

 # ---- acting on it ----------------------------------------------------
 ("Row selection",                       "core",  1, ""),
 ("Range / rectangle selection",         "plug",  4, ""),
 ("Selection across pages",              "core",  2, "Selection is a set of ids plus a predicate, never 'the checkbox on screen'."),
 ("Bulk action bar",                     "shell", 4, ""),
 ("Bulk safety review",                  "clin",  4, "A bulk clinical write shows the affected people before it runs."),
 ("Inline cell editing",                 "shell", 4, ""),
 ("Row editing with commit phase",       "shell", 4, "Reuses useCommitPhase() from the Switch."),
 ("Validation",                          "core",  4, ""),
 ("Optimistic update + rollback",        "core",  4, ""),
 ("Undo / redo",                         "plug",  5, "Never for a signed or transmitted write."),
 ("Copy",                                "plug",  4, "Copies what is on screen, including masks."),
 ("Paste / fill",                        "plug",  5, "Off by default in clinical presets."),
 ("Row actions & overflow",              "shell", 1, ""),
 ("Context menu",                        "plug",  4, ""),

 # ---- getting it out --------------------------------------------------
 ("CSV / XLSX export",                   "plug",  4, "Export is a disclosure event; the coverage sentence travels with it."),
 ("Print sheet",                         "plug",  4, "Print is where 'see all' stops existing."),
 ("Import",                              "app",   0, "Mapping and validating an upload is an application concern."),

 # ---- keeping it ------------------------------------------------------
 ("Serialisable view (GridView)",        "core",  4, "One artefact serves default, role preset and saved view."),
 ("Saved views & precedence",            "shell", 4, ""),
 ("URL state sync",                      "plug",  4, ""),
 ("Per-user personalisation store",      "app",   0, "We define the shape; where it is stored is yours."),

 # ---- telling the truth ----------------------------------------------
 ("Coverage declaration",                "clin",  1, "Required prop. What this query reached, in words, always rendered."),
 ("Absence taxonomy per cell",           "clin",  1, ""),
 ("Loading / skeleton states",           "shell", 1, ""),
 ("Empty states (six)",                  "shell", 1, ""),
 ("Partial failure",                     "clin",  2, "One source down does not make an empty grid."),
 ("Stale-data indicator",                "clin",  3, ""),
 ("Arrivals queue",                      "clin",  3, ""),
 ("Changed-cell attention",              "clin",  3, ""),

 # ---- who may see it --------------------------------------------------
 ("Column-level permission gate",        "clin",  5, "A column the viewer may not see is absent, and its absence is stated."),
 ("Cell masking",                        "clin",  5, ""),
 ("Restricted-row treatment",            "clin",  5, ""),
 ("Break-glass affordance",              "clin",  5, "Renders the reason capture; the decision is the server's."),
 ("Disclosure events out",               "clin",  5, "The grid emits; the application records."),
 ("Audit logging",                       "app",   0, "Must be server-side or it is not an audit log."),
 ("Session timeout / re-auth",           "app",   0, "The grid restores its view; the app owns the clock."),

 # ---- intelligence ----------------------------------------------------
 ("Natural-language filter",             "clin",  6, "Compiles to the same AST, and shows the chips before it runs."),
 ("AI-proposed columns",                 "clin",  6, "A proposal channel that never writes."),
 ("Row-level AI summary",                "clin",  6, "Provenance-tagged, never mixed with verified values."),
 ("Anomaly / outlier marks",             "clin",  6, ""),
 ("Smart grouping suggestions",          "clin",  6, ""),
]

LAYERS = {
 "core":  ("Grid engine",        "@oxygenui-design/grid-core — no React, no DOM, no dependencies."),
 "shell": ("Presentation",       "The DataGrid component: markup, tokens, motion, a11y wiring."),
 "plug":  ("Plugin",             "Opt-in. Costs zero bytes when not imported."),
 "clin":  ("Healthcare layer",   "Clinical semantics. The reason this is not a themed table."),
 "app":   ("Application",        "Deliberately not ours. Named so nobody assumes it is."),
}

PHASES = {
 0: "n/a",
 1: "Phase 1 — Foundation",
 2: "Phase 2 — Scale",
 3: "Phase 3 — Clinical shape",
 4: "Phase 4 — Work",
 5: "Phase 5 — Disclosure",
 6: "Phase 6 — Intelligence",
}
