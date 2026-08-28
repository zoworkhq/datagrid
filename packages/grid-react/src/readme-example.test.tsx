// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { describeCoverage, type Coverage } from "@oxygenui-design/grid-healthcare";
import { DataGrid } from "./index.js";

/**
 * The README's quick-start snippet, compiled and run.
 *
 * A README example that does not compile is the fastest way to lose an
 * engineer who is evaluating you, so this file IS the snippet — if the API
 * changes under it, the build breaks before the documentation goes stale.
 *
 * `grid-healthcare` is a TEST-ONLY dependency here. An adapter must not depend
 * on the domain layer at runtime; the example composes both because that is
 * what a consumer does.
 */

// ── the exact snippet the README shows ──────────────────────────────────────
interface Patient { id: string; name: string; potassium: string }

const patients: Patient[] = [
  { id: "p1", name: "A. Okafor", potassium: "3.7" },
  { id: "p2", name: "B. Lindqvist", potassium: "5.1" },
];

const coverage: Coverage = {
  sources: [{ id: "ehr", label: "This application", status: "ok" }],
  total: "unknown",
  loaded: patients.length,
  asOf: "09:12",
};

const columns = [
  { key: "name", header: "Patient", sortable: true },
  { key: "potassium", header: "Potassium" },
];

function Roster() {
  return (
    <>
      <p>{describeCoverage(coverage)}</p>
      <DataGrid
        label="Patient roster"
        model={{
          columns,
          rows: patients.map((row, index) => ({ id: row.id, row, index })),
          total: coverage.total,
          sort: [],
          selection: [],
          focus: null,
        }}
        fallback={(row, key) => ({
          kind: "text",
          text: String(row[key as keyof Patient] ?? ""),
        })}
        onAction={(action) => console.log(action)}
      />
    </>
  );
}
// ── end snippet ─────────────────────────────────────────────────────────────

describe("the README example", () => {
  it("compiles and renders what it claims", () => {
    const host = document.createElement("div");
    document.body.append(host);
    act(() => {
      createRoot(host).render(<Roster />);
    });
    expect(host.querySelector('[role="grid"]')?.getAttribute("aria-label")).toBe("Patient roster");
    expect(host.querySelectorAll('[role="gridcell"]')).toHaveLength(4);
    // The coverage sentence is true when the total is unknown.
    expect(host.querySelector("p")?.textContent).toBe(
      "Showing 2 loaded, more may be available; as of 09:12",
    );
  });
});
