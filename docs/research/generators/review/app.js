/* ====================================================================
   Oxygen Data Grid brief — mockup runtime.
   No framework. Every demo is driven by delegated events on data-act
   attributes so the markup in the report stays readable as markup.
   ==================================================================== */
(function () {
  "use strict";

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function closest(el, sel) { return el && el.closest ? el.closest(sel) : null; }
  function say(scope, msg) {
    if (!scope) return;
    var sr = scope.querySelector("[data-sr]");
    if (sr) { sr.textContent = msg; }
    // The visible echo of the live region usually sits beside the grid, not
    // inside it, so widen the search to the enclosing figure or stage.
    var box = scope.closest ? (scope.closest("[data-scope]") || scope.closest("figure") || scope.closest(".stage")) : null;
    var out = scope.querySelector("[data-live]") || (box && box.querySelector("[data-live]"));
    if (out) { out.textContent = msg; }
  }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : (many || one + "s")); }
  function closeAllPops() {
    $$(".gpop").forEach(function (p) { p.style.display = "none"; p.classList.remove("pop"); });
    $$("[data-act='more'][aria-expanded='true']").forEach(function (b) { b.setAttribute("aria-expanded", "false"); });
  }

  /* ---------------- sorting ------------------------------------- */
  function cmp(a, b, kind) {
    if (kind === "num") {
      var na = parseFloat(String(a).replace(/[^0-9.\-]/g, ""));
      var nb = parseFloat(String(b).replace(/[^0-9.\-]/g, ""));
      if (isNaN(na) && isNaN(nb)) return 0;
      if (isNaN(na)) return 1;
      if (isNaN(nb)) return -1;
      return na - nb;
    }
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
  }

  function applySort(grid) {
    var tbody = $("tbody", grid);
    if (!tbody) return;
    var ths = $$("th[data-key]", grid);
    var keys = ths.filter(function (t) { return t.dataset.dir; })
      .sort(function (a, b) { return (+a.dataset.ord || 0) - (+b.dataset.ord || 0); });
    var rows = $$("tr", tbody).filter(function (r) { return !r.dataset.pinRow; });
    if (keys.length) {
      rows.sort(function (ra, rb) {
        for (var i = 0; i < keys.length; i++) {
          // The column index is the header's position among ALL headers, not
          // among the sortable ones — a keyed-only index silently sorts by the
          // wrong column the moment one column is not sortable.
          var k = keys[i];
          var idx = Array.prototype.indexOf.call(k.parentElement.children, k);
          var va = ra.children[idx] ? (ra.children[idx].dataset.v || ra.children[idx].textContent.trim()) : "";
          var vb = rb.children[idx] ? (rb.children[idx].dataset.v || rb.children[idx].textContent.trim()) : "";
          var c = cmp(va, vb, k.dataset.kind);
          if (c) return k.dataset.dir === "desc" ? -c : c;
        }
        return (+ra.dataset.i || 0) - (+rb.dataset.i || 0);
      });
    } else {
      rows.sort(function (ra, rb) { return (+ra.dataset.i || 0) - (+rb.dataset.i || 0); });
    }
    rows.forEach(function (r) { tbody.appendChild(r); });

    ths.forEach(function (t) {
      var mark = $(".sortmark", t), ord = $(".ord", t);
      t.classList.toggle("sorted", !!t.dataset.dir);
      t.setAttribute("aria-sort", t.dataset.dir === "asc" ? "ascending" : t.dataset.dir === "desc" ? "descending" : "none");
      if (mark) mark.innerHTML = t.dataset.dir === "desc" ? DOWN : t.dataset.dir === "asc" ? UP : BOTH;
      if (ord) { ord.style.display = (keys.length > 1 && t.dataset.dir) ? "" : "none"; ord.textContent = t.dataset.ord || ""; }
    });

    var prov = $("[data-sortprov]", grid);
    if (prov) {
      var top = keys[0];
      var show = top && top.dataset.prov;
      prov.style.display = show ? "" : "none";
      if (show) $("[data-provtext]", prov).innerHTML = top.dataset.prov;
    }

    if (keys.length) {
      say(grid, "Sorted by " + keys.map(function (k) {
        return $(".lbl-t", k).textContent.trim() + " " + (k.dataset.dir === "desc" ? "descending" : "ascending");
      }).join(", then "));
    } else {
      say(grid, "Sort cleared — restored to the grid's default order.");
    }
  }

  var UP = '<svg class="i i-14" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
  var DOWN = '<svg class="i i-14" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>';
  var BOTH = '<svg class="i i-14" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 9l4-4 4 4M16 15l-4 4-4-4"/></svg>';

  /* ---------------- selection ----------------------------------- */
  function refreshSel(grid) {
    var rows = $$("tbody tr[data-id]", grid).filter(function (r) { return r.style.display !== "none"; });
    var on = rows.filter(function (r) { return r.classList.contains("sel"); });
    var all = $("[data-selall]", grid);
    if (all) {
      all.classList.toggle("on", on.length === rows.length && rows.length > 0);
      all.classList.toggle("part", on.length > 0 && on.length < rows.length);
      all.setAttribute("aria-checked", on.length === 0 ? "false" : on.length === rows.length ? "true" : "mixed");
    }
    var bar = $("[data-selbar]", grid);
    if (bar) {
      bar.style.display = on.length ? "" : "none";
      var c = $("[data-selcount]", bar);
      if (c) c.textContent = plural(on.length, grid.dataset.noun || "patient");
      var tot = $("[data-seltotal]", bar);
      if (tot) tot.style.display = (on.length === rows.length && rows.length > 0) ? "" : "none";
    }
    var wide = grid.closest ? (grid.closest("[data-scope]") || grid.closest("figure") || grid.closest(".stage")) : null;
    var names = $("[data-selnames]", grid) || (wide && $("[data-selnames]", wide));
    if (names) {
      names.innerHTML = on.length
        ? on.map(function (r) { return '<span class="a-tag">' + (r.dataset.name || r.dataset.id) + "</span>"; }).join("")
        : '<span class="t3 sm">Nothing selected.</span>';
    }
    if (on.length) say(grid, plural(on.length, grid.dataset.noun || "patient") + " selected.");
    return on;
  }

  /* ---------------- filters -------------------------------------- */
  function applyFilters(grid) {
    var actives = $$("[data-qf].on", grid).map(function (p) { return p.dataset.qf; });
    var q = ($("[data-search]", grid) || {}).value || "";
    q = q.trim().toLowerCase();
    var rows = $$("tbody tr[data-id]", grid);
    var shown = 0;
    rows.forEach(function (r) {
      var tags = (r.dataset.tags || "").split(/\s+/);
      var okTags = actives.every(function (a) { return tags.indexOf(a) >= 0; });
      var okQ = !q || (r.textContent || "").toLowerCase().indexOf(q) >= 0;
      var vis = okTags && okQ;
      r.style.display = vis ? "" : "none";
      if (vis) shown++;
    });
    var cnt = $("[data-count]", grid);
    if (cnt) cnt.textContent = shown;
    var tot = grid.dataset.total || rows.length;
    var covn = $("[data-covshown]", grid);
    if (covn) covn.textContent = shown;
    var empty = $("[data-empty]", grid);
    var scroll = $(".dg-scroll", grid);
    if (empty) {
      var noRows = shown === 0;
      empty.style.display = noRows ? "" : "none";
      if (scroll) scroll.style.display = noRows ? "none" : "";
      var kind = $("[data-emptykind]", empty);
      if (kind) {
        var filtered = actives.length > 0 || q;
        kind.textContent = filtered
          ? "No rows match this query."
          : "No one is on this list.";
        var why = $("[data-emptywhy]", empty);
        if (why) why.textContent = filtered
          ? "That is a statement about the query, not about the population. Clear the filters to see all " + tot + " rows."
          : "This list is genuinely empty — every source answered and returned nothing.";
      }
    }
    // predicate sentence
    var pred = $("[data-predicate]", grid);
    if (pred) {
      var bits = actives.map(function (a) {
        var el = $('[data-qf="' + a + '"]', grid);
        return '<span class="f">' + (el ? el.dataset.pred || el.textContent.trim() : a) + "</span>";
      });
      if (q) bits.push('<span class="f">text contains “' + q + "”</span>");
      pred.innerHTML = bits.length
        ? bits.join(' <span class="op">AND</span> ')
        : '<span class="f">no filter — every row this query reached</span>';
    }
    // chips
    var chipbar = $("[data-chips]", grid);
    if (chipbar) {
      chipbar.innerHTML = actives.map(function (a) {
        var el = $('[data-qf="' + a + '"]', grid);
        return '<span class="fchip"><b>' + (el ? el.dataset.pred || el.textContent.trim() : a) +
          '</b><span class="x" data-act="unchip" data-qf-clear="' + a + '" role="button" tabindex="0" aria-label="Remove filter">' +
          '<svg class="i i-14" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></span></span>';
      }).join("") + (actives.length > 1
        ? '<button class="a-btn text sm" data-act="clearall" type="button">Clear all</button>' : "");
      chipbar.style.display = actives.length ? "" : "none";
    }
    say(grid, shown + " of " + tot + " rows shown.");
  }

  /* ---------------- keyboard cell focus --------------------------- */
  function moveFocus(grid, dr, dc, abs) {
    var cur = $("td.focus, th.focus", grid);
    var tbody = $("tbody", grid);
    var rows = $$("tr", tbody).filter(function (r) { return r.style.display !== "none"; });
    if (!rows.length) return;
    var r = 0, c = 0;
    if (cur) {
      var tr = cur.parentElement;
      r = rows.indexOf(tr); if (r < 0) r = 0;
      c = Array.prototype.indexOf.call(tr.children, cur);
      cur.classList.remove("focus");
      cur.removeAttribute("tabindex");
    }
    if (abs === "home") c = 0;
    else if (abs === "end") c = rows[r].children.length - 1;
    else if (abs === "top") { r = 0; c = 0; }
    else if (abs === "bottom") { r = rows.length - 1; c = rows[r].children.length - 1; }
    else { r += dr; c += dc; }
    r = Math.max(0, Math.min(rows.length - 1, r));
    c = Math.max(0, Math.min(rows[r].children.length - 1, c));
    var cell = rows[r].children[c];
    cell.classList.add("focus");
    cell.setAttribute("tabindex", "0");
    try { cell.focus({ preventScroll: false }); } catch (e) {}
    var head = $$("thead th", grid)[c];
    var colName = head ? (($(".lbl-t", head) || head).textContent.trim() || "column " + (c + 1)) : "column " + (c + 1);
    var rowName = rows[r].dataset.name || "row " + (r + 1);
    var total = grid.dataset.total || rows.length;
    var abs = +rows[r].dataset.abs || (r + 1);
    say(grid, colName + ", " + (cell.dataset.read || cell.textContent.trim().slice(0, 46) || "blank") +
      " — row " + abs.toLocaleString("en-GB") + " of " + total);
  }

  /* ---------------- filter builder ------------------------------- */
  function buildAst(node) {
    var join = ($(":scope > .ghead .andor button.on", node) || {}).dataset;
    var op = join ? join.j : "and";
    var kids = $$(":scope > .fb-row, :scope > .fb-grp", node);
    var parts = kids.map(function (k) {
      if (k.classList.contains("fb-grp")) return buildAst(k);
      var f = $(".fb-tok.field", k), o = $(".fb-tok.op", k), v = $(".fb-tok.value", k);
      if (!f) return null;
      return { field: f.dataset.f || f.textContent.trim(), op: o ? o.textContent.trim() : "=", value: v ? v.textContent.trim() : "" };
    }).filter(Boolean);
    return { op: op, children: parts };
  }
  function astHtml(n, d) {
    d = d || 0;
    var pad = "  ".repeat(d);
    if (n.field) return pad + '{ <span class="f">' + n.field + '</span>: <span class="op">' + n.op + '</span> <span class="v">"' + n.value + '"</span> }';
    return pad + '<span class="op">' + n.op.toUpperCase() + "</span> [\n" +
      n.children.map(function (c) { return astHtml(c, d + 1); }).join(",\n") + "\n" + pad + "]";
  }
  function refreshBuilder(scope) {
    var root = $(".fb-grp[data-root]", scope);
    if (!root) return;
    var ast = buildAst(root);
    var out = $("[data-ast]", scope);
    if (out) out.innerHTML = astHtml(ast);
    var sent = $("[data-sentence]", scope);
    if (sent) sent.textContent = sentence(ast);
    var n = $("[data-astcount]", scope);
    if (n) n.textContent = count(ast);
  }
  function count(n) { return n.field ? 1 : n.children.reduce(function (a, c) { return a + count(c); }, 0); }
  function sentence(n) {
    if (n.field) return n.field + " " + n.op + " " + n.value;
    var j = n.op === "or" ? " or " : n.op === "not" ? " and not " : " and ";
    return n.children.map(function (c) { return c.field ? sentence(c) : "(" + sentence(c) + ")"; }).join(j);
  }

  /* ---------------- delegated events ----------------------------- */
  document.addEventListener("click", function (e) {
    var t = e.target;

    var th = closest(t, "th[data-key]");
    if (th && !closest(t, ".grip")) {
      var grid = closest(th, "[data-grid]");
      var ths = $$("th[data-key]", grid);
      var multi = e.shiftKey;
      if (!multi) ths.forEach(function (o) { if (o !== th) { delete o.dataset.dir; delete o.dataset.ord; } });
      var d = th.dataset.dir;
      if (!d) { th.dataset.dir = "asc"; th.dataset.ord = String(ths.filter(function (o) { return o.dataset.dir; }).length); }
      else if (d === "asc") th.dataset.dir = "desc";
      else { delete th.dataset.dir; delete th.dataset.ord; }
      var i = 1;
      ths.filter(function (o) { return o.dataset.dir; })
        .sort(function (a, b) { return (+a.dataset.ord || 0) - (+b.dataset.ord || 0); })
        .forEach(function (o) { o.dataset.ord = String(i++); });
      applySort(grid);
      e.preventDefault();
      return;
    }

    var act = closest(t, "[data-act]");
    if (!act) {
      var cell = closest(t, "tbody td");
      if (cell && closest(cell, "[data-grid][data-cellfocus]")) {
        var g0 = closest(cell, "[data-grid]");
        var old = $("td.focus", g0); if (old) { old.classList.remove("focus"); old.removeAttribute("tabindex"); }
        cell.classList.add("focus"); cell.setAttribute("tabindex", "0");
        try { cell.focus({ preventScroll: true }); } catch (er) {}
        moveFocus(g0, 0, 0);
      }
      return;
    }
    var a = act.dataset.act;
    var scope = closest(act, "[data-grid]") || closest(act, "[data-scope]") || document;

    if (a === "selrow") {
      var row = closest(act, "tr");
      row.classList.toggle("sel");
      $(".cbx", row).classList.toggle("on", row.classList.contains("sel"));
      $(".cbx", row).setAttribute("aria-checked", row.classList.contains("sel") ? "true" : "false");
      refreshSel(scope);
    } else if (a === "selall") {
      var rows = $$("tbody tr[data-id]", scope).filter(function (r) { return r.style.display !== "none"; });
      var turnOn = !$("[data-selall]", scope).classList.contains("on");
      rows.forEach(function (r) {
        r.classList.toggle("sel", turnOn);
        var c = $(".cbx", r); if (c) { c.classList.toggle("on", turnOn); c.setAttribute("aria-checked", turnOn ? "true" : "false"); }
      });
      refreshSel(scope);
    } else if (a === "selclear") {
      $$("tbody tr.sel", scope).forEach(function (r) {
        r.classList.remove("sel");
        var c = $(".cbx", r); if (c) { c.classList.remove("on"); c.setAttribute("aria-checked", "false"); }
      });
      refreshSel(scope);
    } else if (a === "qf") {
      act.classList.toggle("on");
      act.setAttribute("aria-pressed", act.classList.contains("on") ? "true" : "false");
      applyFilters(scope);
    } else if (a === "unchip") {
      var k = act.dataset.qfClear;
      var p = $('[data-qf="' + k + '"]', scope);
      if (p) { p.classList.remove("on"); p.setAttribute("aria-pressed", "false"); }
      applyFilters(scope);
    } else if (a === "clearall") {
      $$("[data-qf].on", scope).forEach(function (p) { p.classList.remove("on"); p.setAttribute("aria-pressed", "false"); });
      var s = $("[data-search]", scope); if (s) s.value = "";
      applyFilters(scope);
    } else if (a === "density") {
      var d2 = act.dataset.d;
      $$("[data-act='density']", scope).forEach(function (b) { b.classList.toggle("on", b === act); b.setAttribute("aria-pressed", b === act ? "true" : "false"); });
      $$("[data-grid], .dg", scope).forEach(function (g) {
        g.classList.remove("comfortable", "standard", "compact", "ultra");
        g.classList.add(d2);
      });
      say(scope, "Density: " + d2 + ".");
    } else if (a === "expand") {
      var tr = closest(act, "tr");
      var det = tr.nextElementSibling;
      var open = det && det.dataset.detail !== undefined && det.style.display !== "none";
      if (det && det.dataset.detail !== undefined) {
        det.style.display = open ? "none" : "";
        act.setAttribute("aria-expanded", open ? "false" : "true");
        act.style.transform = open ? "" : "rotate(90deg)";
        say(scope, (open ? "Collapsed " : "Expanded ") + (tr.dataset.name || "row") + ".");
      }
    } else if (a === "inspect") {
      var tr2 = closest(act, "tr");
      $$("tbody tr", scope).forEach(function (r) { r.classList.remove("sel"); });
      tr2.classList.add("sel");
      var box2 = scope.closest ? (scope.closest("[data-scope]") || scope.closest("figure") || scope.closest(".stage")) : null;
      var ins = $("[data-inspector]", scope) || (box2 && $("[data-inspector]", box2));
      if (ins) {
        $$("[data-ins]", ins).forEach(function (p) { p.style.display = p.dataset.ins === tr2.dataset.id ? "" : "none"; });
      }
      say(scope, "Inspector showing " + (tr2.dataset.name || tr2.dataset.id) + ". The grid keeps its scroll position and its focused row.");
    } else if (a === "more") {
      // `.pop` is only added while the popover is open: the shared stylesheet
      // turns off the figure's own scrolling for any stage that :has(.pop),
      // and these popovers live in the DOM permanently.
      var pop = act.querySelector(".gpop") || act.nextElementSibling;
      if (pop && pop.classList.contains("gpop")) {
        var vis = pop.style.display !== "none" && pop.style.display !== "";
        closeAllPops();
        pop.style.display = vis ? "none" : "block";
        pop.classList.toggle("pop", !vis);
        act.setAttribute("aria-expanded", vis ? "false" : "true");
      }
    } else if (a === "andor") {
      var wrap = closest(act, ".andor");
      $$("button", wrap).forEach(function (b) { b.classList.toggle("on", b === act); b.setAttribute("aria-pressed", b === act ? "true" : "false"); });
      refreshBuilder(scope);
    } else if (a === "col") {
      act.classList.toggle("off");
      var key = act.dataset.col;
      var vis2 = !act.classList.contains("off");
      $(".cbx", act).classList.toggle("on", vis2);
      var g3 = $("[data-grid]", scope) || scope;
      var ths2 = $$("th[data-col]", g3);
      ths2.forEach(function (h, i) {
        if (h.dataset.col !== key) return;
        var idx = Array.prototype.indexOf.call(h.parentElement.children, h);
        h.style.display = vis2 ? "" : "none";
        $$("tbody tr", g3).forEach(function (r) { if (r.children[idx]) r.children[idx].style.display = vis2 ? "" : "none"; });
      });
      var n2 = $("[data-colcount]", scope);
      if (n2) n2.textContent = $$("[data-act='col']:not(.off)", scope).length;
      say(scope, (vis2 ? "Showing " : "Hidden ") + key + ".");
    } else if (a === "pin") {
      act.classList.toggle("on");
      say(scope, "Column " + (act.classList.contains("on") ? "pinned to the start." : "unpinned."));
      e.stopPropagation();
    } else if (a === "view") {
      $$("[data-act='view']", scope).forEach(function (v) { v.classList.toggle("on", v === act); });
      var cfg = JSON.parse(act.dataset.cfg || "{}");
      var g4 = $("[data-grid]", scope);
      if (g4) {
        $$("[data-qf]", g4).forEach(function (p) {
          var on = (cfg.filters || []).indexOf(p.dataset.qf) >= 0;
          p.classList.toggle("on", on); p.setAttribute("aria-pressed", on ? "true" : "false");
        });
        $$("th[data-key]", g4).forEach(function (h) { delete h.dataset.dir; delete h.dataset.ord; });
        if (cfg.sort) {
          var target = $('th[data-key="' + cfg.sort[0] + '"]', g4);
          if (target) { target.dataset.dir = cfg.sort[1]; target.dataset.ord = "1"; }
        }
        if (cfg.density) { g4.classList.remove("comfortable", "standard", "compact", "ultra"); g4.classList.add(cfg.density); }
        applyFilters(g4); applySort(g4);
      }
      var meta = $("[data-viewmeta]", scope);
      if (meta) meta.innerHTML = cfg.meta || "";
      say(scope, "Restored view: " + act.dataset.name + ".");
    } else if (a === "arrive") {
      var g5 = $("[data-grid]", scope) || scope;
      var n5 = (+g5.dataset.pending || 0) + 1;
      g5.dataset.pending = String(n5);
      var ar = $("[data-arrivals]", g5);
      if (ar) {
        ar.style.display = "";
        $("[data-arrcount]", ar).textContent = plural(n5, "new admission");
      }
      say(g5, plural(n5, "new admission") + " waiting. Nothing moved: the sort is frozen while your pointer is in the grid.");
    } else if (a === "flush") {
      var g6 = closest(act, "[data-grid]");
      var tb = $("tbody", g6);
      var tpl = $("[data-arrivaltpl]", g6);
      var n6 = +g6.dataset.pending || 0;
      for (var i2 = 0; i2 < n6; i2++) {
        var clone = tpl.content ? tpl.content.cloneNode(true) : null;
        if (clone) { tb.insertBefore(clone, tb.firstChild); }
      }
      g6.dataset.pending = "0";
      $("[data-arrivals]", g6).style.display = "none";
      applySort(g6);
      say(g6, plural(n6, "row") + " inserted, and the row you were pointing at is still where it was.");
    } else if (a === "nl") {
      var box = $("[data-nlq]", scope);
      var q2 = (box && box.value || "").toLowerCase();
      var outc = $("[data-nlchips]", scope);
      var known = [
        [/high[- ]?risk|risk/, "Risk = High or Imminent", "risk"],
        [/no follow[- ]?up|without follow[- ]?up|follow[- ]?up/, "Next appointment = none", "fu"],
        [/30 ?days|thirty days/, "Last seen > 30 days ago", "d30"],
        [/behavio(u)?ral|bh/, "Programme = Behavioural Health", "prog"],
        [/my|mine|assigned to me/, "Assigned clinician = me", "me"],
        [/phq|depress/, "PHQ-9 recorded in the last 30 days", "phq"],
      ];
      var hits = known.filter(function (k) { return k[0].test(q2); });
      var unmatched = q2 && !hits.length;
      if (outc) {
        outc.innerHTML = hits.map(function (k) {
          return '<span class="fchip"><b>' + k[1] + '</b><span class="x" role="button" tabindex="0" aria-label="Remove">' +
            '<svg class="i i-14" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></span></span>';
        }).join("") || (unmatched
          ? '<span class="a-alert error"><svg class="i ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg><span><b>Not compiled.</b> Nothing in that sentence maps to a field this grid has. It has <em>not</em> been approximated — an AI filter that quietly narrows a cohort is the most dangerous thing on this surface.</span></span>'
          : '<span class="t3 sm">Type a question, then press Compile.</span>');
      }
      var run = $("[data-nlrun]", scope);
      if (run) run.style.display = hits.length ? "" : "none";
      var st = $("[data-nlstate]", scope);
      if (st) st.textContent = hits.length ? "Compiled to " + plural(hits.length, "condition") + ". Review, then run." : "";
    }
  });

  /* selection with shift for ranges */
  var lastRow = null;
  document.addEventListener("mousedown", function (e) {
    var act = closest(e.target, "[data-act='selrow']");
    if (!act) return;
    var grid = closest(act, "[data-grid]");
    var row = closest(act, "tr");
    if (e.shiftKey && lastRow && closest(lastRow, "[data-grid]") === grid) {
      e.preventDefault();
      var rows = $$("tbody tr[data-id]", grid).filter(function (r) { return r.style.display !== "none"; });
      var a1 = rows.indexOf(lastRow), b1 = rows.indexOf(row);
      if (a1 > -1 && b1 > -1) {
        var lo = Math.min(a1, b1), hi = Math.max(a1, b1);
        for (var i = lo; i <= hi; i++) {
          rows[i].classList.add("sel");
          var c = $(".cbx", rows[i]); if (c) { c.classList.add("on"); c.setAttribute("aria-checked", "true"); }
        }
        refreshSel(grid);
        say(grid, plural(hi - lo + 1, "row") + " selected as a range.");
      }
    }
    lastRow = row;
  });

  document.addEventListener("input", function (e) {
    if (e.target.matches("[data-search]")) {
      var grid = closest(e.target, "[data-grid]");
      applyFilters(grid);
    }
  });

  document.addEventListener("keydown", function (e) {
    var grid = closest(e.target, "[data-grid][data-cellfocus]");
    if (grid) {
      var map = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
      if (map[e.key]) { e.preventDefault(); moveFocus(grid, map[e.key][0], map[e.key][1]); return; }
      if (e.key === "Home") { e.preventDefault(); moveFocus(grid, 0, 0, e.ctrlKey ? "top" : "home"); return; }
      if (e.key === "End") { e.preventDefault(); moveFocus(grid, 0, 0, e.ctrlKey ? "bottom" : "end"); return; }
      if (e.key === "PageDown") { e.preventDefault(); moveFocus(grid, 5, 0); return; }
      if (e.key === "PageUp") { e.preventDefault(); moveFocus(grid, -5, 0); return; }
      if (e.key === " ") {
        var cell = $("td.focus", grid);
        if (cell) {
          e.preventDefault();
          var row = cell.parentElement;
          row.classList.toggle("sel");
          var c = $(".cbx", row); if (c) { c.classList.toggle("on", row.classList.contains("sel")); }
          refreshSel(grid);
        }
        return;
      }
    }
    if (e.key === "Enter" || e.key === " ") {
      var act = closest(e.target, "[data-act]");
      if (act && act.getAttribute("role") === "button") { e.preventDefault(); act.click(); }
    }
    if (e.key === "Escape") { closeAllPops(); }
  });

  document.addEventListener("click", function (e) {
    if (!closest(e.target, ".gpop") && !closest(e.target, "[data-act='more']")) {
      closeAllPops();
    }
  }, true);

  /* ---------------- column resize -------------------------------- */
  document.addEventListener("pointerdown", function (e) {
    var grip = closest(e.target, ".grip");
    if (!grip) return;
    e.preventDefault();
    var th = closest(grip, "th");
    var grid = closest(th, "[data-grid]");
    var startX = e.clientX, startW = th.getBoundingClientRect().width;
    var min = +th.dataset.min || 64;
    grip.setPointerCapture(e.pointerId);
    function move(ev) {
      var w = Math.max(min, startW + (ev.clientX - startX));
      th.style.width = w + "px";
      var rd = $("[data-resizeout]", grid);
      if (rd) rd.textContent = Math.round(w) + "px";
    }
    function up() {
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", up);
      say(grid, ($(".lbl-t", th) || th).textContent.trim() + " column is now " + Math.round(th.getBoundingClientRect().width) + " pixels wide.");
    }
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", up);
  });

  /* ---------------- boot ----------------------------------------- */
  function boot() {
    $$("[data-grid]").forEach(function (g) {
      $$("tbody tr", g).forEach(function (r, i) { if (!r.dataset.i) r.dataset.i = String(i); });
      if ($("[data-qf]", g) || $("[data-search]", g)) applyFilters(g);
      if ($("th[data-key][data-dir]", g)) applySort(g);
      refreshSel(g);
    });
    $$("[data-scope]").forEach(function (s) { refreshBuilder(s); });
    closeAllPops();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.OxG = { boot: boot, applyFilters: applyFilters, applySort: applySort };
})();
