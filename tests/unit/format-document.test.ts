import { describe, expect, it } from "vitest";
import { formatDocument } from "../../src/format/document.js";

async function format(source: string) {
  return formatDocument(source, "/tmp/document.html", "document.html");
}

describe("formatDocument", () => {
  it("formats a valid fragment and is idempotent", async () => {
    const first = await format('<article lang="en"><h1>Title</h1></article>');
    expect(first).toMatchObject({
      status: "ready",
      inputKind: "fragment",
      changed: true,
      problems: [],
      diagnostics: [],
    });
    const second = await format(first.output ?? "");
    expect(second.changed).toBe(false);
    expect(second.output).toBe(first.output);
  });

  it("normalizes a full document to a fragment", async () => {
    const result = await format(
      '<!doctype html><html lang="ja"><head><title>題名</title></head><body><article><h1>題名</h1></article></body></html>',
    );
    expect(result).toMatchObject({
      status: "ready",
      inputKind: "document",
      changed: true,
      diagnostics: [],
    });
    expect(result.output).toBe('<article lang="ja"><h1>題名</h1></article>\n');
    const second = await format(result.output ?? "");
    expect(second.changed).toBe(false);
    expect(second.output).toBe(result.output);
  });

  it("reports BOM removal for a full document", async () => {
    const result = await format(
      '\uFEFF<!doctype html><html lang="en"><body><article><h1>Title</h1></article></body></html>',
    );
    expect(result.status).toBe("ready");
    expect(result.changes.map((change) => change.kind)).toContain("bom-removed");
    expect(result.output).not.toContain("\uFEFF");
  });

  it("does not double-escape copied wrapper attribute values", async () => {
    const result = await format(
      '<html lang="en&amp;x"><body><article><h1>Title</h1></article></body></html>',
    );
    expect(result.status).toBe("ready");
    expect(result.output).toContain('lang="en&amp;x"');
    expect(result.output).not.toContain("&amp;amp;");
  });

  it("returns remaining lint diagnostics without blocking formatting", async () => {
    const result = await format("<main><h1>Title</h1></main>");
    expect(result.status).toBe("ready");
    expect(result.diagnostics.map((diagnostic) => diagnostic.rule)).toContain("DOC001");
  });

  it("blocks malformed HTML", async () => {
    const result = await format('<article lang="en');
    expect(result.status).toBe("blocked");
    expect(result.output).toBeNull();
    expect(result.problems.map((problem) => problem.code)).toEqual(["FMT001"]);
  });

  it.each([
    '<article lang="en"><h1 class="x><span>X</span></article>',
    '<article lang="en"><div></article></div>',
    '<article lang="en" lang="ja"><h1>X</h1></article>',
    '<article lang="en"><h1>X</h1><!-- bad</article>',
    '<article lang="en"><h1>X</h1><img src="x" alt="">text</img></article>',
  ])("blocks malformed syntax instead of repairing it: %s", async (source) => {
    const result = await format(source);
    expect(result.status).toBe("blocked");
    expect(result.output).toBeNull();
    expect(result.problems.map((problem) => problem.code)).toContain("FMT001");
  });

  it("preserves inline script text exactly", async () => {
    const script = `const value = \`first
second\`;
console.log(value);`;
    const result = await format(`<article lang="en"><h1>Script</h1><script>${script}</script></article>`);
    expect(result.output).toContain(`<script>${script}</script>`);
  });
});
