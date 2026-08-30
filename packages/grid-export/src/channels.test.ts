/**
 * Every output channel asks about ITSELF.
 *
 * ── THE DEFECT THIS REPLACES ────────────────────────────────────────────────
 *
 * `refuseIfPolicyForbids` only ever called `mayExport()`, and the print writer
 * called it too. So an application whose healthcare policy said `mayPrint:
 * false` and `mayExport: true` got a printable HTML document anyway — an
 * output-channel disclosure bypass, in the one channel that physically leaves
 * the building.
 *
 * `DisclosurePolicy` had defined `mayPrint()` all along. Nothing connected it.
 */
import { describe, expect, it } from "vitest";
import { toCsv } from "./csv.js";
import { toXlsx } from "./xlsx.js";
import { printSheetHtml, toPrintSheet } from "./print.js";
import type { ExportPolicy, ExportRequest } from "./model.js";

interface P { readonly id: string; readonly name: string }

const request = (policy?: ExportPolicy): ExportRequest<P> => ({
  columns: [{ key: "name", header: "Patient", value: (r) => ({ kind: "value", value: r.name }) }],
  rows: [{ id: "p1", name: "A. Okafor" }],
  coverage: "1 of 1 shown",
  ...(policy ? { policy } : {}),
});

/** Every writer, with the channel it is supposed to ask about. */
const WRITERS = [
  { name: "toCsv", channel: "export", run: (r: ExportRequest<P>) => toCsv(r) },
  { name: "toXlsx", channel: "export", run: (r: ExportRequest<P>) => toXlsx(r) },
  { name: "toPrintSheet", channel: "print", run: (r: ExportRequest<P>) => toPrintSheet(r) },
] as const;

const policy = (over: Partial<Record<"mayExport" | "mayPrint" | "mayCopy", boolean>>): ExportPolicy => ({
  mayExport: () => over.mayExport ?? true,
  ...(over.mayPrint === undefined ? {} : { mayPrint: () => over.mayPrint as boolean }),
  ...(over.mayCopy === undefined ? {} : { mayCopy: () => over.mayCopy as boolean }),
});

describe("the export/print permission matrix", () => {
  const CASES = [
    { mayExport: true, mayPrint: true, export: true, print: true },
    { mayExport: true, mayPrint: false, export: true, print: false },
    { mayExport: false, mayPrint: true, export: false, print: true },
    { mayExport: false, mayPrint: false, export: false, print: false },
  ] as const;

  for (const c of CASES) {
    it(`mayExport=${c.mayExport} mayPrint=${c.mayPrint}`, () => {
      const r = request(policy({ mayExport: c.mayExport, mayPrint: c.mayPrint }));
      for (const w of WRITERS) {
        const expected = w.channel === "print" ? c.print : c.export;
        const out = w.run(r);
        expect(out.ok, `${w.name} (${w.channel}) with the policy above`).toBe(expected);
        if (!out.ok) expect(out.reason).toContain(w.channel);
      }
    });
  }

  /** The exact reproduction from the review. */
  it("refuses a print sheet when only print is forbidden", () => {
    const out = toPrintSheet({
      columns: [],
      rows: [],
      policy: { mayExport: () => true, mayPrint: () => false },
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toMatch(/does not permit print/);
  });

  it("still permits the export that the same policy allows", () => {
    const out = toCsv(request(policy({ mayExport: true, mayPrint: false })));
    expect(out.ok).toBe(true);
  });
});

describe("a policy that predates the channels", () => {
  /**
   * `mayPrint` and `mayCopy` are optional and default to the export answer,
   * so an application written against the old single-method shape behaves
   * exactly as it did. The fix closes a bypass; it does not break a caller.
   */
  it("falls back to mayExport when the policy does not distinguish", () => {
    for (const allowed of [true, false]) {
      const r = request({ mayExport: () => allowed });
      for (const w of WRITERS) expect(w.run(r).ok, `${w.name} @ mayExport=${allowed}`).toBe(allowed);
    }
  });

  it("permits everything when there is no policy at all", () => {
    for (const w of WRITERS) expect(w.run(request()).ok, w.name).toBe(true);
  });
});

describe("the string-returning print helper", () => {
  /**
   * `printSheetHtml` returns a string and so CANNOT express a refusal. It is
   * kept for callers that have already decided, and the docs point at
   * `toPrintSheet` — but a helper that cannot refuse must not be the one a
   * policy-carrying request reaches by accident, so this pins the difference.
   */
  it("returns markup regardless, which is why the refusable one exists", () => {
    const html = printSheetHtml(request(policy({ mayExport: true, mayPrint: false })));
    expect(typeof html).toBe("string");
    expect(toPrintSheet(request(policy({ mayExport: true, mayPrint: false }))).ok).toBe(false);
  });
});
