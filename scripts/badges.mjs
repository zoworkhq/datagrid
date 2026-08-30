/**
 * The README's numbers, measured rather than remembered.
 *
 * ── WHY THIS IS A SCRIPT AND NOT A HABIT ────────────────────────────────────
 *
 * The badge said 430 tests while the suite ran 1,002. Nobody lied; the number
 * was true once and nothing made it stay true. A README that is wrong about a
 * fact anyone can check in ten seconds costs more trust than the fact was
 * worth, and the reader has no way to know which of the other numbers are also
 * two months old.
 *
 *   node scripts/badges.mjs           rewrite the badges from measurement
 *   node scripts/badges.mjs --check   fail if any of them has drifted
 *
 * `--check` runs in the gate, so drift is a build failure rather than a thing
 * someone notices during a review.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const README = join(ROOT, "README.md");
const check = process.argv.includes("--check");

const run = (cmd, args) =>
  execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

/** Numbered records only — the folder also holds a README. */
const adrCount = () => readdirSync(join(ROOT, "docs", "decisions")).filter((f) => /^\d{4}-/.test(f)).length;

const packages = () =>
  readdirSync(join(ROOT, "packages")).map((name) =>
    JSON.parse(readFileSync(join(ROOT, "packages", name, "package.json"), "utf8")),
  );

const published = () => packages().filter((p) => p.private !== true).length;

const testCount = () => {
  const out = run("npx", ["vitest", "run", "--reporter=dot"]);
  const m = /Tests\s+(\d+) passed/.exec(out);
  if (!m) throw new Error("could not read the test count from vitest");
  return Number(m[1]);
};

const composedKb = () => {
  const out = run("npx", ["size-limit"]);
  const m = /Size:\s+([\d.]+) kB/.exec(out);
  if (!m) throw new Error("could not read the composed size from size-limit");
  return m[1];
};

const reactBytes = () => {
  const out = run("npx", ["turbo", "run", "size", "--filter=@oxygenui-design/grid-react"]);
  const m = /Size:\s+(\d+) B/.exec(out);
  return m ? m[1] : null;
};

/** Each badge, with the value it must carry. */
function badges() {
  const total = published();
  return [
    {
      key: "composed bundle",
      alt: `the whole grid, composed, ${composedKb()} kB`,
      url: `composed%20bundle-${composedKb()}%20kB%20%2F%2016%20kB-0E7C66`,
    },
    ...(reactBytes()
      ? [{
          key: "react adapter",
          alt: `React adapter ${reactBytes()} bytes`,
          url: `react%20adapter-${reactBytes()}%20B-0E7C66`,
        }]
      : []),
    { key: "runtime deps", alt: "one external runtime dependency", url: "runtime%20deps-1-0E7C66" },
    { key: "tests", alt: `${testCount()} tests`, url: `tests-${testCount()}-0E7C66` },
    { key: "ADRs", alt: `${adrCount()} accepted decision records`, url: `ADRs-${adrCount()}%20accepted-0E7C66` },
    total === 0
      ? { key: "npm", alt: "not published to npm", url: "npm-not%20published-b7791f" }
      : { key: "npm", alt: `${total} packages published`, url: `npm-${total}%20published-0E7C66` },
  ];
}

const render = (b) => `<img alt="${b.alt}" src="https://img.shields.io/badge/${b.url}.svg" />`;

const current = readFileSync(README, "utf8");
const block = badges().map(render).join("\n");
const next = current.replace(
  /(<sub>\n)[\s\S]*?(\n<\/sub>)/,
  (_, open, close) => `${open}${block}${close}`,
);

if (check) {
  if (next === current) {
    console.log(`badges are current — ${badges().map((b) => b.alt).join(" · ")}`);
    process.exit(0);
  }
  console.error("README badges have drifted from what the repository measures.\n");
  console.error("expected:\n" + block + "\n");
  console.error("run `pnpm badges` to update them.");
  process.exit(1);
}

writeFileSync(README, next);
console.log(`badges written — ${badges().map((b) => b.alt).join(" · ")}`);
