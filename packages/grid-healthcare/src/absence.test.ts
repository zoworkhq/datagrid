import { describe, expect, it } from "vitest";
import { describeAbsence, escalatesToCoverage, type Absent } from "./absence.js";

describe("the absence taxonomy", () => {
  it("has eight reasons, each with its own sentence", () => {
    const all: Absent[] = [
      { reason: "not-ordered" },
      { reason: "not-resulted", orderedAt: "08:40" },
      { reason: "not-measured" },
      { reason: "not-applicable", because: "no uterus" },
      { reason: "declined", by: "patient" },
      { reason: "specimen-problem", detail: "haemolysed" },
      { reason: "withheld", policy: "42 CFR Part 2" },
      { reason: "source-unreachable", source: "Northside Regional Exchange" },
    ];
    expect(all).toHaveLength(8);
    const sentences = all.map(describeAbsence);
    expect(new Set(sentences).size).toBe(8);
    for (const s of sentences) expect(s).not.toBe("");
  });

  it("escalates only an unreachable source into coverage", () => {
    expect(escalatesToCoverage({ reason: "source-unreachable", source: "x" })).toBe(true);
    expect(escalatesToCoverage({ reason: "not-ordered" })).toBe(false);
  });
});
