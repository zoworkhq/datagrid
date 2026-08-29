/**
 * Row avatars.
 *
 * Four properties matter, none of them aesthetic:
 *
 *   · a face must be STABLE for a given patient — one that changes between
 *     scroll frames is worse than no face at all;
 *   · BOTH states must be reachable, because a mix is the point: a roster
 *     where everybody has a photograph is lying about its data;
 *   · nothing may be fetched at runtime, because a remote image fails closed
 *     under the published artifact's CSP and shows as a broken image to
 *     everyone the page is shared with;
 *   · a photograph must not visibly contradict the name beside it, which is
 *     the one thing a reader notices instantly.
 */
import { describe, expect, it } from "vitest";
import { avatarFor, type PhotoAvatar } from "./avatar.js";
import { FEMININE_FACES, MASCULINE_FACES } from "./faces.generated.js";

const seeds = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);
const imageOf = (a: ReturnType<typeof avatarFor>) => (a as PhotoAvatar).image;

describe("the embedded photograph set", () => {
  it("is large enough not to repeat visibly down a screen", () => {
    expect(FEMININE_FACES.length).toBeGreaterThanOrEqual(12);
    expect(MASCULINE_FACES.length).toBeGreaterThanOrEqual(12);
  });

  it("is embedded, not linked", () => {
    // The whole reason the set is generated into the bundle: a remote <img>
    // is a broken image under the artifact's CSP.
    for (const face of [...FEMININE_FACES, ...MASCULINE_FACES]) {
      expect(face.startsWith("data:image/")).toBe(true);
      expect(face).not.toMatch(/https?:\/\//);
    }
  });

  it("holds no duplicates", () => {
    const all = [...FEMININE_FACES, ...MASCULINE_FACES];
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("avatarFor", () => {
  it("is deterministic for one seed", () => {
    expect(avatarFor("p42")).toEqual(avatarFor("p42"));
  });

  it("produces BOTH states across a roster", () => {
    const kinds = seeds(300).map((s) => avatarFor(s).kind);
    // Neither state may be vanishingly rare: both have to be designed, and a
    // state nobody sees is a state nobody checked.
    expect(kinds.filter((k) => k === "photo").length).toBeGreaterThan(60);
    expect(kinds.filter((k) => k === "initials").length).toBeGreaterThan(60);
  });

  it("draws a photograph only from the pool it was asked for", () => {
    // A masculine photograph on a feminine given name reads as a bug, and a
    // reader who notices stops looking at the grid and starts looking at seams.
    for (const seed of seeds(300)) {
      const feminine = avatarFor(seed, undefined, "feminine");
      if (feminine.kind === "photo") {
        expect(FEMININE_FACES.some((f) => imageOf(feminine).includes(f))).toBe(true);
      }
      const masculine = avatarFor(seed, undefined, "masculine");
      if (masculine.kind === "photo") {
        expect(MASCULINE_FACES.some((f) => imageOf(masculine).includes(f))).toBe(true);
      }
    }
  });

  it("does not let the two pools share a cache entry", () => {
    // Same seed, different pool: caching on the seed alone would hand the
    // second caller the first one's face.
    const a = avatarFor("collide", undefined, "feminine");
    const b = avatarFor("collide", undefined, "masculine");
    if (a.kind === "photo" && b.kind === "photo") expect(imageOf(a)).not.toBe(imageOf(b));
  });

  it("honours a real photograph when the row supplies one", () => {
    const a = avatarFor("p1", "https://example.test/face.jpg");
    expect(a.kind).toBe("photo");
    expect(imageOf(a)).toBe('url("https://example.test/face.jpg")');
  });

  it("ignores an empty photo url rather than rendering a broken image", () => {
    expect(avatarFor("p1", "")).toEqual(avatarFor("p1"));
  });

  it("spreads faces across the set rather than reusing one", () => {
    const used = new Set(
      seeds(400)
        .map((s) => avatarFor(s))
        .filter((a) => a.kind === "photo")
        .map(imageOf),
    );
    expect(used.size).toBeGreaterThan(8);
  });

  it("assigns initials colours from across the palette", () => {
    const colours = new Set(
      seeds(400)
        .map((s) => avatarFor(s))
        .filter((a) => a.kind === "initials")
        .map((a) => (a as { background: string }).background),
    );
    // One colour for everyone defeats the purpose of a coloured monogram.
    expect(colours.size).toBeGreaterThan(6);
  });

  it("emits a usable CSS url()", () => {
    const photo = seeds(50).map((s) => avatarFor(s)).find((a) => a.kind === "photo");
    expect(photo).toBeDefined();
    expect(imageOf(photo as PhotoAvatar).startsWith('url("data:image/')).toBe(true);
    expect(imageOf(photo as PhotoAvatar).endsWith('")')).toBe(true);
  });

  it("stays cheap when rows recycle", () => {
    // Twenty visible rows re-rendering per scroll frame must not rebuild.
    const started = performance.now();
    for (let i = 0; i < 50_000; i++) avatarFor(`p${i % 40}`);
    expect(performance.now() - started).toBeLessThan(300);
  });
});
