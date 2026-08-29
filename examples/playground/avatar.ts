/**
 * Portrait avatars, drawn rather than photographed.
 *
 * ── WHY THESE ARE ILLUSTRATIONS AND NOT PHOTOGRAPHS ─────────────────────────
 *
 * A roster of patients wants faces, and the obvious way to get them is a stock
 * photo service or `randomuser.me`. Both are wrong here:
 *
 *   · every one of those images is a REAL PERSON, and captioning a real face
 *     with a fabricated MRN, ward and potassium result is exactly the artefact
 *     nobody should be able to screenshot out of a demo;
 *   · they are remote requests, so they fail closed under the artifact's CSP
 *     and leave the page pocked with broken images;
 *   · they are licensed, and a demo that ships someone's likeness inherits
 *     that licence.
 *
 * So these are generated: deterministic from the row id, self-contained as
 * data URIs, and depicting nobody. They read as portraits at 32px, which is
 * the size the grid actually shows them at.
 *
 * ── AND WHY THEY ARE CACHED ─────────────────────────────────────────────────
 *
 * Rows recycle on every scroll frame. Rebuilding an SVG string per cell per
 * frame is the kind of thing that turns a smooth grid into a janky one, so the
 * variants are memoised — there are 2,592 of them, and a viewport shows twenty.
 */

/** Skin tones, spanning the range a real ward does. */
const SKIN = [
  { fill: "#f2d3bd", shade: "#e0bda3" },
  { fill: "#e8c39e", shade: "#d4ab82" },
  { fill: "#d9a879", shade: "#c08f60" },
  { fill: "#b47d56", shade: "#9a6742" },
  { fill: "#8d5524", shade: "#74441c" },
  { fill: "#5c3317", shade: "#472711" },
] as const;

const HAIR = ["#2b2118", "#4a3728", "#6b4423", "#8d6748", "#b8860b", "#9a9a9a", "#e8e4de", "#1c1c1c"] as const;

/** Muted, professional. Nothing here should compete with a lab value. */
const CLOTHES = ["#3f5d75", "#4a5568", "#5b6b7c", "#6b7280", "#546e7a", "#455a64"] as const;

/** Deterministic, so one patient keeps one face for the life of the demo. */
function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * One portrait.
 *
 * Drawn in a 64-unit square and clipped to a circle, so the grid can size it
 * with CSS alone. Proportions are deliberately head-and-shoulders: at 32px a
 * full figure reads as a smudge.
 */
function portrait(seed: string): string {
  const h = hash(seed);
  // `>>>`, NOT `>>`. The hash fills 32 bits, and a SIGNED shift turns anything
  // above 2^31 negative — so `arr[negative % len]` is `undefined` and the
  // portrait renders `fill="undefined"`: no hair, no clothes, silently, for
  // roughly half of all patients.
  const skin = SKIN[h % SKIN.length] as (typeof SKIN)[number];
  const hair = HAIR[(h >>> 3) % HAIR.length] as string;
  const cloth = CLOTHES[(h >>> 6) % CLOTHES.length] as string;
  const style = (h >>> 9) % 6;
  const glasses = ((h >>> 12) % 5) === 0;
  const beard = ((h >>> 14) % 4) === 0 && style % 2 === 0;

  // Hair shapes, in draw order behind and then in front of the face.
  const behind =
    style === 1
      ? `<path d="M14 30c0-12 6-18 18-18s18 6 18 18v14c0 4-3 6-5 4V30H19v18c-2 2-5 0-5-4z" fill="${hair}"/>`
      : style === 4
        ? `<ellipse cx="32" cy="30" rx="19" ry="18" fill="${hair}"/>`
        : "";

  const front =
    style === 0
      ? `<path d="M15 28c1-10 8-16 17-16s16 6 17 16c0 0-4-6-17-6s-17 6-17 6z" fill="${hair}"/>`
      : style === 1
        ? `<path d="M15 27c2-9 9-15 17-15s15 6 17 15c-3-4-8-7-17-7s-14 3-17 7z" fill="${hair}"/>`
        : style === 2
          ? `<path d="M16 27c0-9 7-15 16-15s16 6 16 15c-2-3-5-5-8-5-4 0-5 3-10 3s-8-4-14 2z" fill="${hair}"/>`
          : style === 3
            ? `<path d="M17 26c1-8 7-14 15-14s14 6 15 14c-2-6-7-8-15-8s-13 2-15 8z" fill="${hair}"/>`
            : style === 4
              ? `<path d="M14 30c0-11 8-18 18-18s18 7 18 18c-1-7-6-11-18-11S15 23 14 30z" fill="${hair}"/>`
              : `<path d="M18 25c2-8 7-13 14-13s12 5 14 13c-3-5-8-6-14-6s-11 1-14 6z" fill="${hair}"/>`;

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<defs><clipPath id="c"><circle cx="32" cy="32" r="32"/></clipPath></defs>` +
    `<g clip-path="url(#c)">` +
    // Ground, so the portrait reads on any surface colour.
    `<rect width="64" height="64" fill="#e9edf1"/>` +
    behind +
    // Shoulders, then neck, then head — back to front.
    `<path d="M8 64c0-11 10-17 24-17s24 6 24 17z" fill="${cloth}"/>` +
    `<path d="M26 40h12v10c0 3-12 3-12 0z" fill="${skin.shade}"/>` +
    `<ellipse cx="32" cy="29" rx="14" ry="16" fill="${skin.fill}"/>` +
    // Ears sit behind the hairline.
    `<ellipse cx="18" cy="30" rx="2.5" ry="3.5" fill="${skin.shade}"/>` +
    `<ellipse cx="46" cy="30" rx="2.5" ry="3.5" fill="${skin.shade}"/>` +
    front +
    // Features, understated: at 32px anything more becomes noise.
    `<ellipse cx="26.5" cy="29" rx="1.5" ry="1.8" fill="#2c2419"/>` +
    `<ellipse cx="37.5" cy="29" rx="1.5" ry="1.8" fill="#2c2419"/>` +
    `<path d="M23.5 24.5c1.5-1 4-1 5.5 0M35 24.5c1.5-1 4-1 5.5 0" stroke="${hair}" stroke-width="1.2" fill="none" stroke-linecap="round"/>` +
    `<path d="M29.5 36.5c1.5 1 3.5 1 5 0" stroke="${skin.shade}" stroke-width="1.4" fill="none" stroke-linecap="round"/>` +
    (beard
      ? `<path d="M20 32c0 8 5 13 12 13s12-5 12-13c0 0-2 8-12 8s-12-8-12-8z" fill="${hair}" opacity="0.85"/>`
      : "") +
    (glasses
      ? `<g stroke="#3a4148" stroke-width="1.3" fill="none">` +
        `<circle cx="26.5" cy="29" r="4.8"/><circle cx="37.5" cy="29" r="4.8"/>` +
        `<path d="M31.3 29h1.4M18.5 28l3 0.6M45.5 28l-3 0.6"/></g>`
      : "") +
    `</g></svg>`;

  // `encodeURIComponent`, not base64: it is smaller for markup and keeps the
  // source legible in devtools, which matters for something generated.
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

const cache = new Map<string, string>();

/** A CSS `url(...)` for one row's portrait. Memoised — rows recycle per frame. */
export function avatarFor(seed: string): string {
  // Keyed by the VARIANT, not the seed: two patients hashing to the same face
  // should share one string rather than two identical ones.
  const key = String(hash(seed) % 100003);
  let found = cache.get(key);
  if (found === undefined) {
    found = portrait(seed);
    cache.set(key, found);
  }
  return found;
}
