/**
 * @oxygenui-design/grid-fhir — FHIR as one interoperability profile among several.
 *
 * Separate from `grid-healthcare` on purpose: a behavioural-health platform on
 * a custom Postgres schema must not pay for FHIR, and an HL7v2-fed customer
 * must not be told FHIR is the only path.
 *
 * This package does NOT claim SMART on FHIR support. SMART is an authorisation
 * and launch-context concern belonging to the application; the grid consumes a
 * client, it does not obtain one (ADR 0001). It also ships no terminology data
 * — that is licensed, versioned, jurisdictional clinical content.
 */
export * from "./compile.js";
export * from "./source.js";
export * from "./types.js";
