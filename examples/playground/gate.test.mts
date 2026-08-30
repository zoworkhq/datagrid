/**
 * The gate that guards the gate.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * `pnpm gate` and `.github/workflows/ci.yml` are two lists of the same thing,
 * kept in step by hand. They drifted: the playground typecheck, the real-browser
 * smoke test and the composed size budget were in the local gate and absent
 * from CI for as long as they had existed. Every defect that harness catches
 * could merge, and nothing said so — CI went green because CI was not looking.
 *
 * The defects in question are not hypothetical. All four were found by the
 * smoke test and none is visible in jsdom, which has no layout:
 *
 *   · virtualisation silently dead from a CSS rule in the host page
 *   · a hidden grid growing to 27,628 nodes in two seconds
 *   · an adapter whose wrapper made the grid unbounded
 *   · a shortcut advertised in the keymap and wired to nothing
 *
 * So: every step in `gate` must appear in CI. Adding one to the local gate and
 * forgetting CI now fails here, naming the step.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const scripts = (): Record<string, string> =>
  JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).scripts;

const ci = (): string => readFileSync(join(ROOT, ".github", "workflows", "ci.yml"), "utf8");

/** The steps `pnpm gate` runs, in order, without the `pnpm` prefix. */
const gateSteps = (): string[] =>
  (scripts()["gate"] ?? "")
    .split("&&")
    .map((s) => s.trim().replace(/^pnpm\s+/, ""))
    .filter(Boolean);

describe("CI runs what the local gate runs", () => {
  it("has a gate at all", () => {
    expect(gateSteps().length).toBeGreaterThan(4);
  });

  it("runs every gate step in CI", () => {
    const workflow = ci();
    const missing = gateSteps().filter((step) => !workflow.includes(step));
    expect(
      missing,
      `in \`pnpm gate\` and absent from ci.yml — CI would go green without them:\n  ${missing.join("\n  ")}`,
    ).toEqual([]);
  });

  it("names each of them as its own step, so a failure says which", () => {
    // One `run: pnpm gate` line would satisfy the check above and produce a
    // single opaque red X. The point of separate steps is that the failure
    // names itself in the run summary.
    const workflow = ci();
    const runs = [...workflow.matchAll(/run:\s*(.+)/g)].map((m) => m[1] ?? "");
    expect(runs.some((r) => /\bpnpm gate\b/.test(r))).toBe(false);
  });
});

describe("the performance ratchets say what they are", () => {
  /**
   * Both baselines are `darwin-arm64` and CI is `ubuntu-latest`, so both
   * harnesses print "skipping the ratchet" and pass. That is defensible — a
   * cross-platform comparison is noise — but only while it is stated. A step
   * that measures and does not gate must not be described as one that gates.
   */
  it("admits in the workflow that they self-skip until a linux baseline exists", () => {
    const workflow = ci();
    expect(workflow).toMatch(/SELF-SKIP|self-skips/i);
    expect(workflow).toMatch(/linux/i);
  });

  it("still has no linux baseline, and the comment is therefore still true", () => {
    // When someone commits one, this fails and the comment above it — and the
    // README's "measure and print rather than gate" — need updating together.
    const engine = JSON.parse(readFileSync(join(ROOT, "bench", "baseline.json"), "utf8"));
    const browser = JSON.parse(readFileSync(join(ROOT, "bench", "browser-baseline.json"), "utf8"));
    const platforms = [engine.platform, browser.platform];
    if (platforms.every((p) => String(p).startsWith("linux"))) {
      throw new Error(
        "A linux baseline exists now. Arm the ratchets: update the ci.yml comments and the README's " +
          "status section, which both still say these steps measure rather than gate.",
      );
    }
    expect(platforms.every((p) => typeof p === "string" && p.length > 0)).toBe(true);
  });
});
