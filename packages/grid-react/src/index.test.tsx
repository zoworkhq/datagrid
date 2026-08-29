// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GridAction } from "@oxygenui-design/grid-core";
import type { GridViewModel } from "@oxygenui-design/grid-dom";
import { DataGrid } from "./index.js";

interface Patient { readonly id: string; readonly name: string }

const model = (rows: number): GridViewModel<Patient> => ({
  columns: [{ key: "name", header: "Patient", sortable: true }],
  rows: Array.from({ length: rows }, (_, i) => ({
    id: `p${i}`,
    row: { id: `p${i}`, name: `Patient ${i}` },
    index: i,
  })),
  total: rows,
  sort: [],
  selection: [],
  focus: null,
});

const fallback = (row: Patient) => ({ kind: "text" as const, text: row.name });

let container: HTMLDivElement;
let root: Root;
let actions: GridAction[];

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  actions = [];
  act(() => {
    root = createRoot(container);
  });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("the React adapter", () => {
  it("mounts the framework-free renderer and produces the same ARIA tree", () => {
    act(() => {
      root.render(
        <DataGrid model={model(3)} label="Patient roster" onAction={(a) => actions.push(a)} fallback={fallback} />,
      );
    });
    expect(container.querySelector('[role="grid"]')?.getAttribute("aria-label")).toBe("Patient roster");
    expect(container.querySelectorAll('[role="gridcell"]')).toHaveLength(3);
    expect(container.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
  });

  it("does not rebuild the renderer when an inline callback changes identity", () => {
    // A consumer writing onAction={(a) => …} inline creates a new function
    // every render. Rebuilding on that would destroy focus on every keystroke.
    const m = model(3);
    act(() => {
      root.render(<DataGrid model={m} label="g" onAction={() => {}} fallback={fallback} />);
    });
    const first = container.querySelector('[role="grid"]');
    act(() => {
      root.render(<DataGrid model={m} label="g" onAction={() => {}} fallback={fallback} />);
    });
    expect(container.querySelector('[role="grid"]')).toBe(first);
  });

  it("routes a keyboard action out to the caller", () => {
    act(() => {
      root.render(
        <DataGrid
          model={{ ...model(3), focus: { rowId: "p0", columnKey: "name" } }}
          label="g"
          onAction={(a) => actions.push(a)}
          fallback={fallback}
        />,
      );
    });
    act(() => {
      container
        .querySelector('[role="grid"]')
        ?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    });
    expect(actions.at(-1)).toEqual({ type: "focus/cell", rowId: "p1", columnKey: "name" });
  });

  it("tears the grid down on unmount", () => {
    act(() => {
      root.render(<DataGrid model={model(2)} label="g" onAction={() => {}} fallback={fallback} />);
    });
    expect(container.querySelector('[role="grid"]')).not.toBeNull();
    act(() => root.unmount());
    expect(container.querySelector('[role="grid"]')).toBeNull();
    act(() => {
      root = createRoot(container); // so afterEach has something to unmount
    });
  });

  /**
   * The mount point must not break the height chain.
   *
   * The renderer fills its host and reads `clientHeight` to decide how many
   * rows to build. A wrapper left at `height: auto` between the caller's laid
   * out element and the grid makes that height unbounded, every row renders,
   * and virtualisation is silently gone — the same defect that once shipped in
   * the playground from `body { height: 100% }` with no height on `html`.
   *
   * jsdom has no layout, so this asserts the STRUCTURE that makes the layout
   * right rather than the resulting height, which jsdom would report as 0
   * whatever we did.
   */
  it("gives its mount point a height, so the grid does not become unbounded", () => {
    act(() => {
      root.render(<DataGrid model={model(2)} label="g" onAction={() => {}} fallback={fallback} />);
    });
    const mount = container.firstElementChild as HTMLElement;
    expect(mount.style.height).toBe("100%");
    // …and the grid really is inside it, so the height is on the right element.
    expect(mount.querySelector('[role="grid"]')).not.toBeNull();
  });

  it("still applies the caller's className to that mount point", () => {
    act(() => {
      root.render(
        <DataGrid model={model(2)} label="g" onAction={() => {}} fallback={fallback} className="ward-grid" />,
      );
    });
    const mount = container.firstElementChild as HTMLElement;
    expect(mount.className).toBe("ward-grid");
    expect(mount.style.height).toBe("100%");
  });
});

describe("the SSR boundary", () => {
  it("React clears server markup in a container it owns -- verified, not assumed", async () => {
    // suppressHydrationWarning only silences the warning; React still deletes
    // children it did not render. This is why ADR 0007 exists, and why the
    // supported adoption path is an app-owned host.
    const { renderToString } = await import("@oxygenui-design/grid-dom");
    const { hydrateRoot } = await import("react-dom/client");
    const m = model(5);
    container.innerHTML = `<div>${renderToString(m, { label: "g", fallback })}</div>`;
    expect(container.querySelector(".oxg-root")).not.toBeNull();

    // React does not merely discard the subtree: it throws a hydration
    // mismatch and falls back to a full client render. Capturing it here
    // rather than letting it escape, because it IS the finding.
    const recoverable: unknown[] = [];
    let hydrated: Root;
    act(() => {
      hydrated = hydrateRoot(
        container,
        <DataGrid model={m} label="g" onAction={() => {}} fallback={fallback} />,
        { onRecoverableError: (e) => recoverable.push(e) },
      );
    });
    expect(recoverable.length).toBeGreaterThan(0);
    // The server subtree is gone, and the renderer built a fresh one.
    expect(container.querySelectorAll(".oxg-root")).toHaveLength(1);
    expect(container.querySelectorAll('.oxg-body [role="row"]')).toHaveLength(5);
    act(() => hydrated.unmount());
    act(() => {
      root = createRoot(container);
    });
  });

  it("adopts the server page when the host is app-owned", async () => {
    const { renderToString } = await import("@oxygenui-design/grid-dom");
    const m = model(5);
    // An element React does not render into, so React never touches it.
    const appHost = document.createElement("div");
    document.body.append(appHost);
    appHost.innerHTML = renderToString(m, { label: "Patient roster", fallback });
    const serverRows = Array.from(appHost.querySelectorAll('.oxg-body [role="row"]'));
    expect(serverRows).toHaveLength(5);

    act(() => {
      root.render(
        <DataGrid model={m} host={appHost} label="Patient roster" onAction={() => {}} fallback={fallback} />,
      );
    });

    expect(appHost.querySelectorAll(".oxg-root")).toHaveLength(1);
    for (const node of appHost.querySelectorAll('.oxg-body [role="row"]')) {
      expect(serverRows).toContain(node); // adopted, not rebuilt
    }
    expect(appHost.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
    expect(container.querySelector(".oxg-root")).toBeNull(); // renders nothing itself
    appHost.remove();
  });
});
