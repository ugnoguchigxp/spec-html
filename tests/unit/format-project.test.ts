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
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { formatProject, writeFormatProject } from "../../src/format/project.js";

const roots: string[] = [];

async function createProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "spec-html-format-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("formatProject", () => {
  it("formats directory documents in sorted order", async () => {
    const root = await createProject();
    await mkdir(join(root, "nested"));
    await writeFile(join(root, "z.html"), '<article lang="en"><h1>Z</h1><p>Text</p></article>');
    await writeFile(join(root, "nested", "a.html"), '<article lang="en"><h1>A</h1></article>\n');

    const result = await formatProject(root);
    expect(result.documents.map((document) => document.file)).toEqual([
      "nested/a.html",
      "z.html",
    ]);
    expect(result.summary).toMatchObject({ files: 2, changed: 1, unchanged: 1, blocked: 0 });
  });

  it("accepts one HTML file", async () => {
    const root = await createProject();
    const file = join(root, "page.HTML");
    await writeFile(file, '<article lang="en"><h1>Page</h1></article>');

    const result = await formatProject(file);
    expect(result.documents.map((document) => document.file)).toEqual(["page.HTML"]);
  });

  it("returns an empty successful result for an empty directory", async () => {
    const root = await createProject();
    await expect(formatProject(root)).resolves.toEqual({
      documents: [],
      summary: {
        files: 0,
        changed: 0,
        unchanged: 0,
        blocked: 0,
        lintErrors: 0,
        lintWarnings: 0,
      },
    });
  });

  it("rejects invalid UTF-8 without replacing the original bytes", async () => {
    const root = await createProject();
    const file = join(root, "invalid.html");
    const source = Buffer.from([0x3c, 0x70, 0x3e, 0xc3, 0x28, 0x3c, 0x2f, 0x70, 0x3e]);
    await writeFile(file, source);

    await expect(formatProject(root)).rejects.toThrow("UTF-8");
    expect(await readFile(file)).toEqual(source);
  });

  it.each(["missing", "plain.txt", "nav.html"])(
    "rejects unsupported target %s",
    async (name) => {
      const root = await createProject();
      const target = join(root, name);
      if (name !== "missing") {
        await writeFile(target, "text");
      }
      await expect(formatProject(target)).rejects.toThrow();
    },
  );

  it("rejects a symbolic link target", async () => {
    const root = await createProject();
    const file = join(root, "page.html");
    const link = join(root, "link.html");
    await writeFile(file, '<article lang="en"><h1>Page</h1></article>');
    await symlink(file, link);
    await expect(formatProject(link)).rejects.toThrow("symbolic link");
  });
});

describe("writeFormatProject", () => {
  it("atomically writes changed files and preserves unchanged mtime and file mode", async () => {
    const root = await createProject();
    const changed = join(root, "changed.html");
    const unchanged = join(root, "unchanged.html");
    await writeFile(changed, '<article lang="en"><h1>Changed</h1><p>Text</p></article>');
    await writeFile(unchanged, '<article lang="en"><h1>Unchanged</h1></article>\n');
    await chmod(changed, 0o640);
    const old = new Date("2020-01-01T00:00:00.000Z");
    await utimes(unchanged, old, old);
    const beforeUnchanged = await lstat(unchanged);

    const result = await formatProject(root);
    await writeFormatProject(root, result);

    expect(await readFile(changed, "utf8")).toBe(`<article lang="en">
  <h1>Changed</h1>
  <p>Text</p>
</article>
`);
    expect((await lstat(changed)).mode & 0o777).toBe(0o640);
    expect((await lstat(unchanged)).mtimeMs).toBe(beforeUnchanged.mtimeMs);
    expect((await readdir(root)).some((name) => name.includes(".spec-html-"))).toBe(false);
  });

  it("writes nothing when preflight contains a blocked document", async () => {
    const root = await createProject();
    const ready = join(root, "a.html");
    const blocked = join(root, "b.html");
    const readySource = '<article lang="en"><h1>A</h1><p>Text</p></article>';
    await writeFile(ready, readySource);
    await writeFile(
      blocked,
      '<html><head><style>body { color: red }</style></head><body><article lang="en"><h1>B</h1></article></body></html>',
    );

    const result = await formatProject(root);
    expect(result.summary.blocked).toBe(1);
    await expect(writeFormatProject(root, result)).rejects.toThrow("書き換えませんでした");
    expect(await readFile(ready, "utf8")).toBe(readySource);
  });

  it("writes nothing when the target set changes after preflight", async () => {
    const root = await createProject();
    const original = join(root, "a.html");
    const originalSource = '<article lang="en"><h1>A</h1><p>Text</p></article>';
    await writeFile(original, originalSource);

    const result = await formatProject(root);
    await writeFile(join(root, "b.html"), '<article lang="en"><h1>B</h1></article>');

    await expect(writeFormatProject(root, result)).rejects.toThrow(
      "対象fileの集合が変わった",
    );
    expect(await readFile(original, "utf8")).toBe(originalSource);
  });

  it("writes nothing when file content changes after preflight", async () => {
    const root = await createProject();
    const first = join(root, "a.html");
    const second = join(root, "b.html");
    const firstSource = '<article lang="en"><h1>A</h1><p>Text</p></article>';
    const editedSource = '<article lang="en"><h1>Edited</h1></article>';
    await writeFile(first, firstSource);
    await writeFile(second, '<article lang="en"><h1>B</h1><p>Text</p></article>');

    const result = await formatProject(root);
    await writeFile(second, editedSource);

    await expect(writeFormatProject(root, result)).rejects.toThrow(
      "内容が変わった",
    );
    expect(await readFile(first, "utf8")).toBe(firstSource);
    expect(await readFile(second, "utf8")).toBe(editedSource);
  });

  it("reports completed and failed files when an atomic rename fails", async () => {
    const root = await createProject();
    const first = join(root, "a.html");
    const second = join(root, "b.html");
    const source = (title: string): string =>
      `<article lang="en"><h1>${title}</h1><p>Text</p></article>`;
    await writeFile(first, source("A"));
    await writeFile(second, source("B"));
    const result = await formatProject(root);
    let renameCalls = 0;

    await expect(writeFormatProject(root, result, {
      rename: async (from, to) => {
        renameCalls += 1;
        if (renameCalls === 2) {
          throw new Error("injected rename failure");
        }
        await rename(from, to);
      },
    })).rejects.toThrow(/完了=a\.html; 未処理=なし/);

    expect(await readFile(first, "utf8")).toContain("\n  <h1>A</h1>");
    expect(await readFile(second, "utf8")).toBe(source("B"));
    expect((await readdir(root)).some((name) => name.includes(".spec-html-")))
      .toBe(false);
  });

  it("does not retry a rename EEXIST error as a temporary-name collision", async () => {
    const root = await createProject();
    const file = join(root, "a.html");
    const source = '<article lang="en"><h1>A</h1><p>Text</p></article>';
    await writeFile(file, source);
    const result = await formatProject(root);
    let renameCalls = 0;
    const failure = Object.assign(new Error("injected EEXIST"), { code: "EEXIST" });

    await expect(writeFormatProject(root, result, {
      rename: () => {
        renameCalls += 1;
        return Promise.reject(failure);
      },
    })).rejects.toThrow("injected EEXIST");

    expect(renameCalls).toBe(1);
    expect(await readFile(file, "utf8")).toBe(source);
    expect((await readdir(root)).some((name) => name.includes(".spec-html-")))
      .toBe(false);
  });

  it("retries a colliding temporary name without removing the existing file", async () => {
    const root = await createProject();
    const file = join(root, "a.html");
    const collision = join(root, `.a.html.spec-html-${process.pid}-0.tmp`);
    await writeFile(file, '<article lang="en"><h1>A</h1><p>Text</p></article>');
    await writeFile(collision, "keep");
    const result = await formatProject(root);

    await writeFormatProject(root, result);

    expect(await readFile(file, "utf8")).toContain("\n  <h1>A</h1>");
    expect(await readFile(collision, "utf8")).toBe("keep");
  });
});
