import { describe, expect, it } from "vitest";
import { normalizeEnvelope, parseHtmlSource } from "../../src/format/envelope.js";

const PATH = "/tmp/document.html";

async function normalize(source: string) {
  return normalizeEnvelope(source, PATH, "document.html");
}

describe("normalizeEnvelope", () => {
  it("leaves a fragment envelope unchanged", async () => {
    const source = '<article lang="en"><h1>Title</h1></article>';
    await expect(normalize(source)).resolves.toEqual({
      kind: "fragment",
      source,
      changes: [],
      problems: [],
    });
  });

  it("extracts body content and copies language to a root article", async () => {
    const source = `<!doctype html>
<html lang="ja">
<head><!-- note --><meta charset="utf-8"><title>題名</title></head>
<body><article><h1>題名</h1></article></body>
</html>`;
    const result = await normalize(source);

    expect(result.kind).toBe("document");
    expect(result.problems).toEqual([]);
    expect(result.source).toBe('<article lang="ja"><h1>題名</h1></article>');
    expect(result.changes).toEqual([
      { kind: "document-envelope-removed" },
      { kind: "head-metadata-removed", detail: "title=題名 meta=1 comment" },
      { kind: "envelope-attribute-copied", detail: "lang" },
    ]);
  });

  it("extracts non-article body content without inventing a wrapper", async () => {
    const result = await normalize(
      '<html><head><title>Title</title></head><body><main><h1>Title</h1></main></body></html>',
    );
    expect(result.problems).toEqual([]);
    expect(result.source).toBe("<main><h1>Title</h1></main>");
  });

  it("preserves the original encoding and quoting of copied wrapper attributes", async () => {
    const result = await normalize(
      `<html lang="en&amp;x" dir='rtl'><body><article><h1>Title</h1></article></body></html>`,
    );
    expect(result.problems).toEqual([]);
    expect(result.source).toContain('lang="en&amp;x"');
    expect(result.source).not.toContain("&amp;amp;");
    expect(result.source).toContain("dir='rtl'");
  });

  it("keeps an empty body language override instead of falling back to html", async () => {
    const result = await normalize(
      '<html lang="ja"><body lang=""><article><h1>Title</h1></article></body></html>',
    );
    expect(result.problems).toEqual([]);
    expect(result.source).toContain('lang=""');
    expect(result.source).not.toContain('lang="ja"');
  });

  it("blocks wrapper attributes which cannot be transferred to a root article", async () => {
    const result = await normalize(
      '<html lang="ja"><body><main><h1>Title</h1></main></body></html>',
    );
    expect(result.problems.map((problem) => problem.code)).toContain("FMT003");
  });

  it.each(["base", "style", "link", "script", "template"])(
    "blocks unsupported head element %s",
    async (tag) => {
      const content = tag === "link" ? '<link rel="stylesheet" href="x.css">' : `<${tag}></${tag}>`;
      const result = await normalize(`<html><head>${content}</head><body><article lang="en"><h1>X</h1></article></body></html>`);
      expect(result.problems.map((problem) => problem.code)).toContain("FMT002");
      expect(result.source).not.toBe("");
    },
  );

  it("blocks meaningful text in head instead of dropping it", async () => {
    const result = await normalize(
      '<html><head>lost text<title>Title</title></head><body><article lang="en"><h1>X</h1></article></body></html>',
    );
    expect(result.problems.map((problem) => problem.code)).toContain("FMT002");
  });

  it.each([
    '<html class="theme"><body><article lang="en"><h1>X</h1></article></body></html>',
    '<html><head id="metadata"></head><body><article lang="en"><h1>X</h1></article></body></html>',
    '<html><body data-theme="dark"><article lang="en"><h1>X</h1></article></body></html>',
  ])("blocks unsafe wrapper attributes", async (source) => {
    const result = await normalize(source);
    expect(result.problems.map((problem) => problem.code)).toContain("FMT003");
  });

  it.each([
    "<!doctype html><article lang=\"en\"><h1>X</h1></article>",
    "<body><article lang=\"en\"><h1>X</h1></article></body>",
    "before<html><body><article lang=\"en\"><h1>X</h1></article></body></html>",
    "<html><body><article lang=\"en\"><h1>X</h1></article></body>",
  ])("blocks unsupported document envelopes", async (source) => {
    const result = await normalize(source);
    expect(result.problems.map((problem) => problem.code)).toContain("FMT004");
  });

  it("blocks a doctype after the html start tag", async () => {
    const result = await normalize(
      '<html><head><!doctype html></head><body><article lang="en"><h1>X</h1></article></body></html>',
    );
    expect(result.problems.length).toBeGreaterThan(0);
  });

  it.each([
    '<html><head></head><head></head><body><article lang="en"><h1>X</h1></article></body></html>',
    '<html><head></head><body><article lang="en"><h1>X</h1></article></body><body></body></html>',
    '<html><head></head><body><article lang="en"><h1>X</h1></article></body><div>lost</div></html>',
  ])("blocks repaired envelopes which could otherwise lose source: %s", async (source) => {
    const result = await normalize(source);
    expect(result.problems.map((problem) => problem.code)).toContain("FMT004");
  });

  it.each([
    '<!-- html-validate-disable --><html><body><article lang="en"><h1>X</h1></article></body></html>',
    '<html><body><article lang="en"><h1>X</h1></article></body><!-- html-validate-disable --></html>',
    '<html><body><article lang="en"><h1>X</h1></article></body></html><!-- html-validate-disable -->',
  ])("blocks lint directives in envelope ranges that would be removed: %s", async (source) => {
    const result = await normalize(source);
    expect(result.problems.map((problem) => problem.code)).toContain("FMT004");
  });

  it("bounds removed title detail to one compact line", async () => {
    const result = await normalize(
      `<html><head><title>${"long title ".repeat(20)}</title></head><body><article lang="en"><h1>X</h1></article></body></html>`,
    );
    const detail = result.changes.find((change) =>
      change.kind === "head-metadata-removed"
    )?.detail;
    expect(detail).toBeDefined();
    expect(detail).not.toContain("\n");
    expect([...(detail ?? "")].length).toBeLessThanOrEqual(60);
  });

  it("uses UTF-16 source offsets when emoji precedes the body", async () => {
    const result = await normalize(
      '<html lang="ja"><head><title>😀</title></head><body><article><h1>😀</h1></article></body></html>',
    );
    expect(result.problems).toEqual([]);
    expect(result.source).toBe('<article lang="ja"><h1>😀</h1></article>');
  });

  it("does not mistake tag-like raw text for an envelope boundary", async () => {
    const source = '<article lang="en"><h1>X</h1><script>const value = "</body></html>";</script></article>';
    const parsed = await parseHtmlSource(source, PATH, "document.html");
    expect(parsed.problems).toEqual([]);
    const script = [...parsed.elements.values()].find((record) => record.element.is("script"));
    expect(source.slice(script?.content?.start, script?.content?.end)).toBe('const value = "</body></html>";');
  });
});
