import { describe, expect, it, vi } from "vitest";
import {
  branchPath,
  branchRowId,
  childrenOf,
  coverageErrorFor,
  createBranchStore,
} from "./lazy-groups.js";

interface G {
  readonly id: string;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("lazy branches", () => {
  it("starts unresolved — not empty", () => {
    // A branch nobody has fetched is not a branch with no children.
    const store = createBranchStore<G>({ source: { getChildren: async () => [] } });
    expect(store.state("ward=A")).toEqual({ status: "unresolved" });
    expect(childrenOf(store.state("ward=A"))).toEqual({ kind: "marker", state: "unresolved" });
  });

  it("goes loading, then resolved", async () => {
    const store = createBranchStore<G>({
      source: { getChildren: async () => [{ id: "g1" }, { id: "g2" }] },
    });
    store.request("ward=A");
    expect(store.state("ward=A").status).toBe("loading");
    await flush();
    expect(store.state("ward=A")).toEqual({ status: "resolved", rows: [{ id: "g1" }, { id: "g2" }] });
  });

  it("treats a genuinely empty branch as a real answer", () => {
    // resolved-with-nothing looks different from never-fetched, and both look
    // different from failed.
    const store = createBranchStore<G>({ source: { getChildren: async () => [] } });
    store.request("ward=B");
    return flush().then(() => {
      expect(store.state("ward=B")).toEqual({ status: "resolved", rows: [] });
      expect(childrenOf(store.state("ward=B"))).toEqual({ kind: "rows", rows: [] });
    });
  });

  it("renders a FAILED branch as failed, never as empty", async () => {
    // Every grid that shows a timed-out fetch as an empty branch tells the
    // reader a plan has no goals.
    const store = createBranchStore<G>({
      source: {
        getChildren: async () => {
          throw new Error("upstream timeout for Aurelia Marchetti-Okonkwo");
        },
      },
    });
    store.request("ward=C");
    await flush();
    const state = store.state("ward=C");
    expect(state.status).toBe("failed");
    expect(childrenOf(state)).toEqual({ kind: "marker", state: "failed" });
    // And the error carries coordinates, not the thing it was reading.
    expect(JSON.stringify(state)).not.toContain("Aurelia");
  });

  it("does not refetch a path that is already in flight", async () => {
    const getChildren = vi.fn(async () => [{ id: "g1" }]);
    const store = createBranchStore<G>({ source: { getChildren } });
    store.request("x");
    store.request("x");
    store.request("x");
    await flush();
    expect(getChildren).toHaveBeenCalledTimes(1);
  });

  it("does not retry a failure on its own", async () => {
    // Automatic retry hammers a struggling server and hides the failure from
    // the reader. invalidate() is the retry, and it is the caller's decision.
    const getChildren = vi.fn(async () => {
      throw new Error("nope");
    });
    const store = createBranchStore<G>({ source: { getChildren } });
    store.request("x");
    await flush();
    store.request("x");
    store.request("x");
    await flush();
    expect(getChildren).toHaveBeenCalledTimes(1);
    expect(store.state("x").status).toBe("failed");
  });

  it("refetches after invalidate", async () => {
    const getChildren = vi.fn(async () => [{ id: "g1" }]);
    const store = createBranchStore<G>({ source: { getChildren } });
    store.request("x");
    await flush();
    store.invalidate("x");
    expect(store.state("x").status).toBe("unresolved");
    store.request("x");
    await flush();
    expect(getChildren).toHaveBeenCalledTimes(2);
  });

  it("escalates failures into coverage", async () => {
    // A branch nobody could read is part of what the query did not reach --
    // the same escalation the source-unreachable absence reason makes for one
    // cell.
    const store = createBranchStore<G>({
      source: {
        getChildren: async (path) => {
          if (path === "bad") throw new Error("x");
          return [];
        },
      },
    });
    store.request("good");
    store.request("bad");
    await flush();
    expect(store.failures()).toEqual(["bad"]);
    expect(coverageErrorFor(store.failures())).toMatchObject({ code: "source-unreachable" });
    expect(coverageErrorFor([])).toBeNull();
  });

  it("notifies on every state change, so a signal can recompute", async () => {
    const onChange = vi.fn();
    const store = createBranchStore<G>({ source: { getChildren: async () => [] }, onChange });
    store.request("x");
    await flush();
    expect(onChange.mock.calls.length).toBeGreaterThanOrEqual(2); // loading, then resolved
  });

  it("abandons in-flight work on destroy", async () => {
    let settle: ((rows: G[]) => void) | null = null;
    const store = createBranchStore<G>({
      source: {
        getChildren: () =>
          new Promise<readonly G[]>((resolve) => {
            settle = resolve;
          }),
      },
    });
    store.request("x");
    store.destroy();
    settle?.([{ id: "late" }]);
    await flush();
    expect(store.state("x")).toEqual({ status: "unresolved" });
  });
});

describe("stable identity", () => {
  it("builds nested paths that survive a sort or a refetch", () => {
    const ward = branchPath("", "ward", "A");
    expect(ward).toBe("ward=A");
    expect(branchPath(ward, "team", "Red")).toBe("ward=A/team=Red");
  });

  it("scopes a row id to its branch, so selection survives a refetch", () => {
    expect(branchRowId("ward=A/team=Red", "p1")).toBe("ward=A/team=Red#p1");
  });
});
