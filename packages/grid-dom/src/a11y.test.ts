// @vitest-environment jsdom
import axe from "axe-core";
import { beforeEach, describe, expect, it } from "vitest";
import { createGridRenderer, HEADER_ROW_ID, type GridViewModel } from "./renderer.js";

/**
 * The accessibility gate.
 *
 * ── WHAT THIS IS NOT ────────────────────────────────────────────────────────
 * This is axe in jsdom: a structural smoke gate. jsdom has no layout, so every
 * rule that needs geometry — colour contrast, target size, focus-not-obscured —
 * cannot run here and is NOT covered.
 *
 * The real gate is axe across three engines plus the NVDA / JAWS / VoiceOver
 * matrix, published with its gaps. That is planned work, not a discovery, and
 * it is what governs leaving `experimental`. This file catches the structural
 * regressions cheaply on every commit; it does not stand in for that matrix.
 * ────────────────────────────────────────────────────────────────────────────
 */

interface P { readonly id: string; readonly name: string; readonly k: string }

const model = (over: Partial<GridViewModel<P>> = {}): GridViewModel<P> => ({
  columns: [
    { key: "name", header: "Patient", sortable: true },
    { key: "k", header: "Potassium", sortable: true },
  ],
  rows: [
    { id: "p1", row: { id: "p1", name: "A. Okafor", k: "3.7" }, index: 0 },
    { id: "p2", row: { id: "p2", name: "B. Lindqvist", k: "5.1" }, index: 1 },
  ],
  total: 2,
  sort: [],
  selection: [],
  focus: null,
  ...over,
});

let host: HTMLElement;
const fallback = (row: P, key: string) => ({
  kind: "text" as const,
  text: String(row[key as keyof P] ?? ""),
});

const mount = (m = model()) => {
  const r = createGridRenderer<P>(host, { label: "Patient roster", onAction: () => {}, fallback });
  r.render(m);
  return r;
};

async function violations(): Promise<axe.Result[]> {
  const results = await axe.run(host, {
    // Rules needing layout cannot run in jsdom; excluding them here keeps the
    // gate honest rather than passing them vacuously.
    rules: { "color-contrast": { enabled: false }, "target-size": { enabled: false } },
  });
  return results.violations;
}

beforeEach(() => {
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.append(host);
});

describe("axe (structural)", () => {
  it("reports no violations for a plain grid", async () => {
    mount();
    expect(await violations()).toEqual([]);
  });

  it("reports none with a sort applied and rows selected", async () => {
    mount(model({ sort: [{ key: "k", direction: "desc" }], selection: ["p2"] }));
    expect(await violations()).toEqual([]);
  });

  it("reports none when the total is unknown and rowcount is -1", async () => {
    mount(model({ total: "unknown" }));
    expect(await violations()).toEqual([]);
  });

  it("reports none with focus in the header row", async () => {
    mount(model({ focus: { rowId: HEADER_ROW_ID, columnKey: "k" } }));
    expect(await violations()).toEqual([]);
  });

  it("reports none for an empty grid", async () => {
    mount(model({ rows: [], total: 0 }));
    expect(await violations()).toEqual([]);
  });
});

describe("the structural invariants axe cannot check", () => {
  it("keeps every gridcell inside a row inside a rowgroup, with only presentational wrappers above", () => {
    // Virtualisation needs a scroller and a sized canvas between the grid and
    // its rowgroups. They carry role="presentation" so they do not appear in
    // the accessibility tree at all -- which is exactly what lets
    // aria-required-children still pass. Anything else in that chain is a bug.
    mount();
    for (const cell of host.querySelectorAll('[role="gridcell"],[role="columnheader"]')) {
      const row = cell.parentElement;
      expect(row?.getAttribute("role")).toBe("row");
      expect(row?.parentElement?.getAttribute("role")).toBe("rowgroup");

      let node = row?.parentElement?.parentElement ?? null;
      while (node && node.getAttribute("role") === "presentation") node = node.parentElement;
      expect(node?.getAttribute("role")).toBe("grid");
    }
  });

  it("gives the grid a name a voice-control user would actually say", () => {
    // Dragon and Voice Control drive by accessible name. "Patient roster",
    // never "grid" -- it costs nothing at the start and is a retrofit later.
    mount();
    const name = host.querySelector('[role="grid"]')?.getAttribute("aria-label") ?? "";
    expect(name).toBe("Patient roster");
    expect(name.toLowerCase()).not.toBe("grid");
  });

  it("numbers every column index from one, in visual order", () => {
    mount();
    const idx = Array.from(host.querySelectorAll('[role="columnheader"]')).map((e) =>
      e.getAttribute("aria-colindex"),
    );
    expect(idx).toEqual(["1", "2"]);
  });
});
