/**
 * @oxygenui-design/grid-dom — the framework-free renderer.
 *
 * DOM construction, node recycling, scroll anchoring, focus management, the
 * full ARIA contract, pointer and keyboard handling. This package sitting
 * *below* the adapters is what makes framework agnosticism affordable.
 */
export * from "./aria.js";
export * from "./cell.js";
export * from "./focus.js";
export * from "./keyboard.js";
export * from "./renderer.js";
export * from "./ssr.js";
