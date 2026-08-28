/**
 * What a cell yields to an export or a print sheet.
 *
 * This lives in the engine rather than the renderer because it is a data
 * contract, not a DOM one — the export writer must be able to read it without
 * depending on the render layer.
 *
 * The mask variant is the eighth cell obligation, and it is what makes
 * mask-preserving export possible at all: a cell that returned only a flat
 * value could not tell the writer that the value must not leave.
 */
export type ExportValue =
  | { readonly kind: "value"; readonly value: string | number | boolean | null }
  | { readonly kind: "masked"; readonly reason: string };

export type PrintValue = ExportValue;
