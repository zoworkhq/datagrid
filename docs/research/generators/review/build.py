# -*- coding: utf-8 -*-
"""Assemble oxygen-datagrid-architecture-review.html."""
import os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from model import Section
import d_gap, d_arch, d_plan
import p1, p2, p3

SECTIONS = [
 ("summary",    "Executive summary",                       "Six findings that change the plan", p1.s_summary),
 ("audit",      "Current repository audit",                "What I checked, and what is actually there", p1.s_audit),
 ("assess",     "Current architecture assessment",         "Twelve judgements on the previous brief", p1.s_assess),
 ("competitors","Top-competitor analysis",                 "Six systems, architecture first", p1.s_competitors),
 ("gapmatrix",  "Feature-gap matrix",                      "91 capabilities, filterable", p1.s_gapmatrix),
 ("discovered", "Missing capabilities discovered",         "Twelve things we had not considered", p1.s_discovered),
 ("hcopp",      "Healthcare opportunity analysis",         "The product is the decisions, not the cells", p1.s_hcopp),
 ("proposed",   "Proposed architecture",                   "Five layers, and the two rules that hold them", p1.s_proposed),
 ("agnostic",   "Framework-agnostic strategy",             "Yes — and the condition under which I would abandon it", p1.s_agnostic),
 ("repo",       "Package and repository structure",        "Why a separate repository is right, and what goes in it", p1.s_repo),
 ("engine",     "Core engine architecture",                "Actions for writes, signals for reads", p2.s_engine),
 ("render",     "Rendering architecture",                  "Three strategies, one viable", p2.s_render),
 ("plugins",    "Plugin architecture",                     "Six hooks, twelve slots, nothing arbitrary", p2.s_plugins),
 ("hcarch",     "Healthcare architecture",                 "A package, not a theme", p2.s_hcarch),
 ("fhir",       "FHIR and interoperability",               "The investigation that removed a claim", p2.s_fhir),
 ("security",   "Security and privacy architecture",       "Three defects, and the boundary", p2.s_security),
 ("perf",       "Performance architecture",                "An admission, and where the headroom is", p2.s_perf),
 ("a11y",       "Accessibility strategy",                  "Written once, below the adapters", p2.s_a11y),
 ("api",        "API design",                              "Two surfaces, one engine", p2.s_api),
 ("testing",    "Testing architecture",                    "Thirteen layers, three from defects", p2.s_testing),
 ("docs",       "Documentation architecture",              "Generated, concepts-first, gaps published", p2.s_docs),
 ("readme",     "README redesign",                         "Fifteen seconds to credibility", p3.s_readme),
 ("play",       "Playground and demo strategy",            "Four controls that prove four claims", p3.s_play),
 ("cicd",       "CI/CD and release architecture",          "Every tool justified, every gate in wave one", p3.s_cicd),
 ("ai",         "AI extension strategy",                   "The features are table stakes; the refusal is not", p3.s_ai),
 ("risks",      "Risks and technical debt",                "Ten risks, and the one that is not on the list", p3.s_risks),
 ("notbuild",   "What not to build",                       "Keep this section in the repository", p3.s_notbuild),
 ("migration",  "Migration strategy",                      "The design, and the consumers", p3.s_migration),
 ("roadmap",    "Implementation roadmap",                  "Six waves, wave one ships alone", p3.s_roadmap),
 ("classes",    "P0 / P1 / P2 classification",             "Classified by cost of delay, not importance", p3.s_classes),
 ("diagram",    "Final architecture diagram",              "Everything in one picture", p3.s_diagram),
 ("verdict",    "Final recommendation and score",          "Build it — with six conditions", p3.s_verdict),
]

objs = []
for i, (sid, title, kicker, fn) in enumerate(SECTIONS, 1):
    s = Section(sid, title, kicker)
    s.num = i
    objs.append((s, fn))
NUM = {s.id: s.num for s, _ in objs}

for s, fn in objs:
    s.body = fn()


def resolve(html):
    def sub(m):
        k = m.group(1)
        if k not in NUM:
            raise SystemExit("unknown cross-reference: @@N:%s@@" % k)
        return "%02d" % NUM[k]
    return re.sub(r"@@N:([a-z-]+)@@", sub, html)


toc = "".join('<a href="#%s"><b>%02d</b> %s</a>' % (s.id, s.num, s.title) for s, _ in objs)
toc += '<button class="themebtn" id="themebtn" type="button">theme</button>'

p0 = sum(1 for g in d_gap.GAPS if g[9] == "P0")
gapn = sum(1 for g in d_gap.GAPS if g[7] == "none")
tw = sum(x[3] for x in d_plan.SCORE)
cur = sum(x[1] * x[3] for x in d_plan.SCORE) / tw
new = sum(x[2] * x[3] for x in d_plan.SCORE) / tw

hero = """
<header class="hero">
  <div class="wrap">
    <div class="eyebrow">Oxygen UI · architecture &amp; product review · zoworkhq/datagrid</div>
    <h1>Data Grid — Architecture Review</h1>
    <p class="lede">A deep review of the Data Grid initiative against six competing systems, with a
      framework-agnostic architecture, a security audit that found three defects, and an admission about a
      performance claim that was never achievable.</p>
    <div class="hero-meta">
      <span class="pill on">%d capabilities compared</span>
      <span class="pill">%d P0</span>
      <span class="pill">%d gaps discovered</span>
      <span class="pill">%d packages · 5 layers</span>
      <span class="pill">6 competitors</span>
      <span class="pill">score %.1f → %.1f</span>
      <span class="pill">27 August 2026</span>
    </div>
    <div class="gallery-2" style="margin-top:1.2rem">%s</div>
  </div>
</header>
""" % (len(d_gap.GAPS), p0, gapn, len(d_arch.PACKAGES), cur, new,
       "".join('<a class="gx" href="#%s"><span class="gn">%02d</span>%s</a>' % (s.id, s.num, s.title)
               for s, _ in objs))

css = open(os.path.join(HERE, "base.css.html")).read().replace("<style>", "", 1).replace("</style>", "", 1)
extra = open(os.path.join(HERE, "extra.css")).read()
app = open(os.path.join(HERE, "app.js")).read()
app2 = open(os.path.join(HERE, "app2.js")).read()

THEME = """
(function () {
  var root = document.documentElement, saved = null;
  try { saved = localStorage.getItem("ox-brief-theme"); } catch (e) {}
  if (saved === "light" || saved === "dark") root.setAttribute("data-theme", saved);
  function label() { var t = root.getAttribute("data-theme");
    return t === "dark" ? "dark" : t === "light" ? "light" : "system"; }
  document.addEventListener("DOMContentLoaded", function () {
    var b = document.getElementById("themebtn"); if (!b) return;
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

body = "".join(s.render() for s, _ in objs)

html = """<meta charset="utf-8" />
<title>Oxygen Data Grid — Architecture Review</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="description" content="A deep architecture, product and competitive review of the Oxygen UI Healthcare Data Grid: benchmark against AG Grid, TanStack, MUI X, Handsontable, Syncfusion and Glide; a framework-agnostic package architecture; FHIR, security and performance findings; and a prioritised roadmap." />
<style>
%s
%s
</style>
%s
<nav class="toc"><div class="wrap">%s</div></nav>
%s
<footer class="wrap" style="padding:3rem 0 4rem;color:var(--muted);font-size:0.84rem;line-height:1.7">
  <p><b>Synthetic data only.</b> Every name, MRN and result in this document is invented, on reserved example
  systems. No PHI appears here.</p>
  <p><b>Competitor claims</b> were checked in August 2026 against documentation, release notes, repositories or
  installed source, and are dated where they are version-specific. They will age.</p>
  <p><b>This is a research and architecture document, not a specification of shipped behaviour.</b> Oxygen UI is
  not a compliance boundary, is not clinical decision support, and is not a medical device. Every clinical rule
  proposed here is derived from published literature and general knowledge and has <b>not</b> been reviewed by a
  clinician — see §%02d.</p>
  <p>Oxygen UI · Zowork · 27 August 2026</p>
</footer>
<script>
%s
</script>
<script>
%s
</script>
<script>
%s
</script>
""" % (css, extra, hero, toc, body, NUM["risks"], app, app2, THEME)

html = resolve(html)
left = re.findall(r"@@[A-Za-z0-9_:-]+@@", html)
if left:
    raise SystemExit("unsubstituted tokens: %s" % sorted(set(left))[:10])

out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "out.html")
open(out, "w").write(html)
print("wrote %s — %.0f kB, %d sections" % (out, len(html) / 1024.0, len(objs)))
