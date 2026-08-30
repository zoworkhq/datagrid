/**
 * Builds the site into `dist/`, which is what GitHub Pages serves.
 *
 * The same shape as the playground's build, and for the same reason: the site
 * consumes the packages exactly as an application would, from their built
 * output, rather than reaching into `src`. If the site can be built from the
 * dist, so can a customer's app.
 */
import { context, build as esbuild } from "esbuild";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(HERE, "dist");
const pkg = (n) => join(HERE, "..", "..", "packages", n, "dist", "index.js");

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

export function copyStatic() {
  mkdirSync(DIST, { recursive: true });
  for (const f of ["index.html", "style.css"]) copyFileSync(join(HERE, f), join(DIST, f));
  writeFileSync(join(DIST, ".nojekyll"), "");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  copyStatic();
  if (process.argv.includes("--watch")) {
    const ctx = await context(options);
    await ctx.watch();
    const { port } = await ctx.serve({ servedir: DIST, host: "127.0.0.1", port: 5174 });
    console.log(`site on http://127.0.0.1:${port}`);
  } else {
    await esbuild(options);
    console.log("built examples/site");
  }
}
