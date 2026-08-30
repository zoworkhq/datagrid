// @vitest-environment jsdom
/**
 * The Angular adapter, mounted.
 *
 * ── WHAT THIS CLOSES ────────────────────────────────────────────────────────
 *
 * The cross-adapter parity harness covers React and the custom element. This
 * package's only test was a source-level check that it reimplements none of the
 * grid's vocabulary — a good check, and one that never MOUNTS the directive. Its
 * accessibility tree was therefore never compared with anyone else's, and the
 * README said so.
 *
 * Two things made mounting it awkward, and both have plain answers:
 *
 *   · `ng-packagr` emits PARTIAL declarations (`ɵɵngDeclareDirective`), meant to
 *     be linked at the consumer's build. Importing `@angular/compiler` links
 *     them at runtime instead, which is what a JIT consumer does anyway.
 *   · The source uses `@Directive` syntax, which vitest's transform does not
 *     enable. So this imports the BUILT package — which is what a consumer
 *     imports — and applies its own decorator by CALL rather than by `@`,
 *     because a decorator is a function and the call is identical.
 *
 * The claim under test is the adapter's whole purpose: its DOM is the
 * framework-free renderer's DOM, attribute for attribute.
 */
import "@angular/compiler";
import { Component, provideZonelessChangeDetection, signal, type WritableSignal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { BrowserTestingModule, platformBrowserTesting } from "@angular/platform-browser/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GridAction, GridError } from "@oxygenui-design/grid-core";
import { createGridRenderer, type CellContent, type CellRenderer, type GridViewModel } from "@oxygenui-design/grid-dom";
import { OxDataGrid } from "@oxygenui-design/grid-angular";

interface P { readonly id: string; readonly name: string; readonly k: string }

const ROWS = 12;
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

const fallback = (row: P, key: string): CellContent => ({
  kind: "text",
  text: String(row[key as keyof P] ?? ""),
});

/** The same serialiser the React / custom-element harness uses. */
function tree(scope: ParentNode): string[] {
  return Array.from(scope.querySelectorAll("[role]")).map((el) => {
    const aria = Array.from(el.attributes)
      .filter((a) => a.name === "role" || a.name === "tabindex" || a.name.startsWith("aria-"))
      .map((a) => `${a.name}=${a.value}`)
      .sort();
    const data = Object.entries((el as HTMLElement).dataset)
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

let actions: GridAction[] = [];
let errors: GridError[] = [];

// ── the host component, without decorator syntax ──────────────────────────
class HostCmp {
  readonly model: WritableSignal<GridViewModel<P>> = signal(model());
  readonly fallback = fallback;
  cells: Readonly<Record<string, CellRenderer<P>>> | undefined = undefined;
  onAction(a: GridAction): void {
    actions.push(a);
  }
  onError(e: GridError): void {
    errors.push(e);
  }
}

const Host = Component({
  standalone: true,
  imports: [OxDataGrid],
  template:
    `<div [oxDataGrid]="'Patient roster'" [model]="model()" [fallback]="fallback" [cells]="cells" ` +
    `(action)="onAction($event)" (gridError)="onError($event)"></div>`,
})(HostCmp) as unknown as typeof HostCmp;

TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());

type Fixture = ReturnType<typeof TestBed.createComponent<HostCmp>>;
let fixture: Fixture | null = null;

/** Mounts through Angular, and hands back the element the grid lives in. */
const mountAngular = (m: GridViewModel<P>): HTMLElement => {
  fixture = TestBed.createComponent(Host);
  fixture.componentInstance.model.set(m);
  fixture.detectChanges();
  const host = fixture.nativeElement as HTMLElement;
  sizeViewport(host);
  fixture.detectChanges();
  return host;
};

/** The same model through the renderer, with nothing in front of it. */
const mountPlain = (m: GridViewModel<P>): { host: HTMLElement; destroy: () => void } => {
  const host = document.createElement("div");
  document.body.append(host);
  const r = createGridRenderer<P>(host, {
    label: "Patient roster",
    onAction: () => {},
    fallback,
  });
  r.render(m);
  sizeViewport(host);
  r.render(m);
  return { host, destroy: () => r.destroy() };
};

beforeEach(() => {
  actions = [];
  errors = [];
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
});

afterEach(() => {
  fixture?.destroy();
  fixture = null;
  TestBed.resetTestingModule();
  document.body.innerHTML = "";
});

describe("the Angular adapter produces the renderer's DOM", () => {
  const CASES: { name: string; model: GridViewModel<P> }[] = [
    { name: "a plain grid", model: model() },
    { name: "a sorted grid", model: model({ sort: [{ key: "k", direction: "desc" }] }) },
    { name: "a grid with a selection", model: model({ selection: ["p2", "p5"] }) },
    { name: "focus inside the body", model: model({ focus: { rowId: "p3", columnKey: "k" } }) },
    { name: "an unknown total", model: model({ total: "unknown" }) },
    { name: "an empty grid", model: model({ rows: [], total: 0 }) },
    { name: "a pinned column", model: model({ columns: [
      { key: "name", header: "Patient", sortable: true, pinned: "start" },
      { key: "k", header: "Potassium", sortable: true },
    ] }) },
  ];

  for (const testCase of CASES) {
    it(`matches, attribute for attribute — ${testCase.name}`, () => {
      const angular = tree(mountAngular(testCase.model));
      const plain = mountPlain(testCase.model);
      const direct = tree(plain.host);
      plain.destroy();

      expect(angular, "the Angular adapter diverged from the framework-free renderer").toEqual(direct);
      expect(angular.length).toBeGreaterThan(0);
    });
  }

  /**
   * Proof the comparison has teeth.
   *
   * Two empty arrays are equal, and a `tree()` that silently returned nothing
   * would make every case above pass while comparing nothing at all. This
   * feeds the two mounts DIFFERENT models and requires them to diverge.
   */
  it("would notice a divergence — the same serialiser separates two models", () => {
    const angular = tree(mountAngular(model()));
    const plain = mountPlain(model({ sort: [{ key: "k", direction: "desc" }] }));
    const direct = tree(plain.host);
    plain.destroy();
    expect(angular.length).toBeGreaterThan(10);
    expect(angular).not.toEqual(direct);
  });

  it("puts exactly one tab stop in the grid", () => {
    const host = mountAngular(model());
    expect(host.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
  });

  it("announces the row count the same way", () => {
    const host = mountAngular(model({ total: "unknown" }));
    expect(host.querySelector('[role="grid"]')?.getAttribute("aria-rowcount")).toBe("-1");
  });
});

describe("the three jobs an adapter has", () => {
  it("routes a keyboard action out through Angular's output", () => {
    const host = mountAngular(model({ focus: { rowId: "p0", columnKey: "name" } }));
    host
      .querySelector('[role="grid"]')
      ?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    expect(actions.at(-1)).toEqual({ type: "focus/cell", rowId: "p1", columnKey: "name" });
  });

  it("routes a pointer action out too", () => {
    const host = mountAngular(model());
    host
      .querySelector<HTMLElement>('[role="columnheader"][data-col-key="k"]')
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(actions).toContainEqual({ type: "sort/toggle", key: "k", additive: false });
  });

  it("routes a renderer error out, carrying no value, rather than throwing", () => {
    const SECRET = "a potassium of 7.9 for Amara Okafor";
    const boom: CellRenderer<P> = {
      mount(): void {
        throw new Error(SECRET);
      },
      update(): void {
        throw new Error(SECRET);
      },
      unmount(): void {},
      measure: () => ({ intrinsic: 0, growable: false }),
      read: () => "",
      compare: () => 0,
      toExport: () => ({ kind: "value", value: null }),
      toPrint: () => ({ kind: "value", value: null }),
    };

    fixture = TestBed.createComponent(Host);
    fixture.componentInstance.cells = { name: boom };
    fixture.componentInstance.model.set(model());
    fixture.detectChanges();

    // The grid survives a cell that throws — it is still there, still usable.
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="grid"]')).not.toBeNull();
    expect(errors.length).toBeGreaterThan(0);

    const first = errors[0];
    expect(first?.code).toBe("renderer-threw");
    expect(first?.columnKey).toBe("name");
    // And it carries NOTHING that could put a patient in a log line: no
    // message, no stack, no row id, no value. Only a row INDEX.
    const serialised = JSON.stringify(errors);
    expect(serialised).not.toContain(SECRET);
    expect(serialised).not.toContain("Okafor");
    expect(serialised).not.toContain("p0");
  });

  it("repaints when the signal changes, without remounting the grid", () => {
    const host = mountAngular(model());
    const gridBefore = host.querySelector('[role="grid"]');
    fixture?.componentInstance.model.set(model({ sort: [{ key: "k", direction: "asc" }] }));
    fixture?.detectChanges();
    expect(host.querySelector('[role="grid"]')).toBe(gridBefore);
    expect(
      host.querySelector('[role="columnheader"][data-col-key="k"]')?.getAttribute("aria-sort"),
    ).toBe("ascending");
  });

  it("tears the grid down on destroy, so it does not leak a grid per route", () => {
    const host = mountAngular(model());
    expect(host.querySelector('[role="grid"]')).not.toBeNull();
    fixture?.destroy();
    fixture = null;
    expect(host.querySelector('[role="grid"]')).toBeNull();
  });
});
