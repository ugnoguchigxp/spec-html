import { describe, expect, it } from "vitest";

import { compileMarkdown } from "../../src/markdown/compiler.js";
import {
  canonicalizeLanguageTag,
  InvalidLanguageTagError,
} from "../../src/markdown/language.js";
import { isAllowedMarkdownUrl } from "../../src/markdown/url-policy.js";

describe("compileMarkdown", () => {
  it("renders common Markdown and GFM inside one article", () => {
    const result = compileMarkdown(
      [
        "# Design **guide**",
        "",
        "A [relative link](./next.md#part) and ~~deleted~~ text.",
        "",
        "- [x] complete",
        "- [ ] pending",
        "",
        "| Name | Value |",
        "| --- | ---: |",
        "| alpha | 1 |",
      ].join("\n"),
      { language: "ja-jp" },
    );

    expect(result.fragment).toContain('<article lang="ja-JP">');
    expect(result.fragment).toContain('<h1 id="design-guide">');
    expect(result.fragment).toContain('<a href="./next.md#part">');
    expect(result.fragment).toContain("<del>deleted</del>");
    expect(result.fragment).toContain('checked="" disabled="" type="checkbox"');
    expect(result.fragment).toContain('<th scope="col">Name</th>');
    expect(result.title).toBe("Design guide");
    expect(result.headings).toEqual([
      { depth: 1, id: "design-guide", text: "Design guide" },
    ]);
  });

  it("creates deterministic GitHub-compatible heading IDs", () => {
    const source = ["# 日本語", "## Same", "## Same", "##"].join("\n\n");
    const first = compileMarkdown(source, { language: "ja" });
    const second = compileMarkdown(source, { language: "ja" });

    expect(first.headings).toEqual([
      { depth: 1, id: "日本語", text: "日本語" },
      { depth: 2, id: "same", text: "Same" },
      { depth: 2, id: "same-1", text: "Same" },
      { depth: 2, id: "section", text: "" },
    ]);
    expect(second).toEqual(first);
  });

  it("keeps numeric GitHub IDs and gives punctuation-only headings valid fallbacks", () => {
    const result = compileMarkdown(
      ["# 2026 plan", "## !!!", "## section", "## !!!"].join("\n\n"),
      { language: "en" },
    );

    expect(result.headings).toEqual([
      { depth: 1, id: "2026-plan", text: "2026 plan" },
      { depth: 2, id: "section", text: "!!!" },
      { depth: 2, id: "section-1", text: "section" },
      { depth: 2, id: "section-2", text: "!!!" },
    ]);
  });

  it("uses CSS classes instead of deprecated table alignment attributes", () => {
    const result = compileMarkdown(
      [
        "# Data",
        "",
        "| Left | Center | Right |",
        "| :--- | :---: | ---: |",
        "| A | B | C |",
      ].join("\n"),
      { language: "en" },
    );

    expect(result.fragment).toContain(
      '<th scope="col" class="markdown-align-center">Center</th>',
    );
    expect(result.fragment).toContain(
      '<td class="markdown-align-right">C</td>',
    );
    expect(result.fragment).toContain("<caption>Data</caption>");
    expect(result.tableCaptions).toEqual([
      { index: 0, caption: "Data", headingId: "data" },
    ]);
    expect(result.fragment).not.toContain(" align=");
  });

  it("uses an optional migration link resolver without changing other URLs", () => {
    const result = compileMarkdown(
      "# Links\n\n[local](./next.md#part) [external](https://example.com/a.md)",
      {
        language: "en",
        linkResolver: (url) =>
          url.startsWith("./next.md")
            ? url.replace("./next.md", "./next.html")
            : url,
      },
    );

    expect(result.fragment).toContain('<a href="./next.html#part">local</a>');
    expect(result.fragment).toContain(
      '<a href="https://example.com/a.md">external</a>',
    );
  });

  it("ignores a UTF-8 BOM and treats an empty h1 as a missing title", () => {
    const withBom = compileMarkdown("\uFEFF# BOM title\n", {
      language: "en",
    });
    const empty = compileMarkdown("#\n\nBody\n", { language: "en" });

    expect(withBom.fragment).toContain('<h1 id="bom-title">BOM title</h1>');
    expect(withBom.title).toBe("BOM title");
    expect(empty.headings).toEqual([
      { depth: 1, id: "section", text: "" },
    ]);
    expect(empty.title).toBeNull();
  });

  it("uses rendered text for heading metadata, image alt text, and titles", () => {
    const result = compileMarkdown(
      [
        "# Design &amp; delivery",
        "",
        '![A **bold** &amp; safe label](./image.png "A &amp; B")',
      ].join("\n"),
      { language: "en" },
    );

    expect(result.title).toBe("Design & delivery");
    expect(result.headings[0]).toEqual({
      depth: 1,
      id: "design--delivery",
      text: "Design & delivery",
    });
    expect(result.fragment).toContain(
      '<img src="./image.png" alt="A bold &amp; safe label" title="A &amp; B">',
    );

    const nestedEntity = compileMarkdown("# **&amp;amp;**\n", {
      language: "en",
    });
    expect(nestedEntity.title).toBe("&amp;");

    const literalEntities = compileMarkdown(
      '# `&amp;` and \\&amp; and <em title="&amp;">x</em>\n',
      { language: "en" },
    );
    expect(literalEntities.title).toBe(
      '&amp; and &amp; and <em title="&amp;">x</em>',
    );
  });

  it("renders raw HTML literally and reports notices", () => {
    const result = compileMarkdown(
      '# Safe\n\n<script>alert(1)</script>\n\n<a onclick="alert(2)">text</a>',
      { language: "en" },
    );

    expect(result.fragment).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(result.fragment).toContain(
      "&lt;a onclick=&quot;alert(2)&quot;&gt;text&lt;/a&gt;",
    );
    expect(result.fragment).not.toContain("<script>");
    expect(result.fragment).not.toContain("<a onclick=");
    expect(result.notices.some(({ code }) => code === "raw-html")).toBe(true);
  });

  it("omits unsafe and malformed URLs while preserving labels", () => {
    const result = compileMarkdown(
      [
        "[bad](javascript:alert(1))",
        "[encoded](java&#x73;cript:alert(2))",
        "![bad image](data:image/svg+xml,bad)",
        "[mail](mailto:test@example.com)",
        "![relative](./図.png)",
        "[fragment](#part)",
        "[malformed](bad%url)",
      ].join("\n\n"),
      { language: "en" },
    );

    expect(result.fragment).not.toContain("javascript:");
    expect(result.fragment).not.toContain("java&amp;#x73;cript:");
    expect(result.fragment).not.toContain("data:image");
    expect(result.fragment).toContain(
      '<a href="mailto:test@example.com">mail</a>',
    );
    expect(result.fragment).toContain('<img src="./図.png"');
    expect(result.fragment).toContain('<a href="#part">fragment</a>');
    expect(result.fragment).toContain("<p>malformed</p>");
    expect(result.notices.map(({ code }) => code)).toEqual([
      "unsafe-link-url",
      "unsafe-link-url",
      "unsafe-image-url",
      "unsafe-link-url",
    ]);
  });

  it("normalizes safe character references and rejects malformed absolute URLs", () => {
    const result = compileMarkdown(
      [
        "[safe](https&colon;//example.com/?a=1&amp;b=2)",
        "[bad](https://example.com/bad%url)",
      ].join("\n\n"),
      { language: "en" },
    );

    expect(result.fragment).toContain(
      '<a href="https://example.com/?a=1&amp;b=2">safe</a>',
    );
    expect(result.fragment).toContain("<p>bad</p>");
    expect(result.notices.map(({ code }) => code)).toEqual([
      "unsafe-link-url",
    ]);
  });

  it("maps mermaid fences and escapes their source", () => {
    const result = compileMarkdown(
      "```mermaid\ngraph LR\n  A[<start>] --> B & C\n```",
      { language: "en" },
    );

    expect(result.fragment).toContain(
      '<pre class="mermaid" data-spec-html-source="markdown">graph LR\n  A[&lt;start&gt;] --&gt; B &amp; C\n</pre>',
    );
  });
});

describe("canonicalizeLanguageTag", () => {
  it("canonicalizes a valid BCP 47 language tag", () => {
    expect(canonicalizeLanguageTag("zh-hant-tw")).toBe("zh-Hant-TW");
  });

  it.each(["", " en", "not_a_tag", "en--US"])("rejects %j", (language) => {
    expect(() => canonicalizeLanguageTag(language)).toThrow(
      InvalidLanguageTagError,
    );
  });
});

describe("isAllowedMarkdownUrl", () => {
  it.each([
    ["./next.md", "link"],
    ["#section", "link"],
    ["https://example.com/path", "link"],
    ["HTTP://example.com/image.png", "image"],
    ["mailto:docs@example.com", "link"],
    ["tel:+81000000000", "link"],
    ["日本語/図.png", "image"],
    ["https&colon;//example.com/path", "link"],
  ] as const)("allows %s for %s", (url, kind) => {
    expect(isAllowedMarkdownUrl(url, kind)).toBe(true);
  });

  it.each([
    ["", "link"],
    [" javascript:alert(1)", "link"],
    ["javascript:alert(1)", "link"],
    ["java&#115;cript:alert(1)", "link"],
    ["java&#x73;cript:alert(1)", "link"],
    ["javascript&colon;alert(1)", "link"],
    ["java&Tab;script:alert(1)", "link"],
    ["java&NewLine;script:alert(1)", "link"],
    ["file:///tmp/private", "link"],
    ["data:text/html,bad", "image"],
    ["mailto:docs@example.com", "image"],
    ["tel:+81000000000", "image"],
    ["#fragment", "image"],
    ["bad%url", "link"],
    ["https://example.com/bad%url", "link"],
    ["java&#999999999999999999999;script:x", "link"],
  ] as const)("rejects %s for %s", (url, kind) => {
    expect(isAllowedMarkdownUrl(url, kind)).toBe(false);
  });
});
