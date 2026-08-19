import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ContentDocumentNotFoundError,
  getDocumentArchived,
  readArchivedDocuments,
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

describe("archive state", () => {
  it("starts empty and persists idempotent archive and restore updates", async () => {
    await expect(readArchivedDocuments(root)).resolves.toEqual(new Set());

    await setDocumentArchived(root, "overview.html", true);
    await setDocumentArchived(root, "overview.html", true);
    await expect(getDocumentArchived(root, "overview.html")).resolves.toBe(true);
    await expect(readFile(join(root, "overview.html"), "utf8")).resolves.toContain(
      "Overview",
    );

    await setDocumentArchived(root, "overview.html", false);
    await setDocumentArchived(root, "overview.html", false);
    await expect(getDocumentArchived(root, "overview.html")).resolves.toBe(false);
    await expect(readArchivedDocuments(root)).resolves.toEqual(new Set());
  });

  it("serializes concurrent updates without losing documents", async () => {
    await Promise.all([
      setDocumentArchived(root, "overview.html", true),
      setDocumentArchived(root, "nested/page.html", true),
    ]);

    await expect(readArchivedDocuments(root)).resolves.toEqual(
      new Set(["nested/page.html", "overview.html"]),
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

  it("does not silently replace a malformed manifest", async () => {
    await mkdir(join(root, ".spec-html"));
    await writeFile(join(root, ".spec-html", "archive.json"), "{bad json");

    await expect(readArchivedDocuments(root)).rejects.toThrow(
      "Archive manifestのJSONが不正です",
    );
    await expect(
      setDocumentArchived(root, "overview.html", true),
    ).rejects.toThrow("Archive manifestのJSONが不正です");
  });
});
