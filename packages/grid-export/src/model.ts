/**
 * What an export is made of.
 *
 * The writers share one model so the CSV, the XLSX and the print sheet cannot
 * disagree about what a masked cell says or which rows were included.
 */
import type { ExportValue } from "@oxygenui-design/grid-core";

export interface ExportColumn<TRow> {
  readonly key: string;
  readonly header: string;
  /** Carries mask state. A masked cell must never yield its value here. */
  readonly value: (row: TRow) => ExportValue;
}

/**
 * The channel a request leaves through.
 *
 * These are not interchangeable and a policy may permit one and refuse another.
 * Print is the obvious case: a ward may allow a clinician to read a list on
 * screen and to copy one row, and forbid producing a printable document that
 * walks out of the building.
 */
export type DisclosureChannel = "export" | "print" | "copy";

/**
 * Structurally satisfied by `DisclosurePolicy`, without depending on it.
 *
 * `mayPrint` and `mayCopy` are OPTIONAL, and their absence means "the same
 * answer as export" — which is what every caller written before they existed
 * already assumed. An application that distinguishes the channels implements
 * them and they are honoured; one that does not is no worse off than before.
 * What is no longer possible is the reverse: a policy that says `mayPrint:
 * false` and is silently ignored because the writer only ever asked about
 * export.
 */
export interface ExportPolicy {
  mayExport(): boolean;
  mayPrint?(): boolean;
  mayCopy?(): boolean;
}

export interface ExportRequest<TRow> {
  readonly columns: readonly ExportColumn<TRow>[];
  readonly rows: readonly TRow[];
  /**
   * The coverage sentence, from `describeCoverage`. An export that leaves the
   * screen loses the coverage bar, so it travels in the file — print and
   * export are exactly where "See all" stops existing.
   */
  readonly coverage?: string;
  /** The active filter, in words, so a reader knows what was excluded. */
  readonly predicate?: string;
  readonly policy?: ExportPolicy;
}

export type ExportResult =
  | { readonly ok: true; readonly bytes: Uint8Array; readonly filename: string; readonly mediaType: string }
  | { readonly ok: false; readonly refused: true; readonly reason: string };

/** How a masked cell appears in a file. The reason travels; the value never does. */
export function renderExportValue(v: ExportValue): string {
  return v.kind === "masked" ? `[withheld: ${v.reason}]` : v.value === null ? "" : String(v.value);
}

/**
 * Asks the policy about the channel this writer actually is.
 *
 * `channel` is required rather than defaulted. A default would mean a writer
 * added later gets the export answer by omission, which is exactly the defect
 * this replaces: the print writer asked `mayExport()` and produced a printable
 * document for a policy that said `mayPrint: false`.
 */
export function refuseIfPolicyForbids(
  request: ExportRequest<unknown>,
  channel: DisclosureChannel,
): ExportResult | null {
  const policy = request.policy;
  if (!policy) return null;

  const allowed =
    channel === "print" ? (policy.mayPrint?.() ?? policy.mayExport())
    : channel === "copy" ? (policy.mayCopy?.() ?? policy.mayExport())
    : policy.mayExport();

  if (allowed) return null;
  return {
    ok: false,
    refused: true,
    reason: `The disclosure policy does not permit ${channel}.`,
  };
}

/** Header lines that precede the table in every text format. */
export function preamble(request: ExportRequest<unknown>): string[] {
  const lines: string[] = [];
  if (request.coverage) lines.push(request.coverage);
  if (request.predicate) lines.push(`Filter: ${request.predicate}`);
  return lines;
}
