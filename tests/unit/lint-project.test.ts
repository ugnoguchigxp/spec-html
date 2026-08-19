import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { lintProject } from "../../src/lint/project.js";

const temporaryRoots: string[] = [];

async function createProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "spec-html-lint-"));
  temporaryRoots.push(root);
  return root;
}

async function writeDocument(
  root: string,
  path: string,
  body: string,
): Promise<void> {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, body, "utf8");
}

const ARTICLE = (title: string, body = "") =>
  `<article lang="en"><h1>${title}</h1>${body}</article>`;

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("lintProject", () => {
  it("resolves local assets and cross-document fragments", async () => {
    const root = await createProject();
    await writeDocument(
      root,
      "a.html",
      ARTICLE(
        "A",
        '<a href="b.html#target">B</a><img src="assets/pixel.svg" alt="Pixel">',
      ),
    );
    await writeDocument(
      root,
      "b.html",
      '<article id="target" lang="en"><h1>B</h1></article>',
    );
    await mkdir(join(root, "assets"), { recursive: true });
    await writeFile(join(root, "assets", "pixel.svg"), "<svg></svg>", "utf8");

    const result = await lintProject(root);
    expect(result.summary).toEqual({ files: 2, errors: 0, warnings: 0 });
  });

  it("resolves same-document fragments against the source file", async () => {
    const root = await createProject();
    await writeDocument(
      root,
      "a.html",
      ARTICLE(
        "A",
        '<p id="target">Target</p><a href="#target">Valid</a><a href="#missing">Missing</a>',
      ),
    );

    const result = await lintProject(root);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      file: "a.html",
      rule: "REF002",
      detail: "#missing",
    });
  });

  it("reports unresolved fragments and local files at the URL attribute", async () => {
    const root = await createProject();
    await writeDocument(
      root,
      "a.html",
      ARTICLE(
        "A",
        '<a href="b.html#missing">B</a><img src="missing.svg" alt="Missing">',
      ),
    );
    await writeDocument(root, "b.html", ARTICLE("B"));

    const result = await lintProject(root);
    expect(result.diagnostics.map((diagnostic) => diagnostic.rule)).toEqual([
      "REF002",
      "REF003",
    ]);
    expect(
      result.diagnostics.every((diagnostic) => diagnostic.file === "a.html"),
    ).toBe(true);
  });

  it("allows external URLs but rejects unsafe and malformed local references", async () => {
    const root = await createProject();
    await writeDocument(
      root,
      "a.html",
      ARTICLE(
        "A",
        '<a href="https://example.com">External</a><a href="https://[invalid">Invalid external</a><a href="../outside.html">Outside</a><a href="broken%ZZ.html">Broken</a><a href="b.html?bad=%ZZ">Query</a><a href="?bad=%ZZ">Current query</a>',
      ),
    );
    await writeDocument(root, "b.html", ARTICLE("B"));

    const result = await lintProject(root);
    expect(result.diagnostics.map((diagnostic) => diagnostic.rule)).toEqual([
      "REF003",
      "REF003",
      "REF003",
      "REF003",
      "REF003",
    ]);
  });

  it("rejects separators that the viewer cannot serve", async () => {
    const root = await createProject();
    await writeDocument(
      root,
      "a.html",
      ARTICLE(
        "A",
        '<img src="assets%2Fpixel.svg" alt="Encoded slash"><img src="assets//pixel.svg" alt="Empty segment"><img src="assets/../assets/pixel.svg" alt="Parent segment"><img src="assets\\pixel.svg" alt="Backslash">',
      ),
    );
    await mkdir(join(root, "assets"), { recursive: true });
    await writeFile(join(root, "assets", "pixel.svg"), "<svg></svg>", "utf8");

    const result = await lintProject(root);

    expect(result.diagnostics).toHaveLength(3);
    expect(
      result.diagnostics.every((diagnostic) => diagnostic.rule === "REF003"),
    ).toBe(true);
  });

  it("does not report a missing fragment in a document with a syntax error", async () => {
    const root = await createProject();
    await writeDocument(
      root,
      "a.html",
      ARTICLE("A", '<a href="b.html#missing">B</a>'),
    );
    await writeDocument(root, "b.html", '<article lang="en');

    const result = await lintProject(root);
    expect(result.diagnostics.map((diagnostic) => diagnostic.rule)).toEqual([
      "HTML001",
    ]);
  });

  it("rejects references that escape through a symlink", async () => {
    const root = await createProject();
    const outside = `${root}-outside.html`;
    try {
      await writeFile(outside, ARTICLE("Outside"), "utf8");
      await symlink(outside, join(root, "outside.html"));
      await writeDocument(
        root,
        "a.html",
        ARTICLE("A", '<a href="outside.html">Outside</a>'),
      );

      const result = await lintProject(root);
      expect(result.diagnostics.map((diagnostic) => diagnostic.rule)).toEqual([
        "REF003",
      ]);
    } finally {
      await rm(outside, { force: true });
    }
  });

  it("returns an empty successful result for an empty directory", async () => {
    const root = await createProject();
    await expect(lintProject(root)).resolves.toMatchObject({
      diagnostics: [],
      summary: { files: 0, errors: 0, warnings: 0 },
    });
  });

  it("rejects missing paths and files", async () => {
    const root = await createProject();
    await writeFile(join(root, "not-a-directory"), "x", "utf8");
    await expect(lintProject(join(root, "missing"))).rejects.toThrow(
      "対象ディレクトリが見つかりません",
    );
    await expect(lintProject(join(root, "not-a-directory"))).rejects.toThrow(
      "ディレクトリではありません",
    );
  });
});
