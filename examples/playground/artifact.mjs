/**
 * Bundles the playground into ONE self-contained HTML file, for sharing.
 *
 * An Artifact is a single page with a strict CSP: no external hosts except
 * Google Fonts, no separate script or stylesheet files. So the CSS and the
 * bundled JS are inlined, and the document wrapper is stripped — the host
 * supplies `<!doctype html><html><head>…<body>` at publish time.
 */
import { build as esbuild } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { options, copyStatic } from "./build.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "dist", "artifact.html");

copyStatic();
const bundled = await esbuild({ ...options, outfile: undefined, write: false, minify: true, sourcemap: false });
const js = bundled.outputFiles[0].text;
// Both sheets, in link order: the brief's design system first, then the
// adapter that maps it onto the renderer's DOM. Inlining only the second one
// published a demo with no design at all.
const css = [
  readFileSync(join(HERE, "brief.generated.css"), "utf8"),
  readFileSync(join(HERE, "style.css"), "utf8"),
].join("\n");
const html = readFileSync(join(HERE, "index.html"), "utf8");

// Everything between <body …> and </body>, minus the module script tag that
// pointed at the separate file. Matched to the end of the OPENING TAG rather
// than to a literal `<body>`, because the tag carries a class.
const bodyTag = /<body[^>]*>/.exec(html);
if (!bodyTag) throw new Error("no <body> in index.html");
const body = html
  .slice(bodyTag.index + bodyTag[0].length, html.indexOf("</body>"))
  .replace(/<script type="module"[^>]*><\/script>/, "")
  .trim();

// The host writes its own <body>, so the class on ours is discarded — and the
// entire lifted design system is scoped to `.antd`. Without this wrapper the
// artifact publishes with no styling whatsoever.
const namespace = /<body[^>]*class="([^"]*)"/.exec(html)?.[1] ?? "";

const page = `<title>Oxygen Data Grid</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Mulish:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
html, body { height: 100%; }
/* The page's own <body> rules, re-aimed at the namespace wrapper. */
.${namespace} { height: 100%; }
${css}
</style>

<div class="${namespace}">
${body}
</div>

<script type="module">
${js}
</script>
`;

writeFileSync(OUT, page);
console.log(`wrote ${OUT} — ${(page.length / 1024).toFixed(0)} kB, self-contained`);
