/**
 * Row avatars.
 *
 * Three properties matter, none of them aesthetic:
 *
 *   · a face must be STABLE for a given patient — one that changes between
 *     scroll frames is worse than no face at all;
 *   · BOTH states must be reachable, because a mix is the point: a roster
 *     where everybody has a photograph is lying about its data;
 *   · nothing may be fetched, because a remote image fails closed under the
 *     artifact's CSP and depicts a real person who is not a patient here.
 */
import { describe, expect, it } from "vitest";
import { avatarFor, type PhotoAvatar } from "./avatar.js";

/** The SVG itself, out of the `url("data:image/svg+xml,…")` wrapper. */
const svgOf = (seed: string): string => {
  const a = avatarFor(seed);
  if (a.kind !== "photo") throw new Error(`${seed} is an initials avatar`);
  return decodeURIComponent(a.image.slice('url("data:image/svg+xml,'.length, -2));
};

const seeds = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);
const photos = (n: number) => seeds(n).filter((s) => avatarFor(s).kind === "photo");

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

  it("honours a real photograph when the row supplies one", () => {
    const a = avatarFor("p1", "https://example.test/face.jpg");
    expect(a.kind).toBe("photo");
    expect((a as PhotoAvatar).image).toBe('url("https://example.test/face.jpg")');
  });

  it("ignores an empty photo url rather than rendering a broken image", () => {
    expect(avatarFor("p1", "")).toEqual(avatarFor("p1"));
  });

  it("gives different people different faces", () => {
    const distinct = new Set(seeds(200).map((s) => JSON.stringify(avatarFor(s))));
    expect(distinct.size).toBeGreaterThan(40);
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

  it("reaches every skin tone across a realistic roster", () => {
    const svgs = photos(600).map(svgOf);
    for (const tone of ["#f6d9c2", "#eec5a0", "#dda97b", "#bb8055", "#94582a", "#63381a"]) {
      expect(svgs.some((s) => s.includes(tone)), `no portrait used ${tone}`).toBe(true);
    }
  });

  it("requests nothing from the network", () => {
    const svg = svgOf(photos(20)[0] as string).replace(/xmlns(:\w+)?="[^"]*"/g, "");
    expect(svg).not.toMatch(/https?:\/\//);
    expect(svg).not.toContain("<image");
    expect(svg).not.toContain("href");
  });

  it("never emits an undefined attribute", () => {
    // A signed `>>` on a 32-bit hash indexed out of range and produced
    // `fill="undefined"` — invalid, so those portraits lost hair and clothing.
    for (const seed of photos(500)) {
      const svg = svgOf(seed);
      expect(svg, `portrait ${seed}`).not.toContain("undefined");
      expect(svg, `portrait ${seed}`).not.toContain("NaN");
    }
  });

  it("is a complete SVG document", () => {
    const svg = svgOf(photos(10)[0] as string);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain("viewBox=");
  });

  it("keeps gradient ids distinct between two portraits", () => {
    // A shared id means the second portrait silently paints with the first
    // one's skin tone, which looks like a hashing bug and is not one.
    const [a, b] = photos(80);
    const idOf = (s: string) => /id="f(\d+)"/.exec(svgOf(s))?.[1];
    expect(idOf(a as string)).not.toBe(idOf(b as string));
  });

  it("escapes into a usable url() — no raw quotes or hashes", () => {
    // A `#` inside an unencoded data URI truncates it at the fragment, which
    // renders as a blank circle and is easy to miss.
    const a = avatarFor(photos(10)[0] as string) as PhotoAvatar;
    const inner = a.image.slice('url("'.length, -2);
    expect(inner).not.toContain("#");
    expect(inner).not.toContain('"');
  });

  it("stays cheap when rows recycle", () => {
    const started = performance.now();
    for (let i = 0; i < 20_000; i++) avatarFor(`p${i % 40}`);
    expect(performance.now() - started).toBeLessThan(300);
  });
});
