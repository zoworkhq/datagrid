import { describe, expect, it } from "vitest";
import { and, or, type ModelProvenance } from "@oxygenui-design/grid-core";
import {
  acceptProposal, aiDerived, compareSourced, compileProposal, describeProvenance,
  exportLabel, isAiDerived, toChips, verified, type Proposal,
} from "./index.js";

const model: ModelProvenance = {
  model: "Sepsis risk", version: "2.1",
  validatedOn: "adult inpatients, 2019–2023", validatedAt: "2024-02-01",
};
const ctx = { columnKeys: ["ward", "risk", "k"] };
const proposal = (over: Partial<Proposal> = {}): Proposal => ({
  id: "p1", prompt: "high risk on ward A", provenance: model, ...over,
});

describe("refusal is the product", () => {
  it("REFUSES a column this grid does not have, by name, and runs nothing", () => {
    const r = compileProposal(
      proposal({ filter: { kind: "text", key: "diagnosis", op: "eq", value: "x" } }),
      ctx,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain('no column called "diagnosis"');
      expect(r.reason).toContain("Nothing was run");
      expect(r.error.code).toBe("filter-not-compilable");
    }
  });

  it("refuses an operator the grid cannot evaluate rather than widening it", () => {
    // Widening to something that happens to run is how a cohort silently
    // becomes the wrong cohort.
    const r = compileProposal(proposal({ filter: { kind: "text", key: "ward", op: "endsWith", value: "e" } }), {
      ...ctx,
      supports: (c) => c.op !== "endsWith",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("cannot evaluate ward endsWith e");
  });

  it("refuses proposed columns that do not exist", () => {
    const r = compileProposal(proposal({ columns: ["ward", "nope"] }), ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("Proposed columns do not exist: nope");
  });

  it("compiles a proposal it can honour", () => {
    const filter = and(
      { kind: "text", key: "ward", op: "eq", value: "A" },
      { kind: "number", key: "risk", op: "gte", value: 7 },
    );
    const r = compileProposal(proposal({ filter }), ctx);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.chips).toEqual(["ward eq A", "risk gte 7"]);
  });
});

describe("a proposal is never applied", () => {
  it("returns an action for the caller to dispatch, and nothing else", () => {
    // Nothing in this package can change grid state. An AI that can mutate a
    // clinical list is an AI that will, at 3 a.m., to somebody who did not ask.
    const r = compileProposal(proposal({ filter: { kind: "text", key: "ward", op: "eq", value: "A" } }), ctx);
    expect(acceptProposal(r)).toEqual({ type: "filter/set", node: { kind: "text", key: "ward", op: "eq", value: "A" } });
  });

  it("returns nothing to dispatch for a refused proposal", () => {
    expect(acceptProposal(compileProposal(proposal({ columns: ["nope"] }), ctx))).toBeNull();
  });

  it("renders the query as chips so it is checkable BEFORE it runs", () => {
    expect(toChips(or(
      { kind: "text", key: "ward", op: "eq", value: "A" },
      { kind: "text", key: "ward", op: "eq", value: "B" },
    ))).toEqual(["any of (ward eq A, ward eq B)"]);
  });
});

describe("provenance is a shape, not a flag", () => {
  it("makes an AI-derived value structurally distinct", () => {
    // Not a boolean somebody can forget to check.
    expect(isAiDerived(verified(7))).toBe(false);
    expect(isAiDerived(aiDerived(7, model, 0.82))).toBe(true);
  });

  it("names the model, its version and the population it was VALIDATED on", () => {
    // Not the population it is being applied to — the distinction the Epic
    // Sepsis Model made expensive.
    expect(describeProvenance(aiDerived(7, model, 0.82)))
      .toBe("Sepsis risk 2.1, validated on adult inpatients, 2019–2023, confidence 82%");
    expect(describeProvenance(verified(7))).toBe("");
  });

  it("refuses to order an AI-derived value against a verified one", () => {
    // Sorting a worklist is triage; ranking a model's guess against a measured
    // fact silently converts model quality into queue discipline.
    const cmp = (a: number, b: number) => a - b;
    expect(compareSourced(aiDerived(9, model), verified(3), cmp)).toBe("incomparable");
    expect(compareSourced(verified(9), verified(3), cmp)).toBe(6);
    expect(compareSourced(aiDerived(9, model), aiDerived(3, model), cmp)).toBe(6);
  });

  it("labels an AI-derived value in an export", () => {
    expect(exportLabel(aiDerived(7, model), String)).toBe("7 (Sepsis risk, AI-derived)");
    expect(exportLabel(verified(7), String)).toBe("7");
  });
});
