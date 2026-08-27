# -*- coding: utf-8 -*-
"""Fast preview harness — renders selected figures only, for visual checking."""
import io, os, sys
import mocks_a, mocks_b, mocks_c, mocks_d

HERE = os.path.dirname(os.path.abspath(__file__))
css = open(os.path.join(HERE, "base.css.html")).read()
css = css.replace("<style>", "", 1).replace("</style>", "", 1)
extra = open(os.path.join(HERE, "extra.css")).read()
js = open(os.path.join(HERE, "app.js")).read()

which = sys.argv[1:] or ["fig_roster", "fig_caseload", "fig_queue", "fig_labs"]
body = []
for name in which:
    fn = None
    for mod in (mocks_a, mocks_b, mocks_c, mocks_d):
        fn = getattr(mod, name, None)
        if fn: break
    if not fn:
        continue
    body.append('<h3 style="margin:2rem 0 .6rem">%s</h3><div class="stage antd">%s</div>' % (name, fn()))

html = """<!doctype html><html lang="en"><head><meta charset="utf-8"><title>preview</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>%s
%s</style></head><body>
<div class="wrap" style="padding-block:2rem">%s</div>
<script>%s</script>
</body></html>""" % (css, extra, "\n".join(body), js)
open(os.path.join(HERE, "preview.html"), "w").write(html)
print("wrote preview.html", len(html))
