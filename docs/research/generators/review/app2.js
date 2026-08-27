/* Architecture-review interactions: the gap matrix, the classification board,
   and the README framework tabs. Same delegated-event style as app.js. */
(function () {
  "use strict";
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function closest(el, s) { return el && el.closest ? el.closest(s) : null; }

  function applyGap(scope) {
    var pri = $$("[data-gp].on", scope).map(function (p) { return p.dataset.gp; });
    var area = $$("[data-ga].on", scope).map(function (p) { return p.dataset.ga; });
    var only = $$("[data-go].on", scope).map(function (p) { return p.dataset.go; });
    var rows = $$("tbody tr[data-pri]", scope);
    var n = 0;
    rows.forEach(function (r) {
      var ok = (!pri.length || pri.indexOf(r.dataset.pri) >= 0)
            && (!area.length || area.indexOf(r.dataset.area) >= 0)
            && (!only.length || only.every(function (o) { return r.dataset[o] === "1"; }));
      r.classList.toggle("hidden", !ok);
      if (ok) n++;
    });
    var c = $("[data-gapcount]", scope);
    if (c) c.textContent = n;
    var empty = $("[data-gapempty]", scope);
    if (empty) empty.style.display = n ? "none" : "";
    var live = $("[data-live]", scope);
    if (live) {
      live.textContent = n + " of " + rows.length + " capabilities shown"
        + (pri.length ? " · priority " + pri.join(", ") : "")
        + (only.length ? " · " + only.join(", ") : "");
    }
  }

  document.addEventListener("click", function (e) {
    var t = closest(e.target, "[data-gp],[data-ga],[data-go]");
    if (t) {
      var scope = closest(t, "[data-gapscope]");
      // priority pills are exclusive-ish: clicking toggles
      t.classList.toggle("on");
      t.setAttribute("aria-pressed", t.classList.contains("on") ? "true" : "false");
      applyGap(scope);
      return;
    }
    var clr = closest(e.target, "[data-gapclear]");
    if (clr) {
      var sc = closest(clr, "[data-gapscope]");
      $$("[data-gp],[data-ga],[data-go]", sc).forEach(function (p) {
        p.classList.remove("on"); p.setAttribute("aria-pressed", "false");
      });
      applyGap(sc);
      return;
    }
    var tab = closest(e.target, "[data-ghtab]");
    if (tab) {
      var box = closest(tab, "[data-ghscope]");
      $$("[data-ghtab]", box).forEach(function (x) { x.classList.toggle("on", x === tab); });
      $$("[data-ghpane]", box).forEach(function (p) {
        p.style.display = p.dataset.ghpane === tab.dataset.ghtab ? "" : "none";
      });
      return;
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    var t = closest(e.target, "[data-gp],[data-ga],[data-go],[data-gapclear],[data-ghtab]");
    if (t) { e.preventDefault(); t.click(); }
  });

  function boot2() {
    $$("[data-gapscope]").forEach(applyGap);
    $$("[data-ghscope]").forEach(function (box) {
      var on = $("[data-ghtab].on", box) || $("[data-ghtab]", box);
      if (on) {
        $$("[data-ghpane]", box).forEach(function (p) {
          p.style.display = p.dataset.ghpane === on.dataset.ghtab ? "" : "none";
        });
      }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot2);
  else boot2();
})();
