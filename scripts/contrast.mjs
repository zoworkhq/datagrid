/**
 * Contrast gate for the site's palette.
 *
 * ── WHY THIS IS A SCRIPT AND NOT A BROWSER CHECK ────────────────────────────
 *
 * Sweeping the live page is the obvious way, and it lies in exactly the case
 * you need it: flipping `data-theme` updates the tokens on `:root`, but a
 * background tab defers style recalculation for the descendants, so every
 * element still reports the previous theme's colour. That produced eighteen
 * confident, wrong "failures" against a palette that is fine.
 *
 * The pairings below are read from `style.css` itself, so a token that changes
 * value is checked at its new value, and a pairing that is added to the design
 * has to be added here to be covered.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * ── SHARED PALETTE ──────────────────────────────────────────────────────────
 *
 * The marketing site and the documentation carry the same tokens in two
 * stylesheets, because they are two independent bundles and neither should
 * pull the other's CSS over the network to render its first paint.
 *
 * Two copies is a drift risk, so BOTH are gated here. A palette edit that
 * lands in one file and not the other fails the build the moment either copy
 * drops a pairing below AA.
 */
const SHEETS = [
  ["site", join(HERE, "..", "examples", "site", "style.css")],
  ["docs", join(HERE, "..", "examples", "docs", "docs.css")],
];

/** Pulls one theme's token block out of a stylesheet. */
function tokens(css, selector) {
  const at = css.indexOf(selector);
  if (at < 0) throw new Error(`no block for ${selector}`);
  const body = css.slice(at, css.indexOf("}", at));
  const out = {};
  for (const [, name, value] of body.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})/g)) out[name] = value;
  return out;
}

const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const L = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
};
const ratio = (a, b) => { const [x, y] = [L(a), L(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

/**
 * Every foreground/background pairing the stylesheet actually renders text in,
 * with the smallest size that pairing is used at. AA wants 4.5:1 for normal
 * text and 3:1 for large (>=24px, or >=18.66px bold).
 */
const PAIRS = [
  ["--ink", "--paper"], ["--ink", "--raised"], ["--ink", "--sunken"], ["--ink", "--band"],
  ["--ink-2", "--paper"], ["--ink-2", "--raised"], ["--ink-2", "--sunken"], ["--ink-2", "--band"],
  ["--ink-3", "--paper"], ["--ink-3", "--raised"], ["--ink-3", "--sunken"], ["--ink-3", "--band"],
  ["--signal", "--paper"], ["--signal", "--raised"], ["--signal", "--sunken"], ["--signal", "--signal-bg"],
  // Inverted controls: .cta, .switch.is-on, .wstab.is-on.
  ["--paper", "--ink"],
  // The primary action: .runner, and the chip's badge.
  ["--signal-ink", "--signal"],
  // Clinical pills, which encode meaning and must be readable to do it.
  ["--stable", "--stable-bg"], ["--caution", "--caution-bg"],
  ["--critical", "--critical-bg"], ["--derived", "--derived-bg"],
  // Tags sit on the sunken surface.
  ["--ink-2", "--sunken"],
];

let failures = 0;
let checked = 0;
const themes = [["dark", ":root {"], ["light", ':root[data-theme="light"] {']];

for (const [sheet, path] of SHEETS) {
  const css = readFileSync(path, "utf8");
  for (const [theme, selector] of themes) {
    const t = tokens(css, selector);
    const bad = [];
    for (const [fg, bg] of PAIRS) {
      if (!t[fg] || !t[bg]) { bad.push(`     ?? ${fg} on ${bg} — token missing`); failures++; continue; }
      const r = ratio(t[fg], t[bg]);
      checked++;
      if (r < 4.5) {
        failures++;
        bad.push(`     FAIL ${r.toFixed(2).padStart(5)}:1  ${fg} on ${bg}  (${t[fg]} / ${t[bg]})`);
      }
    }
    console.log(`  ${bad.length === 0 ? "pass" : "FAIL"}  ${sheet} · ${theme}  (${PAIRS.length} pairings)`);
    for (const line of bad) console.log(line);
  }
}

console.log(
  failures === 0
    ? `\n${checked} pairings across ${SHEETS.length} stylesheets meet AA 4.5:1`
    : `\n${failures} pairing(s) below AA`,
);
process.exit(failures === 0 ? 0 : 1);
