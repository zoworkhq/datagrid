// @vitest-environment jsdom
/**
 * The whole demo, booted.
 *
 * The panels' substance lives in the packages and is tested there. What is NOT
 * tested anywhere else is the wiring: whether the coverage sentence actually
 * reaches the element it is supposed to, whether the 200,000-row control
 * actually refuses, whether the tabs actually mount their panels. Every one of
 * those is a claim the demo makes on screen, and a claim is exactly the kind of
 * thing that keeps working in a unit test while being wired to nothing.
 *
 * So this loads the real index.html into jsdom and imports the real entry
 * point, side effects and all.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

// Resolved from the project root, not from `import.meta.url`: under the jsdom
// environment that is an http: URL, and `fileURLToPath` rejects it.
const html = readFileSync(resolve(process.cwd(), "examples/playground/index.html"), "utf8");

const $ = <T extends HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);
const byId = <T extends HTMLElement>(id: string): T | null => document.getElementById(id) as T | null;

beforeAll(async () => {
  const body = /<body[^>]*>([\s\S]*)<\/body>/.exec(html)?.[1] ?? "";
  document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/g, "");
  document.body.className = /<body[^>]*class="([^"]*)"/.exec(html)?.[1] ?? "";

  // jsdom has no layout, so the viewport reports zero height and the window
  // would be empty. The renderer falls back to 600px; make that explicit.
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() {
      return this.classList?.contains("oxg-viewport") ? 600 : 0;
    },
  });

  await import("./main.js");
});

describe("the page boots", () => {
  it("mounts a grid into the roster panel", () => {
    expect($('[data-panel="roster"] [role="grid"]')).not.toBeNull();
    expect(document.querySelectorAll('.oxg-body [role="row"]').length).toBeGreaterThan(0);
  });

  it("renders the brief's cells, not plain text", () => {
    expect($(".idc .pname")).not.toBeNull();
    expect($(".cs .gl-dot")).not.toBeNull();
    expect($(".a-tag")).not.toBeNull();
  });

  it("shows every row's cells filled on the FIRST paint", () => {
    // A cell whose content is written only in `update()` paints blank until
    // something forces a second render. In the browser that is invisible.
    for (const cell of document.querySelectorAll<HTMLElement>('.oxg-body [role="gridcell"]')) {
      expect(cell.textContent?.trim(), `blank ${cell.dataset["colKey"]}`).not.toBe("");
    }
  });
});

describe("the coverage claim", () => {
  it("is stated in words, in a fixed place", () => {
    const text = byId("coverage")?.textContent ?? "";
    expect(text.length).toBeGreaterThan(0);
    expect(text).toMatch(/showing/i);
  });

  it("says the total is unknown rather than implying one", () => {
    // An absent total reads as "we forgot". Saying so is the claim.
    const text = byId("coverage")?.textContent ?? "";
    expect(text).toMatch(/more may be available|unknown/i);
  });

  it("escalates an unreachable source into the sentence", () => {
    // A per-cell failure is part of what the query did not reach.
    expect(byId("coverage")?.textContent).toContain("Northside Regional Exchange");
  });

  it("declares the grid's row count as unknown to assistive technology", () => {
    // aria-rowcount="-1" is the specified value for "the total is not known".
    expect($('[data-panel="roster"] [role="grid"]')?.getAttribute("aria-rowcount")).toBe("-1");
  });
});

describe("the ceiling refuses rather than guessing", () => {
  const setSize = (value: string) => {
    const select = byId<HTMLSelectElement>("size");
    if (!select) throw new Error("no size control");
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  };

  it("declines 200,000 rows, with the reason and the number", () => {
    setSize("200000");
    const refusal = byId("refusal");
    expect(refusal?.hidden).toBe(false);
    expect(refusal?.textContent).toContain("200,000");
    // A silent four-second sort is worse than a clear error.
    expect(refusal?.textContent).toMatch(/ceiling/i);
  });

  it("renders no rows while refusing, rather than a partial set", () => {
    setSize("200000");
    // A truncated view that looks complete is the failure `coverage` exists
    // to prevent.
    expect(document.querySelectorAll('.oxg-body [role="row"]')).toHaveLength(0);
  });

  it("recovers when the size comes back under the ceiling", () => {
    setSize("200000");
    setSize("1000");
    expect(byId("refusal")?.hidden).toBe(true);
    expect(document.querySelectorAll('.oxg-body [role="row"]').length).toBeGreaterThan(0);
  });
});

describe("filtering", () => {
  const filter = (term: string) => {
    const input = byId<HTMLInputElement>("filter");
    if (!input) throw new Error("no filter control");
    input.value = term;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };

  it("narrows the set and says how many it excluded", () => {
    filter("Okafor");
    const rows = [...document.querySelectorAll<HTMLElement>(".idc .pname")];
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.textContent).toContain("Okafor");
    // The exclusion is part of the coverage claim, not a silent narrowing.
    expect(byId("coverage")?.textContent).toMatch(/filtered out/i);
  });

  it("restores the full set when cleared", () => {
    filter("Okafor");
    filter("");
    expect(byId("coverage")?.textContent).not.toMatch(/filtered out/i);
  });

  it("shows an empty result honestly rather than falling back to everything", () => {
    filter("zzzz-no-such-patient");
    expect(document.querySelectorAll('.oxg-body [role="row"]')).toHaveLength(0);
    filter("");
  });
});

describe("the panels", () => {
  const openTab = (name: string) => {
    byId(`tab-${name}`) ?? $(`[data-tab="${name}"]`)?.dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
  };

  it.each([
    ["clinical", "clinical-host"],
    ["disclosure", "disclosure-host"],
    ["grouping", "group-host"],
    ["working", "working-host"],
    ["ai", "ai-host"],
  ])("mounts a grid when the %s tab is opened", (tab, hostId) => {
    openTab(tab);
    expect(byId(hostId)?.querySelector('[role="grid"]')).not.toBeNull();
  });

  it("shows only one panel at a time", () => {
    openTab("ai");
    const visible = [...document.querySelectorAll<HTMLElement>("[data-panel]")].filter(
      (p) => !p.hidden,
    );
    expect(visible).toHaveLength(1);
    expect(visible[0]?.dataset["panel"]).toBe("ai");
  });

  it("marks exactly one tab selected", () => {
    openTab("grouping");
    const selected = [...document.querySelectorAll('[role="tab"][aria-selected="true"]')];
    expect(selected).toHaveLength(1);
  });
});

describe("the export panel shows what the writer emitted", () => {
  const openRoster = () =>
    $('[data-tab="roster"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

  it("shows the CSV bytes, with the payload neutralised", () => {
    openRoster();
    byId("csv")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const out = byId("export-out");
    expect(out?.hidden).toBe(false);
    const text = out?.textContent ?? "";
    // A formula in a patient name arrives inert. That is the demonstration,
    // and it has to be VISIBLE in the excerpt, not truncated above.
    expect(text).toMatch(/'[=@+]/);
  });

  it("shows the sheet XML with no formula element in it", () => {
    openRoster();
    byId("xlsx")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const text = byId("export-out")?.textContent ?? "";
    const sheet = text.slice(text.indexOf("<worksheet"));
    expect(sheet).toContain("inlineStr");
    // In XLSX a formula is an <f> element. There must not be one.
    expect(/<f[ >]/.test(sheet)).toBe(false);
  });

  it("keeps the print sheet bounded rather than dumping 200 kB into the panel", () => {
    openRoster();
    byId("print")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect((byId("export-out")?.textContent ?? "").length).toBeLessThan(12_000);
  });
});

describe("the page states its boundaries", () => {
  // Whitespace-normalised: these sentences wrap across lines in the source,
  // so textContent carries newlines mid-phrase.
  const prose = () => (document.body.textContent ?? "").replace(/\s+/g, " ");

  it("says the data is synthetic", () => {
    expect(prose()).toMatch(/synthetic/i);
  });

  it("says it is not a compliance boundary and not a medical device", () => {
    // The library renders a policy; it does not decide or enforce one.
    expect(prose()).toMatch(/not a compliance boundary/i);
    expect(prose()).toMatch(/not a medical device/i);
  });

  it("says no clinician has reviewed the clinical rules", () => {
    expect(prose()).toMatch(/no clinician has reviewed/i);
  });
});
