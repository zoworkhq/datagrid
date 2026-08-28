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

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.{ts,tsx}"],
    exclude: ["**/dist/**", "**/node_modules/**"],
    pool: "forks",
  },
});
