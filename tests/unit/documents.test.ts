import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  findHtmlDocuments,
  findViewerDocuments,
} from "../../src/content/documents.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("document discovery", () => {
  it("returns sorted viewer documents and excludes hidden, nav.html, node_modules, and symlinks", async () => {
    const root = await mkdtemp(join(tmpdir(), "spec-html-documents-"));
    roots.push(root);
    await mkdir(join(root, "nested"), { recursive: true });
    await mkdir(join(root, ".hidden"), { recursive: true });
    await mkdir(join(root, "node_modules", "package"), { recursive: true });
    await Promise.all([
      writeFile(join(root, "z.HTML"), "", "utf8"),
      writeFile(join(root, "nav.html"), "", "utf8"),
      writeFile(join(root, "nested", "a.html"), "", "utf8"),
      writeFile(join(root, "nested", "a.md"), "", "utf8"),
      writeFile(join(root, "notes.Markdown"), "", "utf8"),
      writeFile(join(root, "nav.md"), "", "utf8"),
      writeFile(join(root, ".hidden", "hidden.html"), "", "utf8"),
      writeFile(
        join(root, "node_modules", "package", "ignored.html"),
        "",
        "utf8",
      ),
      writeFile(join(root, "plain.txt"), "", "utf8"),
    ]);
    await symlink(join(root, "nested", "a.html"), join(root, "link.html"));

    const documents = await findViewerDocuments(root);
    expect(documents.map(({ path, format }) => ({ path, format }))).toEqual([
      { path: "nav.md", format: "markdown" },
      { path: "nested/a.html", format: "html" },
      { path: "nested/a.md", format: "markdown" },
      { path: "notes.Markdown", format: "markdown" },
      { path: "z.HTML", format: "html" },
    ]);

    await expect(findHtmlDocuments(root)).resolves.toEqual([
      {
        absolutePath: join(root, "nested", "a.html"),
        path: "nested/a.html",
        format: "html",
      },
      {
        absolutePath: join(root, "z.HTML"),
        path: "z.HTML",
        format: "html",
      },
    ]);
  });
});
