# -*- coding: utf-8 -*-
"""Figures for the architecture review."""
from mocklib import ic
import d_gap, d_comp, d_arch, d_plan
from collections import Counter


# --------------------------------------------------------------- gap matrix
def fig_gapmatrix():
    areas = d_gap.AREAS
    pri_counts = Counter(g[9] for g in d_gap.GAPS)
    area_counts = Counter(g[0] for g in d_gap.GAPS)
    disc = sum(1 for g in d_gap.GAPS if g[7] == "none")
    hc = sum(1 for g in d_gap.GAPS if g[8])

    pills_pri = "".join(
      '<button class="gpill" type="button" data-gp="%s" aria-pressed="false">'
      '<span class="pri pri-%s">%s</span><span class="n">%d</span></button>' % (p, p, p, pri_counts[p])
      for p in ["P0", "P1", "P2", "future", "never"] if pri_counts.get(p))
    pills_only = (
      '<button class="gpill" type="button" data-go="gap" aria-pressed="false">Not considered<span class="n">%d</span></button>'
      '<button class="gpill" type="button" data-go="hc" aria-pressed="false">Healthcare-driven<span class="n">%d</span></button>'
      '<button class="gpill" type="button" data-go="nobody" aria-pressed="false">Nobody has it<span class="n">%d</span></button>'
    ) % (disc, hc, sum(1 for g in d_gap.GAPS if max(g[2:7]) <= 1))
    pills_area = "".join(
      '<button class="gpill" type="button" data-ga="%s" aria-pressed="false">%s<span class="n">%d</span></button>' % (
        a, a, area_counts[a]) for a in areas)

    def dot(v):
        return '<span class="dot%d" title="%s" aria-label="%s"></span>' % (v, d_gap.SUPPORT_WORD[v], d_gap.SUPPORT_WORD[v])

    rows = []
    for area, cap, ag, tan, mui, hot, syn, ours, hcr, pri, rec in d_gap.GAPS:
        nobody = max(ag, tan, mui, hot, syn) <= 1
        rows.append(
          '<tr data-pri="%s" data-area="%s" data-gap="%s" data-hc="%s" data-nobody="%s">'
          '<td><div class="gaparea">%s</div><b>%s</b>%s</td>'
          '<td class="c">%s</td><td class="c">%s</td><td class="c">%s</td><td class="c">%s</td><td class="c">%s</td>'
          '<td class="c"><span class="ourscell ours-%s">%s</span></td>'
          '<td>%s</td>'
          '<td class="c"><span class="pri pri-%s">%s</span></td>'
          '<td>%s</td></tr>' % (
            pri, area, "1" if ours == "none" else "0", "1" if hcr else "0", "1" if nobody else "0",
            area, cap,
            '<div style="font-size:.75rem;color:var(--muted);margin-top:.2rem">%s</div>' % hcr if hcr else "",
            dot(ag), dot(tan), dot(mui), dot(hot), dot(syn),
            ours, d_gap.OURS_WORD[ours][0],
            hcr if False else "",
            pri, pri, rec))
    # drop the now-empty healthcare column
    rows = [r.replace("<td></td>", "") for r in rows]

    return (
      '<div data-gapscope>'
      '<div class="gapctl"><span class="lbl2">Priority</span>%s</div>'
      '<div class="gapctl"><span class="lbl2">Lens</span>%s'
      '<button class="gpill" type="button" data-gapclear>Clear</button></div>'
      '<details style="margin-bottom:.8rem"><summary style="cursor:pointer;font-size:.8rem;color:var(--muted)">'
      'Filter by area (%d)</summary><div class="gapctl" style="margin-top:.5rem">%s</div></details>'
      '<p style="font-size:.8rem;color:var(--muted);margin:0 0 .6rem">'
      'Showing <b data-gapcount>%d</b> of %d capabilities. '
      '<span class="dot3"></span> full · <span class="dot2"></span> partial · '
      '<span class="dot1"></span> none · blank = not applicable.</p>'
      '<div class="tblwrap"><table class="gapt">'
      '<thead><tr><th>Area &amp; capability</th>'
      '<th class="c">AG</th><th class="c">TAN</th><th class="c">MUI</th><th class="c">HOT</th><th class="c">SYN</th>'
      '<th class="c">Us today</th><th class="c">Pri</th><th>Recommendation</th></tr></thead>'
      '<tbody>%s</tbody></table>'
      '<div class="gapempty" data-gapempty style="display:none">Nothing matches those filters.</div></div>'
      '<div class="liveout"><span class="tag">status</span><span data-live></span></div>'
      "</div>"
    ) % (pills_pri, pills_only, len(areas), pills_area, len(d_gap.GAPS), len(d_gap.GAPS), "".join(rows))


# --------------------------------------------------------------- heat matrix
def fig_heat():
    head = "".join('<th%s>%s</th>' % (' class="oursh"' if i == 5 else "", n)
                   for i, n in enumerate(d_comp.COMPETITORS[0] and
                                         ["AG Grid", "TanStack", "MUI X", "Hands.", "Syncf.", "Oxygen"]))
    body = []
    for row in d_comp.SUMMARY:
        cells = "".join(
          '<td><span class="cellv v%d%s">%s</span></td>' % (
            v, " ours" if i == 5 else "", {3: "●●●", 2: "●●", 1: "●", 0: "—"}[v])
          for i, v in enumerate(row[1:]))
        body.append("<tr><td>%s</td>%s</tr>" % (row[0], cells))
    return ('<div class="tblwrap"><table class="heatm">'
            '<thead><tr><th>Capability</th>%s</tr></thead><tbody>%s</tbody></table></div>'
            '<p style="font-size:.78rem;color:var(--muted);margin-top:.5rem">'
            'The Oxygen column is the <em>proposal in this document</em>, not what exists. '
            'The four rows at the bottom of the matrix are where nobody scores — and they are the product.</p>') % (
      head, "".join(body))


# --------------------------------------------------------------- layer stack
def fig_layers():
    rows = []
    for k, name, units, note in d_arch.LAYERS:
        hot = " hot" if k in ("L1", "L2") else ""
        chips = "".join("<code>%s</code>" % u.strip() for u in units.split("·"))
        rows.append('<div class="lrow%s"><div class="lk">%s</div><div class="lb">'
                    '<div class="lt">%s</div><div class="lu">%s</div>'
                    '<div class="ln">%s</div></div></div>' % (hot, k, name, chips, note))
    return '<div class="lstack">%s</div>' % "".join(rows)


# --------------------------------------------------------------- packages
def fig_packages():
    cards = []
    for name, layer, deps, size, what, why, pri in d_arch.PACKAGES:
        laykey = {"L1 engine": "core", "L2 render": "shell", "L2 domain": "clin",
                  "L3 adapter": "shell", "L4 plugin": "plug", "tooling": "app"}[layer]
        depchips = "".join('<code>%s</code>' % d for d in deps) or '<span class="ln">no dependencies</span>'
        cards.append(
          '<div class="pkg"><div class="pkg-h"><code>%s</code>'
          '<span class="lay %s">%s</span><span class="pri pri-%s">%s</span>'
          '<span class="sz">%s</span></div>'
          '<div class="pkg-b">%s'
          '<div class="why"><b>Why its own package:</b> %s</div>'
          '<div class="lu" style="margin-top:.45rem">%s</div></div></div>' % (
            name, laykey, layer, pri, pri, size, what, why, depchips))
    return '<div class="pkgs">%s</div>' % "".join(cards)


# --------------------------------------------------------------- rendering decision
def fig_render():
    opts = [
      ("DOM with node recycling", "adopt", {
        "Cost": "Highest per-cell cost of the three; recycling and anchoring are real engineering.",
        "Ceiling": "~100,000 rows comfortably with both axes windowed. Above that, the server owns the set.",
        "Accessibility": "<b>Native.</b> Every cell is a real element in the accessibility tree, focusable, announceable, findable by browser find-in-page.",
        "Print": "Native. The same DOM prints.",
        "Verdict": "<b>The only option compatible with an all-day clinical surface under WCAG&nbsp;2.2&nbsp;AA.</b> The engineering cost is the price of the accessibility.",
      }),
      ("Canvas", "reject", {
        "Cost": "Lowest. Flat memory whether 100 rows or 10 million; Glide proves it.",
        "Ceiling": "Effectively unbounded.",
        "Accessibility": "<b>Disqualifying.</b> Every cell is outside the accessibility tree by construction. What exists in canvas grids is a bolted-on overlay that duplicates a subset.",
        "Print": "A bitmap. Reference ranges and status words become pixels.",
        "Verdict": "Reject — <b>and write the rejection down</b>, because someone will propose it again the first time a scroll benchmark disappoints. Glide's history is still worth reading: they left DOM virtualisation because of per-frame node churn, which is exactly why we specify recycling.",
      }),
      ("Web Components / shadow DOM", "partial", {
        "Cost": "Moderate. One renderer, every framework, and React&nbsp;19 finally passes properties rather than stringifying them.",
        "Ceiling": "Same as DOM.",
        "Accessibility": "Good, but shadow roots complicate <code>aria-*</code> references across boundaries and <code>::part</code> is a narrow styling contract.",
        "Print": "Native.",
        "Verdict": "<b>Adopt for the vanilla adapter only, in light DOM.</b> Shadow DOM would cut the token cascade and break forced-colors inheritance — which is exactly where our status system lives.",
      }),
    ]
    out = []
    for name, verdict, rows in opts:
        dl = "".join("<dt>%s</dt><dd>%s</dd>" % (k, v) for k, v in rows.items())
        out.append('<div class="dec"><div class="dec-h"><b>%s</b>'
                   '<span class="dec-v %s">%s</span></div>'
                   '<div class="dec-b"><dl>%s</dl></div></div>' % (
                     name, verdict, {"adopt": "adopt", "reject": "reject", "partial": "partial"}[verdict], dl))
    return "".join(out)


# --------------------------------------------------------------- plugin hooks
def fig_hooks():
    rows = "".join(
      '<tr><td class="nw"><code>%s</code></td><td class="nw t3 xs">%s</td><td>%s</td><td class="t3">%s</td></tr>' % h
      for h in d_arch.HOOKS)
    return ('<div class="tblwrap"><table class="dtbl">'
            '<thead><tr><th style="width:16%%">Hook</th><th class="nw">When</th>'
            '<th style="width:34%%">What it may do</th><th>Why it is bounded this way</th></tr></thead>'
            '<tbody>%s</tbody></table></div>') % rows


# --------------------------------------------------------------- data flow
def fig_flow():
    steps = [
      ("view", "The resolved <code>GridView</code> — product default, then organisation, role, team, personal, session. Pure data; no framework has been involved yet."),
      ("query", "<code>toQuery(view)</code> produces a <code>GridQuery</code>: filter tree, sort keys, group keys, page cursor, search scopes. <b>This value is the cache key, the URL and the export header.</b>"),
      ("plugins", "<code>onQuery</code> hooks amend it in registration order. The composed result is logged so a surprising query is explicable."),
      ("source", "Client model evaluates in memory; server model issues one request with an <code>AbortSignal</code>; the FHIR source follows <code>link.next</code> and never builds its own URL."),
      ("page", "<code>GridPage</code> comes back: rows, <code>total | \"unknown\"</code>, cursor, and <b>coverage</b> — which the server owns, because the server is what knows a source timed out."),
      ("model", "Row model assembles: grouping, tree, aggregation with unit refusal, selection re-resolution against the predicate."),
      ("policy", "The disclosure policy is evaluated per row × column. Columns disappear, cells mask, rows restrict. <b>This happens before rendering, and a masked value must never have been in the payload.</b>"),
      ("geometry", "The virtualiser computes the window from measured, cached heights and the scroll anchor. Still no DOM."),
      ("render", "<code>grid-dom</code> patches the recycled nodes, moves the roving <code>tabindex</code>, updates <code>aria-rowindex</code>, and announces into the live region."),
      ("adapter", "The framework adapter has done nothing except own the mount point and marshal cell renderers. <b>If it did more, the architecture has failed.</b>"),
    ]
    out = []
    for i, (k, v) in enumerate(steps):
        if i:
            out.append('<div class="farrow">↓</div>')
        out.append('<div class="fstep"><div class="fk">%s</div><div class="fv">%s</div></div>' % (k, v))
    return '<div class="flow">%s</div>' % "".join(out)


# --------------------------------------------------------------- budgets
def fig_budgets():
    rows = []
    for r in d_arch.BUDGETS:
        warn = ' class="warnrow"' if "not offered" in r[7] else ""
        rows.append('<tr%s><td class="mono2"><b>%s</b></td><td>%s</td><td class="mono2">%s</td>'
                    '<td class="mono2">%s</td><td class="mono2">%s</td><td class="mono2">%s</td>'
                    '<td class="mono2">%s</td><td>%s</td></tr>' % ((warn,) + r))
    rules = "".join("<li><b>%s</b> %s</li>" % (a, b) for a, b in d_arch.BUDGET_RULES)
    return ('<div class="tblwrap"><table class="bud">'
            '<thead><tr><th>Rows</th><th>Mode</th><th>First paint</th><th>Sort</th>'
            '<th>Filter key</th><th>Scroll</th><th>JS heap</th><th>Note</th></tr></thead>'
            '<tbody>%s</tbody></table></div>'
            '<div class="prose"><ol class="claims">%s</ol></div>') % ("".join(rows), rules)


# --------------------------------------------------------------- scorecard
def fig_score():
    rows = []
    tw = sum(s[3] for s in d_plan.SCORE)
    cur = sum(s[1] * s[3] for s in d_plan.SCORE) / tw
    new = sum(s[2] * s[3] for s in d_plan.SCORE) / tw
    for name, was, now, w, note in d_plan.SCORE:
        rows.append(
          '<div class="scrow"><div class="sn">%s<div style="font-size:.74rem;color:var(--muted);line-height:1.5">%s</div></div>'
          '<div class="scbar"><span class="now" style="width:%d%%"></span>'
          '<span class="was" style="width:%d%%"></span></div>'
          '<div class="sv">%d → <b>%d</b></div></div>' % (name, note, now * 10, was * 10, was, now))
    return ('<div class="scorecard">%s</div>'
            '<div class="sckey"><span><i style="background:color-mix(in oklab,var(--muted) 30%%,transparent)"></i>'
            'the brief as written</span><span><i style="background:var(--accent)"></i>this proposal</span>'
            '<span style="margin-inline-start:auto;font-family:var(--font-mono)">weighted: '
            '<b style="color:var(--ink)">%.1f</b> → <b style="color:var(--accent-ink)">%.1f</b> / 10</span></div>') % (
      "".join(rows), cur, new)


# --------------------------------------------------------------- classification
def fig_classes():
    out = []
    for cls, label, blurb in [
      ("P0", "P0 — without these it is not a credible product",
       "Type-system and DOM-structure decisions. Every one of them is expensive or impossible to retrofit."),
      ("P1", "P1 — the difference between a component and a library",
       "Everything a team evaluating against AG Grid will check."),
      ("P2", "P2 — bets and breadth",
       "Separately cancellable. None is on the critical path."),
      ("future", "Future — revisit on evidence", ""),
      ("never", "Never — and here is why", ""),
    ]:
        items = [c for c in d_plan.CLASSES if c[1] == cls]
        if not items:
            continue
        lis = "".join(
          '<li><b>%s</b>%s</li>' % (n, (" — " + why) if why else "")
          for n, _c, why, _w in items)
        out.append('<div class="eng"><div class="eng-h"><span class="pri pri-%s">%s</span><b>%s</b>'
                   '<span style="flex:1 1 auto"></span><span class="st">%d items</span></div>'
                   '<div class="eng-b">%s<ul style="margin:.3rem 0 0;padding-inline-start:1.1rem">%s</ul></div></div>' % (
                     cls, cls, label, len(items),
                     ('<p style="margin:0 0 .5rem;color:var(--muted);font-size:.83rem">%s</p>' % blurb) if blurb else "",
                     lis))
    return "".join(out)
