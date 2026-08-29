/**
 * The generated portraits.
 *
 * Two properties matter and neither is aesthetic: a face must be STABLE for a
 * given patient (one that changes between scroll frames is worse than no face),
 * and the whole thing must be self-contained, because a remote image fails
 * closed under the artifact's CSP and depicts a real person who is not a
 * patient here.
 */
import { describe, expect, it } from "vitest";
import { avatarFor } from "./avatar.js";

/** The SVG itself, out of the `url("data:image/svg+xml,…")` wrapper. */
const svgOf = (seed: string): string => {
  const url = avatarFor(seed);
  return decodeURIComponent(url.slice('url("data:image/svg+xml,'.length, -2));
};

describe("avatarFor", () => {
  it("returns a CSS url() holding an inline SVG", () => {
    const url = avatarFor("p1");
    expect(url.startsWith('url("data:image/svg+xml,')).toBe(true);
    expect(url.endsWith('")')).toBe(true);
  });

  it("is deterministic for one seed", () => {
    expect(avatarFor("p42")).toBe(avatarFor("p42"));
  });

  it("gives different people different faces", () => {
    const faces = new Set(Array.from({ length: 200 }, (_, i) => avatarFor(`p${i}`)));
    // Collisions are fine and expected; a single face for everyone is not.
    expect(faces.size).toBeGreaterThan(50);
  });

  it("reaches every skin tone across a realistic roster", () => {
    const svgs = Array.from({ length: 400 }, (_, i) => svgOf(`p${i}`));
    for (const tone of ["#f2d3bd", "#e8c39e", "#d9a879", "#b47d56", "#8d5524", "#5c3317"]) {
      expect(svgs.some((s) => s.includes(tone)), `no portrait used ${tone}`).toBe(true);
    }
  });

  it("requests nothing from the network", () => {
    // The whole reason these are drawn rather than fetched. The SVG namespace
    // is a URI but not a fetch, so it is excluded rather than matched on.
    const svg = svgOf("p7").replace(/xmlns(:\w+)?="[^"]*"/g, "");
    expect(svg).not.toMatch(/https?:\/\//);
    expect(svg).not.toContain("<image");
    expect(svg).not.toContain("href");
  });

  it("never emits an undefined attribute", () => {
    // A signed `>>` on a 32-bit hash indexed out of range and produced
    // `fill="undefined"` — invalid, so those portraits lost hair and clothing.
    for (let i = 0; i < 500; i++) {
      const svg = svgOf(`p${i}`);
      expect(svg, `portrait p${i}`).not.toContain("undefined");
      expect(svg, `portrait p${i}`).not.toContain("NaN");
    }
  });

  it("is a complete SVG document, clipped to a circle", () => {
    const svg = svgOf("p3");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain('viewBox="0 0 64 64"');
    expect(svg).toContain("clipPath");
  });

  it("escapes into a usable url() — no raw quotes or hashes", () => {
    // A `#` inside an unencoded data URI truncates it at the fragment, which
    // renders as a blank circle and is easy to miss.
    const url = avatarFor("p9");
    const inner = url.slice('url("'.length, -2);
    expect(inner).not.toContain("#");
    expect(inner).not.toContain('"');
  });

  it("stays cheap when rows recycle", () => {
    // Twenty visible rows re-rendering per scroll frame must not rebuild SVG.
    const started = performance.now();
    for (let i = 0; i < 20_000; i++) avatarFor(`p${i % 40}`);
    expect(performance.now() - started).toBeLessThan(300);
  });
});
