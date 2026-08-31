/**
 * The renderer's contract.
 *
 * The escaping tests are the ones that matter. Everything else is a convenience
 * that produces ugly output when it breaks; a hole in `escapeHtml` produces a
 * documentation site that runs whatever a contributor pasted into a code fence.
 */
import { describe, expect, it } from "vitest";
import { render, slug, escapeHtml } from "./markdown.mjs";

const html = (md) => render(md).html;

describe("escaping", () => {
  it("escapes the four characters that can end an HTML context", () => {
    expect(escapeHtml(`<&">`)).toBe("&lt;&amp;&quot;&gt;");
  });

  it("does not let raw HTML through a paragraph", () => {
    expect(html("Use <script>alert(1)</script> carefully.")).toContain("&lt;script&gt;");
    expect(html("Use <script>alert(1)</script> carefully.")).not.toContain("<script>");
  });

  it("does not let raw HTML through a code fence", () => {
    const out = html("```html\n<img src=x onerror=alert(1)>\n```");
    expect(out).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(out).not.toContain("<img");
  });

  it("does not let raw HTML through a table cell or a heading", () => {
    expect(html("| a |\n|---|\n| <b>x</b> |")).toContain("&lt;b&gt;");
    expect(html("## <b>x</b>")).toContain("&lt;b&gt;");
  });

  it("refuses a javascript: link but keeps its text", () => {
    const out = html("[click](javascript:alert(1))");
    expect(out).not.toContain("javascript:");
    expect(out).toContain("click");
  });

  it("keeps http, fragment and relative links", () => {
    expect(html("[a](https://x.test)")).toContain('href="https://x.test"');
    expect(html("[b](#frag)")).toContain('href="#frag"');
    expect(html("[c](./other.md)")).toContain('href="./other.html"');
  });
});

describe("blocks", () => {
  it("renders headings with a stable slug and an anchor", () => {
    const out = html("## 3 · Rendering and cells");
    expect(out).toContain('id="3-rendering-and-cells"');
    expect(out).toContain('href="#3-rendering-and-cells"');
  });

  it("collects only h2 and h3 into the outline", () => {
    const { outline } = render("# Title\n\n## Two\n\n### Three\n\n#### Four");
    expect(outline.map((o) => o.text)).toEqual(["Two", "Three"]);
  });

  it("renders a fenced code block with its language and a copy button", () => {
    const out = html("```ts\nconst a = 1;\n```");
    expect(out).toContain('class="lang-ts"');
    expect(out).toContain("const a = 1;");
    expect(out).toContain("<button");
  });

  it("renders a table inside a scroll container", () => {
    const out = html("| a | b |\n|---|---|\n| 1 | 2 |");
    expect(out).toContain('class="tablewrap"');
    expect(out).toContain("<th>a</th>");
    expect(out).toContain("<td>2</td>");
  });

  it("renders both kinds of list", () => {
    expect(html("- one\n- two")).toBe("<ul><li>one</li><li>two</li></ul>");
    expect(html("1. one\n2. two")).toBe("<ol><li>one</li><li>two</li></ol>");
  });

  it("joins a wrapped list item onto one line", () => {
    expect(html("- a sentence that\n  wrapped")).toBe("<ul><li>a sentence that wrapped</li></ul>");
  });

  it("renders a blockquote by rendering its contents", () => {
    expect(html("> **bold** quote")).toBe("<blockquote><p><strong>bold</strong> quote</p></blockquote>");
  });

  it("joins a wrapped paragraph and separates it from the next", () => {
    expect(html("one\ntwo\n\nthree")).toBe("<p>one two</p>\n<p>three</p>");
  });

  it("renders a horizontal rule", () => {
    expect(html("---")).toBe("<hr />");
  });
});

describe("inline", () => {
  it("renders code, bold, italic and links", () => {
    expect(html("`x`")).toContain("<code>x</code>");
    expect(html("**x**")).toContain("<strong>x</strong>");
    expect(html("an *x* here")).toContain("<em>x</em>");
  });

  /**
   * The reason code spans are extracted before anything else. These docs are
   * full of `**` and `[]()` inside backticks, and a renderer that formats them
   * silently rewrites the API it is documenting.
   */
  it("leaves markdown inside a code span alone", () => {
    expect(html("`**not bold**`")).toContain("<code>**not bold**</code>");
    expect(html("`[a](b)`")).toContain("<code>[a](b)</code>");
    expect(html("`a * b`")).toContain("<code>a * b</code>");
  });

  it("does not treat a mid-word asterisk as emphasis", () => {
    expect(html("2*3 and 4*5")).not.toContain("<em>");
  });
});

describe("slug", () => {
  it("is stable across punctuation people actually use in these headings", () => {
    expect(slug("7 · Errors, PHI and export")).toBe("7-errors-phi-and-export");
    expect(slug("`incomparable` is a real answer")).toBe("incomparable-is-a-real-answer");
  });
});
