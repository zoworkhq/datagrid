# -*- coding: utf-8 -*-
"""Mockup building blocks. Lucide geometry, Oxygen tokens, no inline hexes."""
import json

ICONS = {
 "search":   '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
 "filter":   '<path d="M3 4h18l-7 8v6l-4 2v-8Z"/>',
 "sort":     '<path d="M8 9l4-4 4 4M16 15l-4 4-4-4"/>',
 "up":       '<path d="M12 19V5M5 12l7-7 7 7"/>',
 "down":     '<path d="M12 5v14M19 12l-7 7-7-7"/>',
 "chev":     '<path d="m9 18 6-6-6-6"/>',
 "chevd":    '<path d="m6 9 6 6 6-6"/>',
 "x":        '<path d="M18 6 6 18M6 6l12 12"/>',
 "check":    '<path d="M20 6 9 17l-5-5"/>',
 "more":     '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
 "user":     '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
 "users":    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
 "alert":    '<path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>',
 "info":     '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
 "clock":    '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 "cal":      '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 10h18M8 2v4M16 2v4"/>',
 "pin":      '<path d="M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3Z"/>',
 "eye":      '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
 "eyeoff":   '<path d="m3 3 18 18M10.6 10.6a3 3 0 0 0 4.2 4.2"/><path d="M9.4 5.3A9.9 9.9 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1M6.2 6.2A17.4 17.4 0 0 0 2 12s3.6 7 10 7a9.8 9.8 0 0 0 3.4-.6"/>',
 "lock":     '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
 "shield":   '<path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5Z"/>',
 "flask":    '<path d="M9 3h6M10 3v6L4.5 18A2 2 0 0 0 6.2 21h11.6a2 2 0 0 0 1.7-3L14 9V3"/>',
 "pill":     '<path d="M10.5 20.5a5 5 0 0 1-7-7l6-6a5 5 0 0 1 7 7Z"/><path d="m8.5 8.5 7 7"/>',
 "heart":    '<path d="M19 6a4.5 4.5 0 0 0-7-1l-.9.9-1-.9A4.5 4.5 0 1 0 4 11.4l7.1 7.1a1.3 1.3 0 0 0 1.8 0l7.1-7.1A4.5 4.5 0 0 0 19 6Z"/>',
 "activity": '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
 "grid":     '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
 "cols":     '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18"/>',
 "rows":     '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18"/>',
 "expand":   '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
 "download": '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
 "print":    '<path d="M6 9V3h12v6"/><rect x="4" y="9" width="16" height="7" rx="2"/><path d="M8 16h8v5H8Z"/>',
 "refresh":  '<path d="M21 12a9 9 0 1 1-3-6.7M21 3v6h-6"/>',
 "sparkles": '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/>',
 "save":     '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
 "star":     '<path d="m12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9Z"/>',
 "gear":     '<circle cx="12" cy="12" r="3"/><path d="M20 12a8 8 0 0 0-.1-1.2l2-1.5-2-3.4-2.4 1a8 8 0 0 0-2-1.2L15 3H9l-.5 2.7a8 8 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.5a8 8 0 0 0 0 2.4l-2 1.5 2 3.4 2.4-1a8 8 0 0 0 2 1.2L9 21h6l.5-2.7a8 8 0 0 0 2-1.2l2.4 1 2-3.4-2-1.5A8 8 0 0 0 20 12Z"/>',
 "hand":     '<path d="M18 11V6a1.5 1.5 0 0 0-3 0m0 5V4.5a1.5 1.5 0 0 0-3 0V11m0-.5V3.5a1.5 1.5 0 0 0-3 0V12m0-4a1.5 1.5 0 0 0-3 0v6a8 8 0 0 0 8 8h1a7 7 0 0 0 7-7v-4"/>',
 "wifi":     '<path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M2 9a15 15 0 0 1 20 0M12 20h.01"/>',
 "bed":      '<path d="M2 20V8m0 5h20v7M2 13a4 4 0 0 1 4-4h4v4"/><circle cx="7" cy="10" r="0"/>',
 "route":    '<circle cx="6" cy="19" r="3"/><circle cx="18" cy="5" r="3"/><path d="M9 19h4a4 4 0 0 0 0-8h-2a4 4 0 0 1 0-8h4"/>',
 "arrowr":   '<path d="M5 12h14M13 6l6 6-6 6"/>',
 "drag":     '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
 "plus":     '<path d="M12 5v14M5 12h14"/>',
 "minus":    '<path d="M5 12h14"/>',
 "note":     '<path d="M15 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h6M8 13h8M8 17h5"/>',
 "inbox":    '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.4 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.4-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.8 1.1Z"/>',
 "brain":    '<path d="M12 5a3 3 0 0 0-6 0 3 3 0 0 0-2 5 3 3 0 0 0 1 5 3 3 0 0 0 7 2V5Z"/><path d="M12 5a3 3 0 0 1 6 0 3 3 0 0 1 2 5 3 3 0 0 1-1 5 3 3 0 0 1-7 2V5Z"/>',
 "hash":     '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
}


def ic(name, cls="i"):
    return '<svg class="%s" viewBox="0 0 24 24" aria-hidden="true">%s</svg>' % (cls, ICONS[name])


def av(txt, tone="b1", size=""):
    return '<span class="a-avatar %s %s" aria-hidden="true">%s</span>' % (tone, size, txt)


def cbx(on=False, label="Select row", act="selrow"):
    return ('<span class="cbx%s" role="checkbox" aria-checked="%s" tabindex="0" '
            'data-act="%s" aria-label="%s">%s</span>') % (
        " on" if on else "", "true" if on else "false", act, label, ic("check", "i i-14"))


def ident(name, mrn=None, dob=None, extra=None, tone="b1", disamb=None, prefix=""):
    """The identity cell. Two identifiers, always; the disambiguator when needed."""
    initials = "".join(p[0] for p in name.replace(",", "").split()[:2]).upper()
    sub = []
    if mrn:
        sub.append("MRN&nbsp;%s" % mrn)
    if dob:
        sub.append(dob)
    if extra:
        sub.append(extra)
    d = ' <span class="disamb">%s</span>' % disamb if disamb else ""
    return ('<div class="idc">%s%s<div class="who">'
            '<div class="pname">%s%s</div>'
            '<div class="sub2">%s</div>'
            '<span class="inlinemrn">%s</span>'
            "</div></div>") % (
        prefix, av(initials, tone),
        name, d,
        '<span class="sep">·</span>'.join(sub),
        mrn or "")


def chips(items, shown=2, more_title="Also recorded"):
    """Chips with an accessible overflow. The count is the truth, not the chips."""
    vis = items[:shown]
    rest = items[shown:]
    out = "".join('<span class="a-tag %s">%s</span>' % (t[1], t[0]) for t in vis)
    if rest:
        pop = ('<span class="gpop" style="display:none"><span class="ph">%s</span>'
               '<span class="row wrap" style="gap:4px">%s</span></span>') % (
            more_title, "".join('<span class="a-tag %s">%s</span>' % (t[1], t[0]) for t in rest))
        out += ('<span class="anchor"><button class="more" type="button" data-act="more" '
                'aria-expanded="false" aria-label="Show %d more: %s">+%d</button>%s</span>') % (
            len(rest), ", ".join(t[0] for t in rest), len(rest), pop)
    return '<div class="chips">%s</div>' % out


def status(word, kind, glyph="gl-dot", cls=""):
    return '<span class="cs cs-%s %s"><i class="gl %s" aria-hidden="true"></i>%s</span>' % (
        kind, cls, glyph, word)


def spark(points, tone="", w=54, h=18):
    lo, hi = min(points), max(points)
    rng = (hi - lo) or 1
    step = w / float(len(points) - 1) if len(points) > 1 else w
    d = " ".join("%s%.1f %.1f" % ("M" if i == 0 else "L", i * step, h - 2 - ((p - lo) / rng) * (h - 4))
                 for i, p in enumerate(points))
    return ('<svg class="spark" width="%d" height="%d" viewBox="0 0 %d %d" aria-hidden="true" '
            'style="color:var(--%s)"><path d="%s"/></svg>') % (w, h, w, h, tone or "ink-3", d)


def th(label, key=None, kind="text", width=None, cls="", pinned=False, col=None,
       prov=None, dir=None, ord=None, sub=None):
    """One header cell. Sorting, resizing and pinning are all header state."""
    style = ' style="width:%s"' % width if width else ""
    attrs = ""
    if key:
        attrs += ' data-key="%s" data-kind="%s"' % (key, kind)
    if dir:
        attrs += ' data-dir="%s" data-ord="%s"' % (dir, ord or 1)
    if prov:
        attrs += ' data-prov="%s"' % prov
    if col:
        attrs += ' data-col="%s"' % col
    klass = " ".join(x for x in [cls, "pinned edge" if pinned else ""] if x)
    inner = '<span class="lbl-t">%s</span>' % label
    if sub:
        inner += '<span class="t3" style="font-weight:400">%s</span>' % sub
    if key:
        inner += '<span class="sortmark">%s</span><span class="ord" style="display:none"></span>' % ic("sort", "i i-14")
    body = '<div class="thin">%s</div>' % inner
    grip = '<span class="grip" aria-hidden="true"></span>' if key else ""
    return '<th%s class="%s"%s scope="col">%s%s</th>' % (attrs, klass, style, body, grip)


def dg(id, head, rows, bar=None, foot=None, coverage=None, cls="standard", scroll="",
       extra_top="", extra_bottom="", total=None, noun="patient", cellfocus=False,
       tblcls="", attrs=""):
    a = ' data-grid data-noun="%s"' % noun
    if total:
        a += ' data-total="%s"' % total
    if cellfocus:
        a += " data-cellfocus"
    a += attrs
    return (
        '<div class="dg %s" id="%s"%s>'
        "%s%s"
        '<div class="dg-scroll %s"><table class="dgt %s"><thead><tr>%s</tr></thead><tbody>%s</tbody></table></div>'
        "%s%s%s"
        '<span class="lr" role="status" aria-live="polite" data-sr></span>'
        "</div>"
    ) % (cls, id, a, bar or "", extra_top, scroll, tblcls, head, rows,
         extra_bottom, foot or "", coverage or "")


def cov(text, sources=None, alert=False, shown=None, total=None):
    s = ""
    if sources:
        s = '<div class="cov-srcs">%s</div>' % "".join(
            '<span class="srcpill %s"><i class="d"></i>%s</span>' % (k, v) for v, k in sources)
    return ('<div class="covbar%s">%s<div><span data-cov>%s</span>%s</div></div>') % (
        " alert" if alert else "", ic("info", "i i-14 ic"), text, s)


def liveout(label="live region"):
    return ('<div class="liveout"><span class="tag">%s</span>'
            '<span data-live>Nothing announced yet — operate the grid.</span></div>') % label


def bar(*parts):
    return '<div class="dg-bar">%s</div>' % "".join(parts)


def btn(label, icon=None, kind="", act=None, extra=""):
    a = ' data-act="%s"' % act if act else ""
    i = ic(icon, "i i-14") if icon else ""
    return '<button class="a-btn sm %s" type="button"%s%s>%s%s</button>' % (kind, a, extra, i, label)


def qfp(label, key, n=None, on=False, pred=None, dot=None):
    d = '<i class="dot" style="background:var(--%s)"></i>' % dot if dot else ""
    c = '<span class="n">%s</span>' % n if n is not None else ""
    return ('<button class="qfp%s" type="button" data-act="qf" data-qf="%s" data-pred="%s" '
            'aria-pressed="%s">%s%s%s</button>') % (
        " on" if on else "", key, pred or label, "true" if on else "false", d, label, c)


def jd(o):
    return json.dumps(o).replace('"', "&quot;")


def sortprov():
    """Rendered only while the primary sort is a derived or model column."""
    return ('<div class="sortprov" data-sortprov style="display:none">%s'
            '<span data-provtext></span></div>') % ic("info", "i i-14")
