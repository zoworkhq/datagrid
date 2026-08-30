// @vitest-environment jsdom
/**
 * Every advertised binding does something.
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 *
 * `DEFAULT_KEYMAP` declares each binding with a `description` — the kind of
 * sentence a keyboard-shortcuts dialog renders. Seven of them were declared,
 * described, and wired to nothing: Control+A left the selection at one row,
 * Control+Shift+ArrowRight left the column at its width, F2 opened no editor.
 * A shortcut a grid advertises and does not honour is worse than one it never
 * mentions, because the user concludes the grid is broken rather than that the
 * feature is absent.
 *
 * So the load-bearing test here is the LAST one: every id in the keymap is
 * either a movement or produces an action. A binding added later without a
 * handler fails this file rather than shipping described-but-dead.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_KEYMAP, COLUMN_RESIZE_STEP, MIN_COLUMN_WIDTH, type GridAction,
} from "@oxygenui-design/grid-core";
import { createGridRenderer, HEADER_ROW_ID, type GridViewModel } from "./renderer.js";
import { moveForBinding } from "./keyboard.js";

interface P { readonly id: string; readonly name: string; readonly k: string }

const ROWS = ["p1", "p2", "p3", "p4"];

const model = (over: Partial<GridViewModel<P>> = {}): GridViewModel<P> => ({
  columns: [
    { key: "name", header: "Patient", sortable: true, width: 160 },
    { key: "k", header: "Potassium", sortable: true },
  ],
  rows: ROWS.map((id, index) => ({ id, row: { id, name: `Patient ${index}`, k: "3.7" }, index })),
  total: ROWS.length,
  sort: [],
  selection: [],
  focus: null,
  ...over,
});

let host: HTMLElement;
let actions: GridAction[];

const fallback = (row: P, key: string) => ({ kind: "text" as const, text: String(row[key as keyof P] ?? "") });

const mount = (m = model()) => {
  const r = createGridRenderer<P>(host, {
    label: "Roster", onAction: (a) => actions.push(a), fallback,
  });
  r.render(m);
  return r;
};

/** Fires the chord at the grid, the way a real key press arrives. */
const press = (keys: string, target: Element | null): void => {
  const parts = keys.split("+");
  const key = parts[parts.length - 1] as string;
  target?.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: key === "Space" ? " " : key,
      ctrlKey: parts.includes("Control"),
      shiftKey: parts.includes("Shift"),
      altKey: parts.includes("Alt"),
      metaKey: parts.includes("Meta"),
      bubbles: true,
      cancelable: true,
    }),
  );
};

const bodyCell = (rowId: string, columnKey = "name") =>
  host.querySelector(`[data-row-id="${rowId}"] [data-col-key="${columnKey}"]`);
const header = (columnKey: string) =>
  host.querySelector(`[data-row-id="${HEADER_ROW_ID}"] [data-col-key="${columnKey}"]`);

beforeEach(() => {
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.append(host);
  actions = [];
});

describe("bindings that had no handler", () => {
  it("Control+A asks for every row", () => {
    mount(model({ focus: { rowId: "p2", columnKey: "name" } }));
    press("Control+a", bodyCell("p2"));
    expect(actions).toContainEqual({ type: "select/all" });
  });

  it("F2 names the cell to edit, and does not open one itself", () => {
    mount(model({ focus: { rowId: "p3", columnKey: "k" } }));
    press("F2", bodyCell("p3", "k"));
    expect(actions).toContainEqual({ type: "edit/begin", rowId: "p3", columnKey: "k" });
    // The grid does not own the editor: no input appears from a key press.
    expect(host.querySelector("input,textarea,[contenteditable]")).toBeNull();
  });

  it("Alt+ArrowDown on a header asks for that column's menu", () => {
    mount(model({ focus: { rowId: HEADER_ROW_ID, columnKey: "k" } }));
    press("Alt+ArrowDown", header("k"));
    expect(actions).toContainEqual({ type: "column/menu", key: "k" });
  });

  it("Shift+ArrowDown selects both ends and carries focus with it", () => {
    mount(model({ focus: { rowId: "p1", columnKey: "name" } }));
    press("Shift+ArrowDown", bodyCell("p1"));
    expect(actions).toContainEqual({ type: "select/range", from: "p1", to: "p2" });
    // Focus moved too, so holding the chord keeps extending.
    expect(actions).toContainEqual({ type: "focus/cell", rowId: "p2", columnKey: "name" });
  });

  it("Shift+ArrowUp at the top row does nothing rather than selecting the header", () => {
    mount(model({ focus: { rowId: "p1", columnKey: "name" } }));
    press("Shift+ArrowUp", bodyCell("p1"));
    // Arrowing up from row 1 reaches the header, which is not a row to select.
    expect(actions.filter((a) => a.type === "select/range")).toHaveLength(0);
  });

  it("Shift+Space extends from the last selected row to this one", () => {
    mount(model({ selection: ["p1"], focus: { rowId: "p3", columnKey: "name" } }));
    press("Shift+Space", bodyCell("p3"));
    expect(actions).toContainEqual({ type: "select/range", from: "p1", to: "p3" });
  });

  it("Shift+Space with nothing selected toggles, rather than a range of one", () => {
    mount(model({ focus: { rowId: "p3", columnKey: "name" } }));
    press("Shift+Space", bodyCell("p3"));
    expect(actions).toContainEqual({ type: "select/toggle", id: "p3" });
  });

  it("Control+Shift+ArrowRight widens by a step from the declared width", () => {
    mount(model({ focus: { rowId: HEADER_ROW_ID, columnKey: "name" } }));
    press("Control+Shift+ArrowRight", header("name"));
    expect(actions).toContainEqual({ type: "column/resize", key: "name", width: 160 + COLUMN_RESIZE_STEP });
  });

  it("Control+Shift+ArrowLeft narrows, and stops at a width that can still show a value", () => {
    mount(model({ columns: [{ key: "name", header: "Patient", width: MIN_COLUMN_WIDTH + 4 }],
                  focus: { rowId: HEADER_ROW_ID, columnKey: "name" } }));
    press("Control+Shift+ArrowLeft", header("name"));
    expect(actions).toContainEqual({ type: "column/resize", key: "name", width: MIN_COLUMN_WIDTH });
  });

  it("a header binding does nothing in the body, and the reverse", () => {
    mount(model({ focus: { rowId: "p2", columnKey: "name" } }));
    press("Alt+ArrowDown", bodyCell("p2"));
    press("Control+Shift+ArrowRight", bodyCell("p2"));
    expect(actions.filter((a) => a.type === "column/menu" || a.type === "column/resize")).toHaveLength(0);
  });
});

describe("the keymap and the renderer agree", () => {
  /**
   * The one that catches the next omission.
   *
   * Every binding is a movement, or it emits. Add a binding to DEFAULT_KEYMAP
   * without wiring it and this fails, naming it — which is what nobody did the
   * last seven times.
   */
  it("every advertised binding is a movement or produces an action", () => {
    const dead: string[] = [];

    for (const binding of DEFAULT_KEYMAP) {
      if (moveForBinding(binding)) continue; // movement, handled by focus

      document.body.innerHTML = "";
      host = document.createElement("div");
      document.body.append(host);
      actions = [];

      const inHeader = binding.context === "header";
      const focus = inHeader
        ? { rowId: HEADER_ROW_ID, columnKey: "name" }
        : { rowId: "p2", columnKey: "name" };
      // Something selected, so a range binding has an anchor to work from.
      mount(model({ focus, selection: ["p1"] }));
      press(binding.keys, inHeader ? header("name") : bodyCell("p2"));

      if (actions.length === 0) dead.push(`${binding.id} (${binding.keys}) — "${binding.description}"`);
    }

    expect(dead, `advertised in DEFAULT_KEYMAP and wired to nothing:\n  ${dead.join("\n  ")}`).toEqual([]);
  });
});
