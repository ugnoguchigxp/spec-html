import {
  chmod,
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fixProject, writeFixProject } from "../../src/fix/project.js";

const roots: string[] = [];

async function createProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "spec-html-fix-"));
  roots.push(root);
  return root;
}

async function write(
  root: string,
  path: string,
  source: string,
): Promise<void> {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, source, "utf8");
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("fixProject", () => {
  it("fixes documents in sorted order", async () => {
    const root = await createProject();
    await write(
      root,
      "z.html",
      '<article lang="en"><h1>Z</h1><sectoin>Z</sectoin></article>',
    );
    await write(
      root,
      "nested/a.html",
      '<article lang="en"><h1>A</h1><div>A</dvi></article>',
    );

    const result = await fixProject(root);

    expect(result.documents.map((document) => document.file)).toEqual([
      "nested/a.html",
      "z.html",
    ]);
    expect(result.summary).toMatchObject({
      files: 2,
      changed: 2,
      blocked: 0,
      fixes: 2,
    });
  });

  it("fixes unambiguous ID, fragment, and local path values", async () => {
    const root = await createProject();
    await write(
      root,
      "a.html",
      '<article lang="en" aria-labelledby="titel"><h1 id="title">A</h1><a href="b.html#detials">B</a><img src="assets/daigram.svg" alt="Diagram"></article>',
    );
    await write(
      root,
      "b.html",
      '<article lang="en"><h1>B</h1><section id="details"><h2>Details</h2></section></article>',
    );
    await mkdir(join(root, "assets"));
    await writeFile(join(root, "assets", "diagram.svg"), "<svg></svg>", "utf8");

    const result = await fixProject(root);
    const output = result.documents.find(
      (document) => document.file === "a.html",
    )?.output;

    expect(output).toContain('aria-labelledby="title"');
    expect(output).toContain('href="b.html#details"');
    expect(output).toContain('src="assets/diagram.svg"');
    expect(result.summary.fixes).toBe(3);
  });

  it("does not change external URLs or ambiguous local candidates", async () => {
    const root = await createProject();
    const source =
      '<article lang="en"><h1>A</h1><a href="https://example.com/paht">External</a><img src="dagram.svg" alt="Diagram"></article>';
    await write(root, "a.html", source);
    await writeFile(join(root, "diagram.svg"), "<svg></svg>");
    await writeFile(join(root, "dagrom.svg"), "<svg></svg>");

    const result = await fixProject(root);

    expect(result.documents[0]?.output).toBe(source);
    expect(result.summary.changed).toBe(0);
  });

  it("does not reinterpret encoded separators and preserves URL whitespace", async () => {
    const root = await createProject();
    const source =
      '<article lang="en"><h1>A</h1><img src="assets%2Fdaigram.svg" alt="Encoded"><img src="  assets/daigram.svg  " alt="Spaced"></article>';
    await write(root, "a.html", source);
    await write(root, "assets/diagram.svg", "<svg></svg>");

    const result = await fixProject(root);
    const output = result.documents[0]?.output;

    expect(output).toContain('src="assets%2Fdaigram.svg"');
    expect(output).toContain('src="  assets/diagram.svg  "');
    expect(result.summary).toMatchObject({ changed: 1, fixes: 1, blocked: 0 });
  });

  it.each([
    [100, "ready", 0],
    [101, "blocked", 1],
  ] as const)(
    "handles %i reference fixes without returning a partial result",
    async (count, status, blocked) => {
      const root = await createProject();
      const references = Array.from(
        { length: count },
        () => '<span aria-labelledby="titel">Text</span>',
      ).join("");
      await write(
        root,
        "a.html",
        `<article lang="en"><h1 id="title">A</h1>${references}</article>`,
      );

      const result = await fixProject(root);

      expect(result.summary.blocked).toBe(blocked);
      expect(result.documents[0]?.status).toBe(status);
      expect(result.documents[0]?.fixes).toHaveLength(100);
      if (status === "blocked") {
        expect(result.documents[0]).toMatchObject({
          output: null,
          changed: false,
          problems: [{ code: "FIX002" }],
        });
      }
    },
  );

  it("accepts a single HTML file and rejects symlink targets", async () => {
    const root = await createProject();
    const file = join(root, "page.HTML");
    const link = join(root, "link.html");
    await writeFile(
      file,
      '<article lang="en"><h1>Page</h1><sectoin>X</sectoin></article>',
    );
    await symlink(file, link);

    await expect(fixProject(file)).resolves.toMatchObject({
      summary: { files: 1, changed: 1, blocked: 0 },
    });
    await expect(fixProject(link)).rejects.toThrow("symbolic link");
  });

  it("rejects invalid UTF-8 without replacing the original bytes", async () => {
    const root = await createProject();
    const file = join(root, "invalid.html");
    const source = Buffer.from([
      0x3c, 0x73, 0x65, 0x63, 0x74, 0x6f, 0x69, 0x6e, 0x3e, 0xc3, 0x28, 0x3c,
      0x2f, 0x73, 0x65, 0x63, 0x74, 0x6f, 0x69, 0x6e, 0x3e,
    ]);
    await writeFile(file, source);

    await expect(fixProject(root)).rejects.toThrow("UTF-8");
    expect(await readFile(file)).toEqual(source);
  });
});

describe("writeFixProject", () => {
  it("atomically writes changed files and preserves unchanged metadata", async () => {
    const root = await createProject();
    const changed = join(root, "changed.html");
    const unchanged = join(root, "unchanged.html");
    await writeFile(
      changed,
      '<article lang="en"><h1>A</h1><sectoin>X</sectoin></article>',
    );
    await writeFile(unchanged, '<article lang="en"><h1>B</h1></article>');
    await chmod(changed, 0o640);
    const changedMode = (await lstat(changed)).mode & 0o777;
    const old = new Date("2020-01-01T00:00:00.000Z");
    await utimes(unchanged, old, old);
    const beforeUnchanged = await lstat(unchanged);

    const result = await fixProject(root);
    await writeFixProject(root, result);

    expect(await readFile(changed, "utf8")).toContain("<section>X</section>");
    expect((await lstat(changed)).mode & 0o777).toBe(changedMode);
    expect((await lstat(unchanged)).mtimeMs).toBe(beforeUnchanged.mtimeMs);
    expect(
      (await readdir(root)).some((name) => name.includes(".spec-html-fix-")),
    ).toBe(false);
  });

  it("writes nothing when one document has ambiguous syntax", async () => {
    const root = await createProject();
    const ready = join(root, "a.html");
    const blocked = join(root, "b.html");
    const readySource =
      '<article lang="en"><h1>A</h1><sectoin>X</sectoin></article>';
    await writeFile(ready, readySource);
    await writeFile(
      blocked,
      '<article lang="en"><h1>B</h1><img src="x alt="X" broken="y></article>',
    );

    const result = await fixProject(root);

    expect(result.summary.blocked).toBe(1);
    await expect(writeFixProject(root, result)).rejects.toThrow(
      "書き換えませんでした",
    );
    expect(await readFile(ready, "utf8")).toBe(readySource);
  });

  it("writes nothing when the target set changes after preflight", async () => {
    const root = await createProject();
    const original = join(root, "a.html");
    const source =
      '<article lang="en"><h1>A</h1><sectoin>X</sectoin></article>';
    await writeFile(original, source);
    const result = await fixProject(root);
    await writeFile(
      join(root, "b.html"),
      '<article lang="en"><h1>B</h1></article>',
    );

    await expect(writeFixProject(root, result)).rejects.toThrow(
      "対象fileの集合が変わった",
    );
    expect(await readFile(original, "utf8")).toBe(source);
  });

  it("writes nothing when file content changes after preflight", async () => {
    const root = await createProject();
    const first = join(root, "a.html");
    const second = join(root, "b.html");
    const firstSource =
      '<article lang="en"><h1>A</h1><sectoin>X</sectoin></article>';
    const editedSource = '<article lang="en"><h1>Edited</h1></article>';
    await writeFile(first, firstSource);
    await writeFile(
      second,
      '<article lang="en"><h1>B</h1><sectoin>Y</sectoin></article>',
    );

    const result = await fixProject(root);
    await writeFile(second, editedSource);

    await expect(writeFixProject(root, result)).rejects.toThrow(
      "内容が変わった",
    );
    expect(await readFile(first, "utf8")).toBe(firstSource);
    expect(await readFile(second, "utf8")).toBe(editedSource);
  });

  it("writes nothing when an unchanged file changes after preflight", async () => {
    const root = await createProject();
    const changed = join(root, "a.html");
    const unchanged = join(root, "b.html");
    const changedSource =
      '<article lang="en"><h1>A</h1><sectoin>X</sectoin></article>';
    const editedSource = '<article lang="en"><h1>Edited</h1></article>';
    await writeFile(changed, changedSource);
    await writeFile(unchanged, '<article lang="en"><h1>B</h1></article>');

    const result = await fixProject(root);
    await writeFile(unchanged, editedSource);

    await expect(writeFixProject(root, result)).rejects.toThrow(
      "内容が変わった",
    );
    expect(await readFile(changed, "utf8")).toBe(changedSource);
    expect(await readFile(unchanged, "utf8")).toBe(editedSource);
  });

  it("rejects a target replaced by a symbolic link after preflight", async () => {
    const root = await createProject();
    const outsideRoot = await createProject();
    const file = join(root, "a.html");
    const backup = join(root, ".a.html.backup");
    const outside = join(outsideRoot, "outside.txt");
    const source =
      '<article lang="en"><h1>A</h1><sectoin>X</sectoin></article>';
    await writeFile(file, source);
    await writeFile(outside, "outside");

    const result = await fixProject(root);
    await rename(file, backup);
    await symlink(outside, file);

    await expect(writeFixProject(root, result)).rejects.toThrow(
      "対象fileの集合が変わった",
    );
    expect(await readFile(backup, "utf8")).toBe(source);
    expect(await readFile(outside, "utf8")).toBe("outside");
  });

  it("reports completed and failed files when an atomic rename fails", async () => {
    const root = await createProject();
    const first = join(root, "a.html");
    const second = join(root, "b.html");
    const source = (title: string): string =>
      `<article lang="en"><h1>${title}</h1><sectoin>Text</sectoin></article>`;
    await writeFile(first, source("A"));
    await writeFile(second, source("B"));
    const result = await fixProject(root);
    let renameCalls = 0;

    await expect(
      writeFixProject(root, result, {
        rename: async (from, to) => {
          renameCalls += 1;
          if (renameCalls === 2) {
            throw new Error("injected rename failure");
          }
          await rename(from, to);
        },
      }),
    ).rejects.toThrow(/完了=a\.html; 未処理=なし/);

    expect(await readFile(first, "utf8")).toContain("<section>Text</section>");
    expect(await readFile(second, "utf8")).toBe(source("B"));
    expect(
      (await readdir(root)).some((name) => name.includes(".spec-html-fix-")),
    ).toBe(false);
  });

  it("does not retry a rename EEXIST error as a temporary-name collision", async () => {
    const root = await createProject();
    const file = join(root, "a.html");
    const source =
      '<article lang="en"><h1>A</h1><sectoin>Text</sectoin></article>';
    await writeFile(file, source);
    const result = await fixProject(root);
    let renameCalls = 0;
    const failure = Object.assign(new Error("injected EEXIST"), {
      code: "EEXIST",
    });

    await expect(
      writeFixProject(root, result, {
        rename: () => {
          renameCalls += 1;
          return Promise.reject(failure);
        },
      }),
    ).rejects.toThrow("injected EEXIST");

    expect(renameCalls).toBe(1);
    expect(await readFile(file, "utf8")).toBe(source);
    expect(
      (await readdir(root)).some((name) => name.includes(".spec-html-fix-")),
    ).toBe(false);
  });
});
