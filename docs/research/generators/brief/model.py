# -*- coding: utf-8 -*-
"""Document model for the Oxygen UI Data Grid brief.

Every number, ranking and count in the prose is derived from the structures in
this module, so an edit to a datum cannot desync the sentence that quotes it.
build.py hard-fails on any unsubstituted @@TOKEN@@.
"""
import html as _html
import re

# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------

def esc(s):
    return _html.escape(str(s), quote=True)


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", str(s).lower()).strip("-")


class Section(object):
    """One numbered section of the report."""

    __slots__ = ("id", "num", "title", "kicker", "body")

    def __init__(self, id, title, kicker="", body=""):
        self.id = id
        self.num = 0          # assigned by build.py
        self.title = title
        self.kicker = kicker
        self.body = body

    def render(self):
        head = []
        if self.kicker:
            head.append('<p class="sub">%s</p>' % self.kicker)
        return (
            '<section id="%s">\n  <div class="wrap">\n'
            '    <div class="sec-head">\n'
            '      <span class="sec-num">%02d</span>\n'
            '      <h2>%s</h2>\n'
            '    </div>\n'
            '    %s\n'
            '%s\n  </div>\n</section>'
        ) % (self.id, self.num, self.title, "\n    ".join(head), self.body)


# --------------------------------------------------------------------------
# figures — every mockup is registered here so the hero gallery, the figure
# numbering and the cross references all come from one list.
# --------------------------------------------------------------------------

FIGS = []


class Fig(object):
    __slots__ = ("id", "n", "title", "section", "caption", "html", "interactive", "tags")

    def __init__(self, id, title, section, caption, html, interactive=True, tags=()):
        self.id = id
        self.n = len(FIGS) + 1
        self.title = title
        self.section = section
        self.caption = caption
        self.html = html
        self.interactive = interactive
        self.tags = tuple(tags)
        FIGS.append(self)

    def render(self):
        chips = "".join('<span class="tg %s">%s</span>' % (slug(t.split(":")[0]), esc(t))
                        for t in self.tags)
        live = '<span class="fig-live">live</span>' if self.interactive else \
               '<span class="fig-live static">static</span>'
        return (
            '<figure id="%s" class="figref">\n'
            '  <figcaption class="mocklabel"><b>Fig %d</b> %s %s</figcaption>\n'
            '  <div class="stage antd">%s</div>\n'
            '  <p class="figcap">%s</p>\n'
            '  %s\n'
            '</figure>'
        ) % (self.id, self.n, esc(self.title), live, self.html, self.caption,
             ('<div class="tagrow">%s</div>' % chips) if chips else "")


def figlink(fig_id):
    for f in FIGS:
        if f.id == fig_id:
            return '<a class="figlink" href="#%s">Fig&nbsp;%d</a>' % (f.id, f.n)
    raise KeyError("no such figure: %s" % fig_id)


def fill(tpl, **kw):
    """Token substitution that never fights with a literal % in CSS or prose.

    Percent-formatting a template that contains `width:40%` is a runtime error
    waiting for whoever edits the prose next, so nothing in this report uses it.
    """
    out = tpl
    for k, v in kw.items():
        out = out.replace("@@" + k + "@@", v)
    return out
