import { describe, expect, it } from "vitest";
import { DEFAULT_KEYMAP } from "./keymap.js";
import { applyKeymapOverride, describeMove, moveRow, moveTo, parseKeymapOverride } from "./reorder.js";

describe("reordering", () => {
  const items = ["a", "b", "c", "d"];
  it("moves forwards and backwards", () => {
    expect(moveTo(items, 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveTo(items, 3, 0)).toEqual(["d", "a", "b", "c"]);
  });
  it("clamps rather than throwing", () => {
    expect(moveTo(items, 0, 99)).toEqual(["b", "c", "d", "a"]);
    expect(moveTo(items, 9, 0)).toBe(items);
    expect(moveTo(items, 1, 1)).toBe(items);
  });
  it("moves a row by id", () => {
    const rows = [{ id: "x" }, { id: "y" }, { id: "z" }];
    expect(moveRow(rows, (r) => r.id, "z", 0).map((r) => r.id)).toEqual(["z", "x", "y"]);
  });
  it("announces the move, because a move nobody can hear cannot be verified", () => {
    // WCAG 2.2 SC 2.5.7 makes drag-only reorder a failure, so the keyboard
    // path and its announcement ship with the feature or it is a defect.
    expect(describeMove("Ward", 0, 2, 5)).toBe("Ward moved from position 1 to 3 of 5");
  });
});

describe("keymap overrides", () => {
  it("remaps a binding", () => {
    const r = applyKeymapOverride(DEFAULT_KEYMAP, { id: "u1", bindings: { "cell.edit": "F4" } });
    expect(r.keymap.find((b) => b.id === "cell.edit")?.keys).toBe("F4");
    expect(r.problems).toEqual([]);
  });

  it("unbinds with null", () => {
    const r = applyKeymapOverride(DEFAULT_KEYMAP, { id: "u1", bindings: { "cell.edit": null } });
    expect(r.keymap.some((b) => b.id === "cell.edit")).toBe(false);
  });

  it("REPORTS a conflict rather than resolving it by precedence", () => {
    // Two bindings on one chord means one silently stops working, and the user
    // who remapped it is the last person who would notice.
    const r = applyKeymapOverride(DEFAULT_KEYMAP, { id: "u1", bindings: { "cell.edit": "Enter" } });
    expect(r.problems.some((p) => p.kind === "conflict")).toBe(true);
  });

  it("reports a binding this build does not have", () => {
    const r = applyKeymapOverride(DEFAULT_KEYMAP, { id: "u1", bindings: { "cell.teleport": "F9" } });
    expect(r.problems[0]).toMatchObject({ kind: "unknown-binding", bindingId: "cell.teleport" });
  });

  it("round-trips through storage", () => {
    // A remapping nobody can save is a remapping nobody keeps.
    const o = { id: "u1", bindings: { "cell.edit": "F4" } };
    expect(parseKeymapOverride(JSON.stringify(o))).toEqual(o);
    expect(parseKeymapOverride("{not json")).toBeNull();
    expect(parseKeymapOverride({ id: "u1" })).toBeNull();
  });

  it("leaves the default keymap untouched", () => {
    const before = DEFAULT_KEYMAP.map((b) => b.keys).join("|");
    applyKeymapOverride(DEFAULT_KEYMAP, { id: "u1", bindings: { "cell.edit": "F4" } });
    expect(DEFAULT_KEYMAP.map((b) => b.keys).join("|")).toBe(before);
  });
});
