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

export function copyStatic() {
  mkdirSync(DIST, { recursive: true });
  for (const f of ["index.html", "style.css"]) copyFileSync(join(HERE, f), join(DIST, f));
  // Tells GitHub Pages not to run the output through Jekyll.
  writeFileSync(join(DIST, ".nojekyll"), "");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await precomputeMigrations();
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
