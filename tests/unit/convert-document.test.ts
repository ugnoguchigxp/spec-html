import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  convertMarkdownDocument,
  writeConvertedDocument,
} from "../../src/convert/document.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "spec-html-convert-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("convertMarkdownDocument", () => {
  it("compiles and formats Markdown without writing in stdout mode", async () => {
    const input = join(root, "design.md");
    await writeFile(input, "# 設計書\n\n[計画](./plan.markdown)\n");

    const result = await convertMarkdownDocument({
      inputPath: input,
      language: "ja-jp",
    });

    expect(result.outputPath).toBeNull();
    expect(result.output).toBe(`<article lang="ja-JP">
  <h1 id="設計書">設計書</h1>
  <p><a href="./plan.markdown">計画</a></p>
</article>
`);
    expect(result.diagnostics).toEqual([]);
    await expect(access(join(root, "design.html"))).rejects.toThrow();
  });

  it("creates a syntactically valid draft even when semantic lint errors remain", async () => {
    const input = join(root, "table.markdown");
    const output = join(root, "table.html");
    await writeFile(
      input,
      "# Data\n\n| Key | Value |\n| --- | --- |\n| A | B |\n",
    );

    const result = await convertMarkdownDocument({
      inputPath: input,
      outputPath: output,
      language: "en",
    });
    expect(result.diagnostics.map(({ rule }) => rule)).toContain("TBL001");

    await writeConvertedDocument(result);

    await expect(readFile(output, "utf8")).resolves.toContain(
      '<th scope="col">Key</th>',
    );
  });

  it("reports raw HTML and unsafe URL notices", async () => {
    const input = join(root, "unsafe.md");
    await writeFile(
      input,
      "# Safe\n\n<script>x</script>\n\n[bad](javascript:x)\n",
    );

    const result = await convertMarkdownDocument({
      inputPath: input,
      language: "en",
    });

    expect(result.notices.map(({ code }) => code)).toEqual([
      "raw-html",
      "unsafe-link-url",
    ]);
    expect(result.output).not.toContain("<script>");
    expect(result.output).not.toContain('href="javascript:');
  });

  it("rejects invalid input, output, encodings, and existing entries", async () => {
    const input = join(root, "design.md");
    await writeFile(input, "# Design\n");
    const linkedInput = join(root, "linked.md");
    await symlink(input, linkedInput);
    const existing = join(root, "existing.html");
    await writeFile(existing, "existing");
    const linkedOutput = join(root, "linked.html");
    await symlink(existing, linkedOutput);
    const other = join(root, "other");
    await mkdir(other);
    const invalidUtf8 = join(root, "invalid.md");
    await writeFile(invalidUtf8, Buffer.from([0xc3, 0x28]));

    await expect(
      convertMarkdownDocument({ inputPath: linkedInput, language: "en" }),
    ).rejects.toThrow("通常file");
    await expect(
      convertMarkdownDocument({
        inputPath: input,
        outputPath: existing,
        language: "en",
      }),
    ).rejects.toThrow("既に存在");
    await expect(
      convertMarkdownDocument({
        inputPath: input,
        outputPath: linkedOutput,
        language: "en",
      }),
    ).rejects.toThrow("既に存在");
    await expect(
      convertMarkdownDocument({
        inputPath: input,
        outputPath: join(other, "design.html"),
        language: "en",
      }),
    ).rejects.toThrow("同じdirectory");
    await expect(
      convertMarkdownDocument({ inputPath: invalidUtf8, language: "en" }),
    ).rejects.toThrow("UTF-8");
  });

  it("does not publish when the input changes after conversion", async () => {
    const input = join(root, "design.md");
    const output = join(root, "design.html");
    await writeFile(input, "# First\n");
    const result = await convertMarkdownDocument({
      inputPath: input,
      outputPath: output,
      language: "en",
    });
    await writeFile(input, "# Changed\n");

    await expect(writeConvertedDocument(result)).rejects.toThrow(
      "入力fileが変わった",
    );
    await expect(access(output)).rejects.toThrow();
  });

  it("does not overwrite a target created after conversion", async () => {
    const input = join(root, "design.md");
    const output = join(root, "design.html");
    await writeFile(input, "# Design\n");
    const result = await convertMarkdownDocument({
      inputPath: input,
      outputPath: output,
      language: "en",
    });
    await writeFile(output, "winner\n");

    await expect(writeConvertedDocument(result)).rejects.toThrow("既に存在");
    await expect(readFile(output, "utf8")).resolves.toBe("winner\n");
  });

  it("refuses to write a stdout-only or forged conversion result", async () => {
    const input = join(root, "design.md");
    await writeFile(input, "# Design\n");
    const result = await convertMarkdownDocument({
      inputPath: input,
      language: "en",
    });

    await expect(writeConvertedDocument(result)).rejects.toThrow("--output");
    await expect(
      writeConvertedDocument({
        ...result,
        outputPath: join(root, "forged.html"),
      }),
    ).rejects.toThrow("snapshot");
  });

  it("refuses a conversion result whose validated path or output was mutated", async () => {
    const input = join(root, "design.md");
    const output = join(root, "design.html");
    await writeFile(input, "# Design\n");
    const result = await convertMarkdownDocument({
      inputPath: input,
      outputPath: output,
      language: "en",
    });

    Reflect.set(result, "outputPath", join(root, "forged.html"));
    await expect(writeConvertedDocument(result)).rejects.toThrow(
      "変換結果が変わった",
    );
    Reflect.set(result, "outputPath", output);
    Reflect.set(result, "output", "<article>forged</article>\n");
    await expect(writeConvertedDocument(result)).rejects.toThrow(
      "変換結果が変わった",
    );
    await expect(access(output)).rejects.toThrow();
    await expect(access(join(root, "forged.html"))).rejects.toThrow();
  });

  it("rejects unsupported core paths even without the CLI parser", async () => {
    const text = join(root, "design.txt");
    const markdown = join(root, "design.md");
    await writeFile(text, "# Text\n");
    await writeFile(markdown, "# Design\n");

    await expect(
      convertMarkdownDocument({ inputPath: text, language: "en" }),
    ).rejects.toThrow(".mdまたは.markdown");
    await expect(
      convertMarkdownDocument({
        inputPath: markdown,
        outputPath: join(root, "nav.html"),
        language: "en",
      }),
    ).rejects.toThrow("nav.html");
    await expect(
      convertMarkdownDocument({
        inputPath: markdown,
        outputPath: join(root, "design.txt"),
        language: "en",
      }),
    ).rejects.toThrow(".html");
  });
});
