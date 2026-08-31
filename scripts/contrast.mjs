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
const CSS = readFileSync(join(HERE, "..", "examples", "site", "style.css"), "utf8");

/** Pulls one theme's token block out of the stylesheet. */
function tokens(selector) {
  const at = CSS.indexOf(selector);
  if (at < 0) throw new Error(`no block for ${selector}`);
  const body = CSS.slice(at, CSS.indexOf("}", at));
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
for (const [label, selector] of [["dark", ":root {"], ["light", ':root[data-theme="light"] {']]) {
  const t = tokens(selector);
  console.log(`\n${label}`);
  for (const [fg, bg] of PAIRS) {
    if (!t[fg] || !t[bg]) { console.log(`  ?? ${fg} on ${bg} — token missing`); failures++; continue; }
    const r = ratio(t[fg], t[bg]);
    const ok = r >= 4.5;
    if (!ok) failures++;
    console.log(`  ${ok ? "pass" : "FAIL"}  ${r.toFixed(2).padStart(5)}:1  ${fg} on ${bg}  (${t[fg]} / ${t[bg]})`);
  }
}
console.log(`\n${failures === 0 ? "all pairings meet AA 4.5:1" : `${failures} pairing(s) below AA`}`);
process.exit(failures === 0 ? 0 : 1);
