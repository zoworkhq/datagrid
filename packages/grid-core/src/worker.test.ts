/**
 * The off-thread path.
 *
 * jsdom has no real `Worker`, which is the interesting case rather than a
 * limitation: the module has to REFUSE cleanly where workers do not exist —
 * a server-rendering pass, a locked-down CSP, an old embedded browser — and
 * the caller has to be able to carry on. A grid that throws because it could
 * not find a worker is worse than a grid that sorts on the main thread.
 *
 * The transfer semantics and the radix output are exercised for real in
 * `bench/worker.mjs`, which runs in a browser.
 */
import { describe, expect, it, vi } from "vitest";
import { createGridWorker } from "./worker.js";

describe("where workers do not exist", () => {
  it("reports itself unavailable rather than throwing on construction", () => {
    const original = globalThis.Worker;
    // @ts-expect-error — removing it is the case under test
    delete globalThis.Worker;
    try {
      const w = createGridWorker();
      expect(w.available).toBe(false);
    } finally {
      globalThis.Worker = original;
    }
  });

  it("rejects with a typed error the caller can branch on", async () => {
    const original = globalThis.Worker;
    // @ts-expect-error — removing it is the case under test
    delete globalThis.Worker;
    try {
      const w = createGridWorker();
      await expect(
        w.run({ kind: "sort", direction: "asc" }, new Uint32Array([1, 2])),
      ).rejects.toMatchObject({ code: "worker-unavailable" });
    } finally {
      globalThis.Worker = original;
    }
  });

  it("has a terminate that is safe to call anyway", () => {
    const original = globalThis.Worker;
    // @ts-expect-error — removing it is the case under test
    delete globalThis.Worker;
    try {
      expect(() => createGridWorker().terminate()).not.toThrow();
    } finally {
      globalThis.Worker = original;
    }
  });
});

describe("with a worker present", () => {
  /** A stand-in that records what it was handed. */
  function stub() {
    const posted: Array<{ data: unknown; transfer: unknown[] }> = [];
    class FakeWorker {
      onmessage: ((e: MessageEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      terminated = false;
      postMessage(data: unknown, transfer: unknown[]) {
        posted.push({ data, transfer });
      }
      terminate() { this.terminated = true; }
    }
    const instances: FakeWorker[] = [];
    vi.stubGlobal("Worker", class extends FakeWorker {
      constructor() { super(); instances.push(this); }
    });
    vi.stubGlobal("Blob", class { constructor(public parts: unknown[]) {} });
    vi.stubGlobal("URL", { createObjectURL: () => "blob:x", revokeObjectURL: () => {} });
    return { posted, instances };
  }

  it("transfers the key array rather than copying it", async () => {
    const { posted } = stub();
    const w = createGridWorker();
    const keys = new Uint32Array([3, 1, 2]);
    void w.run({ kind: "sort", direction: "asc" }, keys);

    // THE reason this is possible at all. A structured clone of a million rows
    // costs more than sorting them; a transfer moves ownership and costs the
    // same whatever the length.
    expect(posted[0]?.transfer).toEqual([keys.buffer]);
    vi.unstubAllGlobals();
  });

  it("resolves the matching request when the worker answers", async () => {
    const { instances } = stub();
    const w = createGridWorker();
    const promise = w.run({ kind: "sort", direction: "asc" }, new Uint32Array([2, 1]));
    const worker = instances[0]!;
    worker.onmessage?.({ data: { id: 0, out: new Uint32Array([1, 0]) } } as MessageEvent);
    expect(Array.from(await promise)).toEqual([1, 0]);
    vi.unstubAllGlobals();
  });

  it("fails every outstanding request when the worker dies", async () => {
    const { instances } = stub();
    const w = createGridWorker();
    const a = w.run({ kind: "sort", direction: "asc" }, new Uint32Array([1]));
    const b = w.run({ kind: "filterEquals", value: 1 }, new Uint32Array([1]));
    instances[0]!.onerror?.();
    // Leaving promises that never settle is how a spinner spins forever.
    await expect(a).rejects.toMatchObject({ code: "worker-unavailable" });
    await expect(b).rejects.toMatchObject({ code: "worker-unavailable" });
    vi.unstubAllGlobals();
  });

  it("refuses an operation it does not implement", async () => {
    stub();
    const w = createGridWorker();
    await expect(
      // A comparator cannot cross the boundary: a function is not
      // structured-cloneable, and serialising one would mean evaluating
      // caller-supplied source inside a worker.
      w.run({ kind: "nope" } as never, new Uint32Array([1])),
    ).rejects.toMatchObject({ code: "worker-unavailable" });
    vi.unstubAllGlobals();
  });

  it("fails outstanding work on terminate rather than hanging", async () => {
    stub();
    const w = createGridWorker();
    const pending = w.run({ kind: "sort", direction: "asc" }, new Uint32Array([1]));
    w.terminate();
    await expect(pending).rejects.toMatchObject({ code: "worker-unavailable" });
    vi.unstubAllGlobals();
  });
});
