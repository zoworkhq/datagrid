import { describe, expect, it } from "vitest";
import { setCellContent, text, type CellContent } from "./cell.js";

describe("the renderer safety contract", () => {
  it("writes text as text, never as markup", () => {
    const el = { textContent: "", dataset: {} } as unknown as HTMLElement;
    setCellContent(el, text('<img src=x onerror="alert(1)">'));
    expect(el.textContent).toBe('<img src=x onerror="alert(1)">');
  });

  it("has no variant that carries a markup string", () => {
    // @ts-expect-error -- raw HTML is a type error, not a discouraged practice.
    const forbidden: CellContent = { kind: "html", html: "<b>x</b>" };
    expect(forbidden).toBeDefined();
  });
});
