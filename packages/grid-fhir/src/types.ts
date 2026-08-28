/**
 * The narrow slice of FHIR this package reads.
 *
 * Deliberately structural rather than importing a full resource model: the
 * source only needs to walk a `Bundle`, and a consumer already using
 * `@oxygenui-design/fhir` types satisfies these shapes without conversion.
 */

export interface BundleLink {
  readonly relation: string;
  /**
   * OPAQUE. The specification is explicit that a client must not construct its
   * own paging URLs, so this is carried and returned verbatim, never parsed.
   */
  readonly url: string;
}

export interface BundleEntry {
  readonly fullUrl?: string;
  readonly resource?: { readonly resourceType?: string; readonly id?: string } & Record<string, unknown>;
  readonly search?: { readonly mode?: "match" | "include" | "outcome" };
}

export interface Bundle {
  readonly resourceType?: "Bundle";
  /** OPTIONAL in the specification. Major servers omit it or estimate it. */
  readonly total?: number;
  readonly link?: readonly BundleLink[];
  readonly entry?: readonly BundleEntry[];
}

/**
 * A client the application already built and authorised.
 *
 * The grid consumes a client; it does not obtain one, does not know a base URL,
 * and does not claim SMART on FHIR support — SMART is an authorisation and
 * launch-context concern belonging to the application (ADR 0001).
 */
export interface FhirClient {
  /**
   * Either a search against a resource type, or a follow of an opaque
   * `link.next` URL. Never both.
   */
  request(
    input:
      | { readonly kind: "search"; readonly resourceType: string; readonly params: Readonly<Record<string, string>> }
      | { readonly kind: "follow"; readonly url: string },
    signal: AbortSignal,
  ): Promise<Bundle>;
}

/** What a server said it can do. Absent means "we do not know", never "no". */
export interface ServerCapability {
  /** Sort parameters the server honours. Absent means unknown, so nothing is refused pre-emptively. */
  readonly sortableKeys?: readonly string[];
  /** `_count` is commonly capped at 100 and at most 1,000. */
  readonly maxPageSize?: number;
  /** Some servers report an estimate. An estimate rendered as a count is a false count. */
  readonly totalIs?: "exact" | "estimate" | "none";
}
