/**
 * The filter AST.
 *
 * A tree, not a string, because it must be serialisable into a saved view, and
 * because a source that cannot compile it must be able to *refuse it with a
 * reason* rather than approximate it. FHIR search cannot express nested boolean
 * logic; a silently narrowed cohort looks exactly like a correct answer.
 */

export type TextOperator = "eq" | "neq" | "contains" | "startsWith" | "endsWith" | "empty" | "notEmpty";
export type NumberOperator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "between" | "empty" | "notEmpty";
export type DateOperator = NumberOperator;
export type EnumOperator = "in" | "notIn" | "empty" | "notEmpty";

export type Comparison =
  | { readonly kind: "text"; readonly key: string; readonly op: TextOperator; readonly value: string }
  | { readonly kind: "number"; readonly key: string; readonly op: NumberOperator; readonly value: number | readonly [number, number] }
  | { readonly kind: "date"; readonly key: string; readonly op: DateOperator; readonly value: string | readonly [string, string] }
  | { readonly kind: "enum"; readonly key: string; readonly op: EnumOperator; readonly value: readonly string[] };

export type FilterNode =
  | Comparison
  | { readonly kind: "and"; readonly children: readonly FilterNode[] }
  | { readonly kind: "or"; readonly children: readonly FilterNode[] }
  | { readonly kind: "not"; readonly child: FilterNode };

export const and = (...children: FilterNode[]): FilterNode => ({ kind: "and", children });
export const or = (...children: FilterNode[]): FilterNode => ({ kind: "or", children });
export const not = (child: FilterNode): FilterNode => ({ kind: "not", child });

/** Every column key a filter tree touches. Used to check a filter against source capabilities. */
export function keysOf(node: FilterNode): readonly string[] {
  switch (node.kind) {
    case "and":
    case "or":
      return node.children.flatMap(keysOf);
    case "not":
      return keysOf(node.child);
    default:
      return [node.key];
  }
}
