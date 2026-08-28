/**
 * The display excerpt.
 *
 * This function's whole job is to shorten output WITHOUT hiding the thing the
 * reader was told to look for, and it got that wrong three times, each in a
 * different way:
 *
 *   1. a blind 4,000-character prefix stopped above the payload row;
 *   2. a shared six-line hit budget let one pattern consume it and hide the
 *      other;
 *   3. a 20-LINE budget bounds nothing when a print sheet puts its whole
 *      <tbody> on one line — 20 lines, 215 kB.
 *
 * A panel that promises "find the line starting '=cmd" and then truncates
 * above it makes the same false-completeness claim `coverage` exists to
 * prevent. Each of the three has a test below.
 */
import { describe, expect, it } from "vitest";
import { excerpt } from "./excerpt.js";

const lines = (n: number, make: (i: number) => string = (i) => `line ${i}`) =>
  Array.from({ length: n }, (_, i) => make(i)).join("\n");

describe("short input", () => {
  it("is returned whole when it fits the line budget", () => {
    const body = lines(5);
    expect(excerpt(body)).toBe(body);
  });

  it("is returned whole at exactly the budget", () => {
    const body = lines(20);
    expect(excerpt(body)).toBe(body);
    expect(excerpt(body)).not.toContain("not shown");
  });

  it("keeps an empty string empty", () => {
    expect(excerpt("")).toBe("");
  });
});

describe("the head", () => {
  it("keeps the opening lines, which carry the shape", () => {
    const out = excerpt(lines(100));
    expect(out).toContain("line 0");
    expect(out).toContain("line 19");
    expect(out).not.toContain("line 20\n");
  });

  it("says how much it did not show, in a countable number", () => {
    // "…" says something is missing. "80 lines not shown" says how much.
    expect(excerpt(lines(100))).toContain("80 lines not shown");
  });

  it("honours a caller-supplied head size", () => {
    const out = excerpt(lines(100), [], 3);
    expect(out).toContain("line 2");
    expect(out).not.toContain("line 3\n");
    expect(out).toContain("97 lines not shown");
  });
});

describe("keeping the evidence", () => {
  const payload = "'=cmd|' /c calc'!A1,MRN-107919,Beeches";
  const withheld = "E. Haddad,MRN-400922,[withheld: 42 CFR Part 2]";

  it("keeps a matching line that falls far past the head", () => {
    // Fault 1: the payload row is thousands of lines down, so a prefix shows
    // the reader everything except the thing they were told to find.
    const body = [lines(500), payload, lines(500)].join("\n");
    const out = excerpt(body, [/'=cmd/]);
    expect(out).toContain(payload);
  });

  it("gives each pattern its own quota so neither can crowd the other out", () => {
    // Fault 2: `[withheld]` rows appear first and ate a shared budget whole,
    // hiding the payload the note pointed at.
    const body = [
      lines(30),
      ...Array.from({ length: 40 }, (_, i) => `${withheld} ${i}`),
      payload,
    ].join("\n");
    const out = excerpt(body, [/'=cmd/, /\[withheld/]);

    expect(out).toContain(payload);
    expect(out).toContain("[withheld");
  });

  it("caps each pattern rather than reprinting the whole file", () => {
    const body = [lines(30), ...Array.from({ length: 50 }, () => payload)].join("\n");
    const out = excerpt(body, [/'=cmd/]);
    const shown = out.split("\n").filter((l) => l.includes("=cmd")).length;
    expect(shown).toBeLessThanOrEqual(3);
    expect(shown).toBeGreaterThan(0);
  });

  it("does not print a line twice when two patterns both match it", () => {
    const both = "'=cmd and [withheld: policy]";
    const body = [lines(30), both].join("\n");
    const out = excerpt(body, [/'=cmd/, /\[withheld/]);
    expect(out.split("\n").filter((l) => l === both)).toHaveLength(1);
  });

  it("does not duplicate a match that was already in the head", () => {
    const body = [payload, lines(100)].join("\n");
    const out = excerpt(body, [/'=cmd/]);
    expect(out.split("\n").filter((l) => l.includes("=cmd"))).toHaveLength(1);
  });

  it("still truncates when nothing matches", () => {
    const out = excerpt(lines(100), [/nothing-matches-this/]);
    expect(out).toContain("80 lines not shown");
  });

  it("counts the omission correctly once matches are added back", () => {
    const body = [lines(30), payload, lines(9)].join("\n");
    const out = excerpt(body, [/'=cmd/]);
    // 40 lines total, 20 in the head, 20 in the tail, 1 of which is shown.
    expect(out).toContain("19 lines not shown");
  });
});

describe("the character budget", () => {
  const huge = "x".repeat(5000);

  it("clips a single enormous line", () => {
    // Fault 3: a print sheet is 20 lines and 215 kB. A line budget bounds
    // nothing at all.
    const out = excerpt(huge);
    expect(out.length).toBeLessThan(600);
    expect(out).toContain("…+4,600 chars");
  });

  it("clips an enormous line inside the head of a long document", () => {
    const body = [huge, lines(100)].join("\n");
    const out = excerpt(body);
    expect(out).toContain("…+4,600 chars");
    expect(out.length).toBeLessThan(3000);
  });

  it("clips an enormous line that arrives as a pattern match", () => {
    const body = [lines(50), `MATCH ${huge}`].join("\n");
    const out = excerpt(body, [/^MATCH/]);
    expect(out).toContain("MATCH");
    expect(out.length).toBeLessThan(3000);
  });

  it("leaves a line of exactly the limit alone", () => {
    const exact = "y".repeat(400);
    expect(excerpt(exact)).toBe(exact);
  });

  it("bounds the whole output for the worst realistic input", () => {
    // A print sheet: few lines, enormous ones, plus matches.
    const body = ["<table>", huge, huge, "</table>", ...Array(200).fill(huge)].join("\n");
    const out = excerpt(body, [/table/]);
    expect(out.length).toBeLessThan(12_000);
  });
});
