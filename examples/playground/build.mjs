/**
 * Builds the playground into `dist/`, which is exactly what GitHub Pages
 * serves. `serve.mjs` runs the same build with a watcher, so what you try
 * locally and what deploys are the same artifact.
 */
import { context, build as esbuild } from "esbuild";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(HERE, "dist");
const pkg = (n) => join(HERE, "..", "..", "packages", n, "dist", "index.js");

const PACKAGES = [
  "grid-core", "grid-dom", "grid-signals",
  "grid-healthcare", "grid-export", "grid-fhir", "grid-element",
  "grid-clipboard", "grid-devtools", "grid-ai", "grid-codemod",
];

export const options = {
  entryPoints: [join(HERE, "main.ts")],
  outfile: join(DIST, "main.js"),
  bundle: true,
  format: "esm",
  target: "es2022",
  sourcemap: true,
  // Aliased to built output rather than added as root dependencies: the
  // playground is a consumer of the packages, not a member of the workspace.
  alias: Object.fromEntries(PACKAGES.map((n) => [`@oxygenui-design/${n}`, pkg(n)])),
};

/**
 * Runs the codemod at BUILD time and emits its output as data.
 *
 * A codemod is a build-time tool. Bundling it for the browser dragged the whole
 * TypeScript compiler into the page — 9.99 MB for a panel that shows two fixed
 * examples. Running it here is both smaller and a more honest picture of how it
 * is actually used.
 */
async function precomputeMigrations() {
  const { migrate, describeMigration } = await import(pkg("grid-codemod"));
  const samples = {
    antd: `import { Table, Button } from "antd";

export function Roster({ patients }) {
  return (
    <Table
      columns={columns}
      dataSource={patients}
      rowKey="id"
      pagination={{ pageSize: 20 }}
      onChange={handleChange}
    />
  );
}`,
    mui: `import { DataGrid } from "@mui/x-data-grid";

export function Roster({ patients }) {
  return (
    <DataGrid
      rows={patients}
      columns={columns}
      getRowId={(r) => r.id}
      checkboxSelection
    />
  );
}`,
  };
  const out = {};
  for (const [source, code] of Object.entries(samples)) {
    const result = migrate(code, source);
    out[source] = { input: code, output: result.code, report: describeMigration(result) };
  }
  mkdirSync(DIST, { recursive: true });
  writeFileSync(join(HERE, "migrations.generated.json"), JSON.stringify(out, null, 2) + "\n");
  console.log("precomputed migrations for", Object.keys(out).join(", "));
}

/**
 * Lifts the mockup design system out of the checked-in component brief.
 *
 * The brief IS the design. Copying its CSS here would mean two copies drifting
 * apart the first time a generator changes, and the demo quietly ceasing to
 * show what was signed off. Extracting it at build time makes the resemblance
 * structural: regenerate the brief and the demo follows.
 *
 * Everything is namespaced under `.antd` on the way out — the brief already
 * scopes most of its mockup primitives that way, but a few (`.cov`, `.stage`)
 * are bare, and those would collide with the playground's own class names.
 * Prefixing on extraction means the demo opts in by putting `.antd` on a
 * container, and nothing leaks into the page chrome by accident.
 */
export function liftDesignSystem(brief) {
  const styles = [...brief.matchAll(/<style>([\s\S]*?)<\/style>/g)]
    .map((m) => m[1])
    .join("\n")
    // Comments come out FIRST. This parser matches braces to find a rule's
    // extent, and the brief documents its own CSS in prose that quotes
    // declarations — `.tile.crit { border-color: currentColor }` inside a
    // comment. Those braces are counted, the parser loses its place, and whole
    // @media blocks silently vanish from the output. Five of them did, which is
    // why the demo rendered dark text on light rules.
    .replace(/\/\*[\s\S]*?\*\//g, "");

  // Element-only selectors are the document's prose (body, h1, p). Everything
  // carrying a class or a custom-property root is design system.
  const isDesign = (sel) => /\.[a-zA-Z]|:root|\[data-theme/.test(sel);
  const scope = (sel) =>
    sel
      .split(",")
      .map((part) => {
        const t = part.trim();
        if (!t || t.startsWith("@")) return t;
        if (/\.antd|\.ox\b/.test(t)) return t;
        // :root needs the class on a descendant, not on :root itself.
        if (t.startsWith(":root")) return t.replace(/^:root/, ":root").concat(" .antd");
        return `.antd ${t}`;
      })
      .join(", ");

  const kept = [];
  let i = 0;
  while (i < styles.length) {
    const open = styles.indexOf("{", i);
    if (open < 0) break;
    let depth = 1;
    let j = open + 1;
    while (j < styles.length && depth > 0) {
      if (styles[j] === "{") depth++;
      else if (styles[j] === "}") depth--;
      j++;
    }
    const rule = styles.slice(i, j);
    const sel = rule.slice(0, rule.indexOf("{")).trim();
    const body = rule.slice(rule.indexOf("{") + 1, rule.lastIndexOf("}"));

    if (sel.startsWith("@")) {
      // A conditional group: scope the rules inside it, keep the condition.
      const inner = [];
      let k = 0;
      while (k < body.length) {
        const o = body.indexOf("{", k);
        if (o < 0) break;
        let d = 1;
        let m = o + 1;
        while (m < body.length && d > 0) {
          if (body[m] === "{") d++;
          else if (body[m] === "}") d--;
          m++;
        }
        const s2 = body.slice(k, o).trim();
        if (isDesign(s2)) inner.push(`${scope(s2)} {${body.slice(o + 1, m - 1)}}`);
        k = m;
      }
      if (inner.length > 0) kept.push(`${sel} {\n${inner.join("\n")}\n}`);
    } else if (isDesign(sel)) {
      kept.push(`${scope(sel)} {${body}}`);
    }
    i = j;
  }

  return {
    rules: kept,
    css: [
      "/*",
      " * GENERATED — do not edit. See liftDesignSystem() in build.mjs.",
      " * Lifted from docs/research/2026-08-27-product-brief.html and namespaced",
      " * under .antd, so the demo and the brief cannot disagree about what the",
      " * component looks like.",
      " */",
      "",
      ...kept,
      "",
    ].join("\n"),
  };
}

/** The IO half. Everything decidable lives in `liftDesignSystem`. */
function extractBriefCss() {
  const brief = readFileSync(
    join(HERE, "..", "..", "docs", "research", "2026-08-27-product-brief.html"),
    "utf8",
  );
  const { css, rules } = liftDesignSystem(brief);
  writeFileSync(join(HERE, "brief.generated.css"), css);
  console.log(`lifted ${rules.length} rules from the brief — ${(css.length / 1024).toFixed(0)} kB`);
}

export function copyStatic() {
  mkdirSync(DIST, { recursive: true });
  for (const f of ["index.html", "style.css", "brief.generated.css"]) {
    copyFileSync(join(HERE, f), join(DIST, f));
  }
  // Tells GitHub Pages not to run the output through Jekyll.
  writeFileSync(join(DIST, ".nojekyll"), "");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await precomputeMigrations();
  extractBriefCss();
  copyStatic();
  if (process.argv.includes("--watch")) {
    const ctx = await context(options);
    await ctx.watch();
    const { port } = await ctx.serve({ servedir: DIST, host: "127.0.0.1", port: 5173 });
    console.log(`playground on http://127.0.0.1:${port}`);
  } else {
    await esbuild({ ...options, minify: true, sourcemap: false });
    console.log("built examples/playground/dist");
  }
}
