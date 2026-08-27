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
});
