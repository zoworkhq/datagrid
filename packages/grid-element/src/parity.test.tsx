// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GridAction } from "@oxygenui-design/grid-core";
import type { GridViewModel } from "@oxygenui-design/grid-dom";
import { DataGrid } from "@oxygenui-design/grid-react";
import { defineDataGrid, OxDataGridElement } from "./index.js";

/**
 * ── THE CROSS-ADAPTER PARITY TEST ───────────────────────────────────────────
 *
 * ONE assertion over the rendered accessibility tree, run against every
 * adapter. This is the test that makes "an adapter contains no grid logic" an
 * enforceable statement rather than an aspiration — the moment React starts
 * rendering something the custom element does not, or either starts making its
 * own ARIA decisions, the trees diverge and this fails.
 *
 * It is the same construction Oxygen UI already uses in
 * `e2e/bridge-hosts.spec.ts`, which renders one application under antd, MUI and
 * neither and asserts the trees are identical.
 *
 * ── WHAT IT DOES NOT YET COVER ──────────────────────────────────────────────
 *
 * Angular. The custom element and React exercise the same renderer through
 * different MOUNT paths, which catches an adapter that starts rendering on its
 * own. Angular would additionally exercise a different REACTIVITY system
 * against core signals, which is the part that validates the signals choice —
 * and it is the adapter the wave-4 stop condition is written about. Adding it
 * is one more row in ADAPTERS below.
 * ────────────────────────────────────────────────────────────────────────────
 */

interface P {
  readonly id: string;
  readonly name: string;
  readonly k: string;
}

const ROWS = 40;
const all: P[] = Array.from({ length: ROWS }, (_, i) => ({
  id: `p${i}`,
  name: `Patient ${i}`,
  k: (3 + (i % 20) / 10).toFixed(1),
}));

const model = (over: Partial<GridViewModel<P>> = {}): GridViewModel<P> => ({
  columns: [
    { key: "name", header: "Patient", sortable: true },
    { key: "k", header: "Potassium", sortable: true },
  ],
  rows: all.map((row, index) => ({ id: row.id, row, index })),
  total: ROWS,
  sort: [],
  selection: [],
  focus: null,
  ...over,
});

const fallback = (row: P, key: string) => ({
  kind: "text" as const,
  text: String(row[key as keyof P] ?? ""),
});

/**
 * The accessibility tree, as a comparable string.
 *
 * EVERY `aria-*` attribute, enumerated rather than hand-picked. The first
 * version of this listed the attributes it thought mattered, and a deliberate
 * divergence — an adapter setting `aria-readonly` on its own — sailed straight
 * through it. A parity test that compares a chosen subset is a parity test that
 * passes while the adapters disagree.
 */
function tree(scope: ParentNode): string[] {
  return Array.from(scope.querySelectorAll("[role]")).map((el) => {
    const aria = Array.from(el.attributes)
      .filter((a) => a.name === "role" || a.name === "tabindex" || a.name.startsWith("aria-"))
      .map((a) => `${a.name}=${a.value}`)
      .sort();
    const data = Object.entries((el as HTMLElement).dataset)
      // `pinned` and `error` are render state and are compared; nothing here is
      // adapter-specific, so any adapter-added data attribute also shows up.
      .map(([k, v]) => `data-${k}=${v ?? ""}`)
      .sort();
    return [...aria, ...data, `text=${el.textContent?.trim() ?? ""}`].join("|");
  });
}

const VIEWPORT = 600;

function sizeViewport(host: ParentNode): void {
  const v = host.querySelector<HTMLElement>(".oxg-viewport");
  if (v) Object.defineProperty(v, "clientHeight", { value: VIEWPORT, configurable: true });
}

let container: HTMLDivElement;
let root: Root;
let actions: GridAction[];

beforeEach(() => {
  document.body.innerHTML = "";
  container = document.createElement("div");
  document.body.append(container);
  actions = [];
  defineDataGrid();
  act(() => {
    root = createRoot(container);
  });
});
afterEach(() => {
  act(() => root.unmount());
});

/** Each adapter mounts the same model into a fresh host and returns it. */
const ADAPTERS: {
  name: string;
  mount: (m: GridViewModel<P>) => HTMLElement;
  teardown: () => void;
}[] = [
  {
    name: "react",
    mount: (m) => {
      act(() => {
        root.render(
          <DataGrid
            model={m}
            label="Patient roster"
            onAction={(a) => actions.push(a)}
            fallback={fallback}
          />,
        );
      });
      sizeViewport(container);
      act(() => {
        root.render(
          <DataGrid
            model={m}
            label="Patient roster"
            onAction={(a) => actions.push(a)}
            fallback={fallback}
          />,
        );
      });
      return container;
    },
    teardown: () => {},
  },
  {
    name: "element",
    mount: (m) => {
      const host = document.createElement("div");
      document.body.append(host);
      const el = document.createElement("ox-data-grid") as OxDataGridElement<P>;
      el.label = "Patient roster";
      el.fallback = fallback;
      host.append(el); // connectedCallback mounts the renderer
      sizeViewport(el);
      el.model = m;
      el.addEventListener("ox-action", (e) => actions.push((e as CustomEvent<GridAction>).detail));
      return host;
    },
    teardown: () => {},
  },
];

describe("cross-adapter accessibility parity", () => {
  const CASES: { name: string; model: GridViewModel<P> }[] = [
    { name: "a plain grid", model: model() },
    { name: "a sorted grid", model: model({ sort: [{ key: "k", direction: "desc" }] }) },
    { name: "a grid with a selection", model: model({ selection: ["p2", "p5"] }) },
    { name: "focus inside the body", model: model({ focus: { rowId: "p3", columnKey: "k" } }) },
    { name: "an unknown total", model: model({ total: "unknown" }) },
    { name: "an empty grid", model: model({ rows: [], total: 0 }) },
  ];

  for (const testCase of CASES) {
    it(`is identical across adapters — ${testCase.name}`, () => {
      const trees = ADAPTERS.map((adapter) => {
        const host = adapter.mount(testCase.model);
        const out = tree(host);
        adapter.teardown();
        return { name: adapter.name, out };
      });

      const [first, ...rest] = trees;
      for (const other of rest) {
        expect(other.out, `${other.name} diverged from ${first?.name}`).toEqual(first?.out);
      }
      expect(first?.out.length).toBeGreaterThan(0);
    });
  }

  it("puts exactly one tab stop in each adapter", () => {
    for (const adapter of ADAPTERS) {
      const host = adapter.mount(model());
      expect(host.querySelectorAll('[tabindex="0"]'), adapter.name).toHaveLength(1);
    }
  });

  it("routes the same keyboard action out of each adapter", () => {
    // Different mount paths, different event channels — one behaviour.
    for (const adapter of ADAPTERS) {
      actions = [];
      const host = adapter.mount(model({ focus: { rowId: "p0", columnKey: "name" } }));
      host
        .querySelector('[role="grid"]')
        ?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
      expect(actions.at(-1), adapter.name).toEqual({
        type: "focus/cell",
        rowId: "p1",
        columnKey: "name",
      });
    }
  });
});

describe("the custom element itself", () => {
  it("uses light DOM, so tokens cascade and forced-colors inherits", () => {
    const el = document.createElement("ox-data-grid") as OxDataGridElement<P>;
    document.body.append(el);
    expect(el.shadowRoot).toBeNull();
    expect(el.querySelector('[role="grid"]')).not.toBeNull();
    el.remove();
  });

  it("tears the grid down when disconnected", () => {
    const el = document.createElement("ox-data-grid") as OxDataGridElement<P>;
    el.fallback = fallback;
    document.body.append(el);
    el.model = model();
    expect(el.querySelector('[role="grid"]')).not.toBeNull();
    el.remove();
    expect(el.querySelector('[role="grid"]')).toBeNull();
  });

  it("emits errors as events, carrying coordinates and no value", () => {
    const errors: unknown[] = [];
    const el = document.createElement("ox-data-grid") as OxDataGridElement<P>;
    el.fallback = () => {
      throw new Error("Aurelia Marchetti-Okonkwo 4471-882");
    };
    el.addEventListener("ox-error", (e) => errors.push((e as CustomEvent).detail));
    document.body.append(el);
    el.model = model();
    expect(errors.length).toBeGreaterThan(0);
    expect(JSON.stringify(errors)).not.toContain("Aurelia");
    el.remove();
  });

  it("can be defined twice without throwing", () => {
    // Two bundles on one page is a normal state, not an error.
    expect(() => {
      defineDataGrid();
      defineDataGrid();
    }).not.toThrow();
  });
});
