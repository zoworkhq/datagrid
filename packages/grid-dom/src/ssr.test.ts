// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { createGridRenderer, type GridViewModel } from "./renderer.js";
import { escapeAttr, escapeText, hydrationNotes, renderToString } from "./ssr.js";

interface P {
  readonly id: string;
  readonly name: string;
  readonly note: string;
}

const ROWS = 500;
const all: P[] = Array.from({ length: ROWS }, (_, i) => ({
  id: `p${i}`,
  name: `Patient ${i}`,
  note: i === 3 ? '<script>alert("x")</script> & "quoted"' : "stable",
}));

const model = (over: Partial<GridViewModel<P>> = {}): GridViewModel<P> => ({
  columns: [
    { key: "name", header: "Patient", sortable: true },
    { key: "note", header: "Note" },
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

let host: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.append(host);
});

const serverRender = (m = model(), firstPage = 30): void => {
  host.innerHTML = renderToString(m, { label: "Patient roster", firstPage, fallback });
};

describe("the server-rendered first page", () => {
  it("renders the first page only, never the whole set", () => {
    // A server-rendered 40,000-row table is a slower page than no table.
    serverRender(model(), 30);
    expect(host.querySelectorAll('.oxg-body [role="row"]')).toHaveLength(30);
  });

  it("tells the truth about the whole set while showing part of it", () => {
    serverRender();
    const grid = host.querySelector('[role="grid"]') as HTMLElement;
    expect(grid.getAttribute("aria-rowcount")).toBe(String(ROWS));
    expect(host.querySelector<HTMLElement>(".oxg-canvas")?.style.height).toBe(`${ROWS * 40}px`);
  });

  it('reports aria-rowcount="-1" when the source does not know the total', () => {
    serverRender(model({ total: "unknown" }));
    expect(host.querySelector('[role="grid"]')?.getAttribute("aria-rowcount")).toBe("-1");
  });

  it("is one tab stop before any JavaScript runs", () => {
    // Otherwise the first Tab press before hydration goes somewhere different
    // from the first Tab press after it.
    serverRender();
    expect(host.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
  });

  it("carries absolute row indices", () => {
    serverRender();
    const rows = host.querySelectorAll('.oxg-body [role="row"]');
    expect(rows[0]?.getAttribute("aria-rowindex")).toBe("2"); // header is 1
    expect(rows[29]?.getAttribute("aria-rowindex")).toBe("31");
  });

  it("escapes hostile content in a note field", () => {
    serverRender();
    const html = host.innerHTML;
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    // The note is rendered as text, and reads back as exactly what was stored.
    const cell = host.querySelector('[data-row-id="p3"] [data-col-key="note"]');
    expect(cell?.textContent).toBe('<script>alert("x")</script> & "quoted"');
  });

  it("escapes attributes as well as text", () => {
    expect(escapeAttr('a"b<c&d')).toBe("a&quot;b&lt;c&amp;d");
    expect(escapeText("<b>&</b>")).toBe("&lt;b&gt;&amp;&lt;/b&gt;");
  });
});

describe("structural identity with the client renderer", () => {
  /** Attributes that carry the accessibility and identity contract. */
  const shape = (scope: ParentNode): string[] =>
    Array.from(scope.querySelectorAll("[role]")).map((el) =>
      [
        el.getAttribute("role"),
        el.getAttribute("aria-rowindex") ?? "",
        el.getAttribute("aria-colindex") ?? "",
        el.getAttribute("aria-rowcount") ?? "",
        el.getAttribute("aria-selected") ?? "",
        el.getAttribute("tabindex") ?? "",
        (el as HTMLElement).dataset["rowId"] ?? "",
        (el as HTMLElement).dataset["colKey"] ?? "",
      ].join("|"),
    );

  it("produces the same accessibility tree as a client render of the same model", () => {
    // This is what makes the handoff safe: if the two disagree, hydration is a
    // mismatch and the first paint moves under the reader.
    const m = model({ selection: ["p2"], sort: [{ key: "name", direction: "asc" }] });

    const serverHost = document.createElement("div");
    document.body.append(serverHost);
    serverHost.innerHTML = renderToString(m, { label: "Patient roster", firstPage: 18, fallback });

    const clientHost = document.createElement("div");
    document.body.append(clientHost);
    const r = createGridRenderer<P>(clientHost, {
      label: "Patient roster",
      onAction: () => {},
      fallback,
      rowHeight: 40,
      overscan: 4,
    });
    const viewport = clientHost.querySelector<HTMLElement>(".oxg-viewport") as HTMLElement;
    // 18 rows at 40px, minus the trailing overscan the client adds.
    Object.defineProperty(viewport, "clientHeight", { value: 14 * 40, configurable: true });
    r.render(m);

    expect(shape(serverHost)).toEqual(shape(clientHost));
    r.destroy();
  });
});

describe("phase 2 — the client adopts the server markup", () => {
  it("reuses the server's nodes instead of replacing them", () => {
    serverRender(model(), 20);
    const before = Array.from(host.querySelectorAll('.oxg-body [role="row"]'));
    const root = host.querySelector(".oxg-root");

    const r = createGridRenderer<P>(host, {
      label: "Patient roster",
      onAction: () => {},
      fallback,
      rowHeight: 40,
    });
    const viewport = host.querySelector<HTMLElement>(".oxg-viewport") as HTMLElement;
    Object.defineProperty(viewport, "clientHeight", { value: 600, configurable: true });
    r.render(model());

    expect(host.querySelectorAll(".oxg-root")).toHaveLength(1);
    expect(host.querySelector(".oxg-root")).toBe(root);
    const after = Array.from(host.querySelectorAll('.oxg-body [role="row"]'));
    for (const node of after) expect(before).toContain(node); // adopted, not rebuilt
    r.destroy();
  });

  it("does not rebuild a header whose columns already match", () => {
    serverRender();
    const header = host.querySelector('.oxg-head [role="row"]');
    const r = createGridRenderer<P>(host, { label: "Patient roster", onAction: () => {}, fallback });
    r.render(model());
    expect(host.querySelector('.oxg-head [role="row"]')).toBe(header);
    r.destroy();
  });

  it("still shows the right data in every adopted row", () => {
    serverRender(model(), 20);
    const r = createGridRenderer<P>(host, { label: "g", onAction: () => {}, fallback, rowHeight: 40 });
    const viewport = host.querySelector<HTMLElement>(".oxg-viewport") as HTMLElement;
    Object.defineProperty(viewport, "clientHeight", { value: 600, configurable: true });
    r.render(model());
    for (const row of host.querySelectorAll<HTMLElement>('.oxg-body [role="row"]')) {
      const id = row.dataset["rowId"] as string;
      const source = all[Number(id.slice(1))] as P;
      expect(row.querySelector('[data-col-key="name"]')?.textContent).toBe(source.name);
    }
    r.destroy();
  });

  it("never adopts a root a live renderer already owns", () => {
    // Two renderers sharing one tree would recycle each other's rows.
    const first = createGridRenderer<P>(host, { label: "a", onAction: () => {}, fallback });
    first.render(model());
    const second = createGridRenderer<P>(host, { label: "b", onAction: () => {}, fallback });
    second.render(model());
    expect(host.querySelectorAll(".oxg-root")).toHaveLength(2);
    first.destroy();
    second.destroy();
  });
});

describe("the documented handoff", () => {
  it("says what differs between the phases, and what does not", () => {
    expect(hydrationNotes.whatDiffers).toContain("framework component");
    expect(hydrationNotes.reactNote).toContain("dangerouslySetInnerHTML");
    expect(hydrationNotes.withoutJavaScript).toContain("does not pretend otherwise");
  });
});
