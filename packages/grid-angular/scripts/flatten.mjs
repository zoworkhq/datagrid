/**
 * Normalises ng-packagr's output to the layout every other package in this
 * workspace uses: `dist/index.js` and `dist/index.d.ts`.
 *
 * ng-packagr emits an FESM bundle and a rolled-up `.d.ts` under its own names,
 * plus a rewritten package manifest. Rather than making the whole repository
 * special-case this one adapter — the size gate, the exports map and the
 * documentation all assume dist/index.js — the output is copied into place.
 *
 * The Angular toolchain stays entirely inside this package. Nothing else in the
 * workspace knows it exists.
 */
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(dirname(fileURLToPath(import.meta.url)));
const NG = join(HERE, "dist-ng");
const DIST = join(HERE, "dist");

mkdirSync(DIST, { recursive: true });

const fesm = readdirSync(join(NG, "fesm2022")).find((f) => f.endsWith(".mjs"));
const types = readdirSync(join(NG, "types")).find((f) => f.endsWith(".d.ts"));
if (!fesm || !types) throw new Error("ng-packagr output not found — did the build run?");

copyFileSync(join(NG, "fesm2022", fesm), join(DIST, "index.js"));
copyFileSync(join(NG, "types", types), join(DIST, "index.d.ts"));
console.log("grid-angular: dist/index.js and dist/index.d.ts written from ng-packagr output");
