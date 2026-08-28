/**
 * The page the browser harness drives.
 *
 * Deliberately uses `grid-dom` directly rather than an adapter: this measures
 * the renderer, and a React or custom-element wrapper would put someone else's
 * scheduler between the measurement and the thing being measured.
 */
import {
  createClientRowModel,
  initialState,
  sortRows,
  type Comparator,
  type GridState,
} from "@oxygenui-design/grid-core";
import { createGridRenderer, type GridRenderer, type GridViewModel } from "@oxygenui-design/grid-dom";

interface P {
  readonly id: string;
  readonly name: string;
  readonly ward: string;
  readonly k: number | null;
}

const WARDS = ["A", "B", "C", "D", "E"];

function makeRows(n: number): P[] {
  const rows = new Array<P>(n);
  for (let i = 0; i < n; i++) {
    rows[i] = {
      id: `p${i}`,
      name: `Patient ${(i * 7919) % n}`,
      ward: WARDS[i % WARDS.length] as string,
      k: i % 13 === 0 ? null : 3 + ((i * 37) % 40) / 10,
    };
  }
  return rows;
}

const get = (row: P, key: string) => (row as unknown as Record<string, unknown>)[key];
const comparators: Record<string, Comparator<P>> = {
  name: (a, b) => a.name.localeCompare(b.name),
  k: (a, b) => (a.k === null || b.k === null ? "incomparable" : a.k - b.k),
};

const columns = [
  { key: "name", header: "Patient", sortable: true, width: 240 },
  { key: "ward", header: "Ward", sortable: true, width: 100 },
  { key: "k", header: "Potassium", sortable: true, width: 140 },
];

const fallback = (row: P, key: string) => ({ kind: "text" as const, text: String(get(row, key) ?? "") });

interface Harness {
  mount(n: number): number;
  sort(): number;
  filterKeystroke(term: string): number;
  scroll(steps: number): { p50: number; p95: number; longFrames: number };
  heapMb(): number | null;
  teardown(): void;
}

/** One frame boundary — the point at which the browser has actually painted. */
const nextPaint = (): Promise<number> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve(performance.now())));

declare global {
  interface Window {
    harness: Harness;
    ready: boolean;
  }
}

let renderer: GridRenderer<P> | null = null;
let source: P[] = [];
let state: GridState = initialState();
let host: HTMLElement | null = null;

function viewModel(rows: readonly P[]): GridViewModel<P> {
  return {
    columns,
    rows: rows.map((row, index) => ({ id: row.id, row, index })),
    total: rows.length,
    sort: state.sort,
    selection: [],
    focus: null,
  };
}

window.harness = {
  mount(n) {
    renderer?.destroy();
    host?.remove();
    host = document.createElement("div");
    host.style.cssText = "height:600px;width:900px";
    document.body.append(host);

    source = makeRows(n);
    state = initialState();
    renderer = createGridRenderer<P>(host, {
      label: "Patient roster",
      onAction: () => {},
      fallback,
      rowHeight: 40,
    });

    const started = performance.now();
    renderer.render(viewModel(source));
    return performance.now() - started;
  },

  sort() {
    state = { ...state, sort: [{ key: "name", direction: "asc" }] };
    const started = performance.now();
    const sorted = sortRows(source, state.sort, comparators).rows;
    renderer?.render(viewModel(sorted));
    return performance.now() - started;
  },

  /** One keystroke in a quick filter: filter, then repaint. */
  filterKeystroke(term) {
    const model = createClientRowModel({
      rows: source,
      rowKey: (r) => r.id,
      get,
      maxRows: Number.MAX_SAFE_INTEGER,
    });
    const started = performance.now();
    model.setState({ ...state, filter: { kind: "text", key: "name", op: "contains", value: term } });
    const rows = model.result().rows.map((r) => r.row);
    renderer?.render(viewModel(rows));
    return performance.now() - started;
  },

  scroll(steps) {
    const viewport = host?.querySelector<HTMLElement>(".oxg-viewport");
    if (!viewport) return { p50: 0, p95: 0, longFrames: 0 };
    const frames: number[] = [];
    let last = performance.now();
    let i = 0;

    return new Promise<{ p50: number; p95: number; longFrames: number }>((resolve) => {
      const step = (): void => {
        if (i >= steps) {
          frames.sort((a, b) => a - b);
          const at = (q: number) => frames[Math.min(frames.length - 1, Math.floor(frames.length * q))] ?? 0;
          resolve({
            p50: at(0.5),
            p95: at(0.95),
            // 16.7 ms is one frame at 60 fps. Anything longer is a dropped frame.
            longFrames: frames.filter((f) => f > 16.7).length,
          });
          return;
        }
        viewport.scrollTop += 320;
        viewport.dispatchEvent(new Event("scroll"));
        requestAnimationFrame(() => {
          const now = performance.now();
          frames.push(now - last);
          last = now;
          i++;
          step();
        });
      };
      requestAnimationFrame(() => {
        last = performance.now();
        step();
      });
    }) as unknown as { p50: number; p95: number; longFrames: number };
  },

  heapMb() {
    const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    return memory ? memory.usedJSHeapSize / 1024 / 1024 : null;
  },

  teardown() {
    renderer?.destroy();
    renderer = null;
    host?.remove();
    host = null;
    source = [];
  },
};

void nextPaint;
window.ready = true;
