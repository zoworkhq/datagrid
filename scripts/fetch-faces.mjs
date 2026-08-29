/**
 * Downloads the roster's portrait photographs and embeds them as data URIs.
 *
 * Run rarely, by hand; the output is committed. Two reasons it is not a
 * runtime fetch:
 *
 *   · the published artifact runs under a CSP that allows no external host but
 *     Google Fonts, so a remote <img> renders as a broken image for everyone
 *     the page is shared with;
 *   · a build that needs the network is a build that fails offline and in CI.
 *
 * PROVENANCE. These are real photographs of real people, served by
 * randomuser.me, which sources them from uifaces.co. They are published for
 * use in mockups and test data. Anyone shipping this beyond a demo should
 * confirm that licence covers their use — a face is not a placeholder colour.
 *
 *   node scripts/fetch-faces.mjs
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "examples", "playground", "faces.generated.ts");

/**
 * Two sets, kept apart.
 *
 * Not a statement about anybody — it is the source's own division, and it
 * exists here for one reason: pairing a masculine photograph with a feminine
 * given name reads as a bug in the demo, and a reader who notices it stops
 * looking at the grid and starts looking at the seams. The roster's names are
 * synthetic and so is the pairing.
 *
 * 72px sources for a 40px avatar: enough for a 2x display, ~4 kB each.
 */
const POOLS = { feminine: "women", masculine: "men" };
const COUNT = 18;

/**
 * Deduplicated, and topped up past COUNT to compensate.
 *
 * The source serves the same photograph for more than one index — two indices
 * in the masculine set were byte-identical — and two rows wearing one face
 * looks like a bug in the grid rather than a quirk of the source.
 */
async function fetchPool(path) {
  const seen = new Set();
  const out = [];
  for (let i = 1; i <= COUNT * 2 && out.length < COUNT; i++) {
    const url = `https://randomuser.me/api/portraits/med/${path}/${i}.jpg`;
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`skipped ${url} — ${response.status}`);
      continue;
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    const key = bytes.toString("base64");
    if (seen.has(key)) {
      console.warn(`duplicate at ${path}/${i} — skipped`);
      continue;
    }
    seen.add(key);
    out.push(`data:${response.headers.get("content-type") ?? "image/jpeg"};base64,${key}`);
  }
  return out;
}

const pools = {};
for (const [name, path] of Object.entries(POOLS)) {
  pools[name] = await fetchPool(path);
  if (pools[name].length < 8) {
    throw new Error(`only ${pools[name].length} ${name} faces fetched; refusing to write a thin set`);
  }
}
const faces = Object.values(pools).flat();

const body = `/**
 * GENERATED — do not edit. See scripts/fetch-faces.mjs.
 *
 * Portrait photographs, embedded as data URIs so the published artifact can
 * show them under a CSP that permits no external image host.
 *
 * These are photographs of real people, from randomuser.me (sourced from
 * uifaces.co), published for use in mockups and test data. The records beside
 * them are entirely synthetic. Confirm the licence before shipping these
 * beyond a demo.
 */
${Object.entries(pools)
  .map(
    ([name, list]) =>
      `export const ${name.toUpperCase()}_FACES: readonly string[] = [\n${list
        .map((f) => `  "${f}",`)
        .join("\n")}\n];`,
  )
  .join("\n\n")}
`;

writeFileSync(OUT, body);
console.log(`wrote ${faces.length} faces — ${(body.length / 1024).toFixed(0)} kB`);
