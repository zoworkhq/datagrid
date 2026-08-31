/**
 * A Markdown renderer for the subset this repository's documentation uses.
 *
 * ── WHY NOT A LIBRARY ───────────────────────────────────────────────────────
 *
 * Because the input is not arbitrary. It is `docs/*.md`, written by this team,
 * and a survey of every construct in it comes to nine block types and four
 * inline ones. A general parser would be several hundred kilobytes of
 * dependency to handle CommonMark corner cases that will never appear, in a
 * repository whose whole argument is that it does not take dependencies it
 * cannot justify.
 *
 * ── THE RULE THAT MATTERS ───────────────────────────────────────────────────
 *
 * Everything is escaped by default and nothing passes through as raw HTML.
 * A renderer that lets `<` through is a cross-site-scripting hole wearing a
 * documentation costume, and the fact that today's input is trusted is not a
 * property of the code — it is a property of who happens to be editing.
 *
 * `markdown.test.mjs` covers each construct and the escaping.
 */

/** The four characters that can end an HTML context. */
export function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** A heading's URL fragment. Stable, because people link to these. */
export function slug(text) {
  return text
    .toLowerCase()
    .replace(/[·—–]/g, " ")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

/**
 * Inline constructs, in one pass.
 *
 * Code spans are extracted FIRST and replaced with placeholders, so that a
 * literal `**` or `[link](x)` inside backticks stays literal — which matters
 * here, because the docs are full of code spans containing exactly those.
 */
function inline(text, rewrite) {
  const spans = [];
  let out = text.replace(/`([^`]+)`/g, (_, code) => {
    spans.push(`<code>${escapeHtml(code)}</code>`);
    return `\u0000${spans.length - 1}\u0000`;
  });

  out = escapeHtml(out);
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    // Only http(s), fragments and relative paths. A `javascript:` href in a
    // docs page is the same hole as raw HTML, reached a different way.
    const safe = /^(https?:\/\/|#|\.{0,2}\/|[\w-]+\.(md|html))/i.test(href);
    if (!safe) return label;
    const target = rewrite ? rewrite(href) : href.replace(/\.md(#|$)/, ".html$1");
    return `<a href="${target}">${label}</a>`;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>");

  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => spans[Number(i)]);
}

/** A GitHub-style table, given its lines. Returns null if it is not one. */
function table(lines, start, rewrite) {
  const header = lines[start];
  const rule = lines[start + 1];
  if (!header?.startsWith("|") || !/^\|[\s:|-]+\|$/.test(rule ?? "")) return null;

  const cells = (line) =>
    line.slice(1, line.endsWith("|") ? -1 : undefined).split("|").map((c) => c.trim());

  let end = start + 2;
  while (end < lines.length && lines[end].startsWith("|")) end++;

  const head = cells(header).map((c) => `<th>${inline(c, rewrite)}</th>`).join("");
  const body = lines
    .slice(start + 2, end)
    .map((row) => `<tr>${cells(row).map((c) => `<td>${inline(c, rewrite)}</td>`).join("")}</tr>`)
    .join("");

  return {
    // Wrapped, because a wide table must scroll inside itself rather than
    // making the whole page scroll sideways.
    html: `<div class="tablewrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`,
    end,
  };
}

/**
 * Renders one document.
 *
 * Returns the HTML plus the heading outline, which the docs shell uses to
 * build the "on this page" rail without parsing its own output back.
 */
export function render(markdown, rewrite) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  const outline = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code. Everything inside is literal, including other markers.
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const body = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) body.push(lines[i++]);
      i++;
      out.push(
        `<figure class="code"><pre><code class="lang-${escapeHtml(lang) || "text"}">` +
          `${escapeHtml(body.join("\n"))}</code></pre>` +
          `<button class="copy" type="button" aria-label="Copy code">Copy</button></figure>`,
      );
      continue;
    }

    const t = table(lines, i, rewrite);
    if (t) { out.push(t.html); i = t.end; continue; }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2].trim();
      const id = slug(text);
      if (level >= 2 && level <= 3) outline.push({ level, text, id });
      out.push(
        `<h${level} id="${id}">${inline(text, rewrite)}` +
          `<a class="anchor" href="#${id}" aria-label="Link to this section">#</a></h${level}>`,
      );
      i++;
      continue;
    }

    if (/^(---|\*\*\*)\s*$/.test(line)) { out.push("<hr />"); i++; continue; }

    if (line.startsWith("> ")) {
      const body = [];
      while (i < lines.length && lines[i].startsWith(">")) body.push(lines[i++].replace(/^>\s?/, ""));
      out.push(`<blockquote>${render(body.join("\n"), rewrite).html}</blockquote>`);
      continue;
    }

    const bullet = /^[-*]\s+/;
    if (bullet.test(line)) {
      const items = [];
      while (i < lines.length && bullet.test(lines[i])) {
        let item = lines[i++].replace(bullet, "");
        // A wrapped list item continues on an indented line.
        while (i < lines.length && /^\s{2,}\S/.test(lines[i])) item += " " + lines[i++].trim();
        items.push(`<li>${inline(item, rewrite)}</li>`);
      }
      out.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    const numbered = /^\d+\.\s+/;
    if (numbered.test(line)) {
      const items = [];
      while (i < lines.length && numbered.test(lines[i])) {
        let item = lines[i++].replace(numbered, "");
        while (i < lines.length && /^\s{2,}\S/.test(lines[i])) item += " " + lines[i++].trim();
        items.push(`<li>${inline(item, rewrite)}</li>`);
      }
      out.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    if (line.trim() === "") { i++; continue; }

    const para = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].startsWith("```") &&
      !lines[i].startsWith(">") &&
      !lines[i].startsWith("|") &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !bullet.test(lines[i]) &&
      !numbered.test(lines[i]) &&
      !/^(---|\*\*\*)\s*$/.test(lines[i])
    ) {
      para.push(lines[i++]);
    }
    out.push(`<p>${inline(para.join(" "), rewrite)}</p>`);
  }

  return { html: out.join("\n"), outline };
}
