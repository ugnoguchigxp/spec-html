import {
  access,
  link,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  truncate,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getDocumentArchiveState,
  MigrationManagedDocumentError,
  setDocumentArchived,
} from "../../src/content/archive.js";
import { digestText } from "../../src/content/safe-write.js";
import { rewriteMigrationLink } from "../../src/migrate/links.js";
import {
  createMigrationPlan,
  portableMigrationPathProblem,
} from "../../src/migrate/planner.js";
import {
  applyMigration,
  finalizeMigration,
  MigrationBlockedError,
  rollbackMigration,
} from "../../src/migrate/runner.js";
import {
  createMigrationStorage,
  readMigrationJournal,
  validateMigrationJournal,
  writeMigrationJournal,
  type MigrationJournal,
} from "../../src/migrate/storage.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "spec-html-migrate-"));
  await mkdir(join(root, "nested"));
  await Promise.all([
    writeFile(
      join(root, "guide.md"),
      "# Guide\n\nSee [Other](./nested/other.md?view=all&mode=1#details).\n\n> Keep `details`.\n\n- [x] Ready\n\n```ts\nconst ready = true;\n```\n\n![Pixel](./pixel.svg)\n\n## Status\n\n| Name | Value |\n| :--- | ---: |\n| A | 1 |\n",
    ),
    writeFile(
      join(root, "nested", "other.md"),
      "# Other\n\n## Details\n\nBack to [Guide](../guide.md).\n",
    ),
    writeFile(
      join(root, "index.html"),
      '<article lang="en"><h1>Index</h1><p><a href="./guide.md">Guide</a></p></article>\n',
    ),
    writeFile(join(root, "pixel.svg"), '<svg xmlns="http://www.w3.org/2000/svg"/>'),
  ]);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("migration links", () => {
  it("rewrites mapped local paths while preserving query and fragment", () => {
    const mapping = new Map([
      ["nested/other.md", "nested/other.html"],
    ]);
    expect(
      rewriteMigrationLink(
        "./nested/other.md?view=all#details",
        "guide.md",
        mapping,
      ),
    ).toEqual({
      value: "./nested/other.html?view=all#details",
      kind: "rewritten",
      targetPath: "nested/other.md",
    });
    expect(
      rewriteMigrationLink("https://example.com/a.md", "guide.md", mapping),
    ).toMatchObject({ kind: "unchanged" });
  });

  it("resolves case and Unicode-normalization variants consistently", () => {
    const mapping = new Map([
      ["nested/Cafe\u0301.md", "nested/Cafe\u0301.html"],
    ]);
    expect(
      rewriteMigrationLink("./NESTED/CAFÉ.MD#part", "guide.md", mapping),
    ).toMatchObject({
      kind: "rewritten",
      value: "./nested/Cafe%CC%81.html#part",
    });
  });

  it("rejects malformed and escaping paths without rewriting external URLs", () => {
    const mapping = new Map([["guide.md", "guide.html"]]);
    expect(rewriteMigrationLink("/guide.md", "guide.md", mapping)).toMatchObject({
      kind: "invalid",
      targetPath: "guide.md",
    });
    expect(rewriteMigrationLink("../guide.md", "nested/page.md", mapping).kind).toBe("rewritten");
    expect(rewriteMigrationLink("../../guide.md", "nested/page.md", mapping).kind).toBe("invalid");
    expect(rewriteMigrationLink("./%ZZ.md", "guide.md", mapping).kind).toBe("invalid");
    expect(rewriteMigrationLink("?bad=%ZZ", "guide.md", mapping).kind).toBe("invalid");
    expect(rewriteMigrationLink("./guide.md?bad=%ZZ", "guide.md", mapping))
      .toMatchObject({ kind: "invalid", targetPath: "guide.md" });
    expect(rewriteMigrationLink("//example.test/guide.md", "guide.md", mapping).kind).toBe("unchanged");
    expect(rewriteMigrationLink("mailto:guide.md", "guide.md", mapping).kind).toBe("unchanged");
  });
});

describe("portable migration paths", () => {
  it("rejects Windows-invalid names before write", () => {
    expect(portableMigrationPathProblem("nested/guide.html")).toBeNull();
    expect(portableMigrationPathProblem("nested/bad:name.md")).toContain(
      "Windowsで無効な文字",
    );
    expect(portableMigrationPathProblem("nested/CON.md")).toContain(
      "Windowsの予約名",
    );
    expect(portableMigrationPathProblem("nested/trailing .md")).toBeNull();
    expect(portableMigrationPathProblem("nested/trailing. /guide.md")).toContain(
      "segment末尾",
    );
  });
});

describe("Markdown migration lifecycle", () => {
  it("plans a lint-clean, content-equivalent migration without writing", async () => {
    const before = await readFile(join(root, "guide.md"), "utf8");
    const plan = await createMigrationPlan({ contentRoot: root, language: "en" });

    expect(plan.summary).toMatchObject({
      markdown: 2,
      creates: 2,
      captions: 1,
      htmlRewrites: 1,
      errors: 0,
      parityMatched: 2,
    });
    expect(await readFile(join(root, "guide.md"), "utf8")).toBe(before);
    await expect(access(join(root, "guide.html"))).rejects.toThrow();
    await expect(access(join(root, ".spec-html"))).rejects.toThrow();
  });

  it("blocks existing targets and ambiguous non-navigation references", async () => {
    await Promise.all([
      writeFile(
        join(root, "guide.html"),
        '<article lang="en"><h1>Existing</h1></article>',
      ),
      writeFile(
        join(root, "index.html"),
        '<article lang="en"><h1>Index</h1><img src="./nested/other.md" alt="Other"></article>',
      ),
    ]);

    const plan = await createMigrationPlan({ contentRoot: root, language: "en" });
    expect(plan.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["MIG001", "MIG006"]),
    );
  });

  it("blocks a symlinked archive directory before any content mutation", async () => {
    const external = await mkdtemp(join(tmpdir(), "spec-html-external-"));
    try {
      await symlink(external, join(root, ".archived"), "dir");
      const plan = await createMigrationPlan({ contentRoot: root, language: "en" });
      expect(plan.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ file: "guide.md", code: "MIG007" }),
        ]),
      );
      const result = await applyMigration({
        contentRoot: root,
        language: "en",
        warningsAsErrors: false,
      });
      expect(result.migrationId).toBeNull();
      await expect(access(join(root, "guide.html"))).rejects.toThrow();
      await expect(access(join(external, "guide.md"))).rejects.toThrow();
      await expect(readFile(join(root, "guide.md"), "utf8")).resolves.toContain("# Guide");
    } finally {
      await rm(external, { recursive: true, force: true });
    }
  });

  it("blocks a pre-existing archived copy before creating HTML", async () => {
    await mkdir(join(root, ".archived"));
    await writeFile(join(root, ".archived", "guide.md"), "# Older copy\n");

    const plan = await createMigrationPlan({ contentRoot: root, language: "en" });
    expect(plan.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ file: "guide.md", code: "MIG007" }),
      ]),
    );
    const result = await applyMigration({
      contentRoot: root,
      language: "en",
      warningsAsErrors: false,
    });
    expect(result.migrationId).toBeNull();
    await expect(access(join(root, "guide.html"))).rejects.toThrow();
    await expect(readFile(join(root, "guide.md"), "utf8")).resolves.toContain("# Guide");
    await expect(readFile(join(root, ".archived", "guide.md"), "utf8")).resolves.toContain("Older");
  });

  it("blocks case-normalized collisions with an archived copy", async () => {
    await mkdir(join(root, ".archived"));
    await writeFile(join(root, ".archived", "GUIDE.md"), "# Older copy\n");

    const plan = await createMigrationPlan({ contentRoot: root, language: "en" });
    expect(plan.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: "guide.md",
          code: "MIG007",
        }),
      ]),
    );
  });

  it("rewrites case-mismatched links to the canonical output path", async () => {
    await writeFile(
      join(root, "index.html"),
      '<article lang="en"><h1>Index</h1><p><a href="./NESTED/OTHER.MD#details">Other</a></p></article>\n',
    );
    const plan = await createMigrationPlan({ contentRoot: root, language: "en" });
    expect(plan.summary.errors).toBe(0);
    expect(plan.replacements[0]?.output).toContain(
      'href="./nested/other.html#details"',
    );
  });

  it("preserves linked-image accessible labels in parity", async () => {
    await writeFile(
      join(root, "guide.md"),
      "# Guide\n\n[![Pixel](./pixel.svg)](./nested/other.md)\n",
    );
    const plan = await createMigrationPlan({ contentRoot: root, language: "en" });
    expect(plan.issues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ file: "guide.md", code: "MIG004" }),
      ]),
    );
  });

  it("blocks lossy and unsupported syntax unless lossy behavior is explicit", async () => {
    await writeFile(
      join(root, "guide.md"),
      "---\ntitle: Guide\n---\n\n# Guide\n\n<div>raw</div>\n\nFootnote[^1].\n\n[^1]: note\n",
    );
    const blocked = await createMigrationPlan({ contentRoot: root, language: "en" });
    expect(blocked.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["MIG008", "MIG009"]),
    );
    const allowed = await createMigrationPlan({
      contentRoot: root,
      language: "en",
      allowLossy: true,
    });
    expect(allowed.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "MIG101", severity: "warning" }),
      ]),
    );
    expect(allowed.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "MIG008", severity: "error" }),
      ]),
    );
  });

  it("classifies supported-extension boundaries instead of silently degrading them", async () => {
    await writeFile(
      join(root, "guide.md"),
      `+++
title = "Guide"
+++

# Guide {#custom}

[[Wiki page]]

> [!NOTE]
> Alert

$$
x = 1
$$

\`\`\`math
y = 2
\`\`\`

export Thing from "./thing.js"

<Widget value={thing} />

{thing}

:::note
Directive
:::
`,
    );
    const plan = await createMigrationPlan({ contentRoot: root, language: "en" });
    const unsupported = plan.issues.filter((issue) => issue.code === "MIG008");
    expect(unsupported.length).toBeGreaterThanOrEqual(10);
  });

  it("ignores extension-like examples inside code while retaining real syntax checks", async () => {
    await writeFile(
      join(root, "guide.md"),
      `# Guide

\`[[Inline code]]\`

    [[Indented code]]

> \`\`\`md
> [[Wiki page]]
> [!NOTE]
> $$
> export default Thing
> :::note
> \`\`\`

- \`\`\`md
  [[Nested wiki example]]
  \`\`\`
`,
    );
    const plan = await createMigrationPlan({ contentRoot: root, language: "en" });
    expect(plan.issues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ file: "guide.md", code: "MIG008" }),
      ]),
    );
  });

  it("keeps emphasis in GFM table cells and code language case in parity", async () => {
    await writeFile(
      join(root, "guide.md"),
      "# Guide\n\n## Matrix\n\n| Kind | Value |\n| --- | --- |\n| **Strong** | *Emphasis* |\n\n```TS\nconst ready = true;\n```\n",
    );
    const plan = await createMigrationPlan({ contentRoot: root, language: "en" });
    expect(plan.issues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ file: "guide.md", code: "MIG004" }),
      ]),
    );
  });

  it("does not borrow a table caption from a nested blockquote scope", async () => {
    await writeFile(
      join(root, "guide.md"),
      "> ## Quoted heading\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n",
    );
    const plan = await createMigrationPlan({ contentRoot: root, language: "en" });
    const guide = plan.sources.find((source) => source.path === "guide.md");
    expect(guide?.captions[0]?.caption).toBeNull();
    expect(guide?.output).not.toContain("<caption>Quoted heading</caption>");
    expect(plan.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ file: "guide.html", code: "TBL001" }),
      ]),
    );
  });

  it("adds Mermaid figcaptions and blocks uncaptioned diagrams", async () => {
    await writeFile(
      join(root, "guide.md"),
      "# Guide\n\n## Flow\n\n```mermaid\ngraph TD\n  A-->B\n```\n",
    );
    const captioned = await createMigrationPlan({ contentRoot: root, language: "en" });
    const output = captioned.sources.find((source) => source.path === "guide.md")?.output;
    expect(output).toContain("<figure>");
    expect(output).toMatch(/<figcaption>\s*Flow\s*<\/figcaption>/);
    expect(captioned.issues).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "FIG101" })]),
    );

    await writeFile(join(root, "guide.md"), "```mermaid\ngraph TD\n  A-->B\n```\n");
    const uncaptioned = await createMigrationPlan({ contentRoot: root, language: "en" });
    expect(uncaptioned.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ file: "guide.md", code: "MIG010" }),
      ]),
    );
  });

  it("blocks non-navigation, download, data, style, and script references", async () => {
    await writeFile(join(root, "my guide.md"), "# Space\n");
    await writeFile(
      join(root, "index.html"),
      `<article lang="en"><h1>Index</h1>
<form action="./guide.md"></form>
<a href="./guide.md" download>Download</a>
<a href="./nested/other.md" ping="./guide.md">Ping</a>
<img src="./pixel.svg" srcset="./guide.md 2x" alt="Pixel">
<meta http-equiv="refresh" content="0; url=./guide.md">
<div data-source="./guide.md" style="background:url('./guide.md')"></div>
<script>const source = "./guide.md";</script>
<script>const spaced = "./my guide.md";</script>
<link rel="preload" imagesrcset="./guide.md 2x">
<svg><use xlink:href="./guide.md"></use></svg>
<button onclick="location.href='./guide.md'">Open</button>
<iframe srcdoc="&lt;a href=&quot;./guide.md&quot;&gt;Guide&lt;/a&gt;"></iframe>
</article>\n`,
    );
    const plan = await createMigrationPlan({ contentRoot: root, language: "en" });
    const blockers = plan.issues.filter((issue) => issue.code === "MIG006");
    expect(blockers).toHaveLength(13);
    const messages = blockers.map((blocker) => blocker.message);
    for (const expected of [
      "button[onclick]",
      "iframe[srcdoc]",
      "use[xlink:href]",
      "script[text]",
    ]) {
      expect(messages.some((message) => message.includes(expected))).toBe(true);
    }
  });

  it("blocks HTML-character-reference paths instead of leaving Markdown links", async () => {
    await writeFile(
      join(root, "index.html"),
      '<article lang="en"><h1>Index</h1><a href="./guide&#46;md">Guide</a></article>\n',
    );
    const plan = await createMigrationPlan({ contentRoot: root, language: "en" });
    expect(plan.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ file: "index.html", code: "MIG006" }),
      ]),
    );
  });

  it("blocks invalid local URL forms that still target migrated Markdown", async () => {
    await writeFile(
      join(root, "index.html"),
      '<article lang="en"><h1>Index</h1><a href="/guide.md">Root</a><a href="./guide.md?bad=%ZZ">Malformed</a></article>\n',
    );
    const plan = await createMigrationPlan({ contentRoot: root, language: "en" });
    expect(
      plan.issues.filter((issue) => issue.code === "MIG006"),
    ).toHaveLength(2);
  });

  it("preserves image labels in headings and table cells", async () => {
    await writeFile(
      join(root, "guide.md"),
      "# ![Pixel](./pixel.svg) Guide\n\n## Matrix\n\n| Icon | Value |\n| --- | --- |\n| ![Pixel](./pixel.svg) | 1 |\n",
    );
    const plan = await createMigrationPlan({ contentRoot: root, language: "en" });
    expect(plan.issues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ file: "guide.md", code: "MIG004" }),
      ]),
    );
  });

  it("uses a per-document language map", async () => {
    const plan = await createMigrationPlan({
      contentRoot: root,
      language: "en",
      languages: new Map([["nested/other.md", "ja-JP"]]),
    });
    expect(plan.sources.find((source) => source.path === "guide.md")?.language).toBe("en");
    expect(plan.sources.find((source) => source.path === "nested/other.md")?.output)
      .toContain('<article lang="ja-JP">');
  });

  it("blocks oversized inputs before reading or compiling them", async () => {
    const oversized = join(root, "oversized.md");
    await writeFile(oversized, "# Oversized\n");
    await truncate(oversized, 64 * 1024 * 1024 + 1);

    const plan = await createMigrationPlan({ contentRoot: root, language: "en" });
    expect(plan.sources).toHaveLength(0);
    expect(plan.summary.inputBytes).toBeGreaterThan(64 * 1024 * 1024);
    expect(plan.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ file: "oversized.md", code: "MIG014" }),
      ]),
    );
  });

  it("includes atomic temporary names in the portable path-length preflight", async () => {
    const segments: string[] = [];
    let directory = root;
    while (Buffer.byteLength(join(directory, "deep.html"), "utf8") < 205) {
      const segment = `depth-${String(segments.length).padStart(2, "0")}-xxxxxxxxxx`;
      segments.push(segment);
      directory = join(directory, segment);
    }
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "deep.md"), "# Deep\n");
    expect(Buffer.byteLength(join(directory, "deep.html"), "utf8")).toBeLessThanOrEqual(240);

    const plan = await createMigrationPlan({ contentRoot: root, language: "en" });
    expect(plan.summary.maxPathLength).toBeGreaterThan(240);
    expect(plan.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "MIG011" })]),
    );
  });

  it("keeps a table without a preceding heading as a migration blocker", async () => {
    await writeFile(
      join(root, "bare.md"),
      "| Key | Value |\n| --- | --- |\n| A | B |\n",
    );

    const plan = await createMigrationPlan({ contentRoot: root, language: "en" });
    expect(plan.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ file: "bare.html", code: "TBL001" }),
      ]),
    );
  });

  it("writes, guards Restore, and rolls the whole migration back", async () => {
    const migrationId = "20260819T120000000Z-a1b2c3";
    const result = await applyMigration({
      contentRoot: root,
      language: "en",
      warningsAsErrors: false,
      createId: () => migrationId,
    });

    expect(result.migrationId).toBe(migrationId);
    await expect(access(join(root, "guide.md"))).rejects.toThrow();
    await expect(readFile(join(root, "guide.html"), "utf8")).resolves.toMatch(
      /<caption>\s*Status\s*<\/caption>/,
    );
    await expect(readFile(join(root, "index.html"), "utf8")).resolves.toContain(
      'href="./guide.html"',
    );
    await expect(getDocumentArchiveState(root, "guide.md")).resolves.toEqual({
      archived: true,
      restoreAllowed: false,
      migrationId,
      migrationOutputPath: "guide.html",
    });
    await expect(
      setDocumentArchived(root, "guide.md", false),
    ).rejects.toBeInstanceOf(MigrationManagedDocumentError);

    await rollbackMigration(root, migrationId);
    await expect(readFile(join(root, "guide.md"), "utf8")).resolves.toContain(
      "# Guide",
    );
    await expect(access(join(root, "guide.html"))).rejects.toThrow();
    await expect(readFile(join(root, "index.html"), "utf8")).resolves.toContain(
      'href="./guide.md"',
    );
  });

  it.each(["create", "replace", "archive", "journal"] as const)(
    "automatically rolls back after a %s failure",
    async (failureKind) => {
      const migrationId = "20260819T125000000Z-abcdef";
      await expect(
        applyMigration({
          contentRoot: root,
          language: "en",
          warningsAsErrors: false,
          createId: () => migrationId,
          operationHook: ({ kind, phase, index }) => {
            const failureIndex = failureKind === "journal" ? 1 : 0;
            if (
              kind === failureKind &&
              phase === "after" &&
              index === failureIndex
            ) {
              return Promise.reject(new Error(`injected ${kind} failure`));
            }
            return Promise.resolve();
          },
        }),
      ).rejects.toThrow(`injected ${failureKind} failure`);

      await expect(readFile(join(root, "guide.md"), "utf8")).resolves.toContain(
        "# Guide",
      );
      await expect(readFile(join(root, "nested", "other.md"), "utf8")).resolves.toContain(
        "# Other",
      );
      await expect(access(join(root, "guide.html"))).rejects.toThrow();
      await expect(readFile(join(root, "index.html"), "utf8")).resolves.toContain(
        'href="./guide.md"',
      );
    },
  );

  it("rescans the final document set and rolls back a late Markdown addition", async () => {
    await expect(
      applyMigration({
        contentRoot: root,
        language: "en",
        warningsAsErrors: false,
        createId: () => "20260819T140000000Z-fedcba",
        operationHook: async ({ kind, phase, index }) => {
          if (kind === "archive" && phase === "after" && index === 1) {
            await writeFile(join(root, "late.md"), "# Late\n");
          }
        },
      }),
    ).rejects.toThrow("commit直前にactive Markdownが残っています");
    await expect(readFile(join(root, "guide.md"), "utf8")).resolves.toContain("# Guide");
    await expect(access(join(root, "guide.html"))).rejects.toThrow();
    await expect(readFile(join(root, "late.md"), "utf8")).resolves.toContain("# Late");
  });

  it("counts duplicate final diagnostics and rolls back a late lint regression", async () => {
    await writeFile(
      join(root, "baseline.html"),
      '<article lang="en"><h1>Baseline</h1><a href="./missing.html">Missing</a></article>\n',
    );
    await expect(
      applyMigration({
        contentRoot: root,
        language: "en",
        warningsAsErrors: false,
        createId: () => "20260819T142000000Z-fedcba",
        operationHook: async ({ kind, phase, index }) => {
          if (kind === "archive" && phase === "after" && index === 1) {
            const path = join(root, "baseline.html");
            const source = await readFile(path, "utf8");
            await writeFile(
              path,
              source.replace(
                "</article>",
                '<a href="./missing.html">Missing again</a></article>',
              ),
            );
          }
        },
      }),
    ).rejects.toThrow("commit直前のproject再検証に失敗しました");
    await expect(readFile(join(root, "guide.md"), "utf8")).resolves.toContain("# Guide");
    await expect(access(join(root, "guide.html"))).rejects.toThrow();
  });

  it("recovers a crash that left both sides of the archive hardlink", async () => {
    const migrationId = "20260819T145000000Z-aabbdd";
    const source = await readFile(join(root, "guide.md"), "utf8");
    await mkdir(join(root, ".archived"));
    await link(join(root, "guide.md"), join(root, ".archived", "guide.md"));
    await createMigrationStorage(root, migrationId);
    const journal: MigrationJournal = {
      version: 1,
      id: migrationId,
      state: "applying",
      createdAt: "2026-08-19T14:50:00.000Z",
      language: "en",
      sources: [{
        path: "guide.md",
        outputPath: "guide.html",
        digest: digestText(source),
        outputDigest: digestText("output"),
        archived: false,
      }],
      creates: [{
        path: "guide.html",
        digest: digestText("output"),
        applied: false,
      }],
      replacements: [],
    };
    await writeMigrationJournal(root, journal, true);

    await rollbackMigration(root, migrationId);
    await expect(readFile(join(root, "guide.md"), "utf8")).resolves.toBe(source);
    await expect(access(join(root, ".archived", "guide.md"))).rejects.toThrow();
  });

  it("keeps Restore guarded while an incomplete rollback is awaiting recovery", async () => {
    const migrationId = "20260819T146000000Z-aabbdd";
    await applyMigration({
      contentRoot: root,
      language: "en",
      warningsAsErrors: false,
      createId: () => migrationId,
    });
    const journal = await readMigrationJournal(root, migrationId);
    journal.state = "rolling-back";
    await writeMigrationJournal(root, journal, false);

    await expect(
      setDocumentArchived(root, "guide.md", false),
    ).rejects.toBeInstanceOf(MigrationManagedDocumentError);
    await rollbackMigration(root, migrationId);
    await expect(readFile(join(root, "guide.md"), "utf8")).resolves.toContain(
      "# Guide",
    );
  });

  it("preserves edited HTML when finalizing and closes rollback", async () => {
    const migrationId = "20260819T130000000Z-d4e5f6";
    await applyMigration({
      contentRoot: root,
      language: "en",
      warningsAsErrors: false,
      createId: () => migrationId,
    });
    const outputPath = join(root, "guide.html");
    const edited = (await readFile(outputPath, "utf8")).replace(
      /<caption>\s*Status\s*<\/caption>/,
      "<caption>Current status</caption>",
    );
    await writeFile(outputPath, edited);

    await expect(rollbackMigration(root, migrationId)).rejects.toBeInstanceOf(
      MigrationBlockedError,
    );
    await finalizeMigration(root, migrationId);
    await expect(readFile(outputPath, "utf8")).resolves.toContain(
      "<caption>Current status</caption>",
    );
    await expect(
      access(join(root, ".spec-html", "migrations", migrationId, "backups")),
    ).rejects.toThrow();
    await expect(rollbackMigration(root, migrationId)).rejects.toBeInstanceOf(
      MigrationBlockedError,
    );
  });

  it("refuses a new write while an unfinished journal exists", async () => {
    const migrationId = "20260819T160000000Z-112233";
    await createMigrationStorage(root, migrationId);
    const journal: MigrationJournal = {
      version: 1,
      id: migrationId,
      state: "applying",
      createdAt: "2026-08-19T16:00:00.000Z",
      language: "en",
      sources: [],
      creates: [],
      replacements: [],
    };
    await writeMigrationJournal(root, journal, true);

    await expect(
      applyMigration({
        contentRoot: root,
        language: "en",
        warningsAsErrors: false,
      }),
    ).rejects.toThrow(`先にrollbackしてください: ${migrationId}`);
  });

  it("rejects internally inconsistent migration journals", () => {
    const digest = "a".repeat(64);
    const outputDigest = "b".repeat(64);
    const valid: MigrationJournal = {
      version: 1,
      id: "20260819T170000000Z-112233",
      state: "prepared",
      createdAt: "2026-08-19T17:00:00.000Z",
      language: "en",
      sources: [{
        path: "guide.md",
        outputPath: "guide.html",
        digest,
        outputDigest,
        archived: false,
      }],
      creates: [{ path: "guide.html", digest: outputDigest, applied: false }],
      replacements: [{
        path: "index.html",
        beforeDigest: digest,
        afterDigest: outputDigest,
        backupPath: "backups/existing-html/index.html",
        applied: false,
      }],
    };
    expect(() => validateMigrationJournal(valid)).not.toThrow();
    expect(() => validateMigrationJournal({ ...valid, creates: [] })).toThrow(
      "sourceとcreateが一対一ではありません",
    );
    expect(() => validateMigrationJournal({
      ...valid,
      sources: [{ ...valid.sources[0]!, path: "guide.html" }],
    })).toThrow("文書形式または出力pathが不正です");
    expect(() => validateMigrationJournal({
      ...valid,
      replacements: [{
        ...valid.replacements[0]!,
        backupPath: "backups/existing-html/other.html",
      }],
    })).toThrow("不正なbackup path");
    expect(() => validateMigrationJournal({
      ...valid,
      state: "committed",
    })).toThrow("stateと適用flagが整合しません");
    expect(() => validateMigrationJournal({
      ...valid,
      replacements: [{
        ...valid.replacements[0]!,
        path: ".spec-html/journal.html",
        backupPath: "backups/existing-html/.spec-html/journal.html",
      }],
    })).toThrow("不正なcontent path");
  });
});
