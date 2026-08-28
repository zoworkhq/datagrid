/**
 * Builds the playground into `dist/`, which is exactly what GitHub Pages
 * serves. `serve.mjs` runs the same build with a watcher, so what you try
 * locally and what deploys are the same artifact.
 */
import { context, build as esbuild } from "esbuild";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(HERE, "dist");
const pkg = (n) => join(HERE, "..", "..", "packages", n, "dist", "index.js");

const PACKAGES = [
  "grid-core", "grid-dom", "grid-signals",
  "grid-healthcare", "grid-export", "grid-fhir", "grid-element",
  "grid-clipboard", "grid-devtools",
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

export function copyStatic() {
  mkdirSync(DIST, { recursive: true });
  for (const f of ["index.html", "style.css"]) copyFileSync(join(HERE, f), join(DIST, f));
  // Tells GitHub Pages not to run the output through Jekyll.
  writeFileSync(join(DIST, ".nojekyll"), "");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
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
