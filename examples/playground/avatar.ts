/**
 * Row avatars: a photograph where there is one, coloured initials where there
 * is not.
 *
 * That split is the real pattern, not a decorative one. In any actual system
 * some people have uploaded a photograph and most have not, so a roster that
 * shows a face for everyone is lying about its data, and one that shows
 * initials for everyone throws away what it has. Both states are designed.
 *
 * ── THE PHOTOGRAPHS ─────────────────────────────────────────────────────────
 *
 * Real ones, embedded as data URIs by `scripts/fetch-faces.mjs` rather than
 * fetched at runtime: the published artifact runs under a CSP that permits no
 * external image host, so a remote <img> is a broken image for everyone the
 * page is shared with.
 *
 * They are photographs of real people, from randomuser.me. The records beside
 * them are entirely synthetic, and that pairing is worth being deliberate
 * about — a screenshot of this page shows a real face next to a fabricated MRN
 * and potassium result. It is fine for a demo whose every surface says the data
 * is synthetic; it is not something to carry into a screenshot that loses that
 * caption. Confirm the licence before shipping these beyond a demo.
 *
 * `photoUrl` on a row overrides the set, so pointing it at your own image host
 * replaces them wholesale.
 */
import { FEMININE_FACES, MASCULINE_FACES } from "./faces.generated.js";

/**
 * Initials backgrounds.
 *
 * Distinct hues rather than one brand colour: the point of a coloured monogram
 * is telling people apart at a glance, which one colour cannot do. All are dark
 * enough for white text at AA.
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
export type FacePool = "feminine" | "masculine";

export function avatarFor(seed: string, photoUrl?: string, pool: FacePool = "feminine"): Avatar {
  if (photoUrl !== undefined && photoUrl !== "") {
    return { kind: "photo", image: `url("${photoUrl}")` };
  }

  const h = hash(seed);
  const key = pool === "masculine" ? ~h : h;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const faces = pool === "masculine" ? MASCULINE_FACES : FEMININE_FACES;
  const made: Avatar =
    (h >>> 20) % 5 < 3
      ? { kind: "photo", image: `url("${faces[(h >>> 4) % faces.length]}")` }
      : { kind: "initials", background: INITIAL_COLOURS[h % INITIAL_COLOURS.length] as string };

  cache.set(key, made);
  return made;
}
