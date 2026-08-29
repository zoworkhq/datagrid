/**
 * What a consumer actually downloads.
 *
 * Every package budget `ignore`s its workspace dependencies, so grid-dom is
 * measured at 5.66 kB WITHOUT the engine it cannot run without. Nothing gated
 * the composed figure, which is the only one a consumer experiences.
 *
 * Imported by path rather than by name because the workspace root does not
 * depend on its own packages — and by path is closer to the truth anyway: this
 * is the bundle, not a dependency graph.
 */
export { createGridRenderer } from "../../packages/grid-dom/dist/index.js";
export {
  createClientRowModel, sortRows, evaluateFilter, initialState,
} from "../../packages/grid-core/dist/index.js";
