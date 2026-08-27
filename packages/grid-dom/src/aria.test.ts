import { describe, expect, it } from "vitest";
import { ariaRowCount, ariaRowIndex } from "./aria.js";

describe("the ARIA contract", () => {
  it("reports -1 when the source genuinely does not know the total", () => {
    expect(ariaRowCount("unknown")).toBe(-1);
  });

  it("reports the real total when there is one", () => {
    expect(ariaRowCount(1284)).toBe(1284);
  });

  it("announces an absolute row index under virtualisation", () => {
    // Row 19,998 of 40,000 must announce as 19,998 -- not as its position in
    // the rendered window of fifteen.
    expect(ariaRowIndex(19_997)).toBe(19_999);
  });
});
