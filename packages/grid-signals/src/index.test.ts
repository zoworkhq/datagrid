import { describe, expect, it, vi } from "vitest";
import { batch, computed, effect, signal, untrack } from "./index.js";

describe("grid-signals", () => {
  it("reads and writes", () => {
    const a = signal(1);
    expect(a()).toBe(1);
    a.set(2);
    expect(a()).toBe(2);
    a.update((n) => n + 1);
    expect(a()).toBe(3);
  });

  it("derives lazily and memoises", () => {
    const a = signal(2);
    const runs = vi.fn();
    const doubled = computed(() => {
      runs();
      return a() * 2;
    });
    expect(runs).not.toHaveBeenCalled(); // not read yet
    expect(doubled()).toBe(4);
    expect(doubled()).toBe(4);
    expect(runs).toHaveBeenCalledTimes(1);
  });

  it("batches writes into one notification", () => {
    const a = signal(1);
    const b = signal(1);
    const seen: number[] = [];
    const stop = effect(() => {
      seen.push(a() + b());
    });
    seen.length = 0;
    batch(() => {
      a.set(10);
      b.set(10);
    });
    expect(seen).toEqual([20]);
    stop();
  });

  it("untrack reads without subscribing", () => {
    const tracked = signal(1);
    const hidden = signal(1);
    let runs = 0;
    const stop = effect(() => {
      runs++;
      tracked();
      untrack(() => hidden());
    });
    expect(runs).toBe(1);
    hidden.set(2);
    expect(runs).toBe(1); // did not re-run
    tracked.set(2);
    expect(runs).toBe(2);
    stop();
  });
});
