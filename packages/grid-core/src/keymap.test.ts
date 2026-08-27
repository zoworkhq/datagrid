import { describe, expect, it } from "vitest";
import { DEFAULT_KEYMAP, assertUniqueBindings } from "./keymap.js";

describe("the default keymap", () => {
  it("has 24 bindings", () => {
    expect(DEFAULT_KEYMAP).toHaveLength(24);
  });

  it("binds no chord twice in one context", () => {
    expect(() => assertUniqueBindings(DEFAULT_KEYMAP)).not.toThrow();
  });

  it("does not bind Tab -- the body is one tab stop", () => {
    expect(DEFAULT_KEYMAP.some((b) => b.keys.includes("Tab"))).toBe(false);
  });

  it("gives every binding a description a voice-control user could say", () => {
    for (const b of DEFAULT_KEYMAP) expect(b.description.length).toBeGreaterThan(8);
  });
});
