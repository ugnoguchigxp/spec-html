import { describe, expect, it } from "vitest";

import { formatHtml } from "../../src/format/printer.js";
import { compileMarkdown } from "../../src/markdown/compiler.js";
import { compareMarkdownWithHtml } from "../../src/migrate/parity.js";

const HTML_PATH = "/tmp/spec-html-parity.html";

async function compareFormatted(markdown: string) {
  const compiled = compileMarkdown(markdown, { language: "en" });
  const formatted = await formatHtml(
    compiled.fragment,
    HTML_PATH,
    "parity.html",
  );
  return compareMarkdownWithHtml(markdown, formatted.output, HTML_PATH);
}

describe("migration content parity", () => {
  it("preserves document order for headings, mixed lists, and inline marks", async () => {
    const markdown = [
      "# Guide",
      "",
      "## First",
      "",
      "### Nested",
      "",
      "## Second",
      "",
      "- Unordered one",
      "- Unordered two",
      "",
      "1. Ordered one",
      "2. Ordered two",
      "",
      "- Unordered three",
      "",
      "**Strong one**, *emphasis*, ~~deleted~~, and **strong two**.",
    ].join("\n");

    await expect(compareFormatted(markdown)).resolves.toEqual({
      matched: true,
      mismatches: [],
    });
  });

  it("keeps inline element boundaries from inventing heading, link, or table spaces", async () => {
    const markdown = [
      "# READMEと`v1.0.0`がcurrent",
      "",
      "[READMEと`v1.0.0`がcurrent](./README.md)",
      "",
      "| Kind | Value |",
      "| --- | --- |",
      "| Release | READMEと`v1.0.0`がcurrent |",
      "| Image | (`2.17.0`) |",
    ].join("\n");

    await expect(compareFormatted(markdown)).resolves.toEqual({
      matched: true,
      mismatches: [],
    });
  });

  it("does not decode character references assembled across inline boundaries", async () => {
    const markdown = [
      "# Entity boundaries",
      "",
      "| Kind | Value |",
      "| --- | --- |",
      "| Code then text | `&`amp; |",
      "| Text then code | &amp;`&` |",
    ].join("\n");

    await expect(compareFormatted(markdown)).resolves.toEqual({
      matched: true,
      mismatches: [],
    });
  });

  it("represents explicit line breaks as spaces in accessible labels", async () => {
    const markdown = [
      "# Links",
      "",
      "[Line one\\",
      "line two](./guide.md)",
    ].join("\n");

    await expect(compareFormatted(markdown)).resolves.toEqual({
      matched: true,
      mismatches: [],
    });
  });

  it("preserves long inline code verbatim through formatting", async () => {
    const command =
      "bun run scan:profile -- --project-path <repo> --create-project true --profile agent-output --json";
    const markdown = `# Command\n\nRun \`${command}\` and inspect the result.\n`;

    await expect(compareFormatted(markdown)).resolves.toEqual({
      matched: true,
      mismatches: [],
    });
  });

  it("still detects real structure and content changes", async () => {
    const headingMarkdown = "# Guide\n\n## First\n\n### Nested\n\n## Second\n";
    const headingHtml = compileMarkdown(headingMarkdown, { language: "en" })
      .fragment.replace(
        '<h3 id="nested">Nested</h3>\n<h2 id="second">Second</h2>',
        '<h2 id="second">Second</h2>\n<h3 id="nested">Nested</h3>',
      );
    const heading = await compareMarkdownWithHtml(
      headingMarkdown,
      headingHtml,
      HTML_PATH,
    );
    expect(heading.mismatches).toContain("headings");

    const listMarkdown = "# Guide\n\n- One\n- Two\n";
    const listHtml = compileMarkdown(listMarkdown, { language: "en" })
      .fragment.replace("<ul>", "<ol>").replace("</ul>", "</ol>");
    const list = await compareMarkdownWithHtml(listMarkdown, listHtml, HTML_PATH);
    expect(list.mismatches).toContain("lists");

    const marksMarkdown = "# Guide\n\n**Strong** *Emphasis* ~~Deleted~~.\n";
    const marksHtml = compileMarkdown(marksMarkdown, { language: "en" })
      .fragment.replace(
        "<strong>Strong</strong> <em>Emphasis</em>",
        "<em>Emphasis</em> <strong>Strong</strong>",
      );
    const marks = await compareMarkdownWithHtml(
      marksMarkdown,
      marksHtml,
      HTML_PATH,
    );
    expect(marks.mismatches).toContain("inline-marks");

    const codeMarkdown = "# Guide\n\nUse `alpha beta`.\n";
    const codeHtml = compileMarkdown(codeMarkdown, { language: "en" })
      .fragment.replace("<code>alpha beta</code>", "<code>alpha  beta</code>");
    const code = await compareMarkdownWithHtml(codeMarkdown, codeHtml, HTML_PATH);
    expect(code.mismatches).toContain("inline-code");

    const tableMarkdown = [
      "# Matrix",
      "",
      "| Value |",
      "| --- |",
      "| X`Y`Z |",
    ].join("\n");
    const tableHtml = compileMarkdown(tableMarkdown, { language: "en" })
      .fragment.replace("X<code>Y</code>Z", "X <code>Y</code>Z");
    const table = await compareMarkdownWithHtml(
      tableMarkdown,
      tableHtml,
      HTML_PATH,
    );
    expect(table.mismatches).toContain("tables");

    const breakMarkdown = "# Links\n\n[Line one\\\nline two](./guide.md)\n";
    const breakHtml = compileMarkdown(breakMarkdown, { language: "en" })
      .fragment.replace("<br>", "");
    const lineBreak = await compareMarkdownWithHtml(
      breakMarkdown,
      breakHtml,
      HTML_PATH,
    );
    expect(lineBreak.mismatches).toEqual(
      expect.arrayContaining(["links", "line-breaks"]),
    );
  });
});
