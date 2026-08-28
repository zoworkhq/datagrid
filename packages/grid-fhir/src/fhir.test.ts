import { describe, expect, it, vi } from "vitest";
import { and, not, or, initialState, queryFrom, type GridError } from "@oxygenui-design/grid-core";
import { compileFilter, expandParams } from "./compile.js";
import {
  FilterNotCompilable,
  capabilitiesOf,
  fhirSource,
  partitionBundle,
  totalFrom,
} from "./source.js";
import type { Bundle, FhirClient } from "./types.js";

const MAP = { name: "name", birthDate: "birthdate", ward: "location", risk: "risk-score" };

describe("compiling a filter, or refusing", () => {
  it("compiles a flat AND of comparisons", () => {
    const r = compileFilter(
      and(
        { kind: "text", key: "name", op: "contains", value: "okafor" },
        { kind: "enum", key: "ward", op: "in", value: ["A", "B"] },
      ),
      MAP,
    );
    expect(r).toEqual({ ok: true, params: { "name:contains": "okafor", location: "A,B" } });
  });

  it("REFUSES an OR across fields, and says why", () => {
    // "diabetic OR hypertensive" quietly dropped to "diabetic" returns a real,
    // plausible, wrong list of patients and nobody can tell.
    const r = compileFilter(
      or(
        { kind: "text", key: "name", op: "eq", value: "a" },
        { kind: "text", key: "ward", op: "eq", value: "b" },
      ),
      MAP,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("cannot express OR across different fields");
  });

  it("REFUSES a NOT of a group", () => {
    const r = compileFilter(not({ kind: "text", key: "name", op: "eq", value: "a" }), MAP);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("cannot express NOT of a group");
  });

  it("refuses a nested OR inside an AND rather than dropping it", () => {
    const r = compileFilter(
      and(
        { kind: "text", key: "name", op: "eq", value: "a" },
        or(
          { kind: "text", key: "ward", op: "eq", value: "A" },
          { kind: "text", key: "ward", op: "eq", value: "B" },
        ),
      ),
      MAP,
    );
    expect(r.ok).toBe(false);
  });

  it("names the column when it has no search parameter", () => {
    const r = compileFilter({ kind: "text", key: "nickname", op: "eq", value: "x" }, MAP);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('no FHIR search parameter is mapped for the column "nickname"');
  });

  it("uses the one OR FHIR does have — a value list within one parameter", () => {
    const r = compileFilter({ kind: "enum", key: "ward", op: "in", value: ["A", "B", "C"] }, MAP);
    expect(r).toMatchObject({ ok: true, params: { location: "A,B,C" } });
  });

  it("maps ordered comparisons to FHIR prefixes", () => {
    expect(compileFilter({ kind: "date", key: "birthDate", op: "lt", value: "1990-01-01" }, MAP)).toMatchObject(
      { params: { birthdate: "lt1990-01-01" } },
    );
    expect(compileFilter({ kind: "number", key: "risk", op: "gte", value: 7 }, MAP)).toMatchObject({
      params: { "risk-score": "ge7" },
    });
  });

  it("expresses a range as two prefixed values on one parameter", () => {
    const r = compileFilter({ kind: "date", key: "birthDate", op: "between", value: ["1980", "1990"] }, MAP);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(expandParams(r.params)).toEqual([
        ["birthdate", "ge1980"],
        ["birthdate", "le1990"],
      ]);
    }
  });

  it("maps empty and not-empty to the :missing modifier", () => {
    expect(compileFilter({ kind: "text", key: "name", op: "empty", value: "" }, MAP)).toMatchObject({
      params: { "name:missing": "true" },
    });
  });

  it("compiles a null filter to nothing", () => {
    expect(compileFilter(null, MAP)).toEqual({ ok: true, params: {} });
  });
});

// ── the bundle ──────────────────────────────────────────────────────────────

const bundle = (over: Partial<Bundle> = {}): Bundle => ({
  resourceType: "Bundle",
  entry: [
    { search: { mode: "match" }, resource: { resourceType: "Patient", id: "p1" } },
    { search: { mode: "match" }, resource: { resourceType: "Patient", id: "p2" } },
    { search: { mode: "include" }, resource: { resourceType: "Practitioner", id: "gp1" } },
  ],
  link: [{ relation: "next", url: "https://example.org/fhir?_getpages=abc&_page=2" }],
  ...over,
});

const toRow = (r: { id?: string }) => (r.id ? { id: r.id } : undefined);

describe("reading a bundle", () => {
  it("counts rows from matches, not from entries", () => {
    // _include is applied AFTER paging, so a page of 20 patients can return
    // 140 entries. Anything mapping entry.length to a row count is wrong.
    const { rows, meta } = partitionBundle(bundle(), "Patient", toRow);
    expect(rows).toHaveLength(2);
    expect(meta.included).toBe(1);
  });

  it("reports entries it could not map, by resource type", () => {
    // ADR 0011's obligation on adapters: a silent drop is the same lie one
    // layer further down.
    const b = bundle({
      entry: [
        { search: { mode: "match" }, resource: { resourceType: "Patient", id: "p1" } },
        { search: { mode: "match" }, resource: { resourceType: "Patient" } }, // no id
        { search: { mode: "match" } }, // no resource at all
      ],
    });
    const { rows, meta } = partitionBundle(b, "Patient", toRow);
    expect(rows).toHaveLength(1);
    expect(meta.unmapped).toEqual({ Patient: 1, "(no resource)": 1 });
  });

  it("falls back to resourceType when the server omits search.mode", () => {
    const b = bundle({
      entry: [
        { resource: { resourceType: "Patient", id: "p1" } },
        { resource: { resourceType: "Practitioner", id: "gp1" } },
      ],
    });
    const { rows, meta } = partitionBundle(b, "Patient", toRow);
    expect(rows).toHaveLength(1);
    expect(meta.included).toBe(1);
  });
});

describe("the total, honestly", () => {
  it("uses Bundle.total when the server reports an exact one", () => {
    expect(totalFrom(bundle({ total: 1284 }), { totalIs: "exact" })).toBe(1284);
  });

  it('reports "unknown" when Bundle.total is absent', () => {
    expect(totalFrom(bundle())).toBe("unknown");
  });

  it('reports an ESTIMATE as "unknown", never as a count', () => {
    // An estimate rendered where a reader expects a count is a false count,
    // and they have no way to tell.
    expect(totalFrom(bundle({ total: 1200 }), { totalIs: "estimate" })).toBe("unknown");
  });

  it("declares forward-only paging, because Azure returns only next", () => {
    expect(capabilitiesOf({ totalIs: "none" })).toMatchObject({ paging: "forward-only", total: "none" });
  });
});

// ── the source ──────────────────────────────────────────────────────────────

function clientOf(bundles: Bundle[], calls: unknown[] = []): FhirClient {
  let i = 0;
  return {
    request: async (input) => {
      calls.push(input);
      return bundles[Math.min(i++, bundles.length - 1)] as Bundle;
    },
  };
}

const query = (over: Partial<Parameters<typeof queryFrom>[0]> = {}) =>
  queryFrom(initialState({ pageSize: 50, ...over }), []);

describe("the data source", () => {
  it("performs no network I/O — it calls the client it was given", async () => {
    const calls: unknown[] = [];
    const source = fhirSource({
      client: clientOf([bundle({ total: 2 })], calls),
      resourceType: "Patient",
      toRow,
      capability: { totalIs: "exact" },
    });
    const page = await source.getRows(query(), new AbortController().signal);
    expect(page.rows).toHaveLength(2);
    expect(page.total).toBe(2);
    expect(calls[0]).toMatchObject({ kind: "search", resourceType: "Patient" });
  });

  it("carries link.next verbatim and never constructs a paging URL", async () => {
    // The specification is explicit that a client must not build its own.
    const calls: unknown[] = [];
    const source = fhirSource({ client: clientOf([bundle()], calls), resourceType: "Patient", toRow });
    const first = await source.getRows(query(), new AbortController().signal);
    expect(first.nextCursor).toBe("https://example.org/fhir?_getpages=abc&_page=2");

    await source.getRows({ ...query(), cursor: first.nextCursor }, new AbortController().signal);
    expect(calls[1]).toEqual({ kind: "follow", url: first.nextCursor });
  });

  it("negotiates the page size down to the server's cap and reports it", async () => {
    // _count is commonly capped at 100. The page size is negotiated, not chosen.
    const calls: { params?: Record<string, string> }[] = [];
    const source = fhirSource({
      client: clientOf([bundle()], calls),
      resourceType: "Patient",
      toRow,
      capability: { maxPageSize: 20 },
    });
    const page = await source.getRows(query(), new AbortController().signal);
    expect(calls[0]?.params?.["_count"]).toBe("20");
    expect(page.appliedPageSize).toBe(20);
  });

  it("claims only the sorts the server said it honours", async () => {
    // Several servers silently ignore an unsupported _sort key, and the grid
    // would otherwise show an unsorted list under a sorted header.
    const source = fhirSource({
      client: clientOf([bundle()]),
      resourceType: "Patient",
      toRow,
      sortParams: { name: "family", risk: "risk-score" },
      capability: { sortableKeys: ["family"] },
    });
    const page = await source.getRows(
      { ...query(), sort: [{ key: "name", direction: "asc" }, { key: "risk", direction: "desc" }] },
      new AbortController().signal,
    );
    expect(page.appliedSort).toEqual([{ key: "name", direction: "asc" }]);
  });

  it("throws a named refusal for an uncompilable filter, and emits a grid error", async () => {
    const errors: GridError[] = [];
    const source = fhirSource({
      client: clientOf([bundle()]),
      resourceType: "Patient",
      toRow,
      searchParams: MAP,
      onError: (e) => errors.push(e),
    });
    const filter = or(
      { kind: "text", key: "name", op: "eq", value: "a" },
      { kind: "text", key: "ward", op: "eq", value: "b" },
    );
    await expect(
      source.getRows({ ...query(), filter }, new AbortController().signal),
    ).rejects.toBeInstanceOf(FilterNotCompilable);
    expect(errors.map((e) => e.code)).toEqual(["filter-not-compilable"]);
  });

  it("reports unmapped entries without carrying what they contained", async () => {
    const errors: GridError[] = [];
    const source = fhirSource({
      client: clientOf([
        bundle({
          entry: [{ search: { mode: "match" }, resource: { resourceType: "Patient", name: "Aurelia" } }],
        }),
      ]),
      resourceType: "Patient",
      toRow,
      onError: (e) => errors.push(e),
    });
    await source.getRows(query(), new AbortController().signal);
    expect(source.lastMeta()?.unmapped).toEqual({ Patient: 1 });
    expect(JSON.stringify(errors)).not.toContain("Aurelia");
  });

  it("passes _include through and still counts rows correctly", async () => {
    const calls: { params?: Record<string, string> }[] = [];
    const source = fhirSource({
      client: clientOf([bundle()], calls),
      resourceType: "Patient",
      toRow,
      include: ["Patient:general-practitioner"],
    });
    const page = await source.getRows(query(), new AbortController().signal);
    expect(calls[0]?.params?.["_include"]).toBe("Patient:general-practitioner");
    expect(page.rows).toHaveLength(2); // not 3
  });

  it("does not swallow an aborted request", async () => {
    const client: FhirClient = {
      request: vi.fn(async () => {
        throw new Error("aborted");
      }),
    };
    const source = fhirSource({ client, resourceType: "Patient", toRow });
    await expect(source.getRows(query(), new AbortController().signal)).rejects.toThrow();
  });
});
