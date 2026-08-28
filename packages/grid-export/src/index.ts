/**
 * @oxygenui-design/grid-export — CSV, XLSX and the print sheet.
 *
 * A plugin, because a read-only worklist should not ship a spreadsheet writer.
 *
 * Formula-injection defence is part of the writer and there is no option to
 * switch it off. Prefer `toXlsx` for anything a human opens: in XLSX a string
 * cell cannot be a formula, so the defence is structural rather than an escape
 * that a save-and-reopen can strip.
 */
export * from "./csv.js";
export * from "./injection.js";
export * from "./model.js";
export * from "./xlsx.js";
export { zip, type ZipEntry } from "./zip.js";
