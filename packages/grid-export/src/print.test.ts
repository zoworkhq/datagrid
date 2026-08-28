import { describe, expect, it } from "vitest";
import type { ExportValue } from "@oxygenui-design/grid-core";
import type { ExportColumn, ExportRequest } from "./model.js";
import { printSheetHtml, toPrintSheet } from "./print.js";

const SECRET = "Buprenorphine 8mg";

interface P {
  readonly name: string;
  readonly k: number;
  readonly note: ExportValue;
}

const columns: ExportColumn<P>[] = [
  { key: "name", header: "Patient", value: (r) => ({ kind: "value", value: r.name }) },
  { key: "k", header: "Potassium", value: (r) => ({ kind: "value", value: r.k }) },
  { key: "note", header: "Note", value: (r) => r.note },
];

const request: ExportRequest<P> = {
  columns,
  rows: [
    { name: "Aurelia Marchetti-Okonkwo", k: 3.7, note: { kind: "value", value: "stable" } },
    { name: "<script>alert(1)</script>", k: 5.1, note: { kind: "masked", reason: "42 CFR Part 2" } },
  ],
  coverage: "Showing 2 of 2 loaded, more may be available; as of 09:12",
  predicate: "ward = A",
};

const html = (over: Partial<ExportRequest<P>> = {}) => printSheetHtml({ ...request, ...over }, { title: "Ward A roster" });

describe("the print sheet is a real table", () => {
  it("uses thead, which is the only thing that repeats a header across pages", () => {
    // On screen the grid is divs, because that is what lets it virtualise. In
    // print it has to be a table, or the header appears once and every page
    // after the first is unreadable.
    const out = html();
    expect(out).toContain("<thead>");
    expect(out).toContain("display: table-header-group");
    expect(out).toContain('<th scope="col">Patient</th>');
  });

  it("keeps a row from splitting across a page break", () => {
    // Half a patient is not a row.
    expect(html()).toContain("break-inside: avoid");
  });

  it("renders every row it is given, with no virtualisation", () => {
    const many = Array.from({ length: 500 }, (_, i) => ({
      name: `Patient ${i}`,
      k: i,
      note: { kind: "value" as const, value: "" },
    }));
    const out = html({ rows: many });
    expect(out.match(/<tr>/g)?.length).toBeGreaterThanOrEqual(500);
  });
});

describe("the claim travels onto the paper", () => {
  it("prints the coverage sentence at the top", () => {
    // Print is where "See all" stops existing, and the sheet will be read
    // months later by someone who was not there when the filter was set.
    expect(html()).toContain("Showing 2 of 2 loaded, more may be available");
  });

  it("prints the predicate", () => {
    expect(html()).toContain("Filter: ward = A");
  });

  it("repeats the claim in a running footer", () => {
    const out = html();
    expect(out).toContain("<tfoot>");
    expect(out).toContain("display: table-footer-group");
  });

  it("omits the coverage block entirely when the caller supplied none", () => {
    const bare = printSheetHtml({ columns, rows: request.rows });
    expect(bare).not.toContain('class="coverage"');
    expect(bare).not.toContain("<tfoot>");
  });
});

describe("what must not reach the paper", () => {
  it("prints a masked cell's reason and never its value", () => {
    const out = html();
    expect(out).toContain("[withheld: 42 CFR Part 2]");
    expect(out).not.toContain(SECRET);
  });

  it("escapes hostile content in a name", () => {
    const out = html();
    expect(out).not.toContain("<script>alert(1)</script>");
    expect(out).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("escapes the title too", () => {
    const out = printSheetHtml(request, { title: 'A" onload="x' });
    expect(out).toContain("&quot;");
    expect(out).not.toContain('title="A" onload="x"');
  });

  it("refuses when the disclosure policy says no", () => {
    const r = toPrintSheet({ ...request, policy: { mayExport: () => false } });
    expect(r.ok).toBe(false);
  });
});

describe("presentation", () => {
  it("right-aligns numbers with tabular figures", () => {
    const out = html();
    expect(out).toContain('<td class="num">3.7</td>');
    expect(out).toContain("tabular-nums");
  });

  it("returns bytes and an HTML media type", () => {
    const r = toPrintSheet(request, { title: "x" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.mediaType).toBe("text/html;charset=utf-8");
      expect(new TextDecoder().decode(r.bytes)).toContain("<!doctype html>");
    }
  });
});
