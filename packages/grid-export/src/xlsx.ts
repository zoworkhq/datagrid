/**
 * A minimal XLSX writer with typed cells.
 *
 * ── THIS IS THE FORMAT TO PREFER FOR ANYTHING A HUMAN OPENS. ────────────────
 *
 * In XLSX a formula is an `<f>` element. A string is a typed string cell, and
 * this writer never emits `<f>` — so a value beginning `=` is inert *by the
 * structure of the format*, with no escaping to be stripped on re-save and no
 * visible apostrophe. That is a categorically stronger guarantee than anything
 * CSV can offer, which is why `toCsv` neutralises and this does not have to.
 *
 * Numbers are written as numeric cells so a spreadsheet does not re-interpret
 * an identifier — a leading-zero MRN stays a string and stays intact.
 * ────────────────────────────────────────────────────────────────────────────
 */
import {
  preamble,
  refuseIfPolicyForbids,
  renderExportValue,
  type ExportRequest,
  type ExportResult,
} from "./model.js";
import { zip , ZipTooLarge } from "./zip.js";

/** Control characters XML 1.0 cannot represent at any escaping level. */
const ILLEGAL_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

const xmlEscape = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // A stray control byte in a free-text note would otherwise produce a file
    // the spreadsheet refuses to open at all.
    .replace(ILLEGAL_XML, "");

export function columnLetter(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

function cell(ref: string, value: string | number): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${ref}"><v>${value}</v></c>`;
  }
  // t="inlineStr" — a string cell. Never <f>, so this can never be a formula.
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(String(value))}</t></is></c>`;
}

/**
 * A worksheet name Excel will actually open.
 *
 * ── WHAT WAS WRONG WITH `slice(0, 31)` ──────────────────────────────────────
 *
 * The length cap was right and the rest was missing. Excel rejects a workbook
 * whose sheet name contains any of `: \\ / ? * [ ]`, is blank, or is wrapped in
 * apostrophes — so a perfectly legal application label like "Q1/Q2 [draft]"
 * produced a file that would not open, with no error from this library at any
 * point. XML-escaping does not help: the characters are legal XML and illegal
 * to Excel.
 *
 * Substituted rather than refused, because a sheet name is a label and losing a
 * slash is not a data loss worth failing an export over. The length cap is
 * applied AFTER substitution, so replacing a character cannot push the name
 * over 31 and back into invalidity.
 */
export function worksheetName(requested: string | undefined): string {
  const cleaned = (requested ?? "")
    // Excel's own forbidden set, and control characters with it.
    .replace(/[:\\/?*[\]]/g, "-")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    // A leading or trailing apostrophe makes Excel read the name as quoted.
    .replace(/^'+|'+$/g, "")
    .trim();

  const capped = cleaned.slice(0, 31).trim();
  // "History" is reserved by Excel, and a blank name is rejected outright.
  return capped === "" || capped.toLowerCase() === "history" ? "Export" : capped;
}

export interface XlsxOptions {
  readonly filename?: string;
  readonly sheetName?: string;
}

export function toXlsx<TRow>(request: ExportRequest<TRow>, options: XlsxOptions = {}): ExportResult {
  const refusal = refuseIfPolicyForbids(request as ExportRequest<unknown>, "export");
  if (refusal) return refusal;

  const rows: string[] = [];
  let r = 1;

  for (const line of preamble(request as ExportRequest<unknown>)) {
    rows.push(`<row r="${r}">${cell(`A${r}`, line)}</row>`);
    r++;
  }
  if (rows.length > 0) r++; // a blank row between the preamble and the table

  rows.push(
    `<row r="${r}">${request.columns
      .map((c, i) => cell(`${columnLetter(i)}${r}`, c.header))
      .join("")}</row>`,
  );
  r++;

  for (const row of request.rows) {
    const cells = request.columns.map((c, i) => {
      const v = c.value(row);
      const ref = `${columnLetter(i)}${r}`;
      // A masked cell yields its reason as text, never its value.
      if (v.kind === "masked") return cell(ref, renderExportValue(v));
      return typeof v.value === "number" && Number.isFinite(v.value)
        ? cell(ref, v.value)
        : cell(ref, renderExportValue(v));
    });
    rows.push(`<row r="${r}">${cells.join("")}</row>`);
    r++;
  }

  const sheet =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetData>${rows.join("")}</sheetData></worksheet>`;

  const name = xmlEscape(worksheetName(options.sheetName));

  // A workbook past the classic archive limits is refused rather than written
  // as a file no reader can open. `zip` throws with the reason; this turns it
  // into the same `ExportResult` refusal every other limit produces, so a
  // caller has one shape to handle.
  let bytes: Uint8Array;
  try {
    bytes = zip([
    {
      name: "[Content_Types].xml",
      bytes: utf8(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
          `<Default Extension="xml" ContentType="application/xml"/>` +
          `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
          `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
          `</Types>`,
      ),
    },
    {
      name: "_rels/.rels",
      bytes: utf8(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
          `</Relationships>`,
      ),
    },
    {
      name: "xl/workbook.xml",
      bytes: utf8(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
          `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
          `<sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      ),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      bytes: utf8(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
          `</Relationships>`,
      ),
    },
    { name: "xl/worksheets/sheet1.xml", bytes: utf8(sheet) },
  ]);
  } catch (thrown) {
    return {
      ok: false,
      refused: true,
      reason:
        thrown instanceof ZipTooLarge
          ? `The workbook is too large to write. ${thrown.detail}`
          : "The workbook could not be written.",
    };
  }

  return {
    ok: true,
    bytes,
    filename: options.filename ?? "export.xlsx",
    mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
}
