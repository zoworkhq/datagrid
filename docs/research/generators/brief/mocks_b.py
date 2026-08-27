# -*- coding: utf-8 -*-
"""Mockups B — working the grid: expansion, inspector, filters, bulk, views."""
from mocklib import *
from mocks_a import ROSTER, roster_row, RISK_KIND

# ------------------------------------------------- 5. expanded row
DETAIL = {
 "p2": dict(
   dx=[("Bipolar I disorder","blue"),("Opioid use disorder, moderate","blue"),("COPD","plain")],
   meds=[("Lithium carbonate","400 mg nightly","Level 0.94 mmol/L, 3 days ago","ok"),
         ("Buprenorphine/naloxone","16/4 mg daily","Last dispensed 14 days ago","warn"),
         ("Tiotropium","18 µg inhaled daily","","ok")],
   allergies=[("Penicillin","Anaphylaxis","high"),("No others recorded","","none")],
   team=[("Dr N. Osei","Psychiatrist","b1"),("R. Devi","Care manager","b3"),("—","Peer support: none assigned","b4")],
   notes=[("Session note","19 Aug 2026","Dr N. Osei","signed"),
          ("Crisis contact","3 Aug 2026","Night team","signed"),
          ("Session note","2 Aug 2026","Dr N. Osei","unsigned — 25 days")],
   next="None booked. Last attempt to contact was 24 Aug.",
   tasks=[("Prior authorisation renewal","due in 2 days"),("Confirm pharmacy transfer","overdue 4 days")],
 ),
}


def fig_expanded():
    head = (
      '<th style="width:30px"></th>' +
      th("Patient","name",pinned=True,width="228px") +
      th("Clinical status","status",width="146px") +
      th("Problem list",None,width="190px") +
      th("Last seen","seen",kind="num",width="98px",cls="r") +
      th("Risk","risk",width="120px")
    )
    rows = []
    for i, r in enumerate(ROSTER[:4]):
        pid, name, mrn, dob, tone, disamb, dx, st, seen, prov, risk, tags = r
        exp = ('<td class="c"><button class="a-btn text sm" type="button" data-act="expand" '
               'aria-expanded="%s" aria-label="Show detail for %s" style="%s">%s</button></td>') % (
            "true" if pid=="p2" else "false", name,
            "transform:rotate(90deg)" if pid=="p2" else "", ic("chev","i i-14"))
        railkind = {"ok":"ok","warn":"warn","cau":"warn","info":"info","unk":"none"}[st[1]]
        rows.append(
          '<tr data-id="%s" data-name="%s" data-i="%d" data-abs="%d">%s'
          '<td class="pinned edge rail %s">%s</td><td>%s</td><td>%s</td>'
          '<td class="r"><span class="clk %s">%s</span></td><td>%s</td></tr>' % (
            pid, name, i, i+1, exp, railkind, ident(name,mrn,dob,tone=tone,disamb=disamb),
            status(st[0],st[1],st[2]), chips(dx,2),
            "clk over" if "31" in seen or "48" in seen else "clk fine", seen,
            status(risk[0], RISK_KIND[risk[0]], "gl-tri" if risk[0]=="High" else "gl-dot")))
        if pid == "p2":
            d = DETAIL["p2"]
            panel = (
             '<td colspan="6" style="padding:0;background:var(--sunken)">'
             '<div style="padding:13px 15px;display:grid;grid-template-columns:repeat(auto-fit,minmax(214px,1fr));gap:15px">'
             # meds
             '<div class="insp-sec"><span class="k">Active medications (3)</span>%s</div>'
             # allergies
             '<div class="insp-sec"><span class="k">Allergies</span>%s</div>'
             # team
             '<div class="insp-sec"><span class="k">Care team</span>%s</div>'
             # documentation
             '<div class="insp-sec"><span class="k">Recent documentation</span>%s</div>'
             # next + tasks
             '<div class="insp-sec"><span class="k">Next appointment</span>'
             '<div class="a-alert warning" style="font-size:12px"><span>%s</span><span>%s</span></div>'
             '<span class="k" style="margin-top:11px">Open tasks (2)</span>%s</div>'
             "</div>"
             '<div class="covbar" style="border-top:1px solid var(--line)">%s<div>'
             'This panel shows <b>five of eleven</b> sections in the chart. It is a preview, not the record — '
             '<a href="#" style="color:var(--accent-ink)">open the chart</a> for medications history, results, imaging, '
             'consent and the disclosure log.</div></div>'
             "</td>") % (
              "".join('<div class="row" style="gap:7px;align-items:flex-start;margin-bottom:6px">'
                      '<i class="gl gl-%s" style="width:8px;height:8px;margin-top:5px;background:var(--%s)"></i>'
                      '<div><div class="sm b">%s</div><div class="xs t3">%s%s</div></div></div>' % (
                        "dot" if k=="ok" else "tri", "ok" if k=="ok" else "warn", n, s,
                        (" · " + extra) if extra else "")
                      for n, s, extra, k in d["meds"]),
              "".join(('<div class="row" style="gap:6px;margin-bottom:5px"><span class="sm b">%s</span>%s</div>' % (
                        n, status(rx, "crit", "gl-tri")))
                      if sev == "high" else
                      '<div class="xs t3" style="margin-bottom:5px">%s</div>' % n
                      for n, rx, sev in d["allergies"]),
              "".join('<div class="row" style="gap:7px;margin-bottom:6px">%s<div><div class="sm b">%s</div>'
                      '<div class="xs t3">%s</div></div></div>' % (
                        av("".join(x[0] for x in n.split()[:2]).upper() if n != "—" else "?", tone2, "sm"), n, role)
                      for n, role, tone2 in d["team"]),
              "".join('<div style="margin-bottom:6px"><div class="sm">%s <span class="t3 xs">%s</span></div>'
                      '<div class="xs %s">%s</div></div>' % (
                        t, when, "t3" if sg=="signed" else "", who + " · " + sg)
                      for t, when, who, sg in d["notes"]),
              ic("alert","i i-14 ic"), d["next"],
              "".join('<div class="row sm" style="gap:6px;margin-bottom:4px"><i class="gl gl-ring" '
                      'style="width:7px;height:7px;border:2px solid var(--%s);border-radius:50%%"></i>%s '
                      '<span class="xs t3">%s</span></div>' % (
                        "crit" if "overdue" in w else "warn", t, w)
                      for t, w in d["tasks"]),
              ic("info","i i-14 ic"))
            rows.append('<tr data-detail>%s</tr>' % panel)
    return dg("dg-expanded", head, "".join(rows), scroll="", total="4",
              coverage=cov('Expansion never leaves the list. The row keeps its position, its selection and its scroll offset, '
                           'and the URL gains <code>?row=AR-40915</code> so the expanded state is shareable and survives a reload.'))


# ------------------------------------------------- 6. inspector
INSPECT = [
 ("p1","Aisha Bello","AR-40182","b1","Stable","ok","gl-dot"),
 ("p2","Daniel Okonkwo","AR-40915","b2","High risk","warn","gl-tri"),
 ("p5","Tomas Lindqvist","AR-39544","b4","Monitoring due","cau","gl-hex"),
 ("p7","Grace Mwangi","AR-37765","b2","High risk","warn","gl-tri"),
 ("p8","Jonah Weiss","AR-40663","b3","Stable","ok","gl-dot"),
]

INSPECT_BODY = {
 "p2": [
   ("Why this person is here",
    '<div class="a-alert warning" style="font-size:12.5px"><span>%s</span><span>'
    '<b>31 days since last contact</b> on a programme whose protocol is fortnightly. '
    'Two outreach attempts, both unanswered.</span></div>' % ic("alert","i ic")),
   ("Identity", '<dl class="kv"><dt>MRN</dt><dd class="mono">AR-40915</dd>'
    '<dt>Date of birth</dt><dd>2 Sep 1971 · 54y</dd>'
    '<dt>Preferred name</dt><dd>Danny</dd><dt>Pronouns</dt><dd>he/him</dd>'
    '<dt>Language</dt><dd>English · interpreter not required</dd></dl>'),
   ("Alerts", '<div class="col" style="gap:5px">%s%s</div>' % (
     '<span class="cs cs-crit"><i class="gl gl-tri"></i>Penicillin — anaphylaxis</span>',
     '<span class="cs cs-warn"><i class="gl gl-hex"></i>Opioid use disorder — check PDMP before prescribing</span>')),
   ("Recent timeline",
    '<ul class="tl">%s</ul>' % "".join(
      '<li><div class="rail"><span class="node %s">%s</span><span class="line %s"></span></div>'
      '<div class="body"><div class="kind">%s</div><div class="ttl">%s</div>'
      '<div class="when">%s</div></div></li>' % (k, ic(i,"i i-14"), g, kd, t, w)
      for k, i, g, kd, t, w in [
        ("comms","route","","Outreach","Second call — no answer","24 Aug"),
        ("admin","note","gap","Administrative","Prior authorisation renewed to 12 Sep","14 Aug"),
        ("clinical","brain","","Encounter","Medication review · lithium 400 mg","2 Aug"),
      ])),
   ("Next", '<span class="absent">No appointment booked</span>'),
 ],
}


def fig_inspector():
    head = (th("Patient","name",width="182px") + th("Status","st",width="132px"))
    rows = "".join(
      '<tr data-id="%s" data-name="%s" data-i="%d" data-act="inspect"%s>'
      '<td>%s</td><td>%s</td></tr>' % (
        pid, nm, i, ' class="sel"' if pid=="p2" else "",
        ident(nm, mrn, None, tone=tone), status(st, k, g))
      for i, (pid, nm, mrn, tone, st, k, g) in enumerate(INSPECT))
    grid = dg("dg-insp", head, rows, scroll="h300", total="5",
              bar=bar('<span class="lbl">Caseload</span>','<span style="flex:1 1 auto"></span>',
                      '<span class="t3 xs">Selecting a row never navigates</span>'))
    panels = []
    for pid, nm, mrn, tone, st, k, g in INSPECT:
        secs = INSPECT_BODY.get(pid) or [
          ("Identity", '<dl class="kv"><dt>MRN</dt><dd class="mono">%s</dd></dl>' % mrn),
          ("Alerts", '<span class="absent">None recorded</span>'),
        ]
        panels.append(
          '<div data-ins="%s"%s><div class="insp-h">%s<div class="grow"><div class="b">%s</div>'
          '<div class="xs t3 mono">%s</div></div>%s</div>'
          '<div class="insp-b">%s</div>'
          '<div class="insp-f">%s%s%s</div></div>' % (
            pid, "" if pid=="p2" else ' style="display:none"',
            av("".join(x[0] for x in nm.split()[:2]).upper(), tone, "lg"), nm, "MRN " + mrn,
            status(st,k,g),
            "".join('<div class="insp-sec"><span class="k">%s</span>%s</div>' % (t, b) for t, b in secs),
            btn("Open chart","arrowr","primary"), btn("Add task","plus"), btn("Message","inbox")))
    return ('<div class="dg standard" style="overflow:hidden"><div class="insp-split">'
            '<div style="min-width:0">%s</div>'
            '<aside class="insp" data-inspector aria-label="Patient inspector">%s</aside>'
            "</div></div>%s") % (
      grid.replace('class="dg standard"', 'class="dg standard" style="border:0;border-radius:0;box-shadow:none"'),
      "".join(panels), liveout("aria-live"))


# ------------------------------------------------- 7. filter builder
def fbrow(field, op, value, join=None, fkey=None):
    j = '<span class="jn">%s</span>' % (join or "") if join is not None else '<span class="jn"></span>'
    return ('<div class="fb-row">%s'
            '<button class="fb-tok field" type="button" data-f="%s">%s%s</button>'
            '<button class="fb-tok op" type="button">%s</button>'
            '<button class="fb-tok value" type="button">%s%s</button>'
            '<button class="a-btn text sm" type="button" aria-label="Remove condition">%s</button>'
            "</div>") % (j, fkey or field, field, ic("chevd","i i-14"), op, value, ic("chevd","i i-14"),
                         ic("x","i i-14"))


def fig_builder():
    inner = ('<div class="fb-grp d2">'
             '<div class="ghead"><span class="jn"></span>'
             '<div class="andor"><button type="button" data-act="andor" data-j="and" aria-pressed="false">and</button>'
             '<button type="button" class="on" data-act="andor" data-j="or" aria-pressed="true">or</button></div>'
             '<span class="t3 xs">either of these counts as overdue</span></div>'
             "%s%s</div>") % (
      fbrow("Last encounter","is before","24 Jul 2026 (30 days ago)",fkey="lastEncounter"),
      fbrow("Next appointment","is","none booked","or",fkey="nextAppointment"))
    root = ('<div class="fb-grp" data-root>'
            '<div class="ghead">'
            '<div class="andor"><button type="button" class="on" data-act="andor" data-j="and" aria-pressed="true">and</button>'
            '<button type="button" data-act="andor" data-j="or" aria-pressed="false">or</button>'
            '<button type="button" data-act="andor" data-j="not" aria-pressed="false">not</button></div>'
            '<span class="t3 xs">all of these must be true</span>'
            '<span style="flex:1 1 auto"></span>'
            '<span class="t3 xs"><b data-astcount>4</b> conditions</span></div>'
            "%s%s%s"
            '<div class="fb-row"><span class="jn"></span>%s%s</div>'
            "</div>") % (
      fbrow("Programme","is","Behavioural Health",fkey="programme"),
      fbrow("Risk","is any of","High, Imminent",join="and",fkey="risk"),
      inner,
      btn("Add condition","plus"), btn("Add group","cols"))
    out = ('<div class="g2" style="gap:14px;align-items:start">'
           '<div>%s</div>'
           '<div class="col" style="gap:9px">'
           '<div><span class="lbl">The value this produces</span>'
           '<div class="fb-out" data-ast style="margin-top:5px"></div></div>'
           '<div><span class="lbl">The sentence it renders as</span>'
           '<div class="a-alert" style="margin-top:5px;font-size:12.5px"><span>%s</span>'
           '<span data-sentence></span></div></div>'
           '<div class="hint2">%s<span>Try the <b>or</b> / <b>and</b> toggles. The chips, the URL, the saved view, '
           'the export header and the natural-language bar all produce <em>this same tree</em> — there is one filter '
           'representation in the system, not five.</span></div>'
           "</div></div>") % (root, ic("filter","i ic"), ic("info","i i-14"))
    return '<div data-scope>%s</div>' % out


# ------------------------------------------------- 8. bulk selection
def fig_bulk():
    head = ('<th class="c" style="width:34px">%s</th>' % cbx(False,"Select all","selall").replace('class="cbx"','class="cbx" data-selall') +
            th("Patient","name",width="216px") + th("Programme",None,width="132px") +
            th("Assigned clinician","clin",width="156px") + th("Next appointment","next",width="146px"))
    data = [
      ("b1","Aisha Bello","AR-40182","b1","Behavioural Health","Dr N. Osei","31 Aug"),
      ("b2","Daniel Okonkwo","AR-40915","b2","Behavioural Health","Dr N. Osei","none booked"),
      ("b3","Tomas Lindqvist","AR-39544","b4","Behavioural Health","Dr N. Osei","2 Sep"),
      ("b4","Jonah Weiss","AR-40663","b3","Behavioural Health","Dr N. Osei","4 Sep"),
      ("b5","Priya Raman","AR-42311","b1","Early Intervention","Unassigned","28 Aug"),
      ("b6","Grace Mwangi","AR-37765","b5","Behavioural Health","Dr L. Haddad","none booked"),
    ]
    rows = "".join(
      '<tr data-id="%s" data-name="%s" data-i="%d" data-abs="%d"%s class="%s">'
      '<td class="c">%s</td><td>%s</td><td><span class="a-tag %s">%s</span></td>'
      '<td class="t2">%s</td><td>%s</td></tr>' % (
        i2, nm, i, i+1, ' aria-selected="true"' if i < 4 else "", "sel" if i < 4 else "",
        cbx(i < 4), ident(nm, mrn, None, tone=tone),
        "blue" if prog=="Behavioural Health" else "purple", prog, clin,
        nxt if nxt != "none booked" else '<span class="absent">none booked</span>')
      for i, (i2, nm, mrn, tone, prog, clin, nxt) in enumerate(data))
    selbar = ('<div class="selbar" data-selbar>'
              '<span class="cnt" data-selcount>4 patients</span>'
              '<span class="div"></span>%s%s%s%s'
              '<span style="flex:1 1 auto"></span>'
              '<button class="a-btn text sm" type="button" data-act="selclear">Clear</button></div>') % (
      btn("Reassign clinician","user","primary"), btn("Schedule follow-up","cal"),
      btn("Add task","plus"), btn("Export","download"))
    review = (
      '<div class="a-card" style="max-width:none;margin-top:14px;box-shadow:var(--e-2)">'
      '<div class="a-card-head"><div><div class="a-card-title">Reassign 4 patients to Dr L. Haddad?</div>'
      '<div class="a-card-sub">This changes who is clinically responsible. It is recorded against your account.</div></div>'
      "%s</div>"
      '<div class="a-card-body">'
      '<span class="lbl">The people this will affect</span>'
      '<div class="row wrap" style="gap:5px;margin:7px 0 12px" data-selnames></div>'
      '<div class="a-alert warning" style="font-size:12.5px"><span>%s</span><span>'
      '<b>One of these has changed since you selected it.</b> Tomas Lindqvist was reassigned to Dr Haddad by '
      'another user 40 seconds ago and is no longer in your selection&rsquo;s predicate. '
      'Reassigning again is a no-op; it is listed so that the count you confirm is the count that happens.</span></div>'
      '<div class="hint2">%s<span>The selection travels as <code>{ predicate, includedIds, excludedIds }</code> — '
      'never as &ldquo;the checkboxes that were ticked&rdquo;. That is what makes this check possible at all.</span></div>'
      "</div>"
      '<div class="a-card-foot"><span class="t3 xs">Reason for change is required for a clinical reassignment.</span>'
      '<span class="row" style="gap:6px">%s%s</span></div></div>') % (
      status("Requires confirmation","cau","gl-hex"), ic("alert","i ic"), ic("info","i i-14"),
      btn("Cancel"), btn("Reassign 3, skip 1","check","primary"))
    grid = dg("dg-bulk", head, rows, extra_top=selbar, scroll="", total="6")
    return '<div data-scope>%s%s%s</div>' % (grid, review, liveout("aria-live"))


# ------------------------------------------------- 9. saved views
VIEWS = [
 ("v1","My high-risk caseload","personal", True, dict(
   filters=["mine","highrisk"], sort=["risk","desc"], density="standard",
   meta='<span class="t3 xs">2 filters · sorted by risk · 6 columns · standard density · pinned: Patient</span>')),
 ("v2","Needs review this week","team", False, dict(
   filters=["review"], sort=["seen","desc"], density="compact",
   meta='<span class="t3 xs">1 filter · sorted by last seen · 6 columns · compact density</span>')),
 ("v3","Unassigned intakes","organisation", False, dict(
   filters=["unassigned"], sort=["seen","asc"], density="standard",
   meta='<span class="t3 xs">1 filter · oldest first · 6 columns · standard density</span>')),
 ("v4","Everyone (default)","default", False, dict(
   filters=[], sort=["name","asc"], density="standard",
   meta='<span class="t3 xs">no filters · alphabetical · the product default</span>')),
]


def fig_views():
    head = ('<th class="c" style="width:32px"></th>' +
            th("Patient","name",pinned=True,width="216px") +
            th("Clinical status","status",width="140px") +
            th("Problem list",None,width="176px") +
            th("Last seen","seen",kind="num",width="96px",cls="r") +
            th("Risk","risk",width="118px"))
    rows = "".join(roster_row(r, i, show_cb=True) for i, r in enumerate(ROSTER))
    grid = dg("dg-views", head, rows, scroll="h240", total="1,284",
              coverage=cov('A view restores filters, sort, columns, widths, density, grouping and pinning — and '
                           '<b>nothing about the data</b>. Restoring a view never shows you a cached row.'))
    side = ('<div class="a-card" style="max-width:none">'
            '<div class="a-card-head" style="padding:11px 13px"><div class="a-card-title" style="font-size:13px">Views</div>%s</div>'
            '<div class="a-card-body" style="padding:7px"><div class="views">%s</div></div>'
            '<div class="a-card-foot" style="padding:8px 13px"><span data-viewmeta>%s</span></div></div>') % (
      btn("Save current","save","sm"),
      "".join('<div class="vrow%s" data-act="view" data-name="%s" data-cfg=\'%s\' role="button" tabindex="0">'
              '%s<span>%s</span><span class="scope">%s</span></div>' % (
                " on" if on else "", nm, jd(cfg).replace("&quot;",'"'),
                '<span class="star">%s</span>' % ic("star","i i-14") if scope=="personal" else
                '<span style="width:14px"></span>',
                nm, scope)
              for vid, nm, scope, on, cfg in VIEWS),
      VIEWS[0][4]["meta"])
    return ('<div data-scope class="g2" style="grid-template-columns:minmax(0,1fr) 264px;gap:14px;align-items:start">'
            '<div>%s</div><div>%s</div></div>%s') % (grid, side, liveout("aria-live"))


# ------------------------------------------------- 10. column panel
COLS = [
 ("Patient","name",True,True,True),
 ("Clinical status","status",True,False,False),
 ("Problem list","dx",True,False,False),
 ("Last seen","seen",True,False,False),
 ("Risk","risk",True,False,False),
 ("Assigned clinician","clin",False,False,False),
 ("Programme","prog",False,False,False),
 ("Insurance","ins",False,False,False),
 ("Next appointment","next",False,False,False),
 ("Preferred language","lang",False,False,False),
]


def fig_columns():
    head = ('<th class="c" style="width:32px"></th>' +
            th("Patient","name",pinned=True,width="216px",col="name") +
            th("Clinical status","status",width="140px",col="status") +
            th("Problem list",None,width="176px",col="dx") +
            th("Last seen","seen",kind="num",width="96px",cls="r",col="seen") +
            th("Risk","risk",width="118px",col="risk"))
    rows = "".join(roster_row(r, i, show_cb=True) for i, r in enumerate(ROSTER[:5]))
    grid = dg("dg-cols", head, rows, scroll="")
    panel = ('<div class="a-card" style="max-width:none">'
             '<div class="a-card-head" style="padding:11px 13px"><div>'
             '<div class="a-card-title" style="font-size:13px">Columns</div>'
             '<div class="a-card-sub"><b data-colcount>5</b> of 10 shown</div></div>%s</div>'
             '<div class="a-card-body" style="padding:7px"><div class="colp">%s</div></div>'
             '<div class="a-card-foot" style="padding:8px 13px"><span class="t3 xs">Drag to reorder · '
             '<span class="k2">Ctrl</span>+<span class="k2">Alt</span>+<span class="k2">←</span> does the same from the keyboard</span></div>'
             "</div>") % (
      btn("Reset","refresh"),
      "".join('<div class="colp-row%s" data-act="col" data-col="%s" role="button" tabindex="0">'
              '<span class="hnd">%s</span>%s<span>%s</span>%s</div>' % (
                "" if on else " off", key, ic("drag","i i-14"), cbx(on, "Show " + label, "none"), label,
                ('<span class="req">required</span>' if req else
                 '<span class="pn%s" data-act="pin" role="button" tabindex="0" aria-label="Pin %s">%s</span>' % (
                   " on" if pin else "", label, ic("pin","i i-14"))))
              for label, key, on, pin, req in COLS))
    return ('<div data-scope class="g2" style="grid-template-columns:minmax(0,1fr) 268px;gap:14px;align-items:start">'
            '<div>%s</div><div>%s</div></div>%s') % (grid, panel, liveout("aria-live"))
