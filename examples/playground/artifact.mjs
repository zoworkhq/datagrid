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

/**
 * Assembles the page. Pure, because every fault this file has shipped was a
 * decision made here rather than a file read:
 *
 *   · matching a literal `<body>` when the tag had gained a class, so
 *     `indexOf` returned -1 and the slice ran from the wrong end;
 *   · dropping the namespace class, which the whole design system is scoped
 *     to, because the host writes its own <body> and discards ours;
 *   · inlining one of the two stylesheets — the half with no colours in it.
 *
 * None of those were visible until the published page was opened.
 */
export function composePage({ html, css, js, title = "Oxygen Data Grid" }) {
  // To the end of the OPENING TAG, not to a literal `<body>`: it carries a class.
  const bodyTag = /<body[^>]*>/.exec(html);
  if (!bodyTag) throw new Error("no <body> in the source document");
  const close = html.indexOf("</body>");
  if (close < 0) throw new Error("no </body> in the source document");

  const body = html
    .slice(bodyTag.index + bodyTag[0].length, close)
    // The module script pointed at a separate file the artifact cannot fetch.
    .replace(/<script type="module"[^>]*><\/script>/, "")
    .trim();

  // The host supplies <body>, so our class has to survive as a wrapper element.
  const namespace = /class="([^"]*)"/.exec(bodyTag[0])?.[1] ?? "";
  const open = namespace ? `<div class="${namespace}">` : "<div>";

  return `<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Mulish:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
html, body { height: 100%; }
${namespace ? `/* The page's own <body> rules, re-aimed at the wrapper. */\n.${namespace} { height: 100%; }` : ""}
${css}
</style>

${open}
${body}
</div>

<script type="module">
${js}
</script>
`;
}

// Guarded, so importing `composePage` for a test does not run a build.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  copyStatic();
  const bundled = await esbuild({
    ...options, outfile: undefined, write: false, minify: true, sourcemap: false,
  });
  // Both sheets, in link order: the brief's design system first, then the
  // adapter that maps it onto the renderer's DOM.
  const page = composePage({
    html: readFileSync(join(HERE, "index.html"), "utf8"),
    css: [
      readFileSync(join(HERE, "brief.generated.css"), "utf8"),
      readFileSync(join(HERE, "style.css"), "utf8"),
    ].join("\n"),
    js: bundled.outputFiles[0].text,
  });

  writeFileSync(OUT, page);
  console.log(`wrote ${OUT} — ${(page.length / 1024).toFixed(0)} kB, self-contained`);
}
