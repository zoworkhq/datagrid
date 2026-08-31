/**
 * Builds the documentation site into `dist/`.
 *
 * ── ONE SOURCE, NOT TWO ─────────────────────────────────────────────────────
 *
 * Every page here is rendered from a file in `docs/` at build time. Nothing is
 * transcribed. A documentation site whose prose is a COPY of the repository's
 * prose is a site that is wrong within a month, and the way you find out is a
 * customer following an instruction that stopped being true.
 *
 * So the markdown stays the source, `git log docs/` stays the changelog, and
 * this file is a renderer. If a page here says something, `docs/` says it too.
 */
import { context, build as esbuild } from "esbuild";
import { copyFileSync, cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { render, escapeHtml } from "../../scripts/markdown.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const DIST = join(HERE, "dist");
const DOCS = join(ROOT, "docs");
const pkg = (n) => join(ROOT, "packages", n, "dist", "index.js");

const PACKAGES = [
  "grid-core", "grid-dom", "grid-signals", "grid-healthcare",
  "grid-export", "grid-fhir", "grid-element", "grid-clipboard",
];

export const options = {
  entryPoints: [join(HERE, "main.ts")],
  outfile: join(DIST, "main.js"),
  bundle: true,
  format: "esm",
  target: "es2022",
  sourcemap: true,
  minify: process.env["NODE_ENV"] === "production",
  alias: Object.fromEntries(PACKAGES.map((n) => [`@oxygenui-design/${n}`, pkg(n)])),
};

/** The decision records, newest number last, read off disk so none is missed. */
function decisions() {
  return readdirSync(join(DOCS, "decisions"))
    .filter((f) => /^\d{4}-.*\.md$/.test(f))
    .sort()
    .map((file) => {
      const source = readFileSync(join(DOCS, "decisions", file), "utf8");
      const title = (/^#\s+(.*)$/m.exec(source)?.[1] ?? file).trim();
      return { file, source, title, out: `decisions/${file.replace(/\.md$/, ".html")}` };
    });
}

/**
 * The pages, in reading order.
 *
 * Order is editorial and carries information — a developer who reads top to
 * bottom should meet the concepts before the reference and the reference
 * before the arguments — so it is written here rather than derived from
 * whatever order the filesystem returns.
 */
function pages() {
  const read = (f) => readFileSync(join(DOCS, f), "utf8");
  const adrs = decisions();
  return [
    { out: "index.html", title: "API guide", group: "Guide", source: read("api.md") },
    { out: "accessibility.html", title: "Accessibility", group: "Guide", source: read("accessibility.md") },
    { out: "decisions/index.html", title: "How decisions are recorded", group: "Decisions", source: read("decisions/README.md") },
    ...adrs.map((a) => ({ out: a.out, title: a.title, group: "Decisions", source: a.source })),
    // The research README explains where the two big reports came from, and
    // several decisions cite it — so it is a page, not a dead link.
    { out: "research/index.html", title: "Research", group: "Research", source: read("research/README.md") },
  ];
}

const NAV_GROUPS = ["Guide", "Decisions", "Research"];

const REPO = "https://github.com/zoworkhq/datagrid/blob/main";

/**
 * Where a link in the markdown should point once rendered.
 *
 * The docs tree mirrors `docs/` exactly, so a link between two documents that
 * both live there needs no help. Everything else — `HANDOVER.md`, `README.md`,
 * anything above `docs/` — is a repository file that this site does not
 * publish, and it goes to GitHub rather than to a 404. Checked by
 * `scripts/pages.mjs`, which follows every link in the built output.
 */
function rewriteLink(href, depth) {
  if (/^(https?:\/\/|#)/.test(href)) return href;
  // Anything reaching above the docs directory is a repository file.
  const up = (href.match(/\.\.\//g) ?? []).length;
  if (up > depth) return `${REPO}/${href.replace(/^(\.\.\/)+/, "")}`;
  return href.replace(/README\.md(#|$)/, "index.html$1").replace(/\.md(#|$)/, ".html$1");
}

function shell(page, all) {
  // How many directories below the docs root this page sits — the depth a
  // "../" is allowed to climb before it has left the published tree.
  const depth = page.out.split("/").length - 1;
  const { html, outline } = render(page.source, (href) => rewriteLink(href, depth));

  const up = "../".repeat(depth);

  const nav = NAV_GROUPS.map((group) => {
    const items = all
      .filter((p) => p.group === group)
      .map((p) => {
        const here = p.out === page.out;
        return `<li><a href="${up}${p.out}"${here ? ' aria-current="page"' : ""}>${escapeHtml(p.title)}</a>` +
          // Only the page you are on expands into its own headings. Every
          // page's headings at once is a table of contents nobody can scan.
          (here && outline.length
            ? `<ul class="sub">${outline
                .map((o) => `<li class="lvl${o.level}"><a href="#${o.id}">${escapeHtml(o.text)}</a></li>`)
                .join("")}</ul>`
            : "") +
          `</li>`;
      })
      .join("");
    return `<div class="navgroup"><p class="navhead">${group}</p><ul>${items}</ul></div>`;
  }).join("");

  // The search index is the page titles and headings, inlined. It is a few
  // kilobytes, so it needs no request and works with the network off.
  const index = all.map((p) => ({
    t: p.title,
    u: `${up}${p.out}`,
    h: render(p.source).outline.map((o) => ({ t: o.text, u: `${up}${p.out}#${o.id}` })),
  }));

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(page.title)} — Oxygen Data Grid</title>
<meta name="description" content="Documentation for Oxygen Data Grid, a virtualised data grid for healthcare software." />
<meta name="theme-color" content="#06080b" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500;600;700&family=Noto+Sans+Display:wght@600;700;800&family=Noto+Sans+Mono:wght@400;500;600&display=swap" />
<link rel="stylesheet" href="${up}docs.css" />
</head>
<body>
<a class="skip" href="#doc">Skip to content</a>

<header class="dtop">
  <a class="wordmark" href="${up}../index.html">
    <span class="mark" aria-hidden="true"></span>Oxygen<span class="wordmark-2">Docs</span>
  </a>
  <button class="navtoggle" type="button" id="navtoggle" aria-expanded="false" aria-controls="nav">Menu</button>
  <div class="searchbox">
    <input type="search" id="search" placeholder="Search the docs" aria-label="Search the docs"
           autocomplete="off" role="combobox" aria-expanded="false" aria-controls="results" />
    <kbd>/</kbd>
    <ul class="results" id="results" role="listbox" hidden></ul>
  </div>
  <div class="dtopright">
    <button id="theme" class="ghost" type="button" aria-live="polite">
      <span class="ticon" aria-hidden="true"></span><span class="tlabel">System</span>
    </button>
    <a class="ghost gh" href="https://github.com/zoworkhq/datagrid">GitHub</a>
  </div>
</header>

<div class="shell">
  <nav class="nav" id="nav" aria-label="Documentation">${nav}</nav>
  <main class="doc" id="doc">
    <article class="prose">${html}</article>
    <footer class="docfoot">
      <p>Rendered from <code>docs/</code> in the repository — this page has no separate copy to drift from.</p>
      <p class="dim">Every example is synthetic. The library is not a compliance boundary, is not clinical
      decision support, and is not a medical device.</p>
    </footer>
  </main>
</div>

<script id="searchindex" type="application/json">${JSON.stringify(index).replace(/</g, "\\u003c")}</script>
<script type="module" src="${up}main.js"></script>
</body>
</html>`;
}

export function buildPages() {
  // Cleaned, not merged. A previous build's page layout left `decisions-*.html`
  // beside the new `decisions/*.html`, and the link checker dutifully reported
  // the stale copies as broken — output that nothing writes any more should not
  // survive to be deployed.
  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });
  const all = pages();
  // Each page makes its own directory, so adding a page in a new subdirectory
  // never needs a matching line here to be remembered.
  for (const page of all) {
    mkdirSync(join(DIST, dirname(page.out)), { recursive: true });
    writeFileSync(join(DIST, page.out), shell(page, all));
  }
  copyFileSync(join(HERE, "docs.css"), join(DIST, "docs.css"));
  // The research reports are already HTML and several decisions cite them, so
  // they ship verbatim rather than becoming dead references.
  cpSync(join(DOCS, "research"), join(DIST, "research"), { recursive: true });
  writeFileSync(join(DIST, ".nojekyll"), "");
  return all.length;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const n = buildPages();
  if (process.argv.includes("--watch")) {
    const ctx = await context(options);
    await ctx.watch();
    const { port } = await ctx.serve({ servedir: DIST, host: "127.0.0.1", port: 5175 });
    console.log(`docs on http://127.0.0.1:${port} (${n} pages)`);
  } else {
    await esbuild(options);
    console.log(`built examples/docs — ${n} pages`);
  }
}
