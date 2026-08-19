import { describe, expect, it } from "vitest";
import { formatHtml } from "../../src/format/printer.js";

async function format(source: string): Promise<string> {
  return (await formatHtml(source, "/tmp/document.html", "document.html")).output;
}

describe("formatHtml", () => {
  it("formats a fragment with readable block indentation", async () => {
    await expect(format('<article lang="ja"><h1>題名</h1><p>A <strong>B</strong> C</p></article>')).resolves.toBe(`<article lang="ja">
  <h1>題名</h1>
  <p>A <strong>B</strong> C</p>
</article>
`);
  });

  it("does not merge inline text with and without surrounding spaces", async () => {
    const compact = await format(
      '<article lang="en"><h1>Inline</h1><p>A<strong>B</strong>C</p></article>',
    );
    const spaced = await format(
      '<article lang="en"><h1>Inline</h1><p>A <strong>B</strong> C</p></article>',
    );
    expect(compact).toContain("<p>A<strong>B</strong>C</p>");
    expect(spaced).toContain("<p>A <strong>B</strong> C</p>");
    expect(compact).not.toBe(spaced);
  });

  it("preserves raw element contents while formatting surrounding HTML", async () => {
    const source = `<article lang="ja"><h1>Raw</h1><pre>  a
 b</pre><textarea> a
 b</textarea><script>const value = \`a
b\`;
console.log(value);</script><style>.x::before { content: "a  b"; }</style></article>`;
    const output = await format(source);

    expect(output).toContain(`<pre>  a
 b</pre>`);
    expect(output).toContain(`<textarea> a
 b</textarea>`);
    expect(output).toContain(`<script>const value = \`a
b\`;
console.log(value);</script>`);
    expect(output).toContain('<style>.x::before { content: "a  b"; }</style>');
    await expect(format(output)).resolves.toBe(output);
  });

  it("handles source text which already contains the marker prefix", async () => {
    const source = '<article lang="en"><h1>Marker</h1><pre>SPEC_HTML_FORMAT_RAW_0_0</pre></article>';
    const output = await format(source);
    expect(output).toContain("SPEC_HTML_FORMAT_RAW_0_0");
  });

  it("removes BOM, normalizes line endings, and ends with one newline", async () => {
    const result = await formatHtml(
      '\uFEFF<article lang="en">\r\n<h1>Title</h1>\r\n</article>\r\n\r\n',
      "/tmp/document.html",
      "document.html",
    );
    expect(result.bomRemoved).toBe(true);
    expect(result.output).not.toContain("\r");
    expect(result.output.endsWith("\n")).toBe(true);
    expect(result.output.endsWith("\n\n")).toBe(false);
  });
});
