import { describe, expect, it } from "vitest";
import type { Measured } from "./aggregate.js";
import { countLeaves, flattenTree, groupRows, toggleExpanded, type GroupEntry } from "./group.js";

interface P {
  readonly id: string;
  readonly ward: string;
  readonly team: string;
  readonly dose: Measured | null;
}

const rows: P[] = [
  { id: "1", ward: "A", team: "Red", dose: { value: 5, unit: "mg" } },
  { id: "2", ward: "A", team: "Red", dose: { value: 10, unit: "mg" } },
  { id: "3", ward: "A", team: "Blue", dose: { value: 2, unit: "mL" } },
  { id: "4", ward: "B", team: "Red", dose: null },
];

const rowKey = (r: P) => r.id;
const get = (r: P, key: string) => (r as unknown as Record<string, unknown>)[key];
const shape = (entries: readonly GroupEntry<P>[]) =>
  entries.map((e) =>
    e.kind === "group" ? `${"  ".repeat(e.depth)}[${e.label} ${String(e.count)}]` : e.kind === "row" ? `${"  ".repeat(e.depth)}${e.id}` : `${"  ".repeat(e.depth)}<unresolved>`,
  );

describe("grouping", () => {
  it("returns plain rows when nothing is grouped", () => {
    expect(shape(groupRows(rows, { by: [], rowKey, get, expanded: new Set() }))).toEqual(["1", "2", "3", "4"]);
  });

  it("costs one entry for a collapsed group, however large", () => {
    // This is what makes grouping usable at the sizes this grid targets.
    const out = groupRows(rows, { by: ["ward"], rowKey, get, expanded: new Set() });
    expect(shape(out)).toEqual(["[A 3]", "[B 1]"]);
    expect(countLeaves(out)).toBe(0);
  });

  it("shows children only for expanded branches", () => {
    const out = groupRows(rows, { by: ["ward"], rowKey, get, expanded: new Set(["ward=A"]) });
    expect(shape(out)).toEqual(["[A 3]", "  1", "  2", "  3", "[B 1]"]);
  });

  it("nests, with stable paths that survive a re-render", () => {
    const expanded = new Set(["ward=A", "ward=A/team=Red"]);
    const out = groupRows(rows, { by: ["ward", "team"], rowKey, get, expanded });
    expect(shape(out)).toEqual(["[A 3]", "  [Red 2]", "    1", "    2", "  [Blue 1]", "[B 1]"]);
  });

  it("keeps groups in the order the sort put them in", () => {
    // Not alphabetical, and not arbitrary: a worklist sorted by urgency must
    // not have its groups silently reordered by name.
    const reversed = [...rows].reverse();
    const out = groupRows(reversed, { by: ["ward"], rowKey, get, expanded: new Set() });
    expect(shape(out)).toEqual(["[B 1]", "[A 3]"]);
  });

  it("labels an absent grouping value rather than dropping the rows", () => {
    const withGap: P[] = [{ id: "9", ward: "", team: "Red", dose: null }];
    const out = groupRows(withGap, { by: ["ward"], rowKey, get, expanded: new Set() });
    expect(shape(out)).toEqual(["[(none) 1]"]);
  });
});

describe("group aggregates", () => {
  const aggregates = [{ columnKey: "dose", kind: "sum" as const, value: (r: P) => r.dose }];

  it("aggregates within a group", () => {
    const out = groupRows(rows, { by: ["ward", "team"], rowKey, get, expanded: new Set(["ward=A"]), aggregates });
    const red = out.find((e) => e.kind === "group" && e.label === "Red");
    expect(red?.kind === "group" && red.aggregates["dose"]).toMatchObject({ value: 15, unit: "mg" });
  });

  it("refuses at a group whose rows carry incompatible units", () => {
    // Ward A holds 5 mg, 10 mg and 2 mL. There is no total.
    const out = groupRows(rows, { by: ["ward"], rowKey, get, expanded: new Set(), aggregates });
    const a = out.find((e) => e.kind === "group" && e.label === "A");
    expect(a?.kind === "group" && a.aggregates["dose"]).toMatchObject({
      kind: "refused",
      reason: "cannot combine mg and mL",
    });
  });

  it("reports rows with no value rather than averaging over fewer", () => {
    const out = groupRows(rows, { by: ["ward"], rowKey, get, expanded: new Set(), aggregates });
    const b = out.find((e) => e.kind === "group" && e.label === "B");
    expect(b?.kind === "group" && b.aggregates["dose"]).toMatchObject({ kind: "empty" });
  });
});

describe("tree data", () => {
  interface Goal {
    readonly id: string;
    readonly children?: readonly Goal[] | "unresolved";
  }
  const tree: Goal[] = [
    { id: "g1", children: [{ id: "g1a" }, { id: "g1b" }] },
    { id: "g2", children: "unresolved" },
    { id: "g3", children: [] },
  ];
  const opts = (expanded: string[]) => ({
    rowKey: (g: Goal) => g.id,
    childrenOf: (g: Goal) => g.children ?? [],
    expanded: new Set(expanded),
  });

  it("expands only what is open", () => {
    expect(shape(flattenTree(tree, opts(["g1"])) as GroupEntry<P>[])).toEqual(["g1", "  g1a", "  g1b", "g2", "g3"]);
  });

  it("renders an unfetched branch as unresolved, NOT as empty", () => {
    // A node with unknown children is not a node with no children. Conflating
    // them tells the reader a plan has no goals when the request timed out.
    const out = flattenTree(tree, opts(["g2"]));
    expect(shape(out as GroupEntry<P>[])).toEqual(["g1", "g2", "  <unresolved>", "g3"]);
  });

  it("renders a genuinely empty branch as nothing, which is a different fact", () => {
    const out = flattenTree(tree, opts(["g3"]));
    expect(out.some((e) => e.kind === "unresolved")).toBe(false);
    expect(shape(out as GroupEntry<P>[])).toEqual(["g1", "g2", "g3"]);
  });
});

describe("expansion state", () => {
  it("toggles without mutating the set it was given", () => {
    const a = new Set(["x"]);
    const b = toggleExpanded(a, "y");
    expect([...a]).toEqual(["x"]);
    expect([...b].sort()).toEqual(["x", "y"]);
    expect([...toggleExpanded(b, "x")]).toEqual(["y"]);
  });
});
