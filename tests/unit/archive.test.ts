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
  ContentDocumentNotFoundError,
  DocumentArchiveConflictError,
  findArchivedDocuments,
  getDocumentArchived,
  setDocumentArchived,
} from "../../src/content/archive.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "spec-html-archive-"));
  await mkdir(join(root, "nested"));
  await Promise.all([
    writeFile(join(root, "overview.html"), "<h1>Overview</h1>"),
    writeFile(join(root, "nested", "page.html"), "<h1>Page</h1>"),
  ]);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("archived documents", () => {
  it("moves a document into its sibling .archived directory and restores it", async () => {
    await expect(findArchivedDocuments(root)).resolves.toEqual([]);

    await setDocumentArchived(root, "nested/page.html", true);
    await setDocumentArchived(root, "nested/page.html", true);
    await expect(getDocumentArchived(root, "nested/page.html")).resolves.toBe(
      true,
    );
    await expect(
      readFile(join(root, "nested", ".archived", "page.html"), "utf8"),
    ).resolves.toContain("Page");
    await expect(access(join(root, "nested", "page.html"))).rejects.toThrow();
    await expect(findArchivedDocuments(root)).resolves.toMatchObject([
      { path: "nested/page.html" },
    ]);

    await setDocumentArchived(root, "nested/page.html", false);
    await setDocumentArchived(root, "nested/page.html", false);
    await expect(getDocumentArchived(root, "nested/page.html")).resolves.toBe(
      false,
    );
    await expect(
      readFile(join(root, "nested", "page.html"), "utf8"),
    ).resolves.toContain("Page");
    await expect(access(join(root, "nested", ".archived"))).rejects.toThrow();
  });

  it("serializes concurrent moves without losing documents", async () => {
    await Promise.all([
      setDocumentArchived(root, "overview.html", true),
      setDocumentArchived(root, "nested/page.html", true),
    ]);

    await expect(
      findArchivedDocuments(root).then((documents) =>
        documents.map((document) => document.path),
      ),
    ).resolves.toEqual(["nested/page.html", "overview.html"]);
  });

  it("makes a read started after an update observe the completed update", async () => {
    const update = setDocumentArchived(root, "overview.html", true);
    const observed = getDocumentArchived(root, "overview.html");

    await update;
    await expect(observed).resolves.toBe(true);
  });

  it("returns each update's state even when a later update is already queued", async () => {
    const archived = setDocumentArchived(root, "overview.html", true);
    const restored = setDocumentArchived(root, "overview.html", false);

    await expect(archived).resolves.toBe(true);
    await expect(restored).resolves.toBe(false);
    await expect(getDocumentArchived(root, "overview.html")).resolves.toBe(
      false,
    );
  });

  it("rejects missing documents and symlinks", async () => {
    await symlink(join(root, "overview.html"), join(root, "linked.html"));

    await expect(
      setDocumentArchived(root, "missing.html", true),
    ).rejects.toBeInstanceOf(ContentDocumentNotFoundError);
    await expect(
      setDocumentArchived(root, "linked.html", true),
    ).rejects.toBeInstanceOf(ContentDocumentNotFoundError);
  });

  it("reports a conflict when active and archived copies both exist", async () => {
    await mkdir(join(root, ".archived"));
    await writeFile(join(root, ".archived", "overview.html"), "<h1>Old</h1>");

    await expect(
      getDocumentArchived(root, "overview.html"),
    ).rejects.toBeInstanceOf(DocumentArchiveConflictError);
    await expect(
      setDocumentArchived(root, "overview.html", true),
    ).rejects.toBeInstanceOf(DocumentArchiveConflictError);
  });
});
