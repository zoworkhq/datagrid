import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// --expose-gc so the memory-leak gate can force collection between
// mount/unmount cycles. Set through NODE_OPTIONS rather than
// poolOptions.execArgv, because vitest replaces execArgv with its own; the
// environment is inherited by forked workers and works on every platform.
//
// If it ever stops arriving, memory.test.ts FAILS rather than passing
// vacuously — a gate that quietly stops running is worse than no gate.
const NODE_OPTIONS = `${process.env["NODE_OPTIONS"] ?? ""} --expose-gc`.trim();
process.env["NODE_OPTIONS"] = NODE_OPTIONS;

// The playground is a CONSUMER of the packages, not a workspace member, so
// nothing resolves `@oxygenui-design/*` for it. Its build aliases them to the
// built output; the tests alias them the same way, so a playground test
// exercises the wiring the demo actually ships with.
const packagesDir = fileURLToPath(new URL("./packages", import.meta.url));
const workspaceAliases = Object.fromEntries(
  readdirSync(packagesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => [`@oxygenui-design/${e.name}`, `${packagesDir}/${e.name}/dist/index.js`]),
);

export default defineConfig({
  resolve: { alias: workspaceAliases },
  test: {
    include: [
      "packages/*/src/**/*.test.{ts,tsx}",
      "examples/playground/**/*.test.{ts,mts}",
    ],
    exclude: ["**/dist/**", "**/node_modules/**"],
    pool: "forks",
  },
});
