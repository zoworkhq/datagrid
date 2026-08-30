import { describe, expect, it } from "vitest";
import { DEFAULT_KEYMAP, assertUniqueBindings } from "./keymap.js";

describe("the default keymap", () => {
  it("has 25 bindings", () => {
    // 24 until `column.narrow` was added: widening a column with no keyboard
    // way back is a one-way ratchet for anyone without a pointer.
    expect(DEFAULT_KEYMAP).toHaveLength(25);
  });

  it("describes every binding, because the description is what a user reads", () => {
    // These strings are what a keyboard-shortcuts dialog renders. A binding
    // with no description is a row of blank in that dialog.
    const undescribed = DEFAULT_KEYMAP.filter((b) => b.description.trim() === "");
    expect(undescribed.map((b) => b.id)).toEqual([]);
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
