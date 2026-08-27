/**
 * The column model.
 *
 * Objects with inference, never JSX. Strong inference should make the *wrong*
 * code fail to compile rather than make the right code shorter.
 */

/**
 * A model card for a derived column.
 *
 * Sorting a worklist by a risk score reorders who gets seen first: that is
 * triage. When the score is a model output, the sort silently converts the
 * model's quality into a queue discipline — so the model names itself in the
 * header, not in a tooltip.
 */
export interface ModelProvenance {
  readonly model: string;
  readonly version: string;
  /** The population the model was validated on. Not the population it is being applied to. */
  readonly validatedOn: string;
  readonly validatedAt: string;
  readonly note?: string;
}

interface ColumnBase<TRow> {
  readonly key: string;
  readonly header: string;
  /** An identity column cannot be hidden in a clinical recipe. */
  readonly required?: boolean;
  readonly width?: number;
  readonly value?: (row: TRow) => string | number | boolean | null | undefined;
}

/**
 * A derived column must name its provenance. Omitting it is a compile error,
 * not a lint warning — which is the difference between a rule that is read once
 * and a rule that is read every time.
 */
export type ColumnDef<TRow> = ColumnBase<TRow> &
  (
    | { readonly derived?: false; readonly provenance?: never }
    | { readonly derived: true; readonly provenance: ModelProvenance }
  );

export function defineColumns<TRow>(columns: readonly ColumnDef<TRow>[]): readonly ColumnDef<TRow>[] {
  const seen = new Set<string>();
  for (const c of columns) {
    if (seen.has(c.key)) throw new Error(`duplicate column key: ${c.key}`);
    seen.add(c.key);
  }
  return columns;
}
