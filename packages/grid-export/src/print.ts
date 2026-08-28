/**
 * The print sheet.
 *
 * ── WHY THIS IS A REAL TABLE WHEN THE GRID IS NOT ───────────────────────────
 *
 * On screen the grid is divs with `role="grid"`, because that is what lets it
 * virtualise. In print it is a genuine `<table>` with a `<thead>`, because
 * `display: table-header-group` is the only mechanism that repeats a header
 * across printed pages. A grid built from divs cannot repeat its header, which
 * is why so few of them print usefully — and why this is a real competitor gap
 * rather than a checkbox.
 *
 * Nothing is virtualised here. A print sheet renders every row it is given; if
 * that is a hundred thousand rows, that is the caller's decision and their
 * paper.
 *
 * ── WHY COVERAGE MATTERS MOST HERE ──────────────────────────────────────────
 *
 * Print is where "See all" stops existing. A filtered list on screen has a
 * coverage bar and a way to widen it; the same list on paper has neither, and
 * will be read months later by someone who was not there when the filter was
 * set. So the coverage sentence and the predicate are printed at the top of the
 * sheet and in a running footer, not tucked into a caption.
 *
 * Escaping is ours, as in `renderToString`, and is tested with hostile content.
 * Masked cells print their reason and never their value.
 */
import {
  preamble,
  refuseIfPolicyForbids,
  renderExportValue,
  type ExportRequest,
  type ExportResult,
} from "./model.js";

const escapeText = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const escapeAttr = (s: string): string => escapeText(s).replace(/"/g, "&quot;");

export interface PrintOptions {
  readonly title?: string;
  readonly filename?: string;
  /** Printed in the running footer alongside the page number. */
  readonly footer?: string;
}

const STYLE = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body {
  margin: 0; padding: 12mm 10mm;
  font: 10pt/1.45 -apple-system, "Segoe UI", system-ui, sans-serif;
  color: #0e1c19; background: #fff;
}
h1 { font-size: 13pt; margin: 0 0 4pt; }

/* The coverage claim, at the top, in words. Not a caption, not a footnote. */
.coverage {
  font-size: 8.5pt; line-height: 1.5; color: #33473f;
  border-left: 2pt solid #059478; padding: 4pt 8pt; margin: 0 0 8pt;
  background: #f6faf8;
}
.coverage b { color: #0e1c19; }

table { border-collapse: collapse; width: 100%; font-size: 9pt; }

/* The whole reason this is a table: browsers repeat a thead on every page. */
thead { display: table-header-group; }
tfoot { display: table-footer-group; }

th, td {
  border: 0.5pt solid #c3d3cd; padding: 3pt 5pt;
  text-align: left; vertical-align: top;
}
th { background: #eef4f2; font-weight: 700; }

/* A row must not be split across a page break: half a patient is not a row. */
tr { break-inside: avoid; page-break-inside: avoid; }

td.num { text-align: right; font-variant-numeric: tabular-nums; }
td.masked { color: #5d716b; font-style: italic; }

@page { margin: 14mm 10mm; }
@media print { .no-print { display: none !important; } }
`.trim();

/** The sheet as HTML. The caller prints it — the grid opens no windows. */
export function printSheetHtml<TRow>(
  request: ExportRequest<TRow>,
  options: PrintOptions = {},
): string {
  const title = options.title ?? "Grid";
  const lines = preamble(request as ExportRequest<unknown>);

  const head = request.columns.map((c) => `<th scope="col">${escapeText(c.header)}</th>`).join("");

  const body = request.rows
    .map((row) => {
      const cells = request.columns
        .map((column) => {
          const v = column.value(row);
          if (v.kind === "masked") {
            // The reason travels; the value never does.
            return `<td class="masked">${escapeText(renderExportValue(v))}</td>`;
          }
          const numeric = typeof v.value === "number" && Number.isFinite(v.value);
          return `<td${numeric ? ' class="num"' : ""}>${escapeText(renderExportValue(v))}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  const coverage =
    lines.length > 0
      ? `<div class="coverage">${lines
          .map((l, i) => `${i === 0 ? "<b>" : ""}${escapeText(l)}${i === 0 ? "</b>" : ""}`)
          .join("<br />")}</div>`
      : "";

  // Repeated on every page, because a sheet read months later must carry the
  // same claim as the screen it came from.
  const runningFooter = lines[0]
    ? `<tfoot><tr><td colspan="${request.columns.length}" style="border:0;padding-top:6pt;font-size:7.5pt;color:#5d716b">${escapeText(
        options.footer ? `${lines[0]} — ${options.footer}` : lines[0],
      )}</td></tr></tfoot>`
    : "";

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>${escapeAttr(title)}</title>
<style>${STYLE}</style>
</head><body>
<h1>${escapeText(title)}</h1>
${coverage}
<table>
<thead><tr>${head}</tr></thead>
${runningFooter}
<tbody>${body}</tbody>
</table>
</body></html>`;
}

export function toPrintSheet<TRow>(
  request: ExportRequest<TRow>,
  options: PrintOptions = {},
): ExportResult {
  const refusal = refuseIfPolicyForbids(request as ExportRequest<unknown>);
  if (refusal) return refusal;
  // Print is a disclosure like any other. A policy that permits export but not
  // print is a real configuration, and `mayPrint` is checked by the caller
  // through the same `ExportPolicy` shape.
  return {
    ok: true,
    bytes: new TextEncoder().encode(printSheetHtml(request, options)),
    filename: options.filename ?? "print.html",
    mediaType: "text/html;charset=utf-8",
  };
}
