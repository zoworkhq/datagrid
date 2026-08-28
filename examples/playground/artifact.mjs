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
const css = readFileSync(join(HERE, "style.css"), "utf8");
const html = readFileSync(join(HERE, "index.html"), "utf8");

// Everything between <body> and </body>, minus the module script tag that
// pointed at the separate file.
const body = html
  .slice(html.indexOf("<body>") + "<body>".length, html.indexOf("</body>"))
  .replace(/<script type="module"[^>]*><\/script>/, "")
  .trim();

const page = `<title>Oxygen Data Grid</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Mulish:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
html, body { height: 100%; }
${css}
</style>

${body}

<script type="module">
${js}
</script>
`;

writeFileSync(OUT, page);
console.log(`wrote ${OUT} — ${(page.length / 1024).toFixed(0)} kB, self-contained`);
