# -*- coding: utf-8 -*-
"""Assemble oxygen-data-grid-brief.html.

Hard-fails on any unsubstituted @@TOKEN@@, so a renamed section or a mistyped
cross reference cannot ship as literal text in the report.
"""
import os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import model
from model import Section, FIGS
import data_use, data_feat, data_spec, data_bench
import prose1, prose2, prose3

prose1.NEDGES = len(data_spec.EDGES)

# ------------------------------------------------------------------ sections
SECTIONS = [
 Section("summary",    "Executive summary",                          "What this is, and the five claims it rests on"),
 Section("vision",     "Product vision",                             "Why this cannot be a themed table"),
 Section("usecases",   "Healthcare use-case matrix",                 "Thirty-nine scenarios, and the question none of them is asked"),
 Section("anatomy",    "Grid anatomy",                               "Fourteen regions, three of which are new"),
 Section("features",   "Feature inventory",                          "Seventy-five capabilities across five layers"),
 Section("ux",         "UX architecture",                            "Eight interaction rules, and the row that is not a patient"),
 Section("cells",      "Healthcare cells",                           "The catalogue already ships them; the grid hosts them"),
 Section("shapes",     "Four grids that are not lists of people",    "Appointments, MAR, bed board, treatment plan"),
 Section("filters",    "Filtering architecture",                     "One tree, six renderings, and a predicate that prints"),
 Section("search",     "Search architecture",                        "Three surfaces, and why the grid owns only one"),
 Section("scale",      "Large-data strategy and performance targets","One hundred rows to a million, one consumer API"),
 Section("live",       "Real-time updates",                          "The ground never moves under a human who is aiming at it"),
 Section("detail",     "Row expansion and the inspector",            "Three ways to show more, and which is correct"),
 Section("bulk",       "Bulk clinical workflows",                    "A selection is a predicate, not a list of ticked boxes"),
 Section("views",      "Saved views, roles and personalisation",     "One artefact from six sources"),
 Section("responsive", "Responsive strategy",                        "Column priority, declared once, read four times"),
 Section("density",    "Density and visual variants",                "Four densities, seven variants, one token surface"),
 Section("motion",     "Motion and micro-interaction",               "Four durations, and the interactions that get none"),
 Section("a11y",       "Accessibility architecture",                 "Twenty-four bindings and an ARIA contract"),
 Section("privacy",    "Privacy and disclosure UX",                  "What the component owns, and what it never can"),
 Section("ai",         "AI opportunities",                           "Four rules, seven capabilities, ranked by harm"),
 Section("tech",       "Technical architecture",                     "Headless engine, replaceable presentation, healthcare layer"),
 Section("hierarchy",  "Component hierarchy",                        "Thirty-two components, and six arguments with the brief"),
 Section("state",      "State architecture",                         "Fourteen slices, four owners, one rule"),
 Section("api",        "API design and TypeScript",                  "Ten examples, in the order a developer meets them"),
 Section("states",     "Loading, empty and error states",            "Six empty states, because there are six facts"),
 Section("docs",       "Documentation experience",                   "A page is a projection of a schema"),
 Section("testing",    "Testing strategy",                           "Assert the behaviour, not the hook"),
 Section("edges",      "Edge-case matrix",                           "Twenty-eight cases, thirteen of them critical"),
 Section("bench",      "Competitor comparison",                      "Seven systems, measured where measurement was possible"),
 Section("roadmap",    "Implementation roadmap",                     "Seven phases, 23–29 weeks, Phase 1 ships alone"),
 Section("risks",      "Risks, trade-offs and open questions",       "Nine risks, eight decisions I made unsupervised"),
]

BODIES = {
 "summary": prose1.s_summary, "vision": prose1.s_vision, "usecases": prose1.s_usecases,
 "anatomy": prose1.s_anatomy, "features": prose1.s_features, "ux": prose1.s_ux,
 "cells": prose1.s_cells, "shapes": prose1.s_shapes,
 "filters": prose2.s_filters, "search": prose2.s_search, "scale": prose2.s_scale,
 "live": prose2.s_live, "detail": prose2.s_detail, "bulk": prose2.s_bulk,
 "views": prose2.s_views, "responsive": prose2.s_responsive, "density": prose2.s_density,
 "motion": prose2.s_motion, "a11y": prose2.s_a11y,
 "privacy": prose3.s_privacy, "ai": prose3.s_ai, "tech": prose3.s_tech,
 "hierarchy": prose3.s_hierarchy, "state": prose3.s_state, "api": prose3.s_api,
 "states": prose3.s_states, "docs": prose3.s_docs, "testing": prose3.s_testing,
 "edges": prose3.s_edges, "bench": prose3.s_bench, "roadmap": prose3.s_roadmap,
 "risks": prose3.s_risks,
}

for i, s in enumerate(SECTIONS, 1):
    s.num = i
NUM = {s.id: s.num for s in SECTIONS}

prose1.NFIGS = sum(1 for f in FIGS if f.interactive)

# render bodies (figures register themselves on import, so FIGS is complete)
for s in SECTIONS:
    s.body = BODIES[s.id]()

# ------------------------------------------------------------------ chrome
def resolve(html):
    def sub(m):
        key = m.group(1)
        if key not in NUM:
            raise SystemExit("unknown section cross-reference: @@N:%s@@" % key)
        return "%02d" % NUM[key]
    return re.sub(r"@@N:([a-z-]+)@@", sub, html)


toc = "".join('<a href="#%s"><b>%02d</b> %s</a>' % (s.id, s.num, s.title) for s in SECTIONS)
toc += '<button class="themebtn" id="themebtn" type="button">theme</button>'

gallery = "".join(
  '<a class="gx" href="#%s"><span class="gn">%d</span>%s</a>' % (f.id, f.n, f.title) for f in FIGS)

live = sum(1 for f in FIGS if f.interactive)

hero = """
<header class="hero">
  <div class="wrap">
    <div class="eyebrow">Oxygen UI · component brief · the data layer</div>
    <h1>Healthcare Data Grid</h1>
    <p class="lede">Not a table. The surface almost every enterprise healthcare workflow is actually made of.
      One engine, fourteen recipes, and %d prototypes — twenty of them you can sort, filter, select and break.</p>
    <div class="hero-meta">
      <span class="pill on">%d live prototypes</span>
      <span class="pill">%d scenarios</span>
      <span class="pill">%d capabilities · 5 layers</span>
      <span class="pill">%d edge cases</span>
      <span class="pill">%d keyboard bindings</span>
      <span class="pill">WCAG 2.2 AA</span>
      <span class="pill">27 August 2026</span>
    </div>
    <div class="gallery">%s</div>
  </div>
</header>
""" % (len(FIGS), live, len(data_use.USE_CASES), len(data_feat.FEATURES),
       len(data_spec.EDGES), len(data_spec.KEYS), gallery)

css = open(os.path.join(HERE, "base.css.html")).read()
css = css.replace("<style>", "", 1).replace("</style>", "", 1)
extra = open(os.path.join(HERE, "extra.css")).read()
app = open(os.path.join(HERE, "app.js")).read()

THEME_JS = """
(function () {
  var root = document.documentElement;
  var saved = null;
  try { saved = localStorage.getItem("ox-brief-theme"); } catch (e) {}
  if (saved === "light" || saved === "dark") root.setAttribute("data-theme", saved);
  function label() {
    var t = root.getAttribute("data-theme");
    return t === "dark" ? "dark" : t === "light" ? "light" : "system";
  }
  document.addEventListener("DOMContentLoaded", function () {
    var b = document.getElementById("themebtn");
    if (!b) return;
    b.textContent = "theme: " + label();
    b.onclick = function () {
      var t = root.getAttribute("data-theme");
      var next = t === "dark" ? "light" : t === "light" ? null : "dark";
      if (next) root.setAttribute("data-theme", next); else root.removeAttribute("data-theme");
      try { next ? localStorage.setItem("ox-brief-theme", next) : localStorage.removeItem("ox-brief-theme"); } catch (e) {}
      b.textContent = "theme: " + label();
    };
  });
})();
"""

ERRATA = """
<div class="wrap" style="padding-top:1.6rem">
  <div class="a-alert warning" style="font-size:0.92rem;align-items:flex-start;padding:1rem 1.15rem">
    <svg class="i ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>
    <span>
      <b>Four claims in this document have been superseded.</b> The architecture review of
      27&nbsp;August&nbsp;2026 (<code>oxygen-datagrid-architecture-review.html</code>) overturns them.
      The product research below stands; these four do not.
      <table class="dtbl tight" style="margin:0.8rem 0 0">
        <thead><tr><th style="width:34%">This document says</th><th>Correct position</th></tr></thead>
        <tbody>
          <tr><td>Budgets up to <b>1,000,000+ rows client-side</b></td>
              <td><b>Not achievable.</b> The best-measured engine in the category retains 380&nbsp;MB for 1M rows &times; 8 columns. Client ceiling is ~100k; above it, client mode refuses with a reason.</td></tr>
          <tr><td>Coverage reads <b>&ldquo;Showing 8 of 1,284&rdquo;</b></td>
              <td><code>Coverage.total</code> is <code>number | "unknown"</code>. FHIR servers return opaque <code>link.next</code> URLs and <code>Bundle.total</code> is optional &mdash; so no totals and no page numbers.</td></tr>
          <tr><td>Pagination is <b>offset or cursor</b>, caller&rsquo;s choice</td>
              <td><b>Cursor is the default.</b> Offset is the special case for non-FHIR sources.</td></tr>
          <tr><td><b>AI is a differentiator</b></td>
              <td>The features are table stakes &mdash; Syncfusion and MUI X both ship them. <b>Provenance and refusal</b> are the differentiator.</td></tr>
        </tbody>
      </table>
      <div style="margin-top:0.7rem;font-size:0.86rem">
        Two additive amendments: absence has <b>eight</b> reasons (add <code>source-unreachable</code>), and the cell
        host contract has <b>eight</b> obligations (add <b>mask state</b>). See <code>HANDOVER.md</code> &sect;2.
      </div>
    </span>
  </div>
</div>
"""

body = "".join(s.render() for s in SECTIONS)

html = """<meta charset="utf-8" />
<title>Oxygen Healthcare Data Grid</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="description" content="An enterprise, healthcare-native data grid for EHR, behavioural health, clinical, operational, billing and scheduling workflows: research, UX architecture, component and technical architecture, performance targets, accessibility, disclosure UX, and %d live interactive prototypes." />
<style>
%s
%s
</style>
%s
%s
<nav class="toc"><div class="wrap">%s</div></nav>
%s
<footer class="wrap" style="padding:3rem 0 4rem;color:var(--muted);font-size:0.84rem;line-height:1.7">
  <p><b>Synthetic data only.</b> Every name, MRN, result and schedule in this document is invented, on reserved
  example systems. No PHI appears here.</p>
  <p><b>This is a research and design document, not a specification of shipped behaviour.</b> Oxygen UI is not a
  compliance boundary, is not clinical decision support, and is not a medical device. Every clinical rule proposed
  here is derived from published literature and general knowledge and has <b>not</b> been reviewed by a clinician —
  see §%02d.</p>
  <p>Oxygen UI · Zowork · 27 August 2026</p>
</footer>
<script>
%s
</script>
<script>
%s
</script>
""" % (live, css, extra, hero, ERRATA, toc, body, NUM["risks"], app, THEME_JS)

html = resolve(html)

leftover = re.findall(r"@@[A-Za-z0-9_:-]+@@", html)
if leftover:
    raise SystemExit("unsubstituted tokens: %s" % sorted(set(leftover))[:10])

out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "oxygen-data-grid-brief.html")
open(out, "w").write(html)
print("wrote %s — %.0f kB, %d sections, %d figures (%d live)" % (
  out, len(html) / 1024.0, len(SECTIONS), len(FIGS), live))
