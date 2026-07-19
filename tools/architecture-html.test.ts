import { expect, test } from "bun:test";
import { escapeHtml, renderInline, renderMarkdown, render, buildModel } from "./architecture-html.ts";

test("escapeHtml neutralises the five significant characters", () => {
  expect(escapeHtml(`<a href="x">&'`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
});

test("renderInline: code span is literal and escaped", () => {
  expect(renderInline("call `a<b>` now")).toBe("call <code>a&lt;b&gt;</code> now");
});

test("renderInline: emphasis inside a code span stays literal", () => {
  expect(renderInline("`**not bold**`")).toBe("<code>**not bold**</code>");
});

test("renderInline: bold and italic", () => {
  expect(renderInline("**b** and *i*")).toBe("<strong>b</strong> and <em>i</em>");
});

test("renderInline: link with a relative href", () => {
  expect(renderInline("see [ADR 1](docs/decisions/0001.md)")).toBe(
    'see <a href="docs/decisions/0001.md">ADR 1</a>',
  );
});

test("renderInline: a javascript href is neutralised to #", () => {
  expect(renderInline("[x](javascript:void0)")).toBe('<a href="#">x</a>');
});

test("renderMarkdown: ATX headings map to h1-h6", () => {
  expect(renderMarkdown("## Two\n### Three")).toBe("<h2>Two</h2>\n<h3>Three</h3>");
});

test("renderMarkdown: a dash list becomes a ul", () => {
  expect(renderMarkdown("- one\n- two")).toBe("<ul><li>one</li><li>two</li></ul>");
});

test("renderMarkdown: a numbered list becomes an ol", () => {
  expect(renderMarkdown("1. one\n2. two")).toBe("<ol><li>one</li><li>two</li></ol>");
});

test("renderMarkdown: adjacent ul and ol do not merge", () => {
  expect(renderMarkdown("- a\n1. b")).toBe("<ul><li>a</li></ul>\n<ol><li>b</li></ol>");
});

test("renderMarkdown: a wrapped list item joins its continuation lines", () => {
  const md = "1. first line\n   wraps here\n2. second";
  expect(renderMarkdown(md)).toBe("<ol><li>first line wraps here</li><li>second</li></ol>");
});

test("renderMarkdown: a pipe table becomes a table with header and rows", () => {
  const md = "| A | B |\n| --- | --- |\n| 1 | 2 |";
  expect(renderMarkdown(md)).toBe(
    "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>",
  );
});

test("renderMarkdown: prose becomes a paragraph with inline spans", () => {
  expect(renderMarkdown("uses the `x` guard")).toBe("<p>uses the <code>x</code> guard</p>");
});

test("renderMarkdown: a table cell renders inline code", () => {
  const md = "| Where |\n| --- |\n| `file.ts:9` |";
  expect(renderMarkdown(md)).toContain("<td><code>file.ts:9</code></td>");
});

test("render throws when the template lacks the model injection point", () => {
  const model = { title: "t", provenance: { commit: "", date: "", corpusTag: "", corpusHash: "" }, crosswalk: [], sections: [] };
  expect(() => render("<style>__THEME__</style><x>no slot</x>", model)).toThrow(/injection point/);
});

test("render throws when the template lacks the theme injection point", () => {
  const model = { title: "t", provenance: { commit: "", date: "", corpusTag: "", corpusHash: "" }, crosswalk: [], sections: [] };
  expect(() => render("<x>__MODEL__</x>", model)).toThrow(/__THEME__/);
});

test("buildModel reads the real tree: twelve sections, provenance, crosswalk", () => {
  const m = buildModel("docs/architecture");
  expect(m.sections.length).toBe(12);
  expect(m.sections.map((s) => s.num)).toEqual(
    ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"],
  );
  expect(m.provenance.commit).toMatch(/^[0-9a-f]{7,}$/);
  expect(m.crosswalk.length).toBe(12);
  // Section 9 indexes the ADRs by number.
  const nine = m.sections.find((s) => s.num === "09");
  expect(nine!.html).toContain("0001");
  expect(nine!.html).toContain("0002");
});

test("renderMarkdown: a mermaid fence becomes pre.mermaid", () => {
  const md = "```mermaid\nflowchart LR\n  a --> b\n```";
  expect(renderMarkdown(md)).toBe('<pre class="mermaid">flowchart LR\n  a --&gt; b</pre>');
});

test("renderMarkdown: a non-mermaid fence becomes an escaped code block", () => {
  const md = "```ts\nconst x = 1 < 2;\n```";
  expect(renderMarkdown(md)).toBe('<pre><code class="language-ts">const x = 1 &lt; 2;</code></pre>');
});
