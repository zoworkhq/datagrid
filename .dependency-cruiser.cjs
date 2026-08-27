/**
 * Layer rules for zoworkhq/datagrid.
 *
 * Every rule below implements a clause of an accepted decision record. Do not
 * relax one without superseding the record it names — a package that needs an
 * exemption has a design error, not a lint problem.
 *
 *   ADR 0001  the grid never performs network I/O
 *   ADR 0003  the signals vendor is imported by exactly one package
 *   ADR 0006  foundation → engine → render → domain → { adapter | plugin }
 */

const ENGINE  = "^packages/(grid-core|grid-signals)/";
const RENDER  = "^packages/(grid-dom)/";
const DOMAIN  = "^packages/(grid-healthcare|grid-fhir)/";
const ADAPTER = "^packages/(grid-react|grid-angular|grid-vue|grid-element)/";
const PLUGIN  = "^packages/(grid-export|grid-filters|grid-analytics|grid-ai)/";

const ABOVE_ENGINE = `${RENDER}|${DOMAIN}|${ADAPTER}|${PLUGIN}`;
const ABOVE_RENDER = `${DOMAIN}|${ADAPTER}|${PLUGIN}`;
const ABOVE_DOMAIN = `${ADAPTER}|${PLUGIN}`;

/** Oxygen UI packages this repository is allowed to reach. ADR 0006 rule 4. */
const OXYGEN_FOUNDATION = "tokens|fhir|intl|utils";

module.exports = {
  forbidden: [
    {
      name: "engine-imports-nothing-above",
      severity: "error",
      comment:
        "ADR 0006 rule 1. The engine is pure logic: no DOM, no framework, no " +
        "clinical vocabulary. It is the part that must never change when a " +
        "framework does.",
      from: { path: ENGINE },
      to: { path: ABOVE_ENGINE },
    },
    {
      name: "render-imports-nothing-above",
      severity: "error",
      comment:
        "ADR 0006 rule 1. grid-dom owns the DOM and accessibility for every " +
        "adapter; it cannot know about any one of them, or about the clinic.",
      from: { path: RENDER },
      to: { path: ABOVE_RENDER },
    },
    {
      name: "domain-imports-nothing-above",
      severity: "error",
      comment: "ADR 0006 rule 1.",
      from: { path: DOMAIN },
      to: { path: ABOVE_DOMAIN },
    },
    {
      name: "adapter-does-not-import-plugin",
      severity: "error",
      comment:
        "ADR 0006 rule 2. An adapter that imports a plugin makes an optional " +
        "package mandatory — and an adapter is binding only.",
      from: { path: ADAPTER },
      to: { path: PLUGIN },
    },
    {
      name: "plugin-does-not-import-adapter",
      severity: "error",
      comment:
        "ADR 0006 rule 2. A plugin that imports an adapter is framework-" +
        "specific and has left the architecture.",
      from: { path: PLUGIN },
      to: { path: ADAPTER },
    },
    {
      name: "adapter-does-not-import-adapter",
      severity: "error",
      comment:
        "Four adapters, four bindings, no shared adapter code. Anything two " +
        "adapters both need belongs in grid-dom or grid-core.",
      from: { path: ADAPTER },
      to: { path: ADAPTER, pathNot: "^packages/([^/]+)/" },
    },
    {
      name: "nothing-below-domain-imports-domain",
      severity: "error",
      comment:
        "ADR 0006 rule 3. Generic sorting must not know what a reference " +
        "range is, and a non-healthcare consumer must not pay a byte for one.",
      from: { path: `${ENGINE}|${RENDER}` },
      to: { path: DOMAIN },
    },
    {
      name: "signals-is-the-floor",
      severity: "error",
      comment:
        "ADR 0003 rule 1. grid-signals is the reactivity substrate. It cannot " +
        "depend on the engine built over it; grid-core imports it, never the " +
        "reverse.",
      from: { path: "^packages/grid-signals/" },
      to: { path: "^packages/grid-core/" },
    },
    {
      name: "signals-vendor-is-private-to-the-facade",
      severity: "error",
      comment:
        "ADR 0003 rule 3. Exactly one package may import a signals " +
        "implementation, so that TC39 Signals landing changes one file. A " +
        "direct import elsewhere is a build failure, not a review note.",
      from: { pathNot: "^packages/grid-signals/" },
      to: { dependencyTypes: ["npm"], path: "node_modules/(alien-signals|@preact/signals-core|signal-polyfill)/" },
    },
    {
      name: "no-network-io",
      severity: "error",
      comment:
        "ADR 0001. The grid defines the shape of a request and never issues " +
        "one. It takes a caller-supplied dataSource and receives pushed " +
        "updates. `fetch`, `XMLHttpRequest` and `WebSocket` are caught " +
        "separately by the capability lint rule inherited from Oxygen ADR 0009.",
      from: { path: "^packages/" },
      to: {
        dependencyTypes: ["npm"],
        path: "node_modules/(axios|node-fetch|undici|ky|superagent|got|cross-fetch|ws|socket\\.io-client|eventsource)/",
      },
    },
    {
      name: "oxygen-foundation-only",
      severity: "error",
      comment:
        "ADR 0006 rule 4. The grid may depend on Oxygen UI's foundation " +
        "packages and nothing above them. If it needs something higher, that " +
        "thing moves down to Oxygen L0 or is inlined here.",
      from: { path: "^packages/" },
      to: {
        dependencyTypes: ["npm"],
        path: "node_modules/@oxygenui-design/",
        pathNot: `node_modules/@oxygenui-design/(grid-[^/]+|${OXYGEN_FOUNDATION})/`,
      },
    },
    {
      name: "not-to-unresolvable",
      severity: "error",
      comment:
        "An import the resolver cannot follow is invisible to every layer rule " +
        "below, so an undeclared cross-package import would otherwise pass this " +
        "lint silently. It is also, on its own, a broken build.",
      from: { path: "^packages/" },
      to: { couldNotResolve: true },
    },
    {
      name: "no-deep-package-imports",
      severity: "error",
      comment:
        "Cross-package imports go through the package's public entry point, " +
        "never into its src/ or dist/ internals -- otherwise every internal " +
        "file is a public API and the layer rules can be walked around.",
      from: { path: "^packages/([^/]+)/" },
      to: { path: "^packages/(?!$1/)[^/]+/(src|dist)/.+", pathNot: "^packages/[^/]+/(src|dist)/index\\.(ts|js|d\\.ts)$" },
    },
    {
      name: "no-circular",
      severity: "error",
      comment: "A cycle between packages means a layer boundary is wrong.",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-dev-dep-in-src",
      severity: "error",
      comment:
        "Oxygen ADR 0009: every runtime dependency is a supply-chain entry a " +
        "customer's security team must review. A devDependency reached from " +
        "src is an undeclared runtime dependency.",
      from: { path: "^packages/[^/]+/src/", pathNot: "\\.(test|spec|bench)\\.tsx?$" },
      // A peerDependency IS a declared runtime dependency -- the consumer
      // supplies it. An adapter's `react` is the whole point of an adapter.
      to: { dependencyTypes: ["npm-dev"], dependencyTypesNot: ["npm-peer"] },
    },
  ],

  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.base.json" },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "types", "default"],
      mainFields: ["module", "main"],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
