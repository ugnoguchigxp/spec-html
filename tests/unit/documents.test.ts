import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findContentDocuments } from "../../src/content/documents.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("findContentDocuments", () => {
  it("returns sorted HTML files and excludes hidden, nav, node_modules, and symlinks", async () => {
    const root = await mkdtemp(join(tmpdir(), "spec-html-documents-"));
    roots.push(root);
    await mkdir(join(root, "nested"), { recursive: true });
    await mkdir(join(root, ".hidden"), { recursive: true });
    await mkdir(join(root, "node_modules", "package"), { recursive: true });
    await Promise.all([
      writeFile(join(root, "z.HTML"), "", "utf8"),
      writeFile(join(root, "nav.html"), "", "utf8"),
      writeFile(join(root, "nested", "a.html"), "", "utf8"),
      writeFile(join(root, ".hidden", "hidden.html"), "", "utf8"),
      writeFile(join(root, "node_modules", "package", "ignored.html"), "", "utf8"),
      writeFile(join(root, "plain.txt"), "", "utf8"),
    ]);
    await symlink(join(root, "nested", "a.html"), join(root, "link.html"));

    const documents = await findContentDocuments(root);
    expect(documents.map((document) => document.path)).toEqual(["nested/a.html", "z.HTML"]);
  });
});
