/**
 * @oxygenui-design/grid-core — the engine.
 *
 * No DOM, no framework, no clinical vocabulary. Testable without a renderer,
 * which is what makes 40,000-row property tests cheap. Everything here is
 * serialisable.
 *
 * @see ../../../docs/decisions/0006-the-grids-layers-are-named-not-numbered.md
 */
export * from "./actions.js";
export * from "./column.js";
export * from "./errors.js";
export * from "./filter.js";
export * from "./keymap.js";
export * from "./query.js";
export * from "./sort.js";
export * from "./state.js";
