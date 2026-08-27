# -*- coding: utf-8 -*-
"""Mockups C — the states a demo skips, plus density, keyboard and mobile."""
from mocklib import *
from mocks_a import ROSTER, roster_row

# ------------------------------------------------------------ 11. loading
def fig_loading():
    head = (th("Patient",None,width="228px") + th("Clinical status",None,width="140px") +
            th("Problem list",None,width="180px") + th("Last seen",None,width="98px",cls="r") +
            th("Risk",None,width="118px"))
    def skrow(i):
        return ('<tr><td><div class="idc"><span class="a-avatar" style="background:var(--sunken);border-color:var(--line)"></span>'
                '<div class="who" style="flex:1 1 auto"><span class="sk2 w70"></span><span class="sk2 h6 w55"></span></div></div></td>'
                '<td><span class="sk2 w70"></span></td><td><span class="sk2 w85"></span></td>'
                '<td class="r"><span class="sk2 w40" style="margin-inline-start:auto"></span></td>'
                '<td><span class="sk2 w55"></span></td></tr>')
    rows = "".join(skrow(i) for i in range(6))
    a = dg("dg-load-a", head, rows, scroll="",
           bar=bar('<div class="srch">%s<span class="t3">Search this list</span></div>' % ic("search","i i-14"),
                   '<span style="flex:1 1 auto"></span>', '<span class="t3 sm">Loading…</span>'),
           coverage=cov('The coverage sentence is <b>rendered before the rows are</b>, because what the query is reaching '
                        'is known before what it returns. A skeleton that hides it teaches the reader to ignore it.'))
    # loading more
    rows2 = "".join(roster_row(r, i, show_cb=False) for i, r in enumerate(ROSTER[:4]))
    more = ('<tr><td colspan="5" style="padding:12px;text-align:center">'
            '<span class="row" style="justify-content:center;gap:8px;color:var(--ink-3);font-size:12px">'
            '<span class="sk2 w25" style="width:90px"></span> loading rows 41–80 of 1,284</span></td></tr>')
    b = dg("dg-load-b", head, rows2 + more, scroll="",
           foot='<div class="dg-foot"><span>40 of 1,284 loaded · scrolling fetches the next window</span>'
                '<span class="t3">cursor: <code>eyJvIjo0MH0</code></span></div>')
    return ('<div class="g2" style="gap:14px;align-items:start">'
            '<div><div class="denscap"><b>Initial load</b><span>skeleton, six rows</span></div>%s</div>'
            '<div><div class="denscap"><b>Loading more</b><span>windowed fetch, cursor-paged</span></div>%s</div></div>') % (a, b)


# ------------------------------------------------------------ 12. empty states
EMPTIES = [
 ("No record", "note", "",
  "Nobody has been added to this list yet.",
  "Every source answered and every source returned nothing. This is a fact about the population."),
 ("None in this window", "cal", "",
  "No one matched between 1 Jul and 27 Aug 2026.",
  "The set is not empty — the window is. Widening the date range is the obvious next action, so it is the button."),
 ("No search results", "search", "",
  "Nothing matches “okonkwo j”.",
  "Search is exact on identifiers and fuzzy on names. “okonkwo” alone returns one person."),
 ("No filter results", "filter", "warn",
  "No rows match this query.",
  "Four filters are active, one of them set 6 days ago. The predicate is shown in full so the reader can see what they asked for."),
 ("Permission restricted", "lock", "rest",
  "3 people match, and you may not see them.",
  "The count is disclosed; the rows are not. Hiding the count would let a filter be used to probe who exists."),
 ("Partial failure", "alert", "err",
  "Showing 812 of an unknown total.",
  "The regional exchange did not answer. This is an alert, not a footnote, because the reader is about to treat an absence as a fact."),
]


def fig_empty():
    cards = []
    for title, icon, kind, h5, p in EMPTIES:
        acts = {
          "No record": [("Add someone","plus","primary")],
          "None in this window": [("Widen to 12 months","cal","primary"),("Clear window","x","")],
          "No search results": [("Search all patients","search","primary")],
          "No filter results": [("Clear all filters","x","primary"),("Save as an alert","save","")],
          "Permission restricted": [("Request access","shield","primary")],
          "Partial failure": [("Retry the exchange","refresh","primary"),("Continue without it","arrowr","")],
        }[title]
        pred = ('<div class="predicate" style="margin-top:6px;text-align:start;background:var(--sunken);'
                'border:1px solid var(--line);border-radius:var(--r-xs);padding:6px 8px">'
                '<span class="f">Programme = Behavioural Health</span> <span class="op">AND</span> '
                '<span class="f">Risk = High</span> <span class="op">AND</span> '
                '<span class="f">Last seen &gt; 30 days</span> <span class="op">AND</span> '
                '<span class="f">Assigned clinician = me</span></div>') if title == "No filter results" else ""
        cards.append(
          '<div class="dg standard"><div class="dg-msg %s"><span class="glyph">%s</span>'
          '<h5>%s</h5><p>%s</p>%s<div class="acts">%s</div></div>'
          '<div class="covbar">%s<div>%s</div></div></div>' % (
            kind, ic(icon,"i i-20"), h5, p, pred,
            "".join(btn(l, i2, k) for l, i2, k in acts),
            ic("info","i i-14 ic"),
            {"No record":"Sources: Riverside EHR · all reached.",
             "None in this window":"Window: 1 Jul – 27 Aug 2026. 1,284 people exist outside it.",
             "No search results":"Searched: name, preferred name, MRN, NHS number. Not searched: free text.",
             "No filter results":"1,284 rows before filtering. Filters were set 6 days ago and restored with this view.",
             "Permission restricted":"3 records are restricted to their own care team. Break-glass is available and is logged.",
             "Partial failure":"<b>Regional exchange could not be reached</b> — 812 rows are from Riverside EHR only."}[title]))
    return ('<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(268px,1fr));gap:13px">%s</div>'
            '<div class="hint2" style="margin-top:12px">%s<span>Six sentences, not one “No data” card. '
            'The difference between <b>nobody matched</b>, <b>nobody matched here</b>, and <b>you may not see who matched</b> '
            'is the difference between three different next actions.</span></div>') % (
      "".join('<div><div class="denscap" style="margin-bottom:6px"><b>%s</b></div>%s</div>' % (t, c)
              for c, (t, *_ ) in zip(cards, EMPTIES)), ic("info","i i-14"))


# ------------------------------------------------------------ 13. live / arrivals
ARRIVE = [
 ("a1","Amara Nwosu","AR-42410","b3","Bed 4-12","Admitted 09:22","New"),
 ("a2","Sam Petrov","AR-42411","b4","Bed 4-07","Admitted 09:31","New"),
]


def fig_live():
    head = ('<th class="c" style="width:32px"></th>' +
            th("Patient","name",pinned=True,width="212px") +
            th("Location","loc",width="112px") +
            th("Status","st",width="152px") +
            th("Waiting","wait",kind="num",width="104px",cls="r",dir="desc") +
            th("Owner","own",width="132px"))
    base = [
      ("l1","Chen Wei","AR-41880","b1","Bed 4-02","Awaiting bed","3h 12m","Dr Haddad","over"),
      ("l2","Femi Adeyemi","AR-41902","b2","Bed 4-05","Discharge ready","1h 48m","Dr Osei","soon"),
      ("l3","Rosa Delgado","AR-41955","b5","Triage 2","Awaiting review","0h 51m","Charge nurse","fine"),
      ("l4","Ivan Petrenko","AR-42001","b3","Bed 4-09","Observation","0h 22m","Dr Osei","fine"),
    ]
    rows = "".join(
      '<tr data-id="%s" data-name="%s" data-i="%d" data-abs="%d"><td class="c">%s</td>'
      '<td class="pinned edge">%s</td><td class="mono t2">%s</td><td>%s</td>'
      '<td class="r" data-v="%d"><span class="clk %s">%s</span></td><td class="t2">%s</td></tr>' % (
        i2, nm, i, i+1, cbx(), ident(nm, mrn, None, tone=tone), loc,
        status(st, "warn" if "Awaiting" in st else "ok", "gl-hex" if "Awaiting" in st else "gl-dot"),
        int(w.split("h")[0])*60 + int(w.split(" ")[1].rstrip("m")), k, w, own)
      for i, (i2, nm, mrn, tone, loc, st, w, own, k) in enumerate(base))
    tpl = ('<template data-arrivaltpl><tr class="fresh" data-id="new" data-name="Amara Nwosu" data-i="99">'
           '<td class="c">%s</td><td class="pinned edge">%s</td><td class="mono t2">Bed 4-12</td>'
           '<td>%s</td><td class="r" data-v="1"><span class="clk fine">0h 01m</span></td>'
           '<td class="t2">Unassigned</td></tr></template>') % (
      cbx(), ident("Amara Nwosu","AR-42410",None,tone="b3"), status("New admission","info","gl-sq"))
    arr = ('<div class="arrivals" data-arrivals style="display:none" data-act="flush" role="button" tabindex="0">'
           '<span class="pulse"></span><span data-arrcount>1 new admission</span>'
           '<span class="t3">— click to insert, or press <span class="k2">Alt</span>+<span class="k2">N</span></span></div>')
    bar_ = bar('<span class="lbl">Ward 4 · live</span>',
               '<span class="t3 sm row" style="gap:5px">%s Connected · last event 4s ago</span>' % ic("wifi","i i-14"),
               '<span style="flex:1 1 auto"></span>',
               btn("Simulate an admission","plus","primary",act="arrive"))
    grid = dg("dg-live", head, rows + tpl, bar=bar_, extra_top=arr, scroll="", total="4",
              coverage=cov('Live since 09:04. <b>Sort is frozen while a pointer or keyboard focus is inside the grid</b> — '
                           'arriving rows queue above rather than inserting under your hand. That is the whole reason '
                           'the arrivals strip exists.'))
    stale = ('<div class="a-alert warning" style="margin-top:12px;font-size:12.5px"><span>%s</span><span>'
             '<b>The other half of the same rule.</b> If the connection drops, the grid does not keep looking live: '
             'the header gains <em>“last updated 09:41 — reconnecting”</em>, and a row older than the staleness '
             'budget renders its timestamp instead of its relative time. A worklist that says <em>2 minutes ago</em> '
             'for forty minutes is worse than one that says nothing.</span></div>') % ic("alert","i ic")
    return grid + stale + liveout("aria-live")


# ------------------------------------------------------------ 14. masking / break-glass
def fig_masking():
    head = (th("Patient",None,pinned=True,width="216px") + th("Programme",None,width="146px") +
            th("Diagnosis",None,width="176px") + th("Medication",None,width="176px") +
            th("Notes",None,width="112px"))
    rows = []
    data = [
      ("Aisha Bello","AR-40182","b1","Behavioural Health","Recurrent depression","Sertraline 100 mg","open","4 notes"),
      ("Daniel Okonkwo","AR-40915","b2","SUD — Part 2","","","part2","—"),
      ("Priya Raman","AR-42311","b1","Early Intervention","First-episode psychosis","Aripiprazole 10 mg","open","2 notes"),
      ("Rosa Delgado","AR-41955","b5","Behavioural Health","","","restricted","—"),
      ("Kai Tanaka","AR-40771","b4","Adolescent — minor consent","Generalised anxiety","Masked","minor","1 note"),
    ]
    for i, (nm, mrn, tone, prog, dx, med, mode, notes) in enumerate(data):
        if mode == "part2":
            cells = ('<td colspan="3"><span class="masked">%s Substance-use record — 42 CFR Part 2. '
                     'Disclosure requires the patient&rsquo;s written consent.</span></td>'
                     '<td><span class="absent">—</span></td>') % ic("lock","i i-14")
            cls = ' class="restricted"'
        elif mode == "restricted":
            cells = ('<td colspan="3"><span class="masked">%s Restricted to the treating team. '
                     '<a href="#" style="color:inherit;text-decoration:underline">Break glass</a> — you will be asked why, '
                     'and the patient can see who looked.</span></td>'
                     '<td><span class="absent">—</span></td>') % ic("shield","i i-14")
            cls = ' class="restricted"'
        elif mode == "minor":
            cells = ('<td>%s</td><td><span class="masked">%s Withheld under minor-consent rules</span></td>'
                     '<td class="t2">%s</td>') % (dx, ic("eyeoff","i i-14"), notes)
            cells = '<td>%s</td>%s' % (dx, '<td><span class="masked">%s Withheld under minor-consent rules</span></td><td class="t2">%s</td>' % (ic("eyeoff","i i-14"), notes))
            cls = ""
        else:
            cells = '<td>%s</td><td>%s</td><td class="t2">%s</td>' % (dx, med, notes)
            cls = ""
        rows.append('<tr%s data-id="m%d" data-name="%s" data-i="%d"><td class="pinned edge rail %s">%s</td>'
                    '<td><span class="a-tag %s">%s</span></td>%s</tr>' % (
          cls, i, nm, i, "rest" if mode in ("part2","restricted") else "none",
          ident(nm, mrn, None, tone=tone),
          "purple" if "Part 2" in prog else "blue", prog, cells))
    grid = dg("dg-mask", head, "".join(rows), scroll="", total="5",
              bar=bar('<span class="lbl">Programme roster · viewing as</span>',
                      '<span class="a-tag blue">Care navigator</span>',
                      '<span class="t3 sm">— a role without treatment relationships</span>',
                      '<span style="flex:1 1 auto"></span>',
                      '<span class="t3 sm">2 rows masked · 1 column withheld</span>'),
              coverage=cov('<b>5 of 5 rows are shown and 2 of them are masked.</b> Masking a row is not the same as '
                           'omitting it: a filter that could make restricted people disappear would let anyone probe '
                           'for their existence by elimination. The count is always disclosed; the content is not.',
                           sources=[("Riverside EHR",""),("Consent registry",""),("Part 2 segment","partial")]))
    bg = ('<div class="a-card" style="max-width:none;margin-top:13px">'
          '<div class="a-card-head"><div><div class="a-card-title">Break the glass on Rosa Delgado&rsquo;s record?</div>'
          '<div class="a-card-sub">You do not have a treatment relationship with this person.</div></div>%s</div>'
          '<div class="a-card-body"><div class="col" style="gap:9px">'
          '<div><span class="lbl">Reason — required, free text is not enough</span>'
          '<div class="row wrap" style="gap:5px;margin-top:6px">%s</div></div>'
          '<div class="a-alert warning" style="font-size:12.5px"><span>%s</span><span>'
          'This is recorded with your name, the reason, the rows you opened and the time. '
          '<b>The patient may request that log.</b> Access expires after 8 hours.</span></div>'
          '<div class="hint2">%s<span>The component renders the prompt, emits the event and shows the outcome. '
          '<b>It does not decide.</b> A client-side break-glass that reveals data the server already sent is theatre — '
          'the masked value must never be in the payload.</span></div></div></div>'
          '<div class="a-card-foot"><span class="t3 xs">Emits <code>onDisclosure({ kind: "break-glass", subject, reason })</code></span>'
          '<span class="row" style="gap:6px">%s%s</span></div></div>') % (
      status("Audited","rest","gl-lock"),
      "".join('<button class="a-btn sm%s" type="button">%s</button>' % (" on" if i == 1 else "", r)
              for i, r in enumerate(["Emergency care","Covering clinician","Care coordination","Patient request"])),
      ic("alert","i ic"), ic("info","i i-14"), btn("Cancel"), btn("Break glass","shield","primary"))
    return grid + bg


# ------------------------------------------------------------ 15. density
def fig_density():
    head = (th("Patient",None,width="132px") + th("Status",None,width="108px") +
            th("Seen",None,width="58px",cls="r"))
    rows = "".join(
      '<tr data-i="%d"><td>%s</td><td>%s</td><td class="r"><span class="clk fine">%s</span></td></tr>' % (
        i, ident(nm, mrn, dob, tone=tone), status(st[0], st[1], st[2]), seen)
      for i, (pid, nm, mrn, dob, tone, dis, dx, st, seen, prov, risk, tags) in enumerate(ROSTER[:6]))
    cards = []
    for cls, name, note, rowh in [
      ("comfortable","Comfortable","Patient-facing, tablet, low-volume review","52px"),
      ("standard","Standard","The default. Chart lists, most worklists","40px"),
      ("compact","Compact","Work queues a clinician lives in all day","32px"),
      ("ultra","Ultra-dense","Operational displays, census boards, claims","26px"),
    ]:
        cards.append('<div><div class="denscap"><b>%s</b><span class="mono">%s</span></div>'
                     '<div class="dg %s">%s</div>'
                     '<p class="t3 xs" style="margin:6px 0 0">%s</p></div>' % (
          name, rowh, cls,
          '<div class="dg-scroll"><table class="dgt"><thead><tr>%s</tr></thead><tbody>%s</tbody></table></div>' % (head, rows),
          note))
    note = ('<div class="a-alert" style="margin-top:13px;font-size:12.5px"><span>%s</span><span>'
            '<b>Ultra-dense drops the secondary identifier line and moves the MRN inline</b> rather than shrinking the type. '
            'Type below 12px fails at 200%% zoom on the workstations these grids actually run on, and a density that '
            'breaks the contrast floor or the 24px pointer-target floor is not offered — it is removed from the control, '
            'not merely discouraged.</span></div>') % ic("info","i ic")
    return ('<div data-scope><div class="row" style="gap:6px;margin-bottom:11px">'
            '<span class="lbl" style="margin-inline-end:4px">Try it</span>%s</div>'
            '<div class="denscols">%s</div>%s%s</div>') % (
      "".join('<button class="qfp%s" type="button" data-act="density" data-d="%s" aria-pressed="%s">%s</button>' % (
        " on" if c == "standard" else "", c, "true" if c == "standard" else "false", n)
        for c, n in [("comfortable","Comfortable"),("standard","Standard"),("compact","Compact"),("ultra","Ultra-dense")]),
      "".join(cards), note, liveout("aria-live"))


# ------------------------------------------------------------ 16. keyboard
def fig_keyboard():
    head = ('<th class="c" style="width:32px"></th>' + th("Patient","name",width="204px") +
            th("Status","st",width="140px") + th("Last seen","seen",kind="num",width="104px",cls="r") +
            th("Risk","risk",width="112px"))
    rows = "".join(
      '<tr data-id="k%d" data-name="%s" data-i="%d" data-abs="%d"><td class="c">%s</td>'
      '<td data-read="%s, MRN %s">%s</td><td data-read="%s">%s</td>'
      '<td class="r" data-read="%s">%s</td><td data-read="%s">%s</td></tr>' % (
        i, nm, i, 19995 + i, cbx(), nm, mrn, ident(nm, mrn, None, tone=tone),
        st[0], status(st[0], st[1], st[2]), seen, seen, risk[0],
        status(risk[0], {"Low":"ok","Moderate":"cau","High":"crit","Not scored":"unk"}[risk[0]], "gl-dot"))
      for i, (pid, nm, mrn, dob, tone, dis, dx, st, seen, prov, risk, tags) in enumerate(ROSTER[:5]))
    grid = dg("dg-kbd", head, rows, scroll="", total="40,000", cellfocus=True,
              bar=bar('<span class="lbl">Click a cell, then use the arrow keys</span>',
                      '<span style="flex:1 1 auto"></span>',
                      '<span class="t3 sm">rows 19,995–19,999 of 40,000</span>'),
              coverage=cov('<b>The whole grid body is one tab stop.</b> A tab stop per cell would be 800 presses to '
                           'leave a 40&times;20 grid. Inside it, a roving <code>tabindex</code> moves one cell at a '
                           'time, and <code>aria-rowindex</code> is the <em>absolute</em> row number — the mistake '
                           'that makes a virtualised grid announce &ldquo;row 1 of 20&rdquo; forever.'))
    return grid + liveout("what the screen reader announces")


# ------------------------------------------------------------ 17. mobile
def fig_mobile():
    cards = []
    for pid, nm, mrn, dob, tone, dis, dx, st, seen, prov, risk, tags in ROSTER[:5]:
        cards.append(
          '<article class="pcard"><div class="top">%s<div class="grow" style="min-width:0">'
          '<div class="b" style="font-size:13.5px">%s%s</div>'
          '<div class="xs t3 mono">MRN %s · %s</div></div>%s</div>'
          '<div class="facts"><span><b>Last seen</b> %s</span><span><b>Risk</b> %s</span></div>'
          '<div class="row" style="gap:4px;flex-wrap:wrap">%s</div>'
          '<div class="cta">%s%s</div></article>' % (
            av("".join(x[0] for x in nm.split()[:2]).upper(), tone),
            nm, ' <span class="disamb">%s</span>' % dis if dis else "",
            mrn, dob, status(st[0], st[1], st[2]),
            seen, risk[0],
            "".join('<span class="a-tag %s">%s</span>' % (t[1], t[0]) for t in dx[:2]) +
            ('<span class="more">+%d</span>' % (len(dx)-2) if len(dx) > 2 else ""),
            btn("Open chart","arrowr","primary"), btn("Call","route")))
    phone = ('<div class="mob"><div class="mob-top"><i></i></div>'
             '<div style="padding:8px 9px 0;background:var(--surface);border-bottom:1px solid var(--line)">'
             '<div class="row" style="gap:6px;margin-bottom:7px"><div class="srch" style="flex:1 1 auto">%s'
             '<span class="t3">Search</span></div>%s</div>'
             '<div class="row" style="gap:5px;overflow-x:auto;padding-bottom:7px">%s</div></div>'
             '<div class="mob-cards">%s</div>'
             '<div class="covbar" style="border-top:1px solid var(--line)">%s<div>8 of 1,284 · '
             '3 restricted</div></div></div>') % (
      ic("search","i i-14"), btn("","filter"),
      "".join('<span class="qfp%s">%s</span>' % (" on" if i == 0 else "", t)
              for i, t in enumerate(["Mine","High risk","Needs review","Overdue"])),
      "".join(cards), ic("info","i i-14 ic"))
    prio = ('<div class="a-card" style="max-width:none">'
            '<div class="a-card-head" style="padding:11px 13px"><div class="a-card-title" style="font-size:13px">'
            'Column priority — declared once, honoured everywhere</div></div>'
            '<div class="a-card-body" style="padding:11px 13px">'
            '<table class="dtbl tight" style="margin:0"><thead><tr><th>Column</th><th class="nw">Priority</th>'
            '<th>Desktop</th><th>Tablet</th><th>Phone</th></tr></thead><tbody>%s</tbody></table>'
            '<div class="hint2">%s<span>Priority is a property of the <em>column</em>, not of a breakpoint. '
            'The same declaration drives the responsive drop order, the print sheet, the export column order, '
            'and what survives into the card. One number, four consumers.</span></div>'
            "</div></div>") % (
      "".join('<tr><td><b>%s</b></td><td class="nw"><code>%s</code></td><td>%s</td><td>%s</td><td>%s</td></tr>' % (
        c, p, d, t, m)
        for c, p, d, t, m in [
          ("Patient","1 — identity","column","column","card title"),
          ("Clinical status","2","column","column","chip on the card"),
          ("Risk","3","column","column","fact line"),
          ("Last seen","4","column","column","fact line"),
          ("Problem list","5","column","chips, 2 + overflow","chips, 2 + overflow"),
          ("Assigned clinician","6","column","inspector","inspector"),
          ("Insurance","7","column","inspector","inspector"),
          ("Preferred language","8","hidden by default","inspector","inspector"),
        ]),
      ic("info","i i-14"))
    return ('<div class="g2" style="grid-template-columns:340px minmax(0,1fr);gap:16px;align-items:start">'
            '<div>%s</div><div>%s</div></div>') % (phone, prio)
