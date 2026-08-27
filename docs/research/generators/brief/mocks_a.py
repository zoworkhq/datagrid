# -*- coding: utf-8 -*-
"""Mockups A — the four grids a clinician actually works in.

Synthetic data only. Names are invented; MRNs are on a reserved example system.
"""
from mocklib import *

# ---------------------------------------------------------------- 1. roster
ROSTER = [
 # id, name, mrn, dob, tone, disamb, programme chips, status, last seen, provider, risk, tags
 ("p1","Aisha Bello","AR-40182","12 Mar 1988","b1",None,
  [("Depression","blue"),("Anxiety","blue"),("Type 2 diabetes","plain"),("Hypertension","plain"),("Asthma","plain"),("Insomnia","plain")],
  ("Stable","ok","gl-dot"),"4 days","Dr N. Osei",("Low","ok"),"mine"),
 ("p2","Daniel Okonkwo","AR-40915","2 Sep 1971","b2",None,
  [("Bipolar I","blue"),("Opioid use","blue"),("COPD","plain")],
  ("High risk","warn","gl-tri"),"31 days","Dr N. Osei",("High","crit"),"mine highrisk overdue"),
 ("p3","Maria Santos","AR-38220","19 Jun 1994","b3","b. 19 Jun",
  [("PTSD","blue"),("Migraine","plain")],
  ("Stable","ok","gl-dot"),"11 days","Dr L. Haddad",("Low","ok"),""),
 ("p4","Maria Santos","AR-41007","19 Jun 1994","b5","b. 19 Jun · AR-41007",
  [("Generalised anxiety","blue")],
  ("Needs review","cau","gl-hex"),"2 days","Dr L. Haddad",("Moderate","warn"),"review"),
 ("p5","Tomas Lindqvist","AR-39544","30 Nov 1959","b4",None,
  [("Schizoaffective","blue"),("CKD stage 3","plain"),("Clozapine","gold")],
  ("Monitoring due","cau","gl-hex"),"6 days","Dr N. Osei",("Moderate","warn"),"mine review"),
 ("p6","Priya Raman","AR-42311","4 Jan 2003","b1",None,
  [("First episode psychosis","blue"),("Cannabis use","blue")],
  ("New","info","gl-sq"),"today","Unassigned",("Not scored","unk"),"unassigned"),
 ("p7","Grace Mwangi","AR-37765","22 Aug 1966","b2",None,
  [("Recurrent depression","blue"),("Fibromyalgia","plain"),("Hypothyroidism","plain"),("Osteoarthritis","plain")],
  ("High risk","warn","gl-tri"),"48 days","Dr L. Haddad",("High","crit"),"highrisk overdue"),
 ("p8","Jonah Weiss","AR-40663","7 Jul 1982","b3",None,
  [("Alcohol use","blue"),("Depression","blue")],
  ("Stable","ok","gl-dot"),"9 days","Dr N. Osei",("Low","ok"),"mine"),
]

RISK_KIND = {"Low":"ok","Moderate":"cau","High":"crit","Not scored":"unk"}


def roster_row(r, i, sel=False, extra_cls="", show_cb=True):
    pid, name, mrn, dob, tone, disamb, dx, st, seen, prov, risk, tags = r
    cb = '<td class="c" style="width:34px">%s</td>' % cbx(sel) if show_cb else ""
    railkind = {"ok":"ok","warn":"warn","cau":"warn","info":"info","unk":"none"}[st[1]]
    return (
      '<tr data-id="%s" data-name="%s" data-tags="%s" data-i="%d" data-abs="%d"%s class="%s%s">'
      '%s'
      '<td class="pinned edge rail %s" data-v="%s">%s</td>'
      '<td data-v="%s">%s</td>'
      '<td data-v="%s">%s</td>'
      '<td class="num" data-v="%s"><span class="%s">%s</span></td>'
      '<td data-v="%s">%s</td>'
      '<td class="r" style="width:52px">%s</td>'
      "</tr>"
    ) % (pid, name, tags, i, i+1, ' aria-selected="true"' if sel else "",
         "sel " if sel else "", extra_cls,
         cb, railkind, name,
         ident(name, mrn, dob, tone=tone, disamb=disamb),
         st[0], status(st[0], st[1], st[2]),
         "|".join(d[0] for d in dx), chips(dx, 2, "Also on the problem list"),
         {"today":0,"4 days":4,"2 days":2,"6 days":6,"9 days":9,"11 days":11,"31 days":31,"48 days":48}[seen],
         "clk over" if seen in ("31 days","48 days") else "clk fine", seen,
         risk[0], status(risk[0], RISK_KIND[risk[0]], "gl-tri" if risk[0]=="High" else "gl-dot" if risk[0]=="Low" else "gl-hatch" if risk[0]=="Not scored" else "gl-hex"),
         '<button class="a-btn text sm" type="button" aria-label="More actions for %s" data-act="more">%s<span class="gpop" style="display:none"><span class="ph">Row actions</span><span class="col" style="gap:2px"><span class="a-btn text sm">Open chart</span><span class="a-btn text sm">Add task</span><span class="a-btn text sm">Schedule follow-up</span></span></span></button>' % (name, ic("more","i i-14")))


def fig_roster():
    head = (
      '<th class="c pinned" style="width:34px">%s</th>' % cbx(False, "Select all rows on this page", "selall").replace('class="cbx"','class="cbx" data-selall') +
      th("Patient", "name", pinned=True, width="238px") +
      th("Clinical status", "status", width="150px") +
      th("Problem list", None, width="200px") +
      th("Last seen", "seen", kind="num", width="104px", cls="r") +
      th("Risk", "risk", width="128px",
         prov='Sorted by <b>Risk</b> — a model output. <b>Zowork RiskNet v3.2</b>, recalculated nightly, C-statistic 0.71 on this population, last validated Feb 2026. Sorting by it is a triage decision.') +
      '<th style="width:52px"><span class="lr">Actions</span></th>'
    )
    rows = "".join(roster_row(r, i) for i, r in enumerate(ROSTER))
    toolbar = bar(
      '<div class="srch">%s<input data-search placeholder="Search this list — name, MRN, or NHS number" aria-label="Search the patient directory" /><span class="kbd2">/</span></div>' % ic("search","i i-14"),
      '<div class="qf">%s%s%s%s</div>' % (
        qfp("My patients","mine",4,pred="Assigned clinician = me"),
        qfp("High risk","highrisk",2,pred="Risk = High"),
        qfp("Needs review","review",2,pred="Status = Needs review"),
        qfp("No visit in 30 days","overdue",2,pred="Last seen &gt; 30 days"),
      ),
      '<span style="flex:1 1 auto"></span>',
      btn("Columns","cols"), btn("Export","download"),
    )
    chips_bar = '<div class="dg-bar sub" data-chips style="display:none"></div>'
    selbar = ('<div class="selbar" data-selbar style="display:none">'
              '<span class="cnt" data-selcount>0 patients</span>'
              '<span data-seltotal class="sm" style="display:none">— every row on this page</span>'
              '<span class="div"></span>'
              '%s%s%s%s'
              '<span style="flex:1 1 auto"></span>'
              '<button class="a-btn text sm" type="button" data-act="selclear">Clear</button>'
              "</div>") % (btn("Assign provider","user"), btn("Add to programme","plus"),
                           btn("Schedule follow-up","cal"), btn("Export","download"))
    empty = ('<div class="dg-msg" data-empty style="display:none">'
             '<span class="glyph">%s</span>'
             '<h5 data-emptykind>No rows match this query.</h5>'
             '<p data-emptywhy></p>'
             '<div class="acts"><button class="a-btn sm" type="button" data-act="clearall">Clear filters</button></div>'
             "</div>") % ic("filter","i i-20")
    foot = ('<div class="dg-foot">'
            '<span><b class="num" data-count>8</b> of <span class="num">1,284</span> rows · page 1 of 161</span>'
            '<span class="row" style="gap:4px">%s%s</span></div>') % (
        btn("Previous", extra=' disabled aria-disabled="true"'), btn("Next"))
    coverage = cov(
      'Showing <b><span data-covshown>8</span> of 1,284</b> people in the Riverside behavioural-health caseload, '
      'active as of 27 Aug 2026 09:40. <b>3 people are excluded</b> because their record is restricted to their own care team. '
      'Query: <span class="predicate" data-predicate><span class="f">no filter — every row this query reached</span></span>',
      sources=[("Riverside EHR","" ),("State PDMP","partial"),("Regional exchange","")])
    grid = dg("dg-roster", head, rows, bar=toolbar,
              extra_top=sortprov() + chips_bar + selbar, extra_bottom=empty,
              foot=foot, coverage=coverage, scroll="h360", total="1,284")
    return grid + liveout("aria-live — what a screen reader hears")


# ------------------------------------------------------- 2. BH caseload / registry
CASELOAD = [
 ("c1","Aisha Bello","AR-40182","b1","Week 9","IOP",
  [14,12,11,9,8,7],"7","−7","improving","23 Aug","31 Aug","Osei",[("PHQ-9","blue")],"engaged"),
 ("c2","Daniel Okonkwo","AR-40915","b2","Week 3","OP",
  [18,19,21,20,22,22],"22","+4","worsening","2 Aug","—","Osei",[("PHQ-9","blue"),("AUDIT-C","gold")],"deteriorating overdue"),
 ("c3","Tomas Lindqvist","AR-39544","b4","Week 22","OP",
  [11,10,10,9,9,9],"9","0","no change","19 Aug","2 Sep","Osei",[("PHQ-9","blue")],"plateau"),
 ("c4","Grace Mwangi","AR-37765","b3","Week 1","PHP",
  [],"—","—","not yet measured","—","29 Aug","Haddad",[],"new"),
 ("c5","Jonah Weiss","AR-40663","b5","Week 14","OP",
  [16,14,13,10,9,8],"8","−8","improving","21 Aug","4 Sep","Osei",[("PHQ-9","blue"),("AUDIT-C","gold")],"engaged"),
 ("c6","Priya Raman","AR-42311","b1","Week 6","IOP",
  [9,9,10,12,15,17],"17","+8","worsening","25 Aug","28 Aug","Haddad",[("PHQ-9","blue")],"deteriorating"),
]


def fig_caseload():
    head = (
      th("Client", "name", pinned=True, width="212px") +
      th("Programme", None, width="118px") +
      th("PHQ-9", "phq", kind="num", width="168px", sub=" · trend") +
      th("Change", "chg", kind="num", width="118px", cls="r",
         prov='Sorted by <b>Change</b>, which is a derived value: the difference from the first score in this episode. A change of 5 or more points is the reliable-change threshold for PHQ-9; anything smaller is inside measurement noise and is rendered as such.') +
      th("Last contact", "last", width="112px") +
      th("Next", "next", width="104px") +
      th("Caseload review", None, width="128px")
    )
    rows = []
    for i, c in enumerate(CASELOAD):
        (cid, name, mrn, tone, week, prog, series, cur, chg, dirw, last, nxt, clin, instr, tags) = c
        if not series:
            val = '<span class="absent">not yet measured</span>'
            chgc = '<span class="absent">no baseline</span>'
        else:
            tone2 = "crit" if int(cur) >= 20 else "warn" if int(cur) >= 15 else "ok"
            val = '<span class="row" style="gap:7px"><span class="val %s">%s</span>%s</span>' % (
                "crit" if tone2=="crit" else "abn" if tone2=="warn" else "", cur,
                spark(series, "crit" if tone2=="crit" else "warn" if tone2=="warn" else "ok"))
            reliable = abs(int(chg.replace("−","-").replace("+",""))) >= 5
            chgc = ('<span class="row" style="gap:5px;justify-content:flex-end">'
                    '<span class="val %s">%s</span>%s</span>') % (
                ("ok" if chg.startswith("−") else "crit") if reliable else "",
                chg,
                status("reliable" if reliable else "within noise",
                       "ok" if (reliable and chg.startswith("−")) else "crit" if reliable else "none",
                       "gl-dot" if reliable else "gl-dash"))
        rows.append(
          '<tr data-id="%s" data-name="%s" data-tags="%s" data-i="%d" data-abs="%d">'
          '<td class="pinned edge">%s</td>'
          '<td><span class="a-tag %s">%s</span> <span class="t3 xs">%s</span></td>'
          '<td data-v="%s">%s</td>'
          '<td class="r" data-v="%s">%s</td>'
          '<td class="num t2" data-v="%s">%s</td>'
          '<td class="num" data-v="%s">%s</td>'
          '<td>%s</td></tr>' % (
            cid, name, tags, i, i+1,
            ident(name, mrn, None, extra=week, tone=tone),
            "blue" if prog=="IOP" else "purple" if prog=="PHP" else "plain", prog, week,
            cur if series else "0", val,
            chg.replace("−","-") if series else "0", chgc,
            last, last,
            nxt, nxt if nxt != "—" else '<span class="absent">none booked</span>',
            status("Presented 24 Aug","ok","gl-dot","sq") if tags!="new" else status("Not yet presented","cau","gl-hex","sq")))
    toolbar = bar(
      '<span class="lbl">CoCM registry</span>',
      '<div class="qf">%s%s%s%s</div>' % (
        qfp("Deteriorating","deteriorating",2,pred="Change ≥ +5 points"),
        qfp("Plateau ≥ 8 weeks","plateau",1,pred="No reliable change in 8 weeks"),
        qfp("No next appointment","overdue",1,pred="Next appointment = none"),
        qfp("New this month","new",1,pred="Episode started this month")),
      '<span style="flex:1 1 auto"></span>',
      '<span class="t3 sm">Weekly caseload review · Thu 09:00</span>')
    foot = ('<div class="dg-foot"><span>6 of 6 clients · <b>2</b> flagged for psychiatric consultation</span>'
            '<span class="row" style="gap:5px">%s%s</span></div>') % (
        btn("Print review sheet","print"), btn("Mark reviewed","check","primary"))
    coverage = cov(
      'Showing <b>all 6</b> clients on Dr Osei&rsquo;s collaborative-care panel, week commencing 24 Aug 2026, ordered by change from baseline. '
      'Scores are self-reported instruments; <b>one client has no baseline</b> and is shown as not yet measured rather than as zero.',
      sources=[("Riverside EHR",""),("Measurement platform","")])
    return dg("dg-caseload", head, "".join(rows), bar=toolbar, foot=foot,
              extra_top=sortprov(), coverage=coverage, scroll="h300", total="6",
              noun="client") + liveout("aria-live")


# ---------------------------------------------------------------- 3. work queue
QUEUE = [
 ("q1","Critical potassium 6.8 mmol/L","Aisha Bello","AR-40182","b1",
  "Acknowledge and act","Dr N. Osei","00:07 left","over","crit",
  "Result released 11:42 · statutory acknowledgement clock","labs critical mine"),
 ("q2","Prior authorisation expires in 2 days","Daniel Okonkwo","AR-40915","b2",
  "Submit renewal","Utilisation review","2 days","soon","warn",
  "12 of 24 sessions used · payer: Northstar","auth mine"),
 ("q3","Progress note unsigned — 6 days","Grace Mwangi","AR-37765","b3",
  "Sign or amend","Dr L. Haddad","6 days late","over","crit",
  "Session 19 Aug · draft saved, never signed","docs"),
 ("q4","Clozapine ANC monitoring due","Tomas Lindqvist","AR-39544","b4",
  "Order FBC","Dr N. Osei","today","soon","warn",
  "Last ANC 30 Jul · prescriber-managed since the REMS was retired","meds mine critical"),
 ("q5","Discharge summary owed to GP","Jonah Weiss","AR-40663","b5",
  "Complete summary","Dr N. Osei","3 days","fine","info",
  "Discharged 24 Aug · 14-day statutory window","docs mine"),
 ("q6","New referral, unassigned","Priya Raman","AR-42311","b1",
  "Assign a clinician","Intake pool","4 hours","soon","warn",
  "First-episode psychosis pathway · target 14 days to first contact","intake"),
 ("q7","Two failed outreach attempts","Maria Santos","AR-41007","b5",
  "Third attempt or close","Care navigator","1 day","fine","info",
  "Called 21 Aug, 24 Aug · no voicemail configured","outreach"),
]


def fig_queue():
    head = (
      '<th class="c pinned" style="width:34px">%s</th>' % cbx(False,"Select all","selall").replace('class="cbx"','class="cbx" data-selall') +
      th("What is owed", "what", width="252px") +
      th("Person", "who", width="196px") +
      th("Owner", "owner", width="146px") +
      th("Due", "due", kind="num", width="122px", dir="asc") +
      th("Why", None, width="248px") +
      '<th style="width:88px"><span class="lr">Action</span></th>'
    )
    rows = []
    for i, q in enumerate(QUEUE):
        (qid, what, who, mrn, tone, action, owner, clk, clkk, kind, why, tags) = q
        rows.append(
          '<tr data-id="%s" data-name="%s" data-tags="%s" data-i="%d" data-abs="%d">'
          '<td class="c">%s</td>'
          '<td class="pinned edge rail %s"><div class="res"><span class="what">%s</span>'
          '<span class="whom">%s</span></div></td>'
          '<td>%s</td>'
          '<td class="t2">%s</td>'
          '<td class="r" data-v="%d"><span class="clk %s">%s</span></td>'
          '<td class="t3 sm">%s</td>'
          '<td class="r">%s</td></tr>' % (
            qid, what, tags, i, i+1, cbx(),
            kind, what, action,
            ident(who, mrn, None, tone=tone),
            owner,
            {"over":0,"soon":1,"fine":2}[clkk]*100 + i,
            clkk, clk, why,
            btn(action.split()[0], kind="primary" if clkk=="over" else "")))
    toolbar = bar(
      '<div class="qf">%s%s%s%s%s</div>' % (
        qfp("Mine","mine",4,on=True,pred="Owner = me"),
        qfp("Overdue","over",0,pred="Due &lt; now"),
        qfp("Critical results","critical",2,pred="Kind = critical result",dot="crit"),
        qfp("Documentation","docs",2,pred="Kind = documentation"),
        qfp("Authorisations","auth",1,pred="Kind = authorisation")),
      '<span style="flex:1 1 auto"></span>',
      '<span class="t3 sm">Auto-refresh 60s</span>', btn("Refresh","refresh"))
    coverage = cov(
      'Showing <b>7 open obligations</b> across 6 people. One person can appear more than once: '
      '<b>the row is the thing owed, not the patient.</b> Closed items from the last 24 hours are not shown. '
      'Query: <span class="predicate" data-predicate></span>',
      sources=[("Riverside EHR",""),("Payer portal","partial"),("Lab interface","")])
    foot = '<div class="dg-foot"><span><b data-count>7</b> obligations · 2 overdue · oldest 6 days</span><span class="t3">Sorted by due, soonest first</span></div>'
    return dg("dg-queue", head, "".join(rows), bar=toolbar, foot=foot, coverage=coverage,
              scroll="h360", total="7", noun="item", cls="compact")


# ---------------------------------------------------------------- 4. results
LABS = [
 ("Sodium","Na","139","mmol/L","135–145",[137,138,139,139],"", "final","ok"),
 ("Potassium","K","6.8","mmol/L","3.5–5.1",[4.4,4.6,4.7,6.8],"H","final","crit"),
 ("Creatinine","Cr","112","µmol/L","62–106",[88,94,101,112],"H","final","warn"),
 ("eGFR","eGFR","58","mL/min/1.73m²","≥90",[74,70,64,58],"L","final","warn"),
 ("TSH","TSH","6.4","mIU/L","0.4–4.0",[3.1,3.4,4.9,6.4],"H","preliminary","warn"),
 ("HbA1c","HbA1c","52","mmol/mol","20–41",[46,48,50,52],"H","corrected","warn"),
 ("Lithium","Li","0.94","mmol/L","0.60–1.00",[0.71,0.80,0.88,0.94],"","final","ok"),
 ("ANC","ANC","1.4","×10⁹/L","2.0–7.5",[3.1,2.6,2.0,1.4],"L","final","crit"),
 ("Vitamin D","25-OH-D","—","nmol/L","",[],"","not-ordered","none"),
 ("CRP","CRP","—","mg/L","<5",[],"","specimen","none"),
]


def fig_labs():
    head = (
      th("Analyte", "an", pinned=True, width="176px") +
      th("Result", "val", kind="num", width="152px") +
      th("Reference", None, width="128px") +
      th("Δ from last", "delta", kind="num", width="132px", cls="r") +
      th("Trend", None, width="112px") +
      th("Status", "st", width="150px") +
      th("Collected", "at", width="126px")
    )
    rows = []
    for i, (nm, code, val, unit, ref, series, flag, st, kind) in enumerate(LABS):
        if st == "not-ordered":
            valcell = '<span class="absent">not ordered</span>'
            refcell = '<span class="t3">—</span>'
            deltac = '<span class="absent">no prior</span>'
            trend = '<span class="t3 xs">—</span>'
            stat = status("Not ordered","none","gl-dash")
            when = '<span class="t3">—</span>'
        elif st == "specimen":
            valcell = '<span class="absent">specimen haemolysed</span>'
            refcell = '<span class="t3 xs">%s</span>' % ref
            deltac = '<span class="absent">not resulted</span>'
            trend = '<span class="t3 xs">—</span>'
            stat = status("Specimen problem","warn","gl-x")
            when = '<span class="num t3">27 Aug 08:10</span>'
        else:
            fl = ' <span class="flag %s">%s</span>' % (flag.lower(), flag) if flag else ""
            valcell = '<span class="val %s">%s<span class="u">%s</span></span>%s' % (
                "crit" if kind=="crit" else "abn" if kind=="warn" else "", val, unit, fl)
            refcell = '<span class="t2 num xs">%s</span>' % ref if ref else '<span class="absent">no range for this assay</span>'
            d = series[-1] - series[-2]
            big = abs(d) / (abs(series[-2]) or 1) > 0.25
            deltac = '<span class="val %s">%s%s</span> %s' % (
                "crit" if big and kind=="crit" else "",
                "+" if d > 0 else "", ("%.2f" % d).rstrip("0").rstrip(".") if abs(d)<10 else "%d" % d,
                status("significant","crit","gl-tri") if big else status("within noise","none","gl-dash"))
            trend = spark(series, "crit" if kind=="crit" else "warn" if kind=="warn" else "ok", 74, 20)
            stat = status({"final":"Final","preliminary":"Preliminary","corrected":"Corrected"}[st],
                          {"final":"ok","preliminary":"pend","corrected":"info"}[st],
                          {"final":"gl-dot","preliminary":"gl-ring","corrected":"gl-hex"}[st])
            when = '<span class="num t3">27 Aug 08:10</span>'
        rows.append(
          '<tr data-id="l%d" data-name="%s" data-i="%d" data-abs="%d">'
          '<td class="pinned edge rail %s"><b>%s</b> <span class="t3 xs mono">%s</span></td>'
          '<td data-v="%s">%s</td><td>%s</td><td class="r">%s</td>'
          '<td class="c">%s</td><td>%s</td><td>%s</td></tr>' % (
            i, nm, i, i+1,
            "crit" if kind=="crit" else "warn" if kind=="warn" else "none" if kind=="none" else "ok",
            nm, code, val if val!="—" else "0", valcell, refcell, deltac, trend, stat, when))
    top = ('<div class="a-alert error" style="margin:10px 10px 0"><span>%s</span>'
           '<span><b>Two critical results in this panel.</b> Potassium 6.8 mmol/L and ANC 1.4 ×10⁹/L. '
           'Acknowledgement is required and is recorded against your account.</span></div>' % ic("alert","i ic"))
    toolbar = bar('<span class="lbl">Chemistry &amp; haematology</span>',
                  '<span class="t3 sm">Aisha Bello · AR-40182 · collected 27 Aug 08:10</span>',
                  '<span style="flex:1 1 auto"></span>',
                  btn("Compare panels","cols"), btn("Acknowledge all","check","primary"))
    coverage = cov(
      'Showing <b>10 analytes</b> from one collection. <b>Two are not results</b>: vitamin D was not ordered and CRP&rsquo;s specimen '
      'was haemolysed — neither is a normal value and neither is blank. Reference ranges are the performing laboratory&rsquo;s.',
      sources=[("Riverside Laboratory",""),("Regional exchange","down")], alert=False)
    return ('<div style="display:grid;gap:0">%s</div>' % dg(
        "dg-labs", head, "".join(rows), bar=toolbar, extra_top=top, coverage=coverage,
        scroll="h420", total="10", noun="result"))
