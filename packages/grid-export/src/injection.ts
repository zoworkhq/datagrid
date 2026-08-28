/**
 * Formula-injection defence.
 *
 * ── THIS IS NOT A FEATURE. IT IS A VULNERABILITY FIX. ───────────────────────
 *
 * A cell beginning `=`, `+`, `-`, `@`, tab or carriage return is executed as a
 * formula by Excel, Google Sheets and LibreOffice when the file is opened. A
 * patient's preferred name is free text a patient supplies, so an unguarded
 * export is a remote-code-execution path from a patient into a biller's
 * workstation.
 *
 * Three things OWASP is explicit about, and all three are handled here:
 *
 *   1. Quoting is NOT sufficient. Excel can strip escaping on save-and-reopen
 *      and re-arm the payload. So the value is neutralised, not merely quoted.
 *   2. Full-width variants execute in some locales, so `＝`, `＋`, `－`, `＠`
 *      are in the danger set alongside their ASCII forms.
 *   3. The rule applies after the delimiter, not only at field start — a value
 *      containing `foo,=cmd|…` becomes a formula cell the moment a re-save
 *      splits the field.
 *
 * There is deliberately no way to switch this off. A writer with an
 * `escapeFormulas: false` option is a writer that ships the vulnerability.
 * ────────────────────────────────────────────────────────────────────────────
 */

/** ASCII and full-width forms, plus the whitespace characters Excel also acts on. */
const DANGEROUS = new Set([
  "=", "+", "-", "@", "\t", "\r",
  "＝", "＋", "－", "＠", // ＝ ＋ － ＠
]);

/** Characters that begin a new cell once a spreadsheet re-parses the row. */
const SPLITTERS = [",", ";", "\t", "\n", "\r"];

const startsDangerously = (segment: string): boolean => {
  if (segment === "") return false;
  // Tab and carriage return are themselves dangerous leading characters, so
  // they must be tested BEFORE any whitespace trimming -- trimming first
  // silently disarms exactly the two the trim would eat.
  if (DANGEROUS.has(segment.charAt(0))) return true;
  // Leading spaces do not protect: Excel trims before interpreting.
  const first = segment.replace(/^[ \u00a0\ufeff]+/, "").charAt(0);
  return first !== "" && DANGEROUS.has(first);
};

/**
 * True when this value would be interpreted as a formula — at the start of the
 * field, or at the start of any segment a re-save could split it into.
 */
export function isFormulaInjection(value: string): boolean {
  if (startsDangerously(value)) return true;
  for (const splitter of SPLITTERS) {
    if (!value.includes(splitter)) continue;
    const parts = value.split(splitter);
    for (let i = 1; i < parts.length; i++) {
      if (startsDangerously(parts[i] as string)) return true;
    }
  }
  return false;
}

/**
 * Renders a value inert.
 *
 * A leading apostrophe forces the whole cell to text in Excel, Sheets and
 * LibreOffice, and it covers the embedded-delimiter case too, because the cell
 * is text however it is later re-parsed. The apostrophe is visible on open;
 * that is the correct trade against executing the payload, and it is why the
 * documentation recommends XLSX — where the value is a typed string cell and
 * needs no prefix at all.
 */
export function neutralise(value: string): string {
  return isFormulaInjection(value) ? `'${value}` : value;
}
