// @vitest-environment jsdom
/**
 * One masked value, checked through every channel it can leave by.
 *
 * ── WHY THIS TEST SPANS PACKAGES ────────────────────────────────────────────
 *
 * The disclosure model is a composition contract: `resolveColumns`,
 * `resolveRows` and `policy.cell` are three calls a developer has to make, in
 * order, for EVERY output — the renderer, CSV, XLSX, the print sheet, the
 * clipboard, and a transaction that patches a row after the fact. Miss one and
 * the value is disclosed through that channel while looking correctly masked in
 * the others, and nothing anywhere reports it.
 *
 * `discloseGrid` makes the safe path one call. This test is what says the path
 * is actually safe, and it has to cross package boundaries to say it — the
 * layer rules exempt tests for exactly this.
 *
 * The assertion is deliberately blunt: the secret string must not appear in the
 * bytes. Not "the cell renders a mask" — the BYTES.
 */
import { describe, expect, it } from "vitest";
import { discloseGrid, type DisclosurePolicy } from "@oxygenui-design/grid-healthcare";
import { createGridRenderer } from "@oxygenui-design/grid-dom";
import { copyRange } from "@oxygenui-design/grid-clipboard";
import { toCsv } from "./csv.js";
import { toXlsx } from "./xlsx.js";
import { toPrintSheet, printSheetHtml } from "./print.js";
import type { ExportRequest } from "./model.js";

interface Patient {
  readonly id: string;
  readonly name: string;
  readonly ward: string;
  readonly notes: string;
}

/** The one thing that must never leave. */
const SECRET = "Buprenorphine 8mg, methadone titration";

const PATIENTS: Patient[] = [
  { id: "p1", name: "Amara Okafor", ward: "Ashgrove", notes: "Stable on current regimen" },
  { id: "p2", name: "Daniel Lindqvist", ward: "Beeches", notes: SECRET },
];

const COLUMNS = [
  { key: "name", header: "Patient", required: true },
  { key: "ward", header: "Ward" },
  { key: "notes", header: "Notes" },
];

/** 42 CFR Part 2: the notes column is masked for the Part 2 patient. */
const policy = (over: Partial<DisclosurePolicy> = {}): DisclosurePolicy => ({
  column: () => "visible",
  row: () => "visible",
  cell: (row, key) =>
    key === "notes" && (row as Patient).id === "p2"
      ? { masked: { code: "part2", label: "42 CFR Part 2", legal: "42 CFR §2.32" } }
      : "visible",
  mayExport: () => true,
  mayPrint: () => true,
  mayCopy: () => true,
  ...over,
});

const disclosed = (over: Partial<DisclosurePolicy> = {}) =>
  discloseGrid<Patient>({
    columns: COLUMNS,
    rows: PATIENTS,
    rowKey: (r) => r.id,
    policy: policy(over),
    get: (row, key) => (row as unknown as Record<string, string>)[key] ?? null,
  });

const request = (d = disclosed()): ExportRequest<Patient> => ({
  columns: d.exportColumns,
  rows: d.rows,
  coverage: "2 of 2 shown",
  policy: d.channelPolicy,
});

const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

describe("a masked value does not appear in any output", () => {
  it("not in the rendered DOM", () => {
    const d = disclosed();
    const host = document.createElement("div");
    document.body.append(host);
    const r = createGridRenderer<Patient>(host, {
      label: "Roster",
      onAction: () => {},
      fallback: (row, key) => d.fallback(row, key),
    });
    r.render({
      columns: d.columns.map((c) => ({ key: c.key, header: c.header })),
      rows: d.rows.map((row, index) => ({ id: row.id, row, index })),
      total: d.rows.length, sort: [], selection: [], focus: null,
    });

    expect(host.textContent ?? "").not.toContain(SECRET);
    expect(host.textContent ?? "").toContain("42 CFR Part 2");
    // The unmasked row is untouched.
    expect(host.textContent ?? "").toContain("Stable on current regimen");
    r.destroy();
    host.remove();
  });

  it("not in the CSV", () => {
    const out = toCsv(request());
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(decode(out.bytes)).not.toContain(SECRET);
      expect(decode(out.bytes)).toContain("42 CFR Part 2");
    }
  });

  it("not in the XLSX", () => {
    const out = toXlsx(request());
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(decode(out.bytes)).not.toContain(SECRET);
    }
  });

  it("not in the print sheet", () => {
    const out = toPrintSheet(request());
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(decode(out.bytes)).not.toContain(SECRET);
      expect(decode(out.bytes)).toContain("42 CFR Part 2");
    }
  });

  it("not in the string-returning print helper either", () => {
    expect(printSheetHtml(request())).not.toContain(SECRET);
  });

  it("not on the clipboard", () => {
    const d = disclosed();
    const out = copyRange({
      shape: { rows: [0, 1], columns: d.columns.map((c) => c.key) },
      rowAt: (i) => d.rows[i] as Patient,
      valueAt: (row, key) => d.exportColumns.find((c) => c.key === key)?.value(row) ?? { kind: "value", value: "" },
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.text).not.toContain(SECRET);
      expect(out.masked).toBeGreaterThan(0);
    }
  });

  it("not after a transaction patches the row", () => {
    // A patched row goes through the same fallback, so a value arriving after
    // the first render is masked by the same rule. This is the channel a
    // hand-wired integration is most likely to miss.
    const d = disclosed();
    const host = document.createElement("div");
    document.body.append(host);
    const r = createGridRenderer<Patient>(host, {
      label: "Roster",
      onAction: () => {},
      fallback: (row, key) => d.fallback(row, key),
    });
    r.render({
      columns: d.columns.map((c) => ({ key: c.key, header: c.header })),
      rows: d.rows.map((row, index) => ({ id: row.id, row, index })),
      total: d.rows.length, sort: [], selection: [], focus: null,
    });

    const frames: FrameRequestCallback[] = [];
    const real = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = ((fn: FrameRequestCallback) => {
      frames.push(fn);
      return 1;
    }) as typeof globalThis.requestAnimationFrame;
    try {
      r.applyTransaction({
        update: [{ id: "p2", row: { id: "p2", name: "Daniel Lindqvist", ward: "Beeches", notes: SECRET } }],
      });
      for (const fn of frames.splice(0)) fn(0);
    } finally {
      globalThis.requestAnimationFrame = real;
    }

    expect(host.textContent ?? "").not.toContain(SECRET);
    r.destroy();
    host.remove();
  });
});

describe("the channel permissions travel with it", () => {
  it("refuses export, print and copy independently", () => {
    const noPrint = request(disclosed({ mayPrint: () => false }));
    expect(toCsv(noPrint).ok).toBe(true);
    expect(toPrintSheet(noPrint).ok).toBe(false);

    const noExport = request(disclosed({ mayExport: () => false }));
    expect(toCsv(noExport).ok).toBe(false);
    expect(toXlsx(noExport).ok).toBe(false);
    expect(toPrintSheet(noExport).ok).toBe(true);
  });
});

describe("what the facade reports about itself", () => {
  it("names the columns a policy withheld", () => {
    const d = disclosed({ column: (key) => (key === "ward" ? { withheld: { code: "role", label: "role" } } : "visible") });
    expect(d.columns.map((c) => c.key)).toEqual(["name", "notes"]);
    expect(d.withheld.map((c) => c.key)).toEqual(["ward"]);
    expect(d.withheldNote).not.toBe("");
  });

  it("marks a restricted row rather than dropping it", () => {
    // Dropping changes the row count, and a count that silently shrinks is a
    // coverage claim nobody made.
    const d = disclosed({ row: (row) => ((row as Patient).id === "p2" ? { restricted: { code: "part2", label: "Part 2" } } : "visible") });
    expect(d.rows).toHaveLength(2);
    expect(d.restricted.get("p2")?.label).toBe("Part 2");
  });

  it("says nothing is withheld when nothing is", () => {
    expect(disclosed().withheld).toEqual([]);
  });
});
