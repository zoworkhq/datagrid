/**
 * @oxygenui-design/grid-angular — the Angular binding.
 *
 * ── THE ADAPTER THAT ACTUALLY TESTS THE CLAIM ───────────────────────────────
 *
 * React and the custom element exercise the same renderer through different
 * MOUNT paths. Angular exercises a different REACTIVITY SYSTEM against core
 * signals, which is the half that validates the reactivity choice — and it is
 * the adapter the wave-4 stop condition is written about:
 *
 *   > If the Angular adapter is larger than ~8 KB or contains any logic the
 *   > React adapter also contains, the abstraction is in the wrong place. Stop
 *   > at one framework and say so.
 *
 * Same three jobs as every adapter, and no fourth:
 *
 *   1. Own the mount point — the host element the directive sits on.
 *   2. Marshal cells into `grid-dom`'s renderer interface.
 *   3. Bridge Angular signals to core signals, in one `effect`.
 *
 * No sorting, no filtering, no ARIA, no keyboard, no virtualisation. The
 * cross-adapter parity test asserts this produces an accessibility tree
 * identical to React's.
 */
import {
  Directive,
  ElementRef,
  effect,
  inject,
  input,
  output,
  type OnDestroy,
} from "@angular/core";
import type { GridAction, GridError } from "@oxygenui-design/grid-core";
import {
  createGridRenderer,
  type CellRenderer,
  type CellContent,
  type GridRenderer,
  type GridViewModel,
} from "@oxygenui-design/grid-dom";

@Directive({
  selector: "[oxDataGrid]",
  standalone: true,
  exportAs: "oxDataGrid",
})
export class OxDataGrid<TRow> implements OnDestroy {
  /** The grid's accessible name. "Patient roster", not "grid". */
  readonly label = input.required<string>({ alias: "oxDataGrid" });
  readonly model = input.required<GridViewModel<TRow>>();
  readonly cells = input<Readonly<Record<string, CellRenderer<TRow>>> | undefined>(undefined);
  readonly fallback = input<((row: TRow, columnKey: string) => CellContent) | undefined>(undefined);
  readonly rowHeight = input<number | undefined>(undefined);

  readonly action = output<GridAction>();
  readonly gridError = output<GridError>();

  readonly #host = inject(ElementRef<HTMLElement>);
  #renderer: GridRenderer<TRow> | null = null;

  constructor() {
    // Job 3, and the whole of it: one effect reading Angular signals and
    // pushing into the framework-free renderer. Angular's own reactivity does
    // the scheduling; this adapter does not schedule anything.
    effect(() => {
      const model = this.model();
      if (!this.#renderer) this.#mount();
      this.#renderer?.render(model);
    });
  }

  #mount(): void {
    const cells = this.cells();
    const fallback = this.fallback();
    const rowHeight = this.rowHeight();

    this.#renderer = createGridRenderer<TRow>(this.#host.nativeElement as HTMLElement, {
      label: this.label(),
      onAction: (a) => this.action.emit(a),
      onError: (e) => this.gridError.emit(e),
      ...(cells ? { cells } : {}),
      ...(fallback ? { fallback } : {}),
      ...(rowHeight !== undefined ? { rowHeight } : {}),
    });
  }

  ngOnDestroy(): void {
    // Every adapter tears down completely; the memory gate asserts this shape
    // for the renderer, and an adapter that forgets leaks a grid per route.
    this.#renderer?.destroy();
    this.#renderer = null;
  }
}
