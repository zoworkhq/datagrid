import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import figs, figs2
HERE = os.path.dirname(os.path.abspath(__file__))
css = open(os.path.join(HERE,"base.css.html")).read().replace("<style>","",1).replace("</style>","",1)
extra = open(os.path.join(HERE,"extra.css")).read()
js = open(os.path.join(HERE,"app.js")).read()
js2 = open(os.path.join(HERE,"app2.js")).read()
which = sys.argv[1:] or ["fig_gapmatrix"]
body=[]
for n in which:
    fn = getattr(figs, n, None) or getattr(figs2, n, None)
    if fn: body.append('<h3 style="margin:1.6rem 0 .6rem">%s</h3><div class="stage antd">%s</div>' % (n, fn()))
html = """<!doctype html><html lang="en"><head><meta charset="utf-8"><title>preview</title>
<meta name="viewport" content="width=device-width,initial-scale=1"><style>%s
%s</style></head><body><div class="wrap" style="padding-block:1.5rem">%s</div>
<script>%s</script><script>%s</script></body></html>""" % (css, extra, "\n".join(body), js, js2)
open(os.path.join(HERE,"preview.html"),"w").write(html)
print("wrote", len(html))
