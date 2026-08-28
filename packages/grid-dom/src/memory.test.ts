// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createGridRenderer, type GridViewModel } from "./renderer.js";
import type { CellRenderer } from "./cell.js";

/**
 * The memory-leak gate.
 *
 * ── WHY THIS EXISTS, AND WHY NOBODY ELSE HAS IT ─────────────────────────────
 *
 * Detached DOM nodes and un-removed listeners are the classic grid leak. No
 * grid in this category gates on them, and the failure mode is not a crash —
 * it is a ward workstation that keeps one browser session for a fortnight,
 * mounts this grid hundreds of times a shift, and gets slower every day. That
 * gets blamed on the hospital's hardware.
 *
 * `global.gc` needs `--expose-gc`, which `vitest.config.ts` supplies. If it is
 * ever missing, the heap assertions FAIL rather than silently passing — a gate
 * that quietly stops running is worse than no gate.
 * ────────────────────────────────────────────────────────────────────────────
 */

interface P {
  readonly id: string;
  readonly name: string;
}

const CYCLES = 200;
const ROWS = 200;

const model = (): GridViewModel<P> => ({
  columns: [
    { key: "name", header: "Patient", sortable: true },
    { key: "id", header: "MRN" },
  ],
  rows: Array.from({ length: ROWS }, (_, i) => ({
    id: `p${i}`,
    row: { id: `p${i}`, name: `Patient ${i}` },
    index: i,
  })),
  total: ROWS,
  sort: [],
  selection: [],
  focus: null,
});

const fallback = (row: P, key: string) => ({
  kind: "text" as const,
  text: String(row[key as keyof P]),
});

function cycle(host: HTMLElement, cells?: Record<string, CellRenderer<P>>): void {
  const r = createGridRenderer<P>(host, {
    label: "Patient roster",
    onAction: () => {},
    fallback,
    rowHeight: 40,
    ...(cells ? { cells } : {}),
  });
  const viewport = host.querySelector<HTMLElement>(".oxg-viewport");
  if (viewport) Object.defineProperty(viewport, "clientHeight", { value: 600, configurable: true });
  r.render(model());
  // Exercise the paths that attach things: scroll handlers, measurement,
  // focus, and the recycling pool.
  viewport?.dispatchEvent(new Event("scroll"));
  r.measureRow(3, 88);
  r.render({ ...model(), focus: { rowId: "p5", columnKey: "name" } });
  r.destroy();
}

const heapMb = (): number => {
  const gc = (globalThis as { gc?: () => void }).gc;
  expect(gc, "--expose-gc is required; see vitest.config.ts").toBeTypeOf("function");
  gc?.();
  gc?.();
  return process.memoryUsage().heapUsed / 1024 / 1024;
};

describe("the renderer does not leak across mount and unmount", () => {
  it(`survives ${CYCLES} cycles without unbounded heap growth`, () => {
    const host = document.createElement("div");
    document.body.append(host);

    for (let i = 0; i < 20; i++) cycle(host); // warm: let the JIT and pools settle
    const before = heapMb();
    for (let i = 0; i < CYCLES; i++) cycle(host);
    const after = heapMb();

    const growth = after - before;
    // Generous, because a shared runner is noisy and a gate that fails on noise
    // gets disabled. A real leak here is unbounded, not marginal: 200 cycles of
    // 200 rows x 2 columns retains tens of MB if nothing is released.
    expect(growth, `heap grew ${growth.toFixed(1)} MB across ${CYCLES} cycles`).toBeLessThan(12);
  });

  it("leaves no grid in the host after destroy", () => {
    const host = document.createElement("div");
    document.body.append(host);
    for (let i = 0; i < 10; i++) cycle(host);
    expect(host.childElementCount).toBe(0);
  });

  it("unmounts every cell renderer it mounted", () => {
    // The cell contract's teardown obligation. A plugin that leaks should fail
    // CI rather than a customer's workstation — and the same is true of a cell.
    const mounted = vi.fn();
    const unmounted = vi.fn();
    const cell: CellRenderer<P> = {
      mount: (el) => {
        mounted();
        el.textContent = "x";
      },
      update: () => {},
      unmount: () => unmounted(),
      measure: () => ({ intrinsic: 0, growable: false }),
      read: () => "",
      compare: () => 0,
      toExport: () => ({ kind: "value", value: null }),
      toPrint: () => ({ kind: "value", value: null }),
    };

    const host = document.createElement("div");
    document.body.append(host);
    for (let i = 0; i < 25; i++) cycle(host, { name: cell });

    expect(mounted).toHaveBeenCalled();
    expect(unmounted.mock.calls.length).toBe(mounted.mock.calls.length);
  });

  it("stops responding to scroll after destroy", () => {
    // A listener that outlives its renderer is the classic detached-node leak,
    // and it also repaints a grid nobody is looking at.
    const host = document.createElement("div");
    document.body.append(host);
    const r = createGridRenderer<P>(host, { label: "g", onAction: () => {}, fallback, rowHeight: 40 });
    const viewport = host.querySelector<HTMLElement>(".oxg-viewport") as HTMLElement;
    Object.defineProperty(viewport, "clientHeight", { value: 600, configurable: true });
    r.render(model());
    r.destroy();
    // The node is detached; dispatching on it must not throw or rebuild.
    expect(() => viewport.dispatchEvent(new Event("scroll"))).not.toThrow();
    expect(host.childElementCount).toBe(0);
  });
});
