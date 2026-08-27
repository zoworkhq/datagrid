import { describe, expect, it } from "vitest";
import { gridError, sanitiseError } from "./errors.js";

/**
 * The three tests that would have caught the telemetry defect.
 * @see ../../../docs/decisions/0002-the-grid-emits-events-not-telemetry.md
 */
describe("the PHI-safe error contract", () => {
  const PHI = "Aurelia Marchetti-Okonkwo 4471-882 K+ 3.7 mmol/L";

  it("discards everything a thrown error carried", () => {
    const thrown = new Error(`Cannot format ${PHI}`);
    const safe = sanitiseError(thrown, { code: "renderer-threw", phase: "render", columnKey: "potassium", rowIndex: 418 });
    expect(JSON.stringify(safe)).not.toContain("Aurelia");
    expect(JSON.stringify(safe)).not.toContain("4471-882");
    expect(JSON.stringify(safe)).not.toContain("3.7");
  });

  it("carries coordinates and nothing else", () => {
    const safe = gridError({ code: "comparator-threw", phase: "compare", columnKey: "risk", rowIndex: 12 });
    expect(Object.keys(safe).sort()).toEqual(["code", "columnKey", "phase", "query", "rowIndex"]);
  });

  it("is frozen, so a helpful `value` cannot be attached downstream", () => {
    const safe = gridError({ code: "source-threw", phase: "query" });
    expect(() => {
      Object.assign(safe, { value: PHI });
    }).toThrow();
    expect(JSON.stringify(safe)).not.toContain("Aurelia");
  });

  it("reports a row index, never a row key -- a rowKey is very often an MRN", () => {
    const safe = gridError({ code: "renderer-threw", phase: "render", rowIndex: 418 });
    expect(safe.rowIndex).toBe(418);
    expect(safe).not.toHaveProperty("rowId");
    expect(safe).not.toHaveProperty("rowKey");
  });
});
