/**
 * The server-rendered first page.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * A virtualised grid renders fifteen of a hundred thousand rows, so server and
 * client markup differ and hydration fails. The common answer in this category
 * is `ssr: false` and a shrug. That is not an architecture — it is the reason a
 * Next.js team wraps a grid in a dynamic import and stops trusting it.
 *
 * The answer is a documented two-phase boundary:
 *
 *   Phase 1 — the server renders a real, non-virtualised first page. Correct
 *             markup, correct ARIA, correct absolute row indices, indexable,
 *             and useful with JavaScript disabled.
 *   Phase 2 — the client mounts the virtualiser *over that markup*, adopting
 *             the existing nodes rather than replacing them, and takes
 *             ownership at a known point. Whether a given framework can hand
 *             the markup over intact is framework-specific: see ADR 0007 for
 *             React, where it is not free.
 *
 * The structure emitted here is byte-for-byte the structure `createGridRenderer`
 * builds, including the inline positioning, so adoption is seamless and there is
 * nothing for a framework to report as a mismatch. `ssr.test.ts` asserts that by
 * parsing this output and comparing it to a client render of the same model.
 *
 * ── ON RAW HTML ─────────────────────────────────────────────────────────────
 *
 * This function returns a markup string, which looks like it contradicts the
 * renderer safety contract. It does not, and the distinction is worth stating:
 * the contract forbids a *cell renderer* returning markup, because that markup
 * would be attacker-influenced. Here the library serialises its own DOM from
 * typed content, and every interpolation goes through `escapeText` or
 * `escapeAttr`. Escaping is our responsibility, and it is tested with hostile
 * content in a note field.
 *
 * The React adapter does NOT inject this with `dangerouslySetInnerHTML` —
 * Oxygen ADR 0009 forbids it. Getting the markup into the document is the
 * application's job, through its own framework's server rendering. See
 * `hydrationNotes` below.
 * ────────────────────────────────────────────────────────────────────────────
 */
import { ariaRowCount, ariaRowIndex } from "./aria.js";
import type { CellContent } from "./cell.js";
import { resolveFocus } from "./focus.js";
import { HEADER_ROW_ID, type GridViewModel, type RenderColumn } from "./renderer.js";

const AMP = /&/g;
const LT = /</g;
const GT = />/g;
const QUOT = /"/g;

export const escapeText = (s: string): string =>
  s.replace(AMP, "&amp;").replace(LT, "&lt;").replace(GT, "&gt;");

export const escapeAttr = (s: string): string =>
  s.replace(AMP, "&amp;").replace(LT, "&lt;").replace(GT, "&gt;").replace(QUOT, "&quot;");

export interface SsrOptions<TRow> {
  readonly label: string;
  /**
   * How many rows the server renders. This is the first page, not the whole
   * set — a server-rendered 40,000-row table is a slower page than no table.
   */
  readonly firstPage?: number;
  readonly rowHeight?: number;
  /** Must match the client's `fallback`, or the first paint will flicker. */
  readonly fallback?: (row: TRow, columnKey: string) => CellContent;
}

const ariaSortOf = (
  sort: GridViewModel<unknown>["sort"],
  column: RenderColumn,
): string | null => {
  const s = sort.find((x) => x.key === column.key);
  if (s) return s.direction === "asc" ? "ascending" : "descending";
  return column.sortable ? "none" : null;
};

function contentText<TRow>(
  row: TRow,
  column: RenderColumn,
  fallback: SsrOptions<TRow>["fallback"],
): string {
  const content = fallback?.(row, column.key);
  if (!content) return "";
  // A component cell cannot be serialised here: it belongs to a framework the
  // renderer does not know. It renders empty on the server and fills on mount,
  // which is the one place the two phases legitimately differ.
  if (content.kind === "text") return content.text;
  if (content.kind === "token") return content.label;
  return "";
}

/**
 * Renders the first page as markup.
 *
 * Rows are absolutely positioned at the estimated row height, exactly as the
 * client renderer positions them, so the client can adopt without moving
 * anything. Without JavaScript the canvas still has its full height and the
 * first page still reads correctly.
 */
export function renderToString<TRow>(model: GridViewModel<TRow>, options: SsrOptions<TRow>): string {
  const estimate = options.rowHeight ?? 40;
  const firstPage = options.firstPage ?? 30;
  const rows = model.rows.slice(0, firstPage);

  // The body is one tab stop, so exactly one cell in the whole grid carries
  // tabindex="0" — and it must be the SAME cell the client would choose, or the
  // first Tab press before hydration goes somewhere different from the first
  // Tab press after it.
  //
  // Calling the client's own resolver rather than restating the rule: the first
  // draft of this file defaulted to the first body cell while the client
  // defaults to the header, and the structural-identity test caught it. Two
  // copies of a rule are two rules.
  const focus = resolveFocus(
    {
      rowIds: [HEADER_ROW_ID, ...model.rows.map((r) => r.id)],
      columnKeys: model.columns.map((c) => c.key),
    },
    model.focus,
  );

  const header = model.columns
    .map((column, i) => {
      const sort = ariaSortOf(model.sort, column);
      const focused = focus?.rowId === HEADER_ROW_ID && focus.columnKey === column.key;
      return (
        `<div role="columnheader" aria-colindex="${i + 1}"` +
        (sort ? ` aria-sort="${sort}"` : "") +
        ` tabindex="${focused ? 0 : -1}"` +
        ` data-col-key="${escapeAttr(column.key)}"` +
        (column.width !== undefined ? ` style="width:${column.width}px"` : "") +
        `>${escapeText(column.header)}</div>`
      );
    })
    .join("");

  const selected = new Set(model.selection);

  const body = rows
    .map((entry) => {
      const cells = model.columns
        .map((column, i) => {
          const isFocus = focus?.rowId === entry.id && focus.columnKey === column.key;
          return (
            `<div role="gridcell" aria-colindex="${i + 1}"` +
            ` data-col-key="${escapeAttr(column.key)}"` +
            ` tabindex="${isFocus ? 0 : -1}"` +
            (column.width !== undefined ? ` style="width:${column.width}px"` : "") +
            `>${escapeText(contentText(entry.row, column, options.fallback))}</div>`
          );
        })
        .join("");
      return (
        `<div role="row" aria-rowindex="${ariaRowIndex(entry.index)}"` +
        ` data-row-id="${escapeAttr(entry.id)}" data-row-index="${entry.index}"` +
        (selected.has(entry.id) ? ` aria-selected="true"` : "") +
        ` style="position:absolute;left:0;right:0;top:${entry.index * estimate}px"` +
        `>${cells}</div>`
      );
    })
    .join("");

  const totalHeight = model.rows.length * estimate;

  return (
    `<div class="oxg-root">` +
    `<div role="grid" aria-label="${escapeAttr(options.label)}" class="oxg"` +
    ` aria-rowcount="${ariaRowCount(model.total)}" aria-colcount="${model.columns.length}">` +
    `<div role="rowgroup" class="oxg-head">` +
    `<div role="row" aria-rowindex="1" data-row-id="${HEADER_ROW_ID}">${header}</div>` +
    `</div>` +
    `<div role="presentation" class="oxg-viewport" style="overflow-y:auto;overflow-x:hidden;position:relative">` +
    `<div role="presentation" class="oxg-canvas" style="position:relative;width:100%;height:${totalHeight}px">` +
    `<div role="rowgroup" class="oxg-body">${body}</div>` +
    `</div></div></div>` +
    `<div role="status" aria-live="polite" class="oxg-live" ` +
    `style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap"></div>` +
    `</div>`
  );
}

/**
 * The handoff contract, in prose, so it is documented rather than discovered.
 *
 * Exported as data so the documentation site can render it from the same source
 * the implementation is written against.
 */
export const hydrationNotes = {
  serverRenders: "The first page only — typically 20 to 50 rows. Never the whole set.",
  clientAdopts:
    "createGridRenderer finds the server markup in its host and adopts those nodes. " +
    "It does not clear the host and rebuild, so there is no flash and no lost scroll position.",
  whatDiffers:
    "A cell backed by a framework component renders empty on the server and fills on mount. " +
    "Everything else — structure, ARIA, row indices, the single tab stop — is identical.",
  reactNote:
    "React DELETES children it did not render, and suppressHydrationWarning only silences the " +
    "warning — it does not preserve the subtree. React 19 throws a hydration mismatch and falls " +
    "back to a full client render. Verified, not assumed. So adoption inside a " +
    "React-owned container needs dangerouslySetInnerHTML, which Oxygen ADR 0009 forbids. " +
    "The supported path is an app-owned host: render the markup into an element React does not " +
    "own and pass it as `host`. Without that, the server page is replaced on mount rather than " +
    "adopted — correct, indexable, and a visible flash. See ADR 0007.",
  withoutJavaScript:
    "The first page is readable and correctly announced. Sorting, filtering and scrolling " +
    "beyond the first page require JavaScript, and the grid does not pretend otherwise.",
} as const;
