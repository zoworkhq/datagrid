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

/** Structurally satisfied by `DisclosurePolicy`, without depending on it. */
export interface ExportPolicy {
  mayExport(): boolean;
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

export function refuseIfPolicyForbids(request: ExportRequest<unknown>): ExportResult | null {
  if (request.policy && !request.policy.mayExport()) {
    return { ok: false, refused: true, reason: "The disclosure policy does not permit export." };
  }
  return null;
}

/** Header lines that precede the table in every text format. */
export function preamble(request: ExportRequest<unknown>): string[] {
  const lines: string[] = [];
  if (request.coverage) lines.push(request.coverage);
  if (request.predicate) lines.push(`Filter: ${request.predicate}`);
  return lines;
}
