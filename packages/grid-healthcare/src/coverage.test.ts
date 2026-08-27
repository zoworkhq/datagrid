import { describe, expect, it } from "vitest";
import { describeCoverage, validateCoverage, type Coverage } from "./coverage.js";

const base = {
  sources: [{ id: "ehr", label: "This application", status: "ok" }],
  loaded: 20,
  asOf: "09:12",
} as const;

describe("coverage", () => {
  it("states a real total when there is one", () => {
    const c: Coverage = { ...base, total: 1284 };
    expect(describeCoverage(c)).toBe("Showing 20 of 1284; as of 09:12");
  });

  it("is true when the total is unknown, and quantifies nothing", () => {
    const c: Coverage = { ...base, total: "unknown" };
    const sentence = describeCoverage(c);
    expect(sentence).toBe("Showing 20 loaded, more may be available; as of 09:12");
    expect(sentence).not.toMatch(/Showing \d+ of /); // no total claim
    expect(sentence).not.toContain("of many");
    expect(sentence).not.toContain("20+");
  });

  it("names a source that could not be reached", () => {
    const c: Coverage = {
      ...base,
      total: "unknown",
      sources: [
        { id: "ehr", label: "This application", status: "ok" },
        { id: "hie", label: "Northside Regional Exchange", status: "unreachable", reason: "timed out" },
      ],
    };
    expect(describeCoverage(c)).toContain("Northside Regional Exchange timed out");
  });

  it("reports a non-ok source that carries no reason, rather than rendering around it", () => {
    const c: Coverage = {
      ...base,
      total: 20,
      sources: [{ id: "hie", label: "Exchange", status: "partial" }],
    };
    expect(validateCoverage(c)).toHaveLength(1);
  });
});
