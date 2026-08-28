// @vitest-environment jsdom
/**
 * The roster's cell renderers.
 *
 * The emphasis is on RECYCLING. A cell node outlives the row it was built for:
 * the renderer pools rows and calls `update()` on a node that is already
 * showing someone else's data. Every field must therefore be written on every
 * update, and any class the cell later queries by must survive being rewritten.
 *
 * That is not a hypothetical. The result cell shipped with `className` assigned
 * wholesale in `update()`, which dropped the `.res-v` hook it queries by; the
 * next recycle found nothing and rendered an empty cell. Rows 1–3 looked
 * correct, so it survived a visual check. The tests below scroll a node through
 * several rows precisely because a single `update()` cannot catch it.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { Absent } from "@oxygenui-design/grid-healthcare";
import {
  identityCell, problemsCell, resultCell, statusCell,
  type Patient, type Status,
} from "./cells.js";

const patient = (over: Partial<Patient> = {}): Patient => ({
  id: "p1",
  name: "A. Okafor",
  mrn: "MRN-100000",
  dob: "01 Jan 1938",
  ward: "Ashgrove",
  status: "Stable",
  problems: ["Depression"],
  potassium: { value: 4.1, unit: "mmol/L" },
  reviewed: "2026-08-01",
  ...over,
});

const ctx = (row: Patient, columnKey = "name") => ({
  row,
  columnKey,
  rowIndex: 0,
  onError: () => {},
});

let node: HTMLElement;
beforeEach(() => {
  node = document.createElement("div");
});

describe("the identity cell", () => {
  it("puts the name above the two things that disambiguate a person", () => {
    identityCell.mount(node, ctx(patient()));
    identityCell.update(node, ctx(patient()));

    expect(node.querySelector(".pname")?.textContent).toBe("A. Okafor");
    const sub = node.querySelector(".sub2")?.textContent ?? "";
    expect(sub).toContain("MRN-100000");
    expect(sub).toContain("01 Jan 1938");
  });

  it("does not repeat a prefix the identifier already carries", () => {
    identityCell.mount(node, ctx(patient()));
    identityCell.update(node, ctx(patient()));
    // "MRN MRN-100000" shipped once. The identifier is the label.
    expect(node.querySelector(".sub2")?.textContent).not.toContain("MRN MRN");
  });

  it("hides the avatar from assistive technology", () => {
    identityCell.mount(node, ctx(patient()));
    identityCell.update(node, ctx(patient()));
    // Initials are a visual shorthand for a name that is already in the row.
    expect(node.querySelector(".a-avatar")?.getAttribute("aria-hidden")).toBe("true");
  });

  it.each([
    ["A. Okafor", "AO"],
    ["Aisha Bello", "AB"],
    ["Madonna", "M"],
    ["Ana María López", "AL"],
    ["  spaced   out  ", "SO"],
  ])("derives initials from %j as %j", (name, expected) => {
    identityCell.mount(node, ctx(patient({ name })));
    identityCell.update(node, ctx(patient({ name })));
    expect(node.querySelector(".a-avatar")?.textContent).toBe(expected);
  });

  it("survives a name that is empty rather than throwing", () => {
    identityCell.mount(node, ctx(patient({ name: "" })));
    expect(() => identityCell.update(node, ctx(patient({ name: "" })))).not.toThrow();
    expect(node.querySelector(".a-avatar")?.textContent).toBe("");
  });

  it("gives one person the same avatar tone every time", () => {
    identityCell.mount(node, ctx(patient()));
    identityCell.update(node, ctx(patient()));
    const first = node.querySelector(".a-avatar")?.className;

    identityCell.update(node, ctx(patient({ id: "other" })));
    identityCell.update(node, ctx(patient()));
    expect(node.querySelector(".a-avatar")?.className).toBe(first);
    expect(first).toMatch(/\ba-avatar b[1-5]\b/);
  });

  it("rewrites every field when the node is recycled onto another patient", () => {
    identityCell.mount(node, ctx(patient()));
    identityCell.update(node, ctx(patient()));
    identityCell.update(
      node,
      ctx(patient({ id: "p2", name: "K. Lindqvist", mrn: "MRN-123757", dob: "04 Apr 1941" })),
    );

    expect(node.querySelector(".pname")?.textContent).toBe("K. Lindqvist");
    const sub = node.querySelector(".sub2")?.textContent ?? "";
    expect(sub).toContain("MRN-123757");
    expect(sub).toContain("04 Apr 1941");
    // Nothing of the previous occupant may remain.
    expect(node.textContent).not.toContain("Okafor");
    expect(node.textContent).not.toContain("100000");
  });

  it("does not accumulate nodes across many recycles", () => {
    identityCell.mount(node, ctx(patient()));
    for (let i = 0; i < 50; i++) {
      identityCell.update(node, ctx(patient({ id: `p${i}`, name: `Name ${i}` })));
    }
    expect(node.querySelectorAll(".idc")).toHaveLength(1);
    expect(node.querySelectorAll(".sub2")).toHaveLength(1);
  });

  it("reads out the disambiguating detail, not just the name", () => {
    expect(identityCell.read(ctx(patient()))).toBe("A. Okafor, MRN MRN-100000, born 01 Jan 1938");
  });

  it("sorts by name and exports the name alone", () => {
    expect(identityCell.compare(patient({ name: "A" }), patient({ name: "B" }))).toBeLessThan(0);
    expect(identityCell.toExport(ctx(patient()))).toEqual({ kind: "value", value: "A. Okafor" });
    // Print has no hover and no second line, so the identifier travels inline.
    expect(identityCell.toPrint(ctx(patient()))).toEqual({
      kind: "value",
      value: "A. Okafor (MRN-100000)",
    });
  });

  it("empties the node on unmount", () => {
    identityCell.mount(node, ctx(patient()));
    identityCell.update(node, ctx(patient()));
    identityCell.unmount(node);
    expect(node.childNodes).toHaveLength(0);
  });
});

describe("the status cell", () => {
  const TONES: ReadonlyArray<readonly [Status, string]> = [
    ["Stable", "cs-ok"],
    ["Needs review", "cs-cau"],
    ["Deteriorating", "cs-crit"],
    ["Newly admitted", "cs-info"],
  ];

  it.each(TONES)("renders %j with the %j tone", (status, tone) => {
    statusCell.mount(node, ctx(patient({ status }), "status"));
    statusCell.update(node, ctx(patient({ status }), "status"));
    expect(node.querySelector(".cs")?.className).toContain(tone);
  });

  it.each(TONES)("states %j in words as well as colour", (status) => {
    statusCell.mount(node, ctx(patient({ status }), "status"));
    statusCell.update(node, ctx(patient({ status }), "status"));
    // Colour alone fails every colour-blind reader, and prints as grey.
    expect(node.textContent).toContain(status);
    expect(node.querySelector(".gl-dot")).not.toBeNull();
    expect(node.querySelector(".gl-dot")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("replaces the tone rather than accumulating tones when recycled", () => {
    statusCell.mount(node, ctx(patient({ status: "Stable" }), "status"));
    statusCell.update(node, ctx(patient({ status: "Stable" }), "status"));
    statusCell.update(node, ctx(patient({ status: "Deteriorating" }), "status"));

    const cls = node.querySelector(".cs")?.className ?? "";
    expect(cls).toContain("cs-crit");
    expect(cls).not.toContain("cs-ok");
    expect(node.textContent).toBe("Deteriorating");
  });

  it("keeps the hook class it queries by across recycles", () => {
    statusCell.mount(node, ctx(patient(), "status"));
    for (const [status] of TONES) {
      statusCell.update(node, ctx(patient({ status }), "status"));
      expect(node.querySelector(".cs")).not.toBeNull();
    }
  });

  it("exports the status as its word", () => {
    expect(statusCell.toExport(ctx(patient({ status: "Needs review" }), "status"))).toEqual({
      kind: "value",
      value: "Needs review",
    });
  });
});

describe("the problem list", () => {
  const withProblems = (problems: readonly string[]) =>
    ctx(patient({ problems }), "problems");

  it("shows the first two conditions", () => {
    problemsCell.mount(node, withProblems(["Depression", "Anxiety"]));
    problemsCell.update(node, withProblems(["Depression", "Anxiety"]));
    expect([...node.querySelectorAll(".a-tag")].map((t) => t.textContent)).toEqual([
      "Depression",
      "Anxiety",
    ]);
  });

  it("counts the overflow rather than trailing off", () => {
    const list = ["Depression", "Anxiety", "Asthma", "COPD", "Insomnia"];
    problemsCell.mount(node, withProblems(list));
    problemsCell.update(node, withProblems(list));
    // "+3" says how much is missing. "…" says only that something is.
    const tags = [...node.querySelectorAll(".a-tag")].map((t) => t.textContent);
    expect(tags).toEqual(["Depression", "Anxiety", "+3"]);
    expect(node.querySelector(".a-tag.plain")?.getAttribute("title")).toBe(
      "Asthma, COPD, Insomnia",
    );
  });

  it.each([[0], [1], [2]])("shows no overflow marker for %i problems", (n) => {
    const list = ["A", "B"].slice(0, n);
    problemsCell.mount(node, withProblems(list));
    problemsCell.update(node, withProblems(list));
    expect(node.querySelector(".a-tag.plain")).toBeNull();
    expect(node.querySelectorAll(".a-tag")).toHaveLength(n);
  });

  it("drops stale chips when recycled onto a shorter list", () => {
    problemsCell.mount(node, withProblems(["A", "B", "C", "D"]));
    problemsCell.update(node, withProblems(["A", "B", "C", "D"]));
    problemsCell.update(node, withProblems(["Z"]));

    expect([...node.querySelectorAll(".a-tag")].map((t) => t.textContent)).toEqual(["Z"]);
    expect(node.textContent).not.toContain("+");
  });

  it("empties cleanly when recycled onto a patient with no problems", () => {
    problemsCell.mount(node, withProblems(["A", "B", "C"]));
    problemsCell.update(node, withProblems(["A", "B", "C"]));
    problemsCell.update(node, withProblems([]));
    expect(node.querySelectorAll(".a-tag")).toHaveLength(0);
  });

  it("says so out loud when there is nothing recorded", () => {
    // An empty announcement would be indistinguishable from a broken cell.
    expect(problemsCell.read(withProblems([]))).toBe("no problems recorded");
    expect(problemsCell.read(withProblems(["A", "B"]))).toBe("A, B");
  });

  it("exports the WHOLE list, not the two that fitted", () => {
    const list = ["Depression", "Anxiety", "Asthma", "COPD"];
    expect(problemsCell.toExport(withProblems(list))).toEqual({
      kind: "value",
      value: "Depression; Anxiety; Asthma; COPD",
    });
  });
});

describe("the result cell", () => {
  const withK = (potassium: Patient["potassium"]) =>
    ctx(patient({ potassium }), "potassium");

  const ABSENCES: ReadonlyArray<readonly [Absent, string]> = [
    [{ reason: "not-ordered" }, "Not ordered"],
    [{ reason: "not-resulted", orderedAt: "08:15" }, "Ordered 08:15, not yet resulted"],
    [{ reason: "not-measured" }, "Not measured"],
    [{ reason: "not-applicable", because: "on dialysis" }, "Not applicable — on dialysis"],
    [{ reason: "declined", by: "patient" }, "Declined by patient"],
    [{ reason: "specimen-problem", detail: "haemolysed" }, "Specimen problem — haemolysed"],
    [{ reason: "withheld", policy: "42 CFR Part 2" }, "Withheld — 42 CFR Part 2"],
    [{ reason: "source-unreachable", source: "Northside" }, "Northside could not be reached"],
  ];

  it("renders a measurement with its unit", () => {
    resultCell.mount(node, withK({ value: 4.1, unit: "mmol/L" }));
    resultCell.update(node, withK({ value: 4.1, unit: "mmol/L" }));
    expect(node.textContent).toBe("4.1 mmol/L");
    expect(node.querySelector(".res-v")?.className).toContain("num");
  });

  it.each(ABSENCES)("renders the reason for %o rather than a blank", (absent, sentence) => {
    resultCell.mount(node, withK(absent));
    resultCell.update(node, withK(absent));
    // A blank is indistinguishable from a bug, from zero, and from a test
    // nobody ordered. Each is a different clinical situation.
    expect(node.textContent).toBe(sentence);
    expect(node.querySelector(".res-v")?.className).toContain("cs-none");
  });

  it("keeps its hook class when recycled between measured and absent", () => {
    // THE REGRESSION. `className` was assigned wholesale, dropping `.res-v`,
    // so the next update found no node and the cell rendered empty.
    resultCell.mount(node, withK({ value: 4.1, unit: "mmol/L" }));
    resultCell.update(node, withK({ value: 4.1, unit: "mmol/L" }));

    const sequence: Patient["potassium"][] = [
      { reason: "not-ordered" },
      { value: 5.8, unit: "mmol/L" },
      { reason: "not-applicable", because: "on dialysis" },
      { reason: "declined", by: "clinician" },
      { value: 3.2, unit: "mmol/L" },
    ];
    for (const k of sequence) {
      resultCell.update(node, withK(k));
      expect(node.querySelector(".res-v"), `hook lost after ${JSON.stringify(k)}`).not.toBeNull();
      expect(node.textContent).not.toBe("");
    }
    expect(node.textContent).toBe("3.2 mmol/L");
  });

  it("refuses to order a measurement against a reason there is none", () => {
    const measured = patient({ potassium: { value: 4.1, unit: "mmol/L" } });
    const absent = patient({ potassium: { reason: "not-ordered" } });
    // Sorting a worklist is triage. Inventing an order here would rank a
    // patient by a fiction.
    expect(resultCell.compare(measured, absent)).toBe("incomparable");
    expect(resultCell.compare(absent, measured)).toBe("incomparable");
    expect(resultCell.compare(absent, absent)).toBe(0);
    expect(
      resultCell.compare(measured, patient({ potassium: { value: 5.0, unit: "mmol/L" } })),
    ).toBeLessThan(0);
  });

  it("exports a number as a number and an absence as its sentence", () => {
    // A number that exports as text lands in a spreadsheet as text and will
    // not sum; a reason that exports as a blank loses the reason.
    expect(resultCell.toExport(withK({ value: 4.1, unit: "mmol/L" }))).toEqual({
      kind: "value",
      value: 4.1,
    });
    expect(resultCell.toExport(withK({ reason: "not-measured" }))).toEqual({
      kind: "value",
      value: "Not measured",
    });
  });

  it("prints the unit, which the export column header carries instead", () => {
    expect(resultCell.toPrint(withK({ value: 4.1, unit: "mmol/L" }))).toEqual({
      kind: "value",
      value: "4.1 mmol/L",
    });
  });

  it("announces an absence as an absence", () => {
    expect(resultCell.read(withK({ reason: "not-ordered" }))).toBe("no result: Not ordered");
    expect(resultCell.read(withK({ value: 4.1, unit: "mmol/L" }))).toBe("4.1 mmol/L");
  });
});

describe("every cell", () => {
  const ALL = { identityCell, statusCell, problemsCell, resultCell };

  it.each(Object.entries(ALL))("%s survives update before mount is re-run", (_name, cell) => {
    cell.mount(node, ctx(patient()));
    expect(() => cell.update(node, ctx(patient()))).not.toThrow();
    expect(() => cell.update(node, ctx(patient({ id: "p9" })))).not.toThrow();
  });

  it.each(Object.entries(ALL))("%s reports a growable intrinsic width", (_name, cell) => {
    const m = cell.measure(ctx(patient()));
    expect(m.intrinsic).toBeGreaterThan(0);
    expect(typeof m.growable).toBe("boolean");
  });

  it.each(Object.entries(ALL))("%s never announces an empty string", (_name, cell) => {
    expect(cell.read(ctx(patient())).length).toBeGreaterThan(0);
  });

  it.each(Object.entries(ALL))("%s puts hostile text through no parser", (_name, cell) => {
    // Patient-supplied text must never reach a parser. The renderer forbids
    // this one layer down; a cell reaching around it is the same defect.
    const hostile = '<img src=x onerror="alert(1)">';
    cell.mount(node, ctx(patient({ name: hostile, problems: [hostile] })));
    cell.update(node, ctx(patient({ name: hostile, problems: [hostile] })));

    // No element was built from it. Serialising the tree re-escapes the text,
    // so `onerror` is VISIBLE in innerHTML and inert — asserting on its
    // absence would fail against correct code. The element is the question.
    expect(node.querySelector("img")).toBeNull();
    expect(node.getElementsByTagName("*")).not.toContain(
      expect.objectContaining({ tagName: "IMG" }),
    );
    // And it survives as literal text, escaped, which is what textContent does.
    if (node.innerHTML.includes("alert(1)")) {
      expect(node.innerHTML).toContain("&lt;img");
    }
  });
});
