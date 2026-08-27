/**
 * The disclosure policy.
 *
 * The grid renders a policy. It does not decide one and it cannot enforce one:
 * a client-side mask over a value that is already in the payload is theatre,
 * and a client that records its own access is a client that can choose not to.
 * Access control, audit storage and data residency remain the application's.
 */

export type MaskReason = { readonly code: string; readonly label: string; readonly legal?: string };
export type RestrictReason = { readonly code: string; readonly label: string };

export interface DisclosurePolicy {
  /** A withheld column is *stated*, never silently dropped. */
  column(key: string): "visible" | "withheld";
  cell(row: unknown, key: string): "visible" | { readonly masked: MaskReason };
  row(row: unknown): "visible" | { readonly restricted: RestrictReason };
  mayExport(): boolean;
  mayPrint(): boolean;
  mayCopy(): boolean;
}

/** view · expand · inspect · export · print · copy. The server records these; we only emit them. */
export type DisclosureKind = "view" | "expand" | "inspect" | "export" | "print" | "copy";

/** Coordinates only — the same shape as `GridError`, for the same reason. */
export interface DisclosureEvent {
  readonly kind: DisclosureKind;
  readonly columnKeys: readonly string[];
  readonly rowCount: number;
  readonly at: string;
}
