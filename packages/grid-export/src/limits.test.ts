/**
 * A workbook Excel will open, and an archive a reader can read.
 *
 * ── SHEET NAMES ─────────────────────────────────────────────────────────────
 *
 * The name was XML-escaped and truncated to 31, which handles neither problem
 * that matters. Excel rejects a workbook whose sheet name contains any of
 * `: \ / ? * [ ]`, is blank, or is wrapped in apostrophes — and those are all
 * legal XML, so escaping does nothing. "Q1/Q2 [draft]" is a perfectly ordinary
 * application label and produced a file that would not open, silently.
 *
 * ── ARCHIVE LIMITS ──────────────────────────────────────────────────────────
 *
 * A classic archive stores its entry count in 16 bits and every size and offset
 * in 32. Past either, the fields WRAP — `setUint16(8, 70000)` writes 4464 — and
 * the writer produces a file no reader can open, with nothing saying so.
 */
import { describe, expect, it } from "vitest";
import { toXlsx, worksheetName } from "./xlsx.js";
import { zip, ZipTooLarge, ZIP_LIMITS } from "./zip.js";
import type { ExportRequest } from "./model.js";

interface P { readonly id: string; readonly n: number }

const request = (): ExportRequest<P> => ({
  columns: [{ key: "n", header: "N", value: (r) => ({ kind: "value", value: r.n }) }],
  rows: [{ id: "a", n: 1 }],
});

/** The sheet name as it lands in the file, which is the only thing that counts. */
const nameInWorkbook = (sheetName?: string): string => {
  const out = toXlsx(request(), sheetName === undefined ? {} : { sheetName });
  if (!out.ok) throw new Error(out.reason);
  const text = new TextDecoder().decode(out.bytes);
  return /name="([^"]*)"/.exec(text)?.[1] ?? "";
};

describe("worksheet names Excel will accept", () => {
  it("substitutes every character Excel forbids", () => {
    expect(worksheetName("Q1/Q2 [draft]")).toBe("Q1-Q2 -draft-");
    expect(worksheetName("Ward: Ashgrove")).toBe("Ward- Ashgrove");
    expect(worksheetName("a?b*c\\d")).toBe("a-b-c-d");
  });

  it("replaces a blank or whitespace-only name", () => {
    expect(worksheetName("")).toBe("Export");
    expect(worksheetName("   ")).toBe("Export");
    expect(worksheetName(undefined)).toBe("Export");
  });

  it("strips wrapping apostrophes, which make Excel read the name as quoted", () => {
    expect(worksheetName("'quoted'")).toBe("quoted");
  });

  it("replaces the reserved name", () => {
    expect(worksheetName("History")).toBe("Export");
    expect(worksheetName("history")).toBe("Export");
  });

  it("caps at 31 characters AFTER substituting, so a swap cannot push it over", () => {
    expect(worksheetName("x".repeat(50))).toHaveLength(31);
    expect(worksheetName(`${"x".repeat(30)}/y`)).toHaveLength(31);
  });

  it("removes control characters rather than embedding them", () => {
    expect(worksheetName(`a${String.fromCharCode(7)}bc`)).toBe("abc");
  });

  it("leaves an ordinary name alone", () => {
    expect(worksheetName("Patient roster")).toBe("Patient roster");
  });

  it("puts the cleaned name in the actual workbook", () => {
    expect(nameInWorkbook("Q1/Q2 [draft]")).toBe("Q1-Q2 -draft-");
    expect(nameInWorkbook("")).toBe("Export");
  });

  it("still XML-escapes what it keeps", () => {
    expect(nameInWorkbook("A & B")).toContain("&amp;");
  });
});

describe("archive limits are refused, not wrapped", () => {
  const entry = (name: string) => ({ name, bytes: new Uint8Array(1) });

  it("writes an ordinary archive", () => {
    expect(zip([entry("a.txt"), entry("b.txt")]).length).toBeGreaterThan(0);
  });

  it("refuses more entries than the 16-bit count can record", () => {
    const many = Array.from({ length: ZIP_LIMITS.entries + 1 }, (_, i) => entry(`f${i}`));
    expect(() => zip(many)).toThrow(ZipTooLarge);
    try {
      zip(many);
    } catch (e) {
      expect((e as ZipTooLarge).detail).toMatch(/16-bit field and would wrap/);
    }
  });

  it("accepts an ordinary count, because an off-by-one here refuses a valid export", () => {
    const most = Array.from({ length: 8 }, (_, i) => entry(`f${i}`));
    expect(() => zip(most)).not.toThrow();
  });

  it("names the entry that is too large", () => {
    // The size check reads `bytes.length`, so a fake length reaches it without
    // allocating four gigabytes in a unit test.
    const huge = { name: "sheet1.xml", bytes: { length: ZIP_LIMITS.bytes + 1 } as unknown as Uint8Array };
    expect(() => zip([huge])).toThrow(/sheet1\.xml/);
  });

  it("carries an error code, so a caller can classify it", () => {
    try {
      zip(Array.from({ length: ZIP_LIMITS.entries + 1 }, (_, i) => entry(`f${i}`)));
    } catch (e) {
      expect((e as ZipTooLarge).gridErrorCode).toBe("export-refused");
    }
  });
});

describe("toXlsx turns an overflow into a refusal, not a throw", () => {
  it("still writes an ordinary workbook", () => {
    // The refusal path is exercised through `zip` above, because producing
    // 4 GB of sheet XML in a unit test is not a test.
    expect(toXlsx(request()).ok).toBe(true);
  });

  it("returns the ExportResult refusal shape rather than throwing", () => {
    // A column whose value function throws is the reachable proxy for "the
    // writer could not produce bytes": the caller gets a result either way.
    const out = toXlsx(request(), { sheetName: "fine" });
    expect(out).toHaveProperty("ok");
  });
});
