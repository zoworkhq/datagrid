/**
 * Builds the marketing site and the documentation into one deployable tree.
 *
 * ── WHY THEY SHIP TOGETHER ──────────────────────────────────────────────────
 *
 * They link to each other. Built separately and served on two ports, every
 * cross-link is a 404 that nobody notices until it is in front of a customer,
 * because in development you only ever open one of them at a time.
 *
 * So the layout is decided here, once:
 *
 *   /              the site
 *   /docs/         the documentation
 *
 * and both are checked, after the build, by following every internal link and
 * confirming a file exists at the other end. A link checker that runs on the
 * OUTPUT is the only kind that can catch a path assembled at build time.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, normalize, posix } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const OUT = join(ROOT, "dist-pages");

const SITE = join(ROOT, "examples", "site", "dist");
const DOCS = join(ROOT, "examples", "docs", "dist");

function assemble() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  for (const [from, to] of [[SITE, OUT], [DOCS, join(OUT, "docs")]]) {
    if (!existsSync(from)) {
      throw new Error(`${from} is missing — run the site and docs builds first`);
    }
    cpSync(from, to, { recursive: true });
  }
}

/** Every HTML file in the output, as paths relative to the output root. */
function htmlFiles(dir = OUT, prefix = "") {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = posix.join(prefix, entry.name);
    if (entry.isDirectory()) out.push(...htmlFiles(join(dir, entry.name), rel));
    else if (entry.name.endsWith(".html")) out.push(rel);
  }
  return out;
}

/**
 * Follows every internal href and src, and reports the ones that land nowhere.
 *
 * Fragment-only links are checked against the ids in the SAME file; a link to
 * another page's fragment is checked as far as the file existing, because the
 * id may be generated and this is a build check, not a crawler.
 */
function checkLinks() {
  const broken = [];
  for (const file of htmlFiles()) {
    const html = readFileSync(join(OUT, file), "utf8");
    const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    const dir = posix.dirname(file);

    for (const [, attr, value] of html.matchAll(/\s(href|src)="([^"]+)"/g)) {
      if (/^(https?:|mailto:|data:|#$)/.test(value)) continue;

      if (value.startsWith("#")) {
        const id = decodeURIComponent(value.slice(1));
        if (!ids.has(id)) broken.push(`${file} → ${value} (no such id on the page)`);
        continue;
      }

      const [path] = value.split("#");
      if (!path) continue;
      const target = normalize(join(OUT, dir, path));
      const ok = existsSync(target) && (statSync(target).isFile() || existsSync(join(target, "index.html")));
      if (!ok) broken.push(`${file} → ${attr}="${value}"`);
    }
  }
  return broken;
}

assemble();
const pages = htmlFiles();
const broken = checkLinks();

for (const b of broken) console.error(`  BROKEN  ${b}`);
console.log(
  broken.length === 0
    ? `dist-pages: ${pages.length} pages, every internal link resolves`
    : `dist-pages: ${broken.length} broken link(s) across ${pages.length} pages`,
);
process.exit(broken.length === 0 ? 0 : 1);
