/**
 * A `Bundle`-driven data source.
 *
 * This package is the reason `Coverage.total` is `number | "unknown"` and the
 * reason cursor paging is the default. Investigating FHIR properly did not add
 * a feature — it *removed* a claim, and this file is where that shows up in
 * code:
 *
 *   - paging is opaque: the source carries `link.next` verbatim and never
 *     constructs a paging URL, because the specification forbids it;
 *   - `Bundle.total` is optional, so `total` is often `"unknown"`, and an
 *     *estimate* is reported as unknown rather than as a count;
 *   - `_include` is applied AFTER paging, so a page of 20 patients can return
 *     140 entries — anything mapping `entry.length` to a row count is wrong;
 *   - `_count` is capped, so the page size is negotiated rather than chosen;
 *   - `_sort` support is server-dependent and silently ignored by some servers.
 *
 * It performs no network I/O (ADR 0001): it calls a client the application
 * built and authorised.
 */
import {
  gridError,
  sanitiseError,
  type GridDataSource,
  type GridError,
  type GridPage,
  type GridQuery,
  type SortSpec,
  type SourceCapabilities,
} from "@oxygenui-design/grid-core";
import type { Absent, CoverageSource } from "@oxygenui-design/grid-healthcare";
import { compileFilter, expandParams, type SearchParamMap } from "./compile.js";
import type { Bundle, BundleEntry, FhirClient, ServerCapability } from "./types.js";

export interface FhirSourceOptions<TRow> {
  readonly client: FhirClient;
  readonly resourceType: string;
  /** Fixed search parameters, e.g. `{ "_has:Encounter:patient:status": "in-progress" }`. */
  readonly search?: Readonly<Record<string, string>>;
  /** `_include` / `_revinclude`. Note what these do to entry counts, above. */
  readonly include?: readonly string[];
  /** Column key → FHIR search parameter. A column with no mapping cannot be filtered on. */
  readonly searchParams?: SearchParamMap;
  /** Column key → `_sort` token. A column with no mapping cannot be sorted server-side. */
  readonly sortParams?: SearchParamMap;
  /** What the server told us it can do, from its CapabilityStatement. */
  readonly capability?: ServerCapability;
  /** Maps a matched resource to a row. Return `undefined` to report it unmappable. */
  readonly toRow: (resource: NonNullable<BundleEntry["resource"]>) => TRow | undefined;
  readonly onError?: (error: GridError) => void;
}

export interface FhirPageMeta {
  /** Entries the adapter could not map, by resource type — ADR 0011's obligation on adapters. */
  readonly unmapped: Readonly<Record<string, number>>;
  /** Entries present because of `_include`, which are not rows. */
  readonly included: number;
  readonly sources: readonly CoverageSource[];
}

const linkOf = (bundle: Bundle, relation: string): string | null =>
  bundle.link?.find((l) => l.relation === relation)?.url ?? null;

/**
 * Partitions a bundle into rows, includes and unmappable entries.
 *
 * `search.mode` is the reliable discriminator: `"match"` entries are results,
 * `"include"` entries are context. When a server omits `search.mode`, an entry
 * of a different `resourceType` is treated as an include — which is a guess,
 * and is reported as such through `unmapped` rather than silently dropped.
 */
export function partitionBundle<TRow>(
  bundle: Bundle,
  resourceType: string,
  toRow: FhirSourceOptions<TRow>["toRow"],
): { rows: TRow[]; meta: FhirPageMeta } {
  const rows: TRow[] = [];
  const unmapped: Record<string, number> = {};
  let included = 0;

  for (const entry of bundle.entry ?? []) {
    const resource = entry.resource;
    if (!resource) {
      unmapped["(no resource)"] = (unmapped["(no resource)"] ?? 0) + 1;
      continue;
    }
    const mode = entry.search?.mode;
    const isMatch = mode === "match" || (mode === undefined && resource.resourceType === resourceType);

    if (!isMatch) {
      included++;
      continue;
    }
    const row = toRow(resource);
    if (row === undefined) {
      const key = resource.resourceType ?? "(unknown)";
      unmapped[key] = (unmapped[key] ?? 0) + 1;
      continue;
    }
    rows.push(row);
  }

  return { rows, meta: { unmapped, included, sources: [] } };
}

/**
 * The total, honestly.
 *
 * An *estimate* is reported as `"unknown"`, not as a number. An estimate
 * rendered where a reader expects a count is a false count, and they have no
 * way to tell.
 */
export function totalFrom(bundle: Bundle, capability?: ServerCapability): number | "unknown" {
  if (capability?.totalIs === "estimate" || capability?.totalIs === "none") return "unknown";
  return typeof bundle.total === "number" ? bundle.total : "unknown";
}

export function capabilitiesOf(capability?: ServerCapability): SourceCapabilities {
  return {
    total: capability?.totalIs ?? "none",
    // Azure Health Data Services returns only `next` — no first, last or
    // previous — so forward-only is the safe default, not a degraded case.
    paging: "forward-only",
    ...(capability?.sortableKeys ? { sortableKeys: capability.sortableKeys } : {}),
    ...(capability?.maxPageSize !== undefined ? { maxPageSize: capability.maxPageSize } : {}),
  };
}

/** The absence reason for a source that could not be reached, ready to fold into coverage. */
export const unreachable = (source: string): Absent => ({ reason: "source-unreachable", source });

export function fhirSource<TRow>(options: FhirSourceOptions<TRow>): GridDataSource<TRow> & {
  lastMeta(): FhirPageMeta | null;
} {
  const capabilities = capabilitiesOf(options.capability);
  let meta: FhirPageMeta | null = null;

  const sortToken = (sort: readonly SortSpec[]): string | null => {
    const tokens: string[] = [];
    for (const spec of sort) {
      const param = options.sortParams?.[spec.key];
      if (!param) continue;
      tokens.push(spec.direction === "desc" ? `-${param}` : param);
    }
    return tokens.length > 0 ? tokens.join(",") : null;
  };

  return {
    capabilities,
    lastMeta: () => meta,

    async getRows(query: GridQuery, signal: AbortSignal): Promise<GridPage<TRow>> {
      // Following an opaque cursor: no parameters, no reconstruction.
      if (query.cursor) {
        const bundle = await options.client.request({ kind: "follow", url: query.cursor }, signal);
        return pageFrom(bundle, query.sort);
      }

      const compiled = compileFilter(query.filter, options.searchParams ?? {});
      if (!compiled.ok) {
        // Refused, not approximated. A silently narrowed cohort looks exactly
        // like a correct answer.
        options.onError?.(gridError({ code: "filter-not-compilable", phase: "query" }));
        throw new FilterNotCompilable(compiled.reason);
      }

      const params: Record<string, string> = { ...options.search };
      for (const [key, value] of expandParams(compiled.params)) {
        params[key] = params[key] === undefined ? value : `${params[key]},${value}`;
      }
      for (const include of options.include ?? []) {
        params["_include"] = params["_include"] ? `${params["_include"]},${include}` : include;
      }

      const asked = Math.min(query.pageSize, options.capability?.maxPageSize ?? query.pageSize);
      params["_count"] = String(asked);
      const sort = sortToken(query.sort);
      if (sort) params["_sort"] = sort;

      const bundle = await options.client.request(
        { kind: "search", resourceType: options.resourceType, params },
        signal,
      );
      return pageFrom(bundle, query.sort, asked);
    },
  };

  function pageFrom(bundle: Bundle, sort: readonly SortSpec[], asked?: number): GridPage<TRow> {
    const { rows, meta: partition } = partitionBundle(bundle, options.resourceType, options.toRow);
    meta = partition;

    const unmappedCount = Object.values(partition.unmapped).reduce((a, b) => a + b, 0);
    if (unmappedCount > 0) {
      // ADR 0011 places this obligation on adapters: report what could not be
      // mapped rather than dropping it, because a silent drop is the same lie
      // one layer further down.
      options.onError?.(gridError({ code: "source-unreachable", phase: "query" }));
    }

    return {
      rows,
      nextCursor: linkOf(bundle, "next"),
      total: totalFrom(bundle, options.capability),
      // The server does not report what it sorted by, and several silently
      // ignore an unsupported key. We claim only what the capability statement
      // said it would honour; grid-core compares and reports the difference.
      appliedSort: options.capability?.sortableKeys
        ? sort.filter((s) => {
            const param = options.sortParams?.[s.key];
            return param !== undefined && options.capability?.sortableKeys?.includes(param) === true;
          })
        : sort,
      ...(asked !== undefined ? { appliedPageSize: asked } : {}),
    };
  }
}

/** Thrown when a filter cannot be compiled. Carries a reason, never a value. */
export class FilterNotCompilable extends Error {
  readonly code = "filter-not-compilable" as const;
  constructor(reason: string) {
    super(reason);
    this.name = "FilterNotCompilable";
  }
}

/** Turns any thrown transport failure into a PHI-safe grid error. */
export const toGridError = (thrown: unknown): GridError =>
  sanitiseError(thrown, { code: "source-unreachable", phase: "query" });
