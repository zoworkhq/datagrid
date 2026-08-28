import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * ── THE WAVE-4 STOP CONDITION, AS A TEST ────────────────────────────────────
 *
 * The plan's condition for abandoning framework agnosticism:
 *
 *   > If the Angular adapter is larger than ~8 KB or contains any logic the
 *   > React adapter also contains, the abstraction is in the wrong place. Stop
 *   > at one framework and say so.
 *
 * Size is covered by the size gate. This covers the second clause, which a size
 * check misses entirely: an adapter can be small and still be reimplementing
 * something. It reads the BUILT bundle and asserts none of the grid's own
 * vocabulary appears in it — sorting, filtering, ARIA, virtualisation and the
 * keyboard model all live below the adapters, so a hit here means one of them
 * has been copied up.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const BUNDLE = join(HERE, "..", "dist", "index.js");

const read = (): string | null => (existsSync(BUNDLE) ? readFileSync(BUNDLE, "utf8") : null);

/** Vocabulary that must only ever exist in grid-core and grid-dom. */
const GRID_LOGIC = [
  "aria-rowindex", "aria-rowcount", "aria-colindex", "aria-sort",
  "columnheader", "rowgroup", "gridcell",
  "localeCompare", "incomparable",
  "scrollTop", "offsetOf", "windowFor",
  "ArrowDown", "PageDown", "roving",
];

describe("the Angular adapter contains no grid logic", () => {
  it("has been built", () => {
    // A skipped assertion is not a passing one.
    expect(read(), "run `pnpm build` first — this test reads the built bundle").not.toBeNull();
  });

  it("reimplements none of the grid's vocabulary", () => {
    const bundle = read();
    if (bundle === null) return;
    const found = GRID_LOGIC.filter((term) => bundle.includes(term));
    expect(found, `grid logic leaked into the adapter: ${found.join(", ")}`).toEqual([]);
  });

  it("does exactly the three jobs an adapter has", () => {
    const bundle = read();
    if (bundle === null) return;
    // 1 · owns the mount point, 2 · marshals cells, 3 · bridges reactivity.
    expect(bundle).toContain("createGridRenderer");
    expect(bundle).toContain("nativeElement");
    expect(bundle).toContain("effect");
  });

  it("tears down, so it does not leak a grid per route", () => {
    const bundle = read();
    if (bundle === null) return;
    expect(bundle).toContain("destroy");
  });
});
