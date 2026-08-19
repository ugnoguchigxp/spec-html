import { describe, expect, it } from "vitest";
import { fixDocument, isSingleEditTypo } from "../../src/fix/document.js";

async function fix(source: string) {
  return fixDocument(source, "/tmp/document.html", "document.html");
}

describe("fixDocument", () => {
  it("repairs unambiguous start and end tag name typos", async () => {
    const result = await fix(
      '<article lang="en"><h1>Title</h1><sectoin>Text</sectoin></article>',
    );

    expect(result.status).toBe("ready");
    expect(result.output).toContain("<section>Text</section>");
    expect(result.fixes).toEqual([
      expect.objectContaining({
        kind: "tag-name",
        before: "sectoin",
        after: "section",
      }),
    ]);
  });

  it("repairs a script tag typo without changing JavaScript source", async () => {
    const javascript = 'const teh = "<div>";\nconsole.log(teh);';
    const result = await fix(
      `<article lang="en"><h1>Script</h1><scritp>${javascript}</scritp></article>`,
    );

    expect(result.output).toBe(
      `<article lang="en"><h1>Script</h1><script>${javascript}</script></article>`,
    );
    expect(result.fixes.map((item) => item.kind)).toEqual(["tag-name"]);
  });

  it("repairs attribute names and preserves event handler JavaScript", async () => {
    const handler = "if (teh) run()";
    const result = await fix(
      `<article lang="en"><h1>Attributes</h1><a herf="page.html" onclik="${handler}"><img scr="image.png" alt="Image"></a><button formaciton="/save">Save</button><aside data-tpye="warning" aria-labl="Note">Note</aside></article>`,
    );

    expect(result.output).toContain(
      `<a href="page.html" onclick="${handler}"><img src="image.png" alt="Image"></a>`,
    );
    expect(result.output).toContain('<button formaction="/save">');
    expect(result.output).toContain(
      '<aside data-type="warning" aria-label="Note">',
    );
    expect(result.fixes.map((item) => item.kind)).toEqual([
      "attribute-name",
      "attribute-name",
      "attribute-name",
      "attribute-name",
      "attribute-name",
      "attribute-name",
    ]);
  });

  it("repairs a mistyped closing tag", async () => {
    const result = await fix(
      '<article lang="en"><h1>Title</h1><div>Text</dvi></article>',
    );

    expect(result.output).toContain("<div>Text</div>");
    expect(result.fixes).toEqual([
      expect.objectContaining({
        kind: "closing-tag-name",
        before: "dvi",
        after: "div",
      }),
    ]);
  });

  it("inserts an unambiguous missing closing tag", async () => {
    const result = await fix(
      '<article lang="en"><h1>Title</h1><section><p>Text</p></article>',
    );

    expect(result.output).toContain("<section><p>Text</p></section></article>");
    expect(result.fixes).toEqual([
      expect.objectContaining({
        kind: "missing-closing-tag",
        after: "</section>",
      }),
    ]);
  });

  it("inserts multiple missing closing tags from the inside out", async () => {
    const result = await fix(
      '<article lang="en"><h1>Title</h1><section><div>Text</article>',
    );

    expect(result.output).toContain(
      "<section><div>Text</div></section></article>",
    );
    expect(result.fixes.map((item) => item.after)).toEqual([
      "</div>",
      "</section>",
    ]);
  });

  it("inserts a uniquely recoverable missing double quote", async () => {
    const result = await fix(
      '<article lang="en"><h1>Title</h1><img src="image.png alt="Diagram"></article>',
    );

    expect(result.status).toBe("ready");
    expect(result.output).toContain('<img src="image.png" alt="Diagram">');
    expect(result.fixes).toEqual([
      expect.objectContaining({
        kind: "attribute-quote",
        before: "",
        after: '"',
      }),
    ]);
  });

  it("inserts a missing opening double quote when it is the unique repair", async () => {
    const result = await fix(
      '<article lang="en"><h1>Title</h1><img src=image.png" alt="Diagram"></article>',
    );

    expect(result.status).toBe("ready");
    expect(result.output).toContain('<img src="image.png" alt="Diagram">');
    expect(result.fixes.map((item) => item.kind)).toContain("attribute-quote");
  });

  it("repairs closed attribute values without generating prose", async () => {
    const result = await fix(
      '<article lang="en"><h1>teh title</h1><aside data-type="waring">teh note</aside><table><caption>Table</caption><tr><th scope="clo">X</th></tr></table><p role="buton">Push</p></article>',
    );

    expect(result.output).toContain("<h1>teh title</h1>");
    expect(result.output).toContain(
      '<aside data-type="warning">teh note</aside>',
    );
    expect(result.output).toContain('scope="col"');
    expect(result.output).toContain('role="button"');
    expect(result.fixes.map((item) => item.kind)).toEqual([
      "attribute-value",
      "attribute-value",
      "attribute-value",
    ]);
  });

  it("does not guess an ambiguous element name or add optional end tags", async () => {
    const ambiguous = await fix(
      '<article lang="en"><h1>Title</h1><h>Text</h></article>',
    );
    const optional = await fix(
      '<article lang="en"><h1>Title</h1><ul><li>One<li>Two</ul></article>',
    );

    expect(ambiguous.output).toContain("<h>Text</h>");
    expect(ambiguous.fixes).toEqual([]);
    expect(optional.changed).toBe(false);
    expect(optional.fixes).toEqual([]);
  });

  it("does not rewrite a valid custom data attribute without semantic evidence", async () => {
    const source =
      '<article lang="en"><h1>Title</h1><p data-tpye="custom">Text</p></article>';

    const result = await fix(source);

    expect(result.output).toBe(source);
    expect(result.changed).toBe(false);
    expect(result.fixes).toEqual([]);
  });

  it("is idempotent", async () => {
    const first = await fix(
      '<article lang="en"><h1>Title</h1><sectoin><img scr="x.png" alt="X"></sectoin></article>',
    );
    const second = await fix(first.output ?? "");

    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    expect(second.fixes).toEqual([]);
    expect(second.output).toBe(first.output);
  });

  it("accepts a document fixed exactly at the safety limit", async () => {
    const typos = Array.from(
      { length: 100 },
      () => "<sectoin>Text</sectoin>",
    ).join("");

    const result = await fix(
      `<article lang="en"><h1>Title</h1>${typos}</article>`,
    );

    expect(result.status).toBe("ready");
    expect(result.fixes).toHaveLength(100);
    expect(result.output).not.toContain("sectoin");
  });
});

describe("isSingleEditTypo", () => {
  it.each([
    ["sectoin", "section"],
    ["scr", "src"],
    ["herf", "href"],
    ["formaciton", "formaction"],
    ["clik", "click"],
  ])("recognizes %s -> %s", (left, right) => {
    expect(isSingleEditTypo(left, right)).toBe(true);
  });

  it.each([
    ["div", "div"],
    ["section", "script"],
    ["title", "table"],
  ])("rejects %s -> %s", (left, right) => {
    expect(isSingleEditTypo(left, right)).toBe(false);
  });
});
