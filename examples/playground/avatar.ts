/**
 * Row avatars: a portrait where there is one, coloured initials where there is
 * not.
 *
 * That split is the real pattern, not a decorative one. In any actual system
 * some people have uploaded a photograph and most have not, so a roster that
 * shows a face for everyone is lying, and one that shows initials for everyone
 * throws away information it has. Both states have to look deliberate.
 *
 * ── ON THE PHOTOGRAPHS ──────────────────────────────────────────────────────
 *
 * `photoUrl` is honoured when a row supplies one — point it at your own image
 * host and these become real photographs.
 *
 * The demo does not supply any, and generates portraits instead, for three
 * reasons that are not stylistic:
 *
 *   · every face on a stock or `randomuser.me` endpoint is a REAL PERSON, and
 *     captioning one with a fabricated MRN, ward and potassium result produces
 *     a screenshot that reads as a real patient record;
 *   · they are remote requests, so they fail closed under the published
 *     artifact's CSP and leave the page pocked with broken images;
 *   · they are licensed likenesses, which a demo would be redistributing.
 *
 * So the generated ones depict nobody, need no network, and survive being
 * shared. Swap them for real photographs by giving rows a `photoUrl`.
 *
 * ── AND WHY EVERYTHING IS CACHED ────────────────────────────────────────────
 *
 * Rows recycle on every scroll frame. Building an SVG per cell per frame is
 * what turns a smooth grid into a janky one.
 */

/** Skin tones, spanning the range a real ward does. */
const SKIN = [
  { fill: "#f6d9c2", shade: "#e6bfa3", deep: "#d3a586" },
  { fill: "#eec5a0", shade: "#dbad83", deep: "#c5936a" },
  { fill: "#dda97b", shade: "#c68f61", deep: "#ac7549" },
  { fill: "#bb8055", shade: "#a06841", deep: "#855230" },
  { fill: "#94582a", shade: "#7a441e", deep: "#5f3315" },
  { fill: "#63381a", shade: "#4d2912", deep: "#3a1d0c" },
] as const;

const HAIR = [
  "#241c16", "#3d2c1e", "#5c3a1e", "#7b5230",
  "#a9793f", "#c9a227", "#8f8f8f", "#e4ded4", "#141414",
] as const;

/** Muted, professional. Nothing here should compete with a lab value. */
const CLOTHES = [
  "#3f5d75", "#4a5568", "#5b6b7c", "#6b7280",
  "#546e7a", "#455a64", "#5a6478", "#4b5f6b",
] as const;

/**
 * Initials backgrounds.
 *
 * Distinct hues rather than one brand colour: the point of a coloured monogram
 * is that it is TELLING PEOPLE APART at a glance, which one colour cannot do.
 * All are dark enough for white text at AA.
 */
const INITIAL_COLOURS = [
  "#2563eb", "#7c3aed", "#db2777", "#e11d48",
  "#ea580c", "#ca8a04", "#16a34a", "#0891b2",
  "#4f46e5", "#be185d", "#0f766e", "#9333ea",
] as const;

/** Deterministic, so one patient keeps one face for the life of the demo. */
function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // `>>> 0` matters: the shifts below must stay unsigned, or an index goes
  // negative and the lookup silently yields `undefined`.
  return h >>> 0;
}

/**
 * One portrait, drawn head-and-shoulders in a 64-unit square.
 *
 * Deliberately not a full figure: at 40px a whole body reads as a smudge.
 */
function portrait(h: number): string {
  const skin = SKIN[h % SKIN.length] as (typeof SKIN)[number];
  const hair = HAIR[(h >>> 3) % HAIR.length] as string;
  const cloth = CLOTHES[(h >>> 6) % CLOTHES.length] as string;
  const style = (h >>> 9) % 6;
  const glasses = ((h >>> 12) % 6) === 0;
  const beard = ((h >>> 14) % 5) === 0 && style % 2 === 0;
  const bg = ["#eef1f5", "#e9eef3", "#f0eef4", "#eaf0ee", "#f2efe9"][(h >>> 17) % 5] as string;
  // Gradient ids must be unique per document: two portraits sharing an id
  // means the second one silently paints with the first one's skin tone.
  const id = h % 9973;

  const behind =
    style === 1
      ? `<path d="M13 31c0-13 7-19 19-19s19 6 19 19v16c0 4-3 6-5 4V31H18v20c-2 2-5 0-5-4z" fill="${hair}"/>`
      : style === 4
        ? `<ellipse cx="32" cy="31" rx="20" ry="19" fill="${hair}"/>`
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
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="7 5 50 50">` +
    `<defs>` +
    // A soft vertical gradient on the face does most of the work of reading as
    // a photograph rather than a flat icon.
    `<linearGradient id="f${id}" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${skin.fill}"/><stop offset="1" stop-color="${skin.shade}"/>` +
    `</linearGradient>` +
    `<linearGradient id="b${id}" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="#dfe4ea"/>` +
    `</linearGradient>` +
    `</defs>` +
    `<rect x="0" y="0" width="64" height="64" fill="url(#b${id})"/>` +
    behind +
    // Shoulders, collar, neck, then head — back to front.
    `<path d="M6 64c0-12 11-18 26-18s26 6 26 18z" fill="${cloth}"/>` +
    `<path d="M25 47l7 7 7-7 3 1-10 10-10-10z" fill="#ffffff" opacity="0.16"/>` +
    `<path d="M26 39h12v11c0 3-12 3-12 0z" fill="${skin.deep}"/>` +
    `<ellipse cx="32" cy="29" rx="14" ry="16.5" fill="url(#f${id})"/>` +
    `<ellipse cx="18" cy="30" rx="2.6" ry="3.6" fill="${skin.shade}"/>` +
    `<ellipse cx="46" cy="30" rx="2.6" ry="3.6" fill="${skin.shade}"/>` +
    front +
    // Features, understated: at 40px anything more becomes noise.
    `<ellipse cx="26.5" cy="29.5" rx="1.6" ry="1.9" fill="#2b2318"/>` +
    `<ellipse cx="37.5" cy="29.5" rx="1.6" ry="1.9" fill="#2b2318"/>` +
    `<circle cx="27" cy="29" r="0.5" fill="#ffffff" opacity="0.8"/>` +
    `<circle cx="38" cy="29" r="0.5" fill="#ffffff" opacity="0.8"/>` +
    `<path d="M23.4 24.8c1.6-1.1 4.1-1.1 5.7 0M35 24.8c1.6-1.1 4.1-1.1 5.7 0" stroke="${hair}" stroke-width="1.3" fill="none" stroke-linecap="round"/>` +
    `<path d="M31 31.5c-0.6 2 0 3 1 3.2" stroke="${skin.deep}" stroke-width="1" fill="none" stroke-linecap="round" opacity="0.7"/>` +
    `<path d="M29 37.2c1.8 1.3 4.2 1.3 6 0" stroke="${skin.deep}" stroke-width="1.5" fill="none" stroke-linecap="round"/>` +
    (beard
      ? `<path d="M19.5 31c0 9 5.5 14 12.5 14s12.5-5 12.5-14c0 0-2.5 8.5-12.5 8.5S19.5 31 19.5 31z" fill="${hair}" opacity="0.9"/>`
      : "") +
    (glasses
      ? `<g stroke="#3a4148" stroke-width="1.4" fill="none" opacity="0.9">` +
        `<circle cx="26.5" cy="29.5" r="5"/><circle cx="37.5" cy="29.5" r="5"/>` +
        `<path d="M31.5 29.5h1M18.6 28.5l2.9 0.6M45.4 28.5l-2.9 0.6"/></g>`
      : "") +
    `</svg>`;

  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export interface PhotoAvatar {
  readonly kind: "photo";
  /** A CSS `url(...)`, ready for `background-image`. */
  readonly image: string;
}

export interface InitialsAvatar {
  readonly kind: "initials";
  readonly background: string;
}

export type Avatar = PhotoAvatar | InitialsAvatar;

const cache = new Map<number, Avatar>();

/**
 * The avatar for one row.
 *
 * `photoUrl` wins when a row has one. Otherwise roughly three in five get a
 * generated portrait and the rest get coloured initials — a mix, because that
 * is what a real roster looks like and because both states have to be designed
 * rather than one being a fallback nobody looked at.
 */
export function avatarFor(seed: string, photoUrl?: string): Avatar {
  if (photoUrl !== undefined && photoUrl !== "") {
    return { kind: "photo", image: `url("${photoUrl}")` };
  }

  const h = hash(seed);
  const cached = cache.get(h);
  if (cached !== undefined) return cached;

  const made: Avatar =
    (h >>> 20) % 5 < 3
      ? { kind: "photo", image: portrait(h) }
      : { kind: "initials", background: INITIAL_COLOURS[h % INITIAL_COLOURS.length] as string };

  cache.set(h, made);
  return made;
}
