// @vitest-environment jsdom
/**
 * Structural props reach the grid after mount.
 *
 * ── WHAT WAS FROZEN ─────────────────────────────────────────────────────────
 *
 * `label`, `cells` and `fallback` were captured once, at mount, behind an empty
 * dependency list. Only `model` ever reached the grid again. So changing a cell
 * renderer — which is exactly what a role or permission change does — left the
 * old one mounted, rendering a value the new policy says to mask. Changing the
 * accessible label did nothing at all.
 *
 * Several renderer capabilities had no prop either: `rowHeight`, `overscan`,
 * `pageRows`, `keymap`, `span`. A React consumer could not configure a grid
 * that an Angular or custom-element consumer could.
 *
 * And `applyTransaction` — the one a monitoring feed needs — was unreachable.
 */
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GridViewModel, CellRenderer } from "@oxygenui-design/grid-dom";
import { DataGrid, type DataGridHandle } from "./index.js";

interface P { readonly id: string; readonly name: string }

const model = (rows = 3): GridViewModel<P> => ({
  columns: [{ key: "name", header: "Patient" }],
  rows: Array.from({ length: rows }, (_, i) => ({ id: `p${i}`, row: { id: `p${i}`, name: `Patient ${i}` }, index: i })),
  total: rows, sort: [], selection: [], focus: null,
});

/** A cell renderer that stamps whatever text it was built with. */
const stamping = (text: string): CellRenderer<P> => ({
  mount: (el) => { el.textContent = text; },
  update: (el) => { el.textContent = text; },
  unmount: () => {},
  measure: () => ({ intrinsic: 0, growable: false }),
  read: () => text,
  compare: () => 0,
  toExport: () => ({ kind: "value", value: text }),
  toPrint: () => ({ kind: "value", value: text }),
});

let container: HTMLDivElement;
let root: Root;

const fallback = (row: P) => ({ kind: "text" as const, text: row.name });
const firstCellText = () =>
  container.querySelector('.oxg-body [role="gridcell"]')?.textContent ?? "";
const gridLabel = () => container.querySelector('[role="grid"]')?.getAttribute("aria-label") ?? "";

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("a changed cell renderer reaches the grid", () => {
  it("swaps the renderer, which is what a permission change does", () => {
    act(() => {
      root.render(<DataGrid model={model()} label="g" onAction={() => {}} cells={{ name: stamping("VISIBLE") }} />);
    });
    expect(firstCellText()).toBe("VISIBLE");

    act(() => {
      root.render(<DataGrid model={model()} label="g" onAction={() => {}} cells={{ name: stamping("[withheld]") }} />);
    });
    expect(firstCellText(), "the old renderer stayed mounted after the policy changed").toBe("[withheld]");
  });

  it("swaps the fallback too", () => {
    act(() => {
      root.render(<DataGrid model={model()} label="g" onAction={() => {}} fallback={fallback} />);
    });
    expect(firstCellText()).toBe("Patient 0");

    act(() => {
      root.render(<DataGrid model={model()} label="g" onAction={() => {}} fallback={() => ({ kind: "text", text: "masked" })} />);
    });
    expect(firstCellText()).toBe("masked");
  });
});

describe("a changed label reaches the grid", () => {
  it("renames the grid's accessible name", () => {
    act(() => {
      root.render(<DataGrid model={model()} label="Patient roster" onAction={() => {}} fallback={fallback} />);
    });
    expect(gridLabel()).toBe("Patient roster");

    act(() => {
      root.render(<DataGrid model={model()} label="Discharge list" onAction={() => {}} fallback={fallback} />);
    });
    expect(gridLabel()).toBe("Discharge list");
  });
});

describe("a remount still shows the current model", () => {
  it("does not leave an empty grid waiting for the next model change", () => {
    // The trap in remounting on structural change: the new renderer is built
    // and nothing has rendered into it yet.
    act(() => {
      root.render(<DataGrid model={model(5)} label="a" onAction={() => {}} fallback={fallback} />);
    });
    act(() => {
      root.render(<DataGrid model={model(5)} label="b" onAction={() => {}} fallback={fallback} />);
    });
    expect(container.querySelectorAll('.oxg-body [role="gridcell"]').length).toBeGreaterThan(0);
  });
});

describe("a stable callback identity does NOT remount", () => {
  it("survives an inline arrow function on every render", () => {
    // The whole reason callbacks go through a ref: an inline arrow in the
    // consumer's render would otherwise rebuild the grid on every keystroke,
    // and a rebuild loses focus.
    const cells = { name: stamping("x") };
    act(() => {
      root.render(<DataGrid model={model()} label="g" onAction={() => {}} cells={cells} />);
    });
    const grid = container.querySelector('[role="grid"]');
    act(() => {
      root.render(<DataGrid model={model()} label="g" onAction={() => {}} cells={cells} />);
    });
    expect(container.querySelector('[role="grid"]')).toBe(grid);
  });
});

describe("the structural options that had no prop", () => {
  it("passes rowHeight through", () => {
    act(() => {
      root.render(<DataGrid model={model()} label="g" onAction={() => {}} fallback={fallback} rowHeight={72} />);
    });
    const canvas = container.querySelector(".oxg-canvas") as HTMLElement;
    // Three rows at 72px.
    expect(parseInt(canvas.style.height, 10)).toBe(216);
  });

  it("passes span through, which turns column virtualisation off", () => {
    act(() => {
      root.render(
        <DataGrid model={model()} label="g" onAction={() => {}} fallback={fallback} span={() => 1} />,
      );
    });
    expect(container.querySelector('[role="grid"]')).not.toBeNull();
  });
});

describe("the imperative handle", () => {
  it("reaches applyTransaction, which nothing could before", () => {
    // The renderer coalesces patches to one repaint per frame, so the flush is
    // a rAF callback. `act()` does not run those; stubbing it to fire
    // immediately is what makes the assertion about the transaction rather
    // than about jsdom's scheduler.
    const frames: FrameRequestCallback[] = [];
    const realRaf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = ((fn: FrameRequestCallback) => {
      frames.push(fn);
      return 1;
    }) as typeof globalThis.requestAnimationFrame;

    try {
      const handle = createRef<DataGridHandle<P>>();
      act(() => {
        root.render(<DataGrid model={model()} label="g" onAction={() => {}} fallback={fallback} handle={handle} />);
      });
      expect(handle.current).not.toBeNull();

      act(() => {
        handle.current?.applyTransaction({ update: [{ id: "p0", row: { id: "p0", name: "PATCHED" } }] });
      });
      for (const fn of frames.splice(0)) fn(0);
      expect(firstCellText()).toBe("PATCHED");
    } finally {
      globalThis.requestAnimationFrame = realRaf;
    }
  });

  it("exposes the renderer's element", () => {
    const handle = createRef<DataGridHandle<P>>();
    act(() => {
      root.render(<DataGrid model={model()} label="g" onAction={() => {}} fallback={fallback} handle={handle} />);
    });
    expect(handle.current?.element?.className).toContain("oxg-root");
  });

  it("is null after unmount rather than pointing at a destroyed grid", () => {
    const handle = createRef<DataGridHandle<P>>();
    act(() => {
      root.render(<DataGrid model={model()} label="g" onAction={() => {}} fallback={fallback} handle={handle} />);
    });
    act(() => root.unmount());
    expect(handle.current?.element ?? null).toBeNull();
    act(() => { root = createRoot(container); });
  });
});
