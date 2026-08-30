/**
 * The CSV writer.
 *
 * Every field passes through `neutralise` with no way to switch it off. RFC 4180
 * quoting is applied on top, but the neutralisation is what actually defends —
 * quoting alone fails the moment Excel re-saves the file.
 */
import { neutralise } from "./injection.js";
import {
  preamble,
  refuseIfPolicyForbids,
  renderExportValue,
  type ExportRequest,
  type ExportResult,
} from "./model.js";

const quote = (field: string): string =>
  /[",\r\n]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field;

/** Neutralise first, then quote. Never the other way round. */
const field = (raw: string): string => quote(neutralise(raw));

export interface CsvOptions {
  readonly filename?: string;
  /** Excel needs a BOM to read UTF-8. On by default, because names have accents. */
  readonly bom?: boolean;
}

export function toCsv<TRow>(request: ExportRequest<TRow>, options: CsvOptions = {}): ExportResult {
  const refusal = refuseIfPolicyForbids(request as ExportRequest<unknown>, "export");
  if (refusal) return refusal;

  const lines: string[] = [];
  for (const line of preamble(request as ExportRequest<unknown>)) lines.push(field(line));
  if (lines.length > 0) lines.push("");

  lines.push(request.columns.map((c) => field(c.header)).join(","));
  for (const row of request.rows) {
    lines.push(request.columns.map((c) => field(renderExportValue(c.value(row)))).join(","));
  }

  const text = (options.bom === false ? "" : "﻿") + lines.join("\r\n") + "\r\n";
  return {
    ok: true,
    bytes: new TextEncoder().encode(text),
    filename: options.filename ?? "export.csv",
    mediaType: "text/csv;charset=utf-8",
  };
}
