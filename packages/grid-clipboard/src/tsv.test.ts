/**
 * Copy and paste round-trip through this package's own format.
 *
 * The writer quotes any value containing a tab, a return, a newline or a quote,
 * doubling embedded quotes. The parser did `split("\n")` then `split("\t")` —
 * so one clinical note containing a tab became two columns, and one containing
 * a newline became two rows. Copy-then-paste did not survive the library's own
 * output, and the plan then reported an overflow that was the parser's fault.
 */
import { describe, expect, it } from "vitest";
import { copyRange, planPaste, shapeOfRange, type RangeShape } from "./index.js";

interface Row { readonly id: string; readonly [k: string]: string }

const target = (rows: number, columns: string[]): RangeShape => ({
  rows: Array.from({ length: rows }, (_, i) => i),
  columns,
});

/** Copies values, then parses what was copied. The whole point. */
const roundTrip = (values: string[][], columns: string[]): string[][] => {
  const rows: Row[] = values.map((cells, i) => {
    const row: Record<string, string> = { id: `r${i}` };
    columns.forEach((c, j) => (row[c] = cells[j] ?? ""));
    return row as Row;
  });
  const copied = copyRange({
    shape: { rows: rows.map((_, i) => i), columns },
    rowAt: (i) => rows[i] as Row,
    valueAt: (row, key) => ({ kind: "value", value: (row as Record<string, string>)[key] ?? "" }),
  });
  if (!copied.ok) throw new Error("copy refused");
  return planPaste(copied.text, target(values.length, columns)).rows;
};

describe("values that used to break the round trip", () => {
  it("a tab inside a value stays one cell", () => {
    expect(roundTrip([["line one\tindented"], ["plain"]], ["note"]))
      .toEqual([["line one\tindented"], ["plain"]]);
  });

  it("a newline inside a value stays one cell", () => {
    expect(roundTrip([["first line\nsecond line"], ["plain"]], ["note"]))
      .toEqual([["first line\nsecond line"], ["plain"]]);
  });

  it("a quote inside a value survives", () => {
    expect(roundTrip([['5" of tubing'], ['he said "stop"']], ["note"]))
      .toEqual([['5" of tubing'], ['he said "stop"']]);
  });

  it("a carriage return inside a value survives EXACTLY", () => {
    // Inside a quoted value the bytes are preserved rather than normalised: a
    // round trip that rewrites the content is not a round trip, and a note
    // typed on Windows should come back as it was typed. Outside a quoted
    // value, CRLF is a row separator — that is tested below.
    expect(roundTrip([["a\r\nb"]], ["note"])).toEqual([["a\r\nb"]]);
  });

  it("all of them at once, across two columns", () => {
    const values = [
      ['note with\ttab', 'and "quotes"'],
      ["multi\nline", "plain"],
    ];
    const out = roundTrip(values, ["a", "b"]);
    expect(out).toHaveLength(2);
    expect(out[0]).toHaveLength(2);
    expect(out[0]?.[0]).toBe("note with\ttab");
    expect(out[1]?.[0]).toBe("multi\nline");
  });

  it("reports a fit rather than a parser-shaped overflow", () => {
    const rows: Row[] = [{ id: "r0", note: "a\tb" }, { id: "r1", note: "c" }];
    const copied = copyRange({
      shape: { rows: [0, 1], columns: ["note"] },
      rowAt: (i) => rows[i] as Row,
      valueAt: (row, key) => ({ kind: "value", value: (row as Record<string, string>)[key] ?? "" }),
    });
    const plan = planPaste(copied.ok ? copied.text : "", target(2, ["note"]));
    expect(plan.fits).toBe(true);
    expect(plan.overflow).toBe(0);
  });
});

describe("plain TSV, as a spreadsheet emits it", () => {
  const shape = target(2, ["a", "b"]);

  it("splits unquoted cells and rows", () => {
    expect(planPaste("1\t2\n3\t4", shape).rows).toEqual([["1", "2"], ["3", "4"]]);
  });

  it("handles CRLF, and a lone CR from old Excel", () => {
    expect(planPaste("1\t2\r\n3\t4", shape).rows).toEqual([["1", "2"], ["3", "4"]]);
    expect(planPaste("1\t2\r3\t4", shape).rows).toEqual([["1", "2"], ["3", "4"]]);
  });

  it("does not invent a row from a trailing newline", () => {
    expect(planPaste("1\t2\n", shape).rows).toEqual([["1", "2"]]);
    expect(planPaste("1\t2\r\n", shape).rows).toEqual([["1", "2"]]);
  });

  it("keeps empty cells rather than dropping them", () => {
    expect(planPaste("1\t\t3", target(1, ["a", "b", "c"])).rows).toEqual([["1", "", "3"]]);
  });

  it("treats a quote in the middle of an unquoted value as a character", () => {
    // 5" of tubing, typed straight into a cell, is not a quoted value.
    expect(planPaste('5" of tubing', target(1, ["a"])).rows).toEqual([['5" of tubing']]);
  });

  it("returns nothing for an empty clipboard", () => {
    expect(planPaste("", shape).rows).toEqual([]);
  });

  it("still reports a genuine overflow", () => {
    const plan = planPaste("1\t2\t3\n4\t5\t6", target(1, ["a"]));
    expect(plan.fits).toBe(false);
    expect(plan.overflow).toBe(5);
  });
});

describe("the neutralisation survives the round trip", () => {
  it("a formula keeps its apostrophe guard and stays one cell", () => {
    const out = roundTrip([["=cmd|' /c calc'!A1"]], ["name"]);
    expect(out[0]?.[0]).toBe("'=cmd|' /c calc'!A1");
  });

  it("a value beginning with a tab is guarded AND quoted, and comes back whole", () => {
    const out = roundTrip([["\tindented"]], ["note"]);
    expect(out[0]).toHaveLength(1);
    expect(out[0]?.[0]).toBe("'\tindented");
  });
});
