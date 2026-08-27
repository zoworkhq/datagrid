# -*- coding: utf-8 -*-
"""Mockups D — the grids that are not lists of people."""
from mocklib import *

# ------------------------------------------------------- 18. appointments
APPTS = [
 ("08:30","45m","Aisha Bello","AR-40182","b1","Therapy — individual","In person","Confirmed","ok","Room 2","low"),
 ("09:15","15m","Daniel Okonkwo","AR-40915","b2","Medication review","Telehealth","Not confirmed","cau","—","high"),
 ("09:30","60m","Group: DBT skills (8)","—","b3","Therapy — group","In person","Confirmed","ok","Room 5","low"),
 ("10:30","30m","Priya Raman","AR-42311","b1","Intake assessment","In person","Confirmed","ok","Room 2","med"),
 ("11:00","30m","Grace Mwangi","AR-37765","b5","Therapy — individual","Telehealth","Cancelled","none","—","—"),
 ("11:00","30m","Jonah Weiss","AR-40663","b4","Therapy — individual","In person","Double-booked","crit","Room 2","low"),
 ("13:00","45m","Tomas Lindqvist","AR-39544","b2","Clozapine review","In person","Confirmed","ok","Room 1","low"),
]
NOSHOW = {"low":("Low","ok"),"med":("Moderate","cau"),"high":("High","warn"),"—":None}


def fig_appts():
    head = (th("Time","t",kind="num",pinned=True,width="112px",dir="asc") +
            th("Person / group","who",width="228px") +
            th("Type","ty",width="164px") +
            th("Mode","mode",width="112px") +
            th("Room","room",width="82px") +
            th("Confirmation","conf",width="152px") +
            th("No-show risk","ns",width="146px",
               prov='Sorted by <b>No-show risk</b> — a model output used for overbooking decisions. '
                    '<b>Riverside NoShow v1.4</b>, 8 source attributes, no external validation on this population. '
                    'It is a scheduling aid and it is not a clinical judgement.'))
    rows = []
    for i, (t, dur, who, mrn, tone, ty, mode, conf, ck, room, ns) in enumerate(APPTS):
        n = NOSHOW[ns]
        conflict = conf == "Double-booked"
        rows.append(
          '<tr data-id="ap%d" data-name="%s" data-i="%d" data-abs="%d"%s>'
          '<td class="pinned edge rail %s" data-v="%s"><b class="mono">%s</b> <span class="t3 xs">%s</span></td>'
          '<td>%s</td><td class="t2">%s</td>'
          '<td><span class="a-tag %s">%s</span></td>'
          '<td class="mono t2">%s</td><td>%s</td><td>%s</td></tr>' % (
            i, who, i, i+1, ' class="restricted"' if False else "",
            "crit" if conflict else "none" if conf == "Cancelled" else "ok" if ck == "ok" else "warn",
            t.replace(":",""), t, dur,
            ident(who, mrn, None, tone=tone) if mrn != "—" else
              '<div class="idc">%s<div class="who"><div class="pname">%s</div>'
              '<div class="sub2">8 attendees · one roster, eight records</div></div></div>' % (
                av("G","b3"), who),
            ty,
            "cyan" if mode == "Telehealth" else "plain", mode,
            room if room != "—" else '<span class="absent">none</span>',
            status(conf, ck if ck != "none" else "none",
                   "gl-x" if conflict else "gl-dash" if conf == "Cancelled" else "gl-hex" if ck == "cau" else "gl-dot"),
            status(n[0], n[1], "gl-tri" if n[0] == "High" else "gl-dot") if n else '<span class="absent">not applicable</span>'))
    conflict_note = ('<div class="a-alert error" style="margin:10px 10px 0"><span>%s</span><span>'
                     '<b>Two appointments at 11:00 in Room 2.</b> Conflict is a render state on both rows, not a '
                     'validation error on one — the grid does not decide which booking was wrong.</span></div>') % ic("alert","i ic")
    return dg("dg-appts", head, "".join(rows), extra_top=conflict_note,
              bar=bar('<span class="lbl">Thursday 27 August · Dr N. Osei</span>',
                      '<span style="flex:1 1 auto"></span>',
                      '<span class="t3 sm">Europe/London · clinic day boundary 00:00–23:59 local to the facility</span>'),
              scroll="", total="7", noun="appointment",
              coverage=cov('Showing <b>7 of 7</b> bookings on this clinic day, in facility local time. '
                           'A day is the <b>facility&rsquo;s</b> day: a night-shift reader in another offset sees the '
                           'same seven rows in the same order. Cancelled bookings are shown — removing them '
                           'would hide the reason the 11:00 slot was double-booked.',
                           sources=[("Scheduling",""),("Telehealth platform",""),("Room booking","partial")])) + \
           liveout("aria-live")


# ------------------------------------------------------- 19. MAR
MAR_SLOTS = ["06:00","08:00","12:00","14:00","18:00","22:00"]
MAR_ROWS = [
 ("Lithium carbonate","400 mg · oral · nightly",
  [("empty",""),("empty",""),("empty",""),("empty",""),("empty",""),("due","22:00")],"ok"),
 ("Aripiprazole","10 mg · oral · daily",
  [("empty",""),("given","07:58"),("empty",""),("empty",""),("empty",""),("empty","")],"ok"),
 ("Metformin","500 mg · oral · twice daily",
  [("empty",""),("given","08:04"),("empty",""),("empty",""),("late","18:40"),("empty","")],"warn"),
 ("Lorazepam","1 mg · oral · PRN, max 3/day",
  [("empty",""),("empty",""),("given","12:20"),("empty",""),("empty",""),("empty","")],"info"),
 ("Enoxaparin","40 mg · subcut · nightly",
  [("empty",""),("empty",""),("empty",""),("empty",""),("empty",""),("missed","not given")],"crit"),
 ("Clozapine","300 mg · oral · nightly",
  [("empty",""),("empty",""),("empty",""),("empty",""),("empty",""),("held","held")],"warn"),
]


def fig_mar():
    head = (th("Medication",None,pinned=True,width="234px") +
            "".join('<th class="tslot c" style="width:78px" scope="col"><div class="thin" style="justify-content:center">'
                    '<span class="lbl-t mono">%s</span></div></th>' % s for s in MAR_SLOTS) +
            th("Notes",None,width="130px"))
    rows = []
    for i, (nm, sig, slots, kind) in enumerate(MAR_ROWS):
        cells = []
        for st, label in slots:
            if st == "empty":
                cells.append('<td class="mslot"><span class="dose empty" aria-label="No dose scheduled">·</span></td>')
            else:
                word = {"given":"Given","due":"Due","late":"Late","missed":"Not given","held":"Held"}[st]
                cells.append('<td class="mslot"><button class="dose %s" type="button" '
                             'aria-label="%s — %s at %s">%s<b>%s</b></button></td>' % (
                  st, nm, word, label, word, label))
        note = {"crit":"Reason required","warn":"See note","ok":"","info":"PRN"}[kind]
        rows.append('<tr data-id="mar%d" data-name="%s" data-i="%d">'
                    '<td class="pinned edge rail %s"><b>%s</b><div class="xs t3">%s</div></td>%s'
                    '<td class="xs t3">%s</td></tr>' % (
          i, nm, i, kind, nm, sig, "".join(cells), note))
    alert = ('<div class="a-alert error" style="margin:10px 10px 0"><span>%s</span><span>'
             '<b>One dose was not given and no reason is recorded.</b> The empty cell at 22:00 for enoxaparin is not '
             'blank — an unfilled scheduled dose is a fact with a consequence, and the grid renders it as one.'
             '</span></div>') % ic("alert","i ic")
    return dg("dg-mar", head, "".join(rows), extra_top=alert, cls="standard",
              bar=bar('<span class="lbl">MAR · Ward 4 · Bed 4-05 · Femi Adeyemi · AR-41902</span>',
                      '<span style="flex:1 1 auto"></span>',
                      '<span class="t3 sm">27 Aug 2026 · facility time</span>'),
              scroll="", total="6", noun="order", tblcls="mar divided",
              coverage=cov('Showing <b>6 active orders across one 24-hour period</b>. Columns are <b>instants, not '
                           'wall-clock labels</b> — on the day the clock goes back, 01:00–02:00 appears twice with its '
                           'offset, which is the only way a 2 a.m. dose can be recorded truthfully.'))


# ------------------------------------------------------- 20. bed board
BEDS = [
 ("4-01","occupied","Chen Wei","Awaiting bed","warn"),
 ("4-02","occupied","Femi Adeyemi","Discharge ready","ok"),
 ("4-03","free","","Available now","free"),
 ("4-04","clean","","Cleaning — 20 min","clean"),
 ("4-05","occupied","Rosa Delgado","Observation","info"),
 ("4-06","blocked","","Blocked — isolation","blocked"),
 ("4-07","occupied","Ivan Petrenko","Observation","info"),
 ("4-08","free","","Available now","free"),
 ("4-09","occupied","Amara Nwosu","Admitted 09:22","info"),
 ("4-10","clean","","Cleaning — 5 min","clean"),
 ("4-11","occupied","Sam Petrov","1:1 observation","warn"),
 ("4-12","free","","Available now","free"),
]


def fig_beds():
    cards = []
    for no, state, who, note, kind in BEDS:
        cls = {"occupied":"","free":"free","clean":"clean","blocked":"blocked"}[state]
        body = ('<div class="nm2">%s</div>' % who) if who else \
               ('<div class="nm2 t3" style="font-weight:400">%s</div>' %
                {"free":"Empty","clean":"Empty","blocked":"Empty"}[state])
        chip = status(note, {"warn":"warn","ok":"ok","info":"info","free":"ok","clean":"none","blocked":"crit"}[kind],
                      {"warn":"gl-hex","ok":"gl-dot","info":"gl-sq","free":"gl-ring","clean":"gl-dash","blocked":"gl-x"}[kind])
        cards.append('<div class="bed %s"><div class="no mono">%s</div>%s%s</div>' % (cls, no, body, chip))
    counts = ('<div class="row wrap" style="gap:6px;margin-bottom:11px">%s</div>') % "".join(
      '<span class="qfp"><i class="dot" style="background:var(--%s)"></i>%s <span class="n">%d</span></span>' % (t, l, n)
      for l, n, t in [("Occupied",7,"info"),("Available",3,"ok"),("Cleaning",2,"ink-3"),("Blocked",1,"crit")])
    return ('<div class="dg standard" style="padding:0">'
            '<div class="dg-bar"><span class="lbl">Ward 4 · bed board</span>'
            '<span style="flex:1 1 auto"></span><span class="t3 sm">12 beds · live</span></div>'
            '<div style="padding:11px 12px">%s<div class="beds">%s</div></div>'
            "%s</div>"
            '<div class="a-alert" style="margin-top:12px;font-size:12.5px"><span>%s</span><span>'
            '<b>This is still the same grid.</b> Same engine, same selection model, same keyboard map, same coverage '
            'contract — a different <code>layout</code>. The reason it is not a list of rows is that '
            '<b>the empty beds are the answer</b>, and a filter that hid them would destroy the artefact. '
            'That is a property of the data, so it belongs to the recipe, not to a second component.</span></div>') % (
      counts, "".join(cards),
      cov('Showing <b>all 12 beds</b> on Ward 4, including the empty ones. '
          'A bed the housekeeping system has not reported on in 40 minutes renders as <em>unknown</em>, never as available.',
          sources=[("ADT feed",""),("Housekeeping","partial"),("Isolation register","")]),
      ic("info","i ic"))


# ------------------------------------------------------- 21. tree / care plan
TREE = [
 (0,"Goal · Reduce depressive symptoms to remission","PHQ-9 ≤ 4 by 31 Oct","62%","ok",None),
 (1,"Weekly individual CBT","12 of 16 sessions","75%","ok",None),
 (1,"Behavioural activation homework","6 of 12 logged","50%","warn",None),
 (1,"Medication adherence","—","—","unk","Adherence is measured in doses; the parent goal is measured in points. They are not averaged."),
 (0,"Goal · Return to part-time work","Two half-days per week by 30 Sep","30%","warn",None),
 (1,"Vocational assessment","Completed 4 Aug","100%","ok",None),
 (1,"Employer conversation","Not started","0%","none",None),
 (1,"Interventions from the community team","not loaded","—","unk","Three interventions exist and have not been fetched. This node is unresolved, not empty."),
 (0,"Goal · Maintain abstinence","No use since 2 Jul","—","unk","Self-reported. No verified measure has been recorded against this goal."),
]


def fig_tree():
    head = (th("Goal and interventions",None,pinned=True,width="330px") +
            th("Measure",None,width="212px") +
            th("Progress",None,width="176px") +
            th("Contributes to the parent",None,width="212px"))
    rows = []
    for i, (depth, label, measure, pct, kind, note) in enumerate(TREE):
        pad = 10 + depth * 22
        twisty = ('<button class="a-btn text sm" type="button" data-act="expand" aria-expanded="true" '
                  'style="transform:rotate(90deg);margin-inline-end:2px" aria-label="Collapse">%s</button>' % ic("chev","i i-14")) \
                 if depth == 0 else '<span style="display:inline-block;width:16px"></span>'
        if pct == "—":
            bar_ = '<span class="absent">not measured</span>'
        else:
            v = int(pct.rstrip("%"))
            bar_ = ('<span class="row" style="gap:7px"><span style="flex:1 1 auto;height:6px;border-radius:3px;'
                    'background:var(--sunken);border:1px solid var(--line);overflow:hidden;min-width:70px">'
                    '<i style="display:block;height:100%%;width:%d%%;background:var(--%s)"></i></span>'
                    '<span class="mono xs">%s</span></span>') % (
              v, {"ok":"ok","warn":"warn","none":"ink-5","unk":"ink-5"}[kind], pct)
        if pct == "—":
            contributes = '<span class="absent">excluded — %s</span>' % (
                "incomparable unit" if note and "unit" in note else "unresolved branch" if note else "no measure")
        elif depth == 0:
            contributes = '<span class="t2 xs">rolled up from 2 of 3 interventions</span>'
        else:
            contributes = '<span class="t2 xs">weighted &frac12; of the goal</span>' 
        rows.append('<tr data-id="t%d" data-name="%s" data-i="%d"><td class="pinned edge" style="padding-inline-start:%dpx">'
                    '%s<b style="font-weight:%s">%s</b>%s</td>'
                    '<td class="t2">%s</td><td>%s</td><td>%s</td></tr>' % (
          i, label, i, pad, twisty, "600" if depth == 0 else "500", label,
          '<div class="xs t3" style="margin-top:2px;padding-inline-start:18px">%s</div>' % note if note else "",
          measure if measure != "not loaded" else '<span class="absent">3 not loaded</span>',
          bar_, contributes))
    return dg("dg-tree", head, "".join(rows), cls="standard", scroll="", total="9", noun="item",
              bar=bar('<span class="lbl">Treatment plan · Aisha Bello · AR-40182</span>',
                      '<span style="flex:1 1 auto"></span>',
                      '<span class="t3 sm">Reviewed 19 Aug · next review 16 Sep</span>'),
              coverage=cov('Showing <b>3 goals and 6 of 9 interventions</b>. One branch has <b>not been fetched</b> and '
                           'renders as unresolved — <b>a node with unknown children is not a node with no children</b>, '
                           'and rolling it up as complete would be the aggregation inventing a number. '
                           'Two rows are excluded from the parent&rsquo;s progress because their units are incomparable, '
                           'and the exclusion is stated on the row rather than hidden in the maths.'))


# ------------------------------------------------------- 22. natural language
def fig_nl():
    box = ('<div class="dg standard"><div class="dg-bar">'
           '<span class="row" style="gap:6px;color:var(--ai-ink)">%s<span class="lbl" style="color:var(--ai-ink)">Ask</span></span>'
           '<div class="srch" style="flex:1 1 320px"><input data-nlq value="show me high-risk behavioural health '
           'patients with no follow-up in 30 days" aria-label="Describe the list you want" /></div>'
           '%s</div>'
           '<div style="padding:12px 12px 0"><span class="lbl">What it compiled to — review before it runs</span>'
           '<div class="row wrap" style="gap:5px;margin-top:7px;min-height:26px" data-nlchips>'
           '<span class="t3 sm">Press Compile.</span></div>'
           '<div class="hint2">%s<span data-nlstate></span></div></div>'
           '<div class="dg-bar sub" style="border-top:1px solid var(--line);margin-top:11px">'
           '<span class="t3 xs">The bar produces a <code>FilterNode</code> — the same tree the visual builder makes. '
           'It cannot express a condition the builder cannot.</span>'
           '<span style="flex:1 1 auto"></span>'
           '<span data-nlrun style="display:none">%s</span></div>'
           "%s</div>") % (
      ic("sparkles","i i-14"), btn("Compile","arrowr","primary",act="nl"), ic("info","i i-14"),
      btn("Run this query","check","primary"),
      cov('An AI-composed query <b>never runs before a human has seen it as chips</b>, and it never approximates. '
          'If a clause cannot be compiled the bar says so and runs nothing — <b>a filter that quietly narrows a cohort '
          'is the most dangerous thing on this surface</b>, because the result looks exactly like a correct answer.'))
    provenance = ('<div class="a-card" style="max-width:none;margin-top:13px">'
                  '<div class="a-card-head" style="padding:11px 14px"><div class="a-card-title" style="font-size:13px">'
                  'How an AI value looks next to a verified one</div></div>'
                  '<div class="a-card-body" style="padding:0">'
                  '<table class="dgt" style="font-size:13px"><thead><tr>%s%s%s%s</tr></thead><tbody>%s</tbody></table>'
                  "</div>"
                  '<div class="covbar">%s<div>Three provenances, three visual treatments, and <b>none of them is colour '
                  'alone</b>. An AI-derived value can never satisfy the same assertion as a verified one — that is a '
                  'test, not a convention.</div></div></div>') % (
      th("Field",None,width="152px"), th("Value",None,width="180px"),
      th("Where it came from",None,width="188px"), th("May it be acted on?",None,width="188px"),
      "".join('<tr><td class="t2">%s</td><td>%s</td><td>%s</td><td class="xs t3">%s</td></tr>' % (f, v, p, a)
              for f, v, p, a in [
        ("Potassium", '<span class="val crit">6.8<span class="u">mmol/L</span></span>',
         '<span class="prov ext">%s Riverside Laboratory</span>' % ic("flask","i i-14"),
         "Yes — verified result, final."),
        ("Housing status", '<span>Temporarily housed</span> <span class="prov">%s extracted</span>' % ic("sparkles","i i-14"),
         '<span class="prov">%s Extracted from a note, 19 Aug</span>' % ic("sparkles","i i-14"),
         "Not until a human confirms it. Shown as a draft."),
        ("Deterioration risk", '<span class="val abn">0.71</span> <span class="prov model">%s model</span>' % ic("activity","i i-14"),
         '<span class="prov model">%s RiskNet v3.2 · 31 attributes</span>' % ic("activity","i i-14"),
         "As a lens on a list. Never as a diagnosis, and never as the only sort."),
        ("Summary", '<span class="t2 xs">“Three missed sessions; last contact 31 days.”</span> <span class="prov">%s</span>' % ic("sparkles","i i-14"),
         '<span class="prov">%s Generated 27 Aug 09:41</span>' % ic("sparkles","i i-14"),
         "It is a pointer to the record, not the record."),
      ]),
      ic("info","i i-14 ic"))
    return '<div data-scope>%s%s</div>' % (box, provenance)


# ------------------------------------------------------- 23. print / export
def fig_print():
    sheet = ('<div style="background:var(--surface);border:1px solid var(--line);border-radius:var(--r-lg);'
             'padding:18px 20px;box-shadow:var(--e-2)">'
             '<div style="border-bottom:2px solid var(--ink);padding-bottom:8px;margin-bottom:10px">'
             '<div class="row sp"><b style="font-size:14px">Behavioural health caseload — high risk</b>'
             '<span class="mono xs t3">Page 1 of 4</span></div>'
             '<div class="xs t3" style="margin-top:3px">Riverside Community Health · printed 27 Aug 2026 09:42 by N. Osei</div>'
             "</div>"
             '<div class="predicate" style="background:var(--sunken);border:1px solid var(--line);'
             'border-radius:var(--r-xs);padding:6px 8px;margin-bottom:10px;font-size:10.5px">'
             '<b>Query:</b> <span class="f">Programme = Behavioural Health</span> <span class="op">AND</span> '
             '<span class="f">Risk = High</span> <span class="op">AND</span> '
             '(<span class="f">Last encounter &lt; 24 Jul 2026</span> <span class="op">OR</span> '
             '<span class="f">Next appointment = none</span>)</div>'
             '<table class="dgt" style="font-size:11.5px"><thead><tr>%s%s%s%s</tr></thead><tbody>%s</tbody></table>'
             '<div style="border-top:1px solid var(--line);margin-top:10px;padding-top:8px;font-size:10.5px;color:var(--ink-3);line-height:1.6">'
             '<b>Rows 1–12 of 47.</b> Sources reached: Riverside EHR (ok), State PDMP (partial — 2 counties not covered), '
             'Regional exchange (<b>not reached</b>). <b>3 people are excluded</b> because their record is restricted. '
             '2 values are masked under 42 CFR Part 2 and are printed as masked.<br>'
             '<b>This sheet contains protected health information.</b> Printed copies are not tracked after they leave '
             'this device. Disclosure recorded as event <span class="mono">dx_9f2a17</span>.'
             "</div></div>") % (
      th("Patient",None,width="176px"), th("Risk",None,width="72px"),
      th("Last seen",None,width="82px"), th("Next",None,width="92px"),
      "".join('<tr><td><b>%s</b><div class="xs t3 mono">MRN %s</div></td><td>%s</td>'
              '<td class="mono">%s</td><td>%s</td></tr>' % (n, m, r, s, x)
              for n, m, r, s, x in [
                ("Okonkwo, Daniel","AR-40915","High","31 days","none booked"),
                ("Mwangi, Grace","AR-37765","High","48 days","none booked"),
                ("[restricted]","—","—","—","—"),
              ]))
    rules = ('<div class="a-card" style="max-width:none">'
             '<div class="a-card-head" style="padding:11px 14px"><div class="a-card-title" style="font-size:13px">'
             'What travels with the data, and what does not</div></div>'
             '<div class="a-card-body" style="padding:0"><table class="dgt" style="font-size:12.5px">'
             '<thead><tr>%s%s%s%s</tr></thead><tbody>%s</tbody></table></div></div>') % (
      th("",None,width="164px"), th("Screen",None,width="112px"),
      th("Print",None,width="112px"), th("CSV / XLSX",None,width="112px"),
      "".join('<tr><td class="t2">%s</td><td>%s</td><td>%s</td><td>%s</td></tr>' % (a, b, c, d)
              for a, b, c, d in [
        ("Coverage sentence","Always","Every page","Header rows"),
        ("The query","Always","Every page","Header rows"),
        ("Masked values","Masked","Masked","<b>Masked</b>"),
        ("Restricted rows","Counted, not shown","Counted, not shown","Counted, not shown"),
        ("Hidden columns","Absent","Absent","Absent — export follows the view"),
        ("Row range","Footer","Every page","Header rows"),
        ("Disclosure event","On expand","On print","On export"),
        ("Sort provenance","Header banner","Header block","Header rows"),
      ]))
    return ('<div class="g2" style="grid-template-columns:minmax(0,1.05fr) minmax(0,0.95fr);gap:15px;align-items:start">'
            '<div>%s</div><div>%s</div></div>') % (sheet, rules)
