/**
 * `fhirSource` through `createServerRowModel`, which is how it is used.
 *
 * The review's point, and it was right: both halves had isolated tests and the
 * two defects below lived exactly in the seam between them, where nothing
 * looked.
 *
 *   · `ServerCapability.sortableKeys` holds FHIR sort PARAMETERS; the core's
 *     `SourceCapabilities.sortableKeys` holds COLUMN keys. Both are
 *     `readonly string[]` and one was handed over as the other, so a correctly
 *     configured server had its sorts pre-refused by the model.
 *   · `FilterNotCompilable` was thrown, caught by the model, and reported as
 *     `source-threw` — indistinguishable from a network failure, which invites
 *     retry logic against a query that can never work.
 */
import { describe, expect, it } from "vitest";
import { fhirSource, capabilitiesOf } from "./source.js";
import type { Bundle, FhirClient } from "./types.js";
import { createServerRowModel, initialState, type GridState } from "@oxygenui-design/grid-core";

interface Row { readonly id: string; readonly name: string }

const settle = () => new Promise((r) => setTimeout(r, 0));

const bundle = (n: number): Bundle =>
  ({
    resourceType: "Bundle",
    type: "searchset",
    entry: Array.from({ length: n }, (_, i) => ({
      resource: { resourceType: "Patient", id: `p${i}`, name: [{ text: `Patient ${i}` }] },
      search: { mode: "match" },
    })),
  }) as unknown as Bundle;

const client = (): FhirClient & { readonly sent: Record<string, string>[] } => {
  const sent: Record<string, string>[] = [];
  return {
    sent,
    async request(input) {
      if (input.kind === "search") sent.push(input.params);
      return bundle(3);
    },
  };
};

const source = (over: Parameters<typeof fhirSource<Row>>[0] extends infer T ? Partial<T> : never = {}) => {
  const c = client();
  return {
    client: c,
    source: fhirSource<Row>({
      client: c,
      resourceType: "Patient",
      sortParams: { name: "family", born: "birthdate" },
      capability: { sortableKeys: ["family", "birthdate"], totalIs: "none" },
      toRow: (r) => {
        const p = r as { id?: string; name?: { text?: string }[] };
        return p.id && p.name?.[0]?.text ? { id: p.id, name: p.name[0].text } : undefined;
      },
      ...over,
    }),
  };
};

const sortedBy = (key: string): GridState => ({
  ...initialState(),
  sort: [{ key, direction: "asc" }],
});

describe("capabilities cross the boundary in the core's vocabulary", () => {
  it("translates server sort tokens into column keys", () => {
    const caps = capabilitiesOf({ sortableKeys: ["family", "birthdate"], totalIs: "none" }, { name: "family" });
    expect(caps.sortableKeys).toEqual(["name"]);
  });

  it("drops a server parameter no column maps to, rather than exposing the token", () => {
    // Not an error — just a sort nobody can ask for.
    const caps = capabilitiesOf({ sortableKeys: ["family", "_lastUpdated"], totalIs: "none" }, { name: "family" });
    expect(caps.sortableKeys).toEqual(["name"]);
  });

  it("says nothing when the server said nothing, which is not the same as 'none'", () => {
    expect(capabilitiesOf({ totalIs: "none" }, { name: "family" }).sortableKeys).toBeUndefined();
  });

  it("exposes the translated list on the source itself", () => {
    expect(source().source.capabilities?.sortableKeys).toEqual(["name", "born"]);
  });
});

describe("a sort the server supports is actually sent", () => {
  it("does not pre-refuse a column whose parameter the server declared", async () => {
    const { client: c, source: s } = source();
    const model = createServerRowModel<Row>({ dataSource: s, rowKey: (r) => r.id });
    model.setState(sortedBy("name"));
    await settle();

    const codes = model.result().errors.map((e) => e.code);
    expect(codes, "the model refused a sort the server can do").not.toContain("sort-not-honoured");
    expect(c.sent.at(-1)?.["_sort"], "no _sort reached the server").toBe("family");
    model.destroy();
  });

  it("still refuses a column the server did NOT declare", async () => {
    const { client: c, source: s } = source();
    const model = createServerRowModel<Row>({ dataSource: s, rowKey: (r) => r.id });
    model.setState(sortedBy("potassium"));
    await settle();

    expect(model.result().errors.map((e) => e.code)).toContain("sort-not-honoured");
    expect(c.sent.at(-1)?.["_sort"]).toBeUndefined();
    model.destroy();
  });

  it("still serves the rows either way", async () => {
    const { source: s } = source();
    const model = createServerRowModel<Row>({ dataSource: s, rowKey: (r) => r.id });
    model.setState(sortedBy("potassium"));
    await settle();
    expect(model.result().rows).toHaveLength(3);
    model.destroy();
  });
});

describe("a refusal keeps its name across the model boundary", () => {
  const uncompilable: GridState = {
    ...initialState(),
    // No `searchParams` mapping for this column, so the filter cannot compile.
    filter: { kind: "number", key: "potassium", op: "gt", value: 5 },
  };

  it("reports filter-not-compilable, not source-threw", async () => {
    const { source: s } = source();
    const model = createServerRowModel<Row>({ dataSource: s, rowKey: (r) => r.id });
    model.setState(uncompilable);
    await settle();

    const codes = model.result().errors.map((e) => e.code);
    expect(codes).toContain("filter-not-compilable");
    expect(codes, "a query that can never work looked like a network failure").not.toContain("source-threw");
    model.destroy();
  });

  it("carries the code and nothing else — no message, no column value", async () => {
    const { source: s } = source();
    const model = createServerRowModel<Row>({ dataSource: s, rowKey: (r) => r.id });
    model.setState(uncompilable);
    await settle();

    const error = model.result().errors.find((e) => e.code === "filter-not-compilable");
    expect(Object.keys(error ?? {}).sort()).toEqual(["code", "columnKey", "phase", "query", "rowIndex"]);
    expect(JSON.stringify(error)).not.toMatch(/cannot|FHIR|potassium.*5/);
    model.destroy();
  });

  it("still reports source-threw for a failure the source did not name", async () => {
    const broken: FhirClient = {
      async request() {
        throw new Error("ECONNREFUSED 10.0.0.5:443");
      },
    };
    const s = fhirSource<Row>({
      client: broken, resourceType: "Patient", toRow: () => undefined,
    });
    const model = createServerRowModel<Row>({ dataSource: s, rowKey: (r) => r.id });
    model.setState(initialState());
    await settle();

    const codes = model.result().errors.map((e) => e.code);
    expect(codes).toContain("source-threw");
    // And the address does not travel with it.
    expect(JSON.stringify(model.result().errors)).not.toContain("10.0.0.5");
    model.destroy();
  });
});
