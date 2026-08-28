/**
 * @oxygenui-design/grid-healthcare — clinical meaning.
 *
 * Separate from the engine so that generic logic cannot be contaminated by
 * clinical assumptions, and so a non-healthcare consumer pays nothing for it.
 * Nothing below this package may import it.
 */
export * from "./absence.js";
export * from "./coverage.js";
export * from "./disclosure.js";
