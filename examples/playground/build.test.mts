/**
 * The build-time transforms.
 *
 * Both of these shipped faults that no test could have missed and no visual
 * check could have caught, because the output only misbehaves once published:
 *
 *   · `liftDesignSystem` brace-matches to find each rule's extent, and the
 *     brief documents its own CSS in prose containing `{ }`. Five whole @media
 *     blocks vanished, the design system's dark override among them, and the
 *     demo rendered dark ink on light rules.
 *
 *   · `composePage` matched a literal `<body>` after the tag gained a class
 *     (so `indexOf` returned -1), and dropped the namespace class that the
 *     entire lifted stylesheet is scoped to. It published 162 kB of CSS that
 *     could not match a single element.
 *
 * Both are pure now, which is the point: every one of those was a decision,
 * not a file read.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { liftDesignSystem } from "./build.mjs";
import { composePage } from "./artifact.mjs";

const wrap = (css: string) => `<html><head><style>${css}</style></head><body></body></html>`;

/** Braces must balance, or the sheet is silently truncated by the parser. */
function balance(css: string): { depth: number; wentNegative: boolean } {
  let depth = 0;
  let wentNegative = false;
  for (const ch of css) {
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth < 0) wentNegative = true;
    }
  }
  return { depth, wentNegative };
}

describe("liftDesignSystem", () => {
  it("keeps rules that already carry the namespace", () => {
    const { css } = liftDesignSystem(wrap(".antd .dgt th { color: red; }"));
    expect(css).toContain(".antd .dgt th");
    expect(css).toContain("color: red");
  });

  it("namespaces a bare class rule so it cannot capture the host page", () => {
    // `.cov` and `.stage` are bare in the brief and collide with the
    // playground's own class names.
    const { css } = liftDesignSystem(wrap(".cov { color: red; }"));
    expect(css).toContain(".antd .cov");
    expect(css).not.toMatch(/^\.cov\s*\{/m);
  });

  it("drops element-only rules, which are the document's prose", () => {
    const { css } = liftDesignSystem(wrap("body { margin: 4rem; } h1 { font-size: 3rem; }"));
    expect(css).not.toContain("margin: 4rem");
    expect(css).not.toContain("font-size: 3rem");
  });

  it("namespaces every part of a comma-separated selector", () => {
    const { css } = liftDesignSystem(wrap(".a, .b { color: red; }"));
    expect(css).toContain(".antd .a");
    expect(css).toContain(".antd .b");
  });

  it("survives a comment containing braces", () => {
    // THE REGRESSION. The brief writes `.tile.crit { border-color: currentColor }`
    // inside a comment; those braces were counted and the parser lost its place.
    const { css } = liftDesignSystem(
      wrap(`
        /*  documented as \`.tile.crit { border-color: currentColor }\` — */
        .kept-after-comment { color: red; }
      `),
    );
    expect(css).toContain(".antd .kept-after-comment");
    expect(balance(css).depth).toBe(0);
  });

  it("keeps an @media block that follows a comment containing braces", () => {
    // The precise shape of the loss: five @media blocks, including the dark
    // override, sat after prose like this.
    const { css } = liftDesignSystem(
      wrap(`
        /* an example: \`.x { color: blue }\` */
        @media (prefers-color-scheme: dark) {
          .antd { --line: #1E2C2A; }
        }
      `),
    );
    expect(css).toContain("@media (prefers-color-scheme: dark)");
    expect(css).toContain("--line: #1E2C2A");
  });

  it("keeps @media blocks whole and namespaces the rules inside them", () => {
    const { css } = liftDesignSystem(
      wrap("@media (min-width: 40em) { .card { padding: 2px; } p { margin: 0; } }"),
    );
    expect(css).toContain("@media (min-width: 40em)");
    expect(css).toContain(".antd .card");
    // The prose rule inside the block is dropped like any other.
    expect(css).not.toContain("margin: 0");
    expect(balance(css).depth).toBe(0);
  });

  it("drops an @media block whose every rule is prose", () => {
    const { css } = liftDesignSystem(wrap("@media print { body { color: black; } }"));
    expect(css).not.toContain("@media print");
  });

  it("keeps :root token blocks, which everything else resolves against", () => {
    const { css } = liftDesignSystem(wrap(':root[data-theme="dark"] .antd { --ink: #fff; }'));
    expect(css).toContain("--ink: #fff");
  });

  it("reads every <style> block, not only the first", () => {
    const two = "<html><head><style>.a{color:red}</style><style>.b{color:blue}</style></head></html>";
    const { css } = liftDesignSystem(two);
    expect(css).toContain(".antd .a");
    expect(css).toContain(".antd .b");
  });

  it("returns balanced CSS for a document with none", () => {
    const { css, rules } = liftDesignSystem("<html><body>no styles</body></html>");
    expect(rules).toHaveLength(0);
    expect(balance(css).depth).toBe(0);
  });

  it("labels its output as generated", () => {
    const { css } = liftDesignSystem(wrap(".antd .x { color: red; }"));
    expect(css).toContain("GENERATED");
  });
});

describe("liftDesignSystem against the real brief", () => {
  const brief = readFileSync(
    fileURLToPath(new URL("../../docs/research/2026-08-27-product-brief.html", import.meta.url)),
    "utf8",
  );
  const { css, rules } = liftDesignSystem(brief);

  it("produces balanced CSS", () => {
    const { depth, wentNegative } = balance(css);
    expect(depth).toBe(0);
    expect(wentNegative).toBe(false);
  });

  it("lifts the whole design system, not a fragment of it", () => {
    expect(rules.length).toBeGreaterThan(1000);
  });

  it("carries every media block the source has", () => {
    // The count is the regression guard: it silently fell to 26 of 31.
    const inSource = (brief.match(/@media/g) ?? []).length;
    const inOutput = (css.match(/@media/g) ?? []).length;
    expect(inOutput).toBeGreaterThanOrEqual(inSource - 1);
  });

  it.each([
    ["the grid shell", ".antd .dg {"],
    ["header cells", ".antd .dgt th"],
    ["body cells", ".antd .dgt td"],
    ["the identity cell", ".antd .idc"],
    ["status pills", ".antd .cs"],
    ["tags", ".antd .a-tag"],
    ["buttons", ".antd .a-btn"],
    ["the coverage bar", ".antd .cov"],
  ])("carries %s", (_what, selector) => {
    expect(css).toContain(selector);
  });

  it.each([
    ["light rules", "#E4EAE8"],
    ["dark rules", "#1E2C2A"],
    ["dark sunken", "#0A1211"],
  ])("carries the %s token", (_what, value) => {
    // Both themes, or the demo renders one theme's ink on the other's ground.
    expect(css).toContain(value);
  });

  it("leaves no bare mockup selector able to capture the host page", () => {
    const bare = [...css.matchAll(/^(\.[a-zA-Z][\w-]*)[^{]*\{/gm)]
      .map((m) => m[1] ?? "")
      .filter((sel) => sel !== "" && sel !== ".antd" && !sel.startsWith(".ox"));
    expect(bare).toEqual([]);
  });
});

describe("composePage", () => {
  const html = `<!doctype html>
<html lang="en">
<head><title>x</title><link rel="stylesheet" href="./style.css" /></head>
<body class="antd">
<h1>Demo</h1>
<script type="module" src="./main.js"></script>
</body>
</html>`;

  // Built per test, not once at describe level: a throw during collection
  // fails the whole FILE with "no tests", which names nothing.
  const make = () => composePage({ html, css: ".antd .dg { color: red; }", js: "console.log(1);" });

  it("finds the body when the opening tag carries attributes", () => {
    // THE REGRESSION: matching a literal `<body>` returned -1 once the tag
    // gained a class, and the slice ran from the wrong end of the document.
    expect(make()).toContain("<h1>Demo</h1>");
  });

  it("carries the namespace class onto a wrapper element", () => {
    // The host writes its own <body>, discarding ours — and the entire lifted
    // stylesheet is scoped to this class. Without the wrapper, nothing matches.
    expect(make()).toContain('<div class="antd">');
  });

  it("re-aims the page's own body rules at that wrapper", () => {
    expect(make()).toContain(".antd { height: 100%; }");
  });

  it("inlines the stylesheet and the script", () => {
    expect(make()).toContain(".antd .dg { color: red; }");
    expect(make()).toContain("console.log(1);");
  });

  it("drops the module script that pointed at a file the artifact cannot fetch", () => {
    expect(make()).not.toContain('src="./main.js"');
  });

  it("emits no document wrapper, which the host supplies", () => {
    // Outside the <style> block: `html, body { … }` is a selector and the
    // comment above it mentions <body>, and neither is a document tag.
    const markup = make().replace(/<style>[\s\S]*?<\/style>/g, "");
    expect(markup).not.toMatch(/<!doctype/i);
    expect(markup).not.toMatch(/<html[\s>]/i);
    expect(markup).not.toMatch(/<head[\s>]/i);
    expect(markup).not.toMatch(/<body[\s>]/i);
  });

  it("carries a title, which names the artifact in the gallery", () => {
    expect(make()).toContain("<title>Oxygen Data Grid</title>");
    expect(composePage({ html, css: "", js: "", title: "Other" })).toContain("<title>Other</title>");
  });

  it("references no external host but the font service", () => {
    const hosts = [...make().matchAll(/https?:\/\/([^/"']+)/g)].map((m) => m[1]);
    expect(new Set(hosts)).toEqual(new Set(["fonts.googleapis.com", "fonts.gstatic.com"]));
  });

  it("works when the body has no class at all", () => {
    const plain = composePage({
      html: "<html><body><p>hi</p></body></html>",
      css: "",
      js: "",
    });
    expect(plain).toContain("<p>hi</p>");
    expect(plain).toContain("<div>");
    expect(plain).not.toContain('class=""');
  });

  it("refuses a document it cannot read rather than emitting a broken page", () => {
    // Silently producing garbage is how the first two faults reached publish.
    expect(() => composePage({ html: "<p>no body</p>", css: "", js: "" })).toThrow(/<body>/);
    expect(() => composePage({ html: "<body>unclosed", css: "", js: "" })).toThrow(/<\/body>/);
  });
});
