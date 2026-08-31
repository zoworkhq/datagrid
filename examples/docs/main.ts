/**
 * The documentation site's behaviour.
 *
 * Four things, all of which a developer reaching for docs expects to work
 * before they expect anything else: search from the keyboard, copy a code
 * block, know where they are, and read in the theme they chose.
 */

const el = <T extends HTMLElement>(id: string): T | null => document.getElementById(id) as T | null;

// ── theme ───────────────────────────────────────────────────────────────────
// Shares its storage key with the marketing site, so the choice a reader makes
// on one survives the click through to the other.

type Theme = "system" | "light" | "dark";
const KEY = "oxg-site-theme";

function applyTheme(next: Theme): void {
  const root = document.documentElement;
  if (next === "system") delete root.dataset["theme"];
  else root.dataset["theme"] = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // A private window is not a reason to fail.
  }
  const label = document.querySelector(".tlabel");
  if (label) label.textContent = next === "system" ? "System" : next === "light" ? "Light" : "Dark";
}

function mountTheme(): void {
  let theme: Theme = "system";
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === "light" || stored === "dark" || stored === "system") theme = stored;
  } catch {
    // ignored
  }
  applyTheme(theme);
  el("theme")?.addEventListener("click", () => {
    theme = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
    applyTheme(theme);
  });
}

// ── copy ────────────────────────────────────────────────────────────────────

function mountCopy(): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>(".code .copy")) {
    button.addEventListener("click", async () => {
      const code = button.parentElement?.querySelector("code")?.textContent ?? "";
      try {
        await navigator.clipboard.writeText(code);
        button.textContent = "Copied";
      } catch {
        // Clipboard access can be refused, and a button that lies about
        // having copied is worse than one that admits it did not.
        button.textContent = "Press ⌘C";
        const range = document.createRange();
        const node = button.parentElement?.querySelector("code");
        if (node) {
          range.selectNodeContents(node);
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
      }
      window.setTimeout(() => { button.textContent = "Copy"; }, 1600);
    });
  }
}

// ── search ──────────────────────────────────────────────────────────────────

interface Hit { readonly t: string; readonly u: string; readonly h?: readonly Hit[] }

function flatten(index: readonly Hit[]): { t: string; u: string; page: string }[] {
  const out: { t: string; u: string; page: string }[] = [];
  for (const page of index) {
    out.push({ t: page.t, u: page.u, page: page.t });
    for (const h of page.h ?? []) out.push({ t: h.t, u: h.u, page: page.t });
  }
  return out;
}

/**
 * Subsequence matching, scored.
 *
 * Not a substring match: a developer typing "rowmod" should find "Choosing a
 * row model", and typing the exact words in order is rare. A prefix hit ranks
 * above an interior one, and a tighter span above a scattered one, so the
 * thing you were obviously reaching for is first.
 */
function score(text: string, query: string): number {
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  if (q.length === 0) return 0;
  if (t.startsWith(q)) return 1000;

  let i = 0;
  let first = -1;
  let last = -1;
  for (const ch of q) {
    const at = t.indexOf(ch, i);
    if (at < 0) return -1;
    if (first < 0) first = at;
    last = at;
    i = at + 1;
  }
  const span = last - first + 1;
  return 500 - span - first;
}

function mountSearch(): void {
  const input = el<HTMLInputElement>("search");
  const list = el<HTMLUListElement>("results");
  const raw = document.getElementById("searchindex")?.textContent ?? "[]";
  if (!input || !list) return;

  const entries = flatten(JSON.parse(raw) as Hit[]);
  let active = -1;

  const close = (): void => {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    active = -1;
  };

  const paint = (query: string): void => {
    if (query.trim().length < 2) return close();
    const hits = entries
      .map((e) => ({ e, s: score(e.t, query) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 8);

    if (hits.length === 0) {
      list.innerHTML = `<li class="empty">Nothing matches “${query.replace(/[<&]/g, "")}”.</li>`;
      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
      return;
    }

    list.innerHTML = hits
      .map(({ e }, i) =>
        `<li role="option" aria-selected="${i === 0}"><a href="${e.u}">` +
        `<span class="hit">${e.t.replace(/[<&]/g, "")}</span>` +
        `<span class="hitpage">${e.page.replace(/[<&]/g, "")}</span></a></li>`,
      )
      .join("");
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    active = 0;
  };

  const move = (delta: number): void => {
    const items = [...list.querySelectorAll("li[role=option]")];
    if (items.length === 0) return;
    active = (active + delta + items.length) % items.length;
    items.forEach((li, i) => li.setAttribute("aria-selected", String(i === active)));
    items[active]?.scrollIntoView({ block: "nearest" });
  };

  input.addEventListener("input", () => paint(input.value));
  input.addEventListener("focus", () => paint(input.value));

  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") { event.preventDefault(); move(1); }
    else if (event.key === "ArrowUp") { event.preventDefault(); move(-1); }
    else if (event.key === "Enter") {
      const link = list.querySelectorAll<HTMLAnchorElement>("li[role=option] a")[Math.max(active, 0)];
      if (link) { event.preventDefault(); window.location.href = link.href; }
    } else if (event.key === "Escape") { close(); input.blur(); }
  });

  document.addEventListener("click", (event) => {
    if (!(event.target as Element | null)?.closest(".searchbox")) close();
  });

  // `/` focuses search, the convention every developer already has in their
  // fingers — but not while they are typing into something else.
  document.addEventListener("keydown", (event) => {
    const target = event.target as HTMLElement | null;
    const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
    if (event.key === "/" && !typing) { event.preventDefault(); input.focus(); input.select(); }
  });
}

// ── where you are ───────────────────────────────────────────────────────────

/** Marks the heading currently being read in the sidebar outline. */
function mountScrollSpy(): void {
  const links = new Map<string, HTMLAnchorElement>();
  for (const a of document.querySelectorAll<HTMLAnchorElement>(".sub a")) {
    links.set(a.getAttribute("href")?.slice(1) ?? "", a);
  }
  if (links.size === 0) return;

  const spy = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        for (const other of links.values()) other.removeAttribute("aria-current");
        links.get(entry.target.id)?.setAttribute("aria-current", "true");
      }
    },
    { rootMargin: "-10% 0px -80% 0px" },
  );
  for (const id of links.keys()) {
    const node = document.getElementById(id);
    if (node) spy.observe(node);
  }
}

function mountNavToggle(): void {
  const button = el<HTMLButtonElement>("navtoggle");
  const nav = el("nav");
  button?.addEventListener("click", () => {
    const open = nav?.toggleAttribute("data-open") ?? false;
    button.setAttribute("aria-expanded", String(open));
  });
}

mountTheme();
mountCopy();
mountSearch();
mountScrollSpy();
mountNavToggle();
