/**
 * @oxygenui-design/grid-ai — provenance and refusal.
 *
 * ── WHAT THIS PACKAGE IS NOT ────────────────────────────────────────────────
 *
 * It calls no model. Semantic filtering and anomaly detection are table stakes
 * — Syncfusion ships them today and MUI X ships an assistant in Premium — and
 * shipping our own copy would be catching up on the axis we do not win.
 *
 * The differentiator is the two things nobody does:
 *
 *   REFUSAL      A proposed query that cannot be compiled RUNS NOTHING and
 *                names the part it could not express. It never approximates,
 *                because a silently narrowed cohort looks exactly like a
 *                correct answer, and the person reading it has no way to tell.
 *
 *   PROVENANCE   An AI-derived value is structurally distinguishable from a
 *                verified one, so no renderer, export or comparison can present
 *                one as the other by accident.
 *
 * Neither needs a model, which is why both ship now and the model integration
 * waits for `copilot-core`.
 *
 * @see ../../../docs/decisions/0010-what-wave-six-is-not.md
 */
import type { Comparison, FilterNode, ModelProvenance } from "@oxygenui-design/grid-core";
import { gridError, keysOf, type GridError } from "@oxygenui-design/grid-core";

// ── proposals ───────────────────────────────────────────────────────────────

/**
 * Something a model suggested. **It is not applied.**
 *
 * The whole channel is pull, not push: a proposal is rendered for confirmation
 * and only becomes state when a person accepts it. An AI that can mutate a
 * clinical list is an AI that will, at 3 a.m., to somebody who did not ask.
 */
export interface Proposal {
  readonly id: string;
  /** What the user asked for, verbatim, so the proposal can be checked against it. */
  readonly prompt: string;
  readonly filter?: FilterNode;
  readonly columns?: readonly string[];
  readonly groupBy?: readonly string[];
  /** The model's own account of itself. Rendered, not trusted. */
  readonly provenance: ModelProvenance;
}

export interface ProposalContext {
  readonly columnKeys: readonly string[];
  /** Operators this grid can actually evaluate or send. */
  readonly supports?: (comparison: Comparison) => boolean;
}

export type Compiled =
  | { readonly ok: true; readonly filter: FilterNode | null; readonly chips: readonly string[] }
  | { readonly ok: false; readonly reason: string; readonly error: GridError };

const describeComparison = (c: Comparison): string => {
  const value = Array.isArray(c.value) ? c.value.join("–") : String(c.value);
  return `${c.key} ${c.op} ${value}`;
};

/** Every condition as a chip, so the query is checkable BEFORE it runs. */
export function toChips(node: FilterNode | null | undefined): readonly string[] {
  if (!node) return [];
  switch (node.kind) {
    case "and":
      return node.children.flatMap(toChips);
    case "or":
      return [`any of (${node.children.flatMap(toChips).join(", ")})`];
    case "not":
      return [`not (${toChips(node.child).join(", ")})`];
    default:
      return [describeComparison(node)];
  }
};

/**
 * Compiles a proposal, or refuses it.
 *
 * Refusal is the product. A proposal naming a column this grid does not have,
 * or an operator it cannot evaluate, is rejected **by name** — never dropped,
 * never widened to something that happens to run.
 */
export function compileProposal(proposal: Proposal, ctx: ProposalContext): Compiled {
  const filter = proposal.filter ?? null;
  const known = new Set(ctx.columnKeys);

  const unknown = [...new Set(keysOf(filter ?? { kind: "and", children: [] }))].filter(
    (k) => !known.has(k),
  );
  if (unknown.length > 0) {
    return {
      ok: false,
      reason: `This grid has no column called ${unknown.map((k) => `"${k}"`).join(", ")}. Nothing was run.`,
      error: gridError({ code: "filter-not-compilable", phase: "query", columnKey: unknown[0] ?? null }),
    };
  }

  if (ctx.supports) {
    const unsupported = collectComparisons(filter).filter((c) => !ctx.supports?.(c));
    if (unsupported.length > 0) {
      const named = unsupported.map(describeComparison).join("; ");
      return {
        ok: false,
        reason: `This grid cannot evaluate ${named}. Nothing was run.`,
        error: gridError({
          code: "filter-not-compilable",
          phase: "query",
          columnKey: unsupported[0]?.key ?? null,
        }),
      };
    }
  }

  const badColumns = (proposal.columns ?? []).filter((k) => !known.has(k));
  if (badColumns.length > 0) {
    return {
      ok: false,
      reason: `Proposed columns do not exist: ${badColumns.join(", ")}. Nothing was applied.`,
      error: gridError({ code: "filter-not-compilable", phase: "query", columnKey: badColumns[0] ?? null }),
    };
  }

  return { ok: true, filter, chips: toChips(filter) };
}

function collectComparisons(node: FilterNode | null): readonly Comparison[] {
  if (!node) return [];
  switch (node.kind) {
    case "and":
    case "or":
      return node.children.flatMap(collectComparisons);
    case "not":
      return collectComparisons(node.child);
    default:
      return [node];
  }
}

/**
 * Accepting a proposal.
 *
 * Returns the action the caller dispatches — it does not dispatch. The
 * separation is the point: nothing in this package can change grid state.
 */
export function acceptProposal(
  compiled: Compiled,
): { readonly type: "filter/set"; readonly node: FilterNode | null } | null {
  return compiled.ok ? { type: "filter/set", node: compiled.filter } : null;
}

// ── provenance ──────────────────────────────────────────────────────────────

/**
 * A value and where it came from.
 *
 * `verified` and `ai-derived` are different *shapes*, not a flag, so a
 * renderer, an export or a comparator cannot treat one as the other by
 * forgetting to check a boolean.
 */
export type Sourced<T> =
  | { readonly source: "verified"; readonly value: T }
  | {
      readonly source: "ai-derived";
      readonly value: T;
      readonly provenance: ModelProvenance;
      /** The model's own confidence. Rendered; never used to decide anything. */
      readonly confidence?: number;
    };

export const verified = <T>(value: T): Sourced<T> => ({ source: "verified", value });

export const aiDerived = <T>(
  value: T,
  provenance: ModelProvenance,
  confidence?: number,
): Sourced<T> => ({
  source: "ai-derived",
  value,
  provenance,
  ...(confidence !== undefined ? { confidence } : {}),
});

export const isAiDerived = <T>(v: Sourced<T>): boolean => v.source === "ai-derived";

/**
 * The sentence shown beside an AI-derived value.
 *
 * Names the model, its version and the population it was validated on — not
 * the population it is being applied to, which is a distinction the Epic Sepsis
 * Model made expensive: AUC 0.63 on external validation against 0.76–0.83
 * claimed internally.
 */
export function describeProvenance(v: Sourced<unknown>): string {
  if (v.source === "verified") return "";
  const c = v.confidence === undefined ? "" : `, confidence ${Math.round(v.confidence * 100)}%`;
  return `${v.provenance.model} ${v.provenance.version}, validated on ${v.provenance.validatedOn}${c}`;
}

/**
 * Comparing across provenance.
 *
 * An AI-derived value and a verified one are **incomparable**. Sorting a
 * worklist that mixes them silently ranks a model's guess against a measured
 * fact, and sorting a worklist is triage.
 */
export function compareSourced<T>(
  a: Sourced<T>,
  b: Sourced<T>,
  compare: (x: T, y: T) => number,
): number | "incomparable" {
  if (a.source !== b.source) return "incomparable";
  return compare(a.value, b.value);
}

/** An AI-derived value never leaves in a file as though it were measured. */
export function exportLabel<T>(v: Sourced<T>, render: (value: T) => string): string {
  return v.source === "verified" ? render(v.value) : `${render(v.value)} (${v.provenance.model}, AI-derived)`;
}
