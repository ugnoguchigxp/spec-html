import {
  mkdtemp,
  mkdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  InvalidRequestPathError,
  resolveRequestFile,
} from "../../src/server/static-file.js";

let root: string;
let fixtureRoot: string;

beforeEach(async () => {
  fixtureRoot = await mkdtemp(join(tmpdir(), "spec-html-paths-"));
  root = join(fixtureRoot, "content");
  await mkdir(join(root, "nested"), { recursive: true });
  await writeFile(join(root, "nested", "page.html"), "nested");
  await writeFile(join(root, "space file.html"), "space");
  await writeFile(join(root, "日本語.html"), "unicode");
});

afterEach(async () => {
  await rm(fixtureRoot, { recursive: true, force: true });
});

describe("resolveRequestFile", () => {
  it("resolves nested, space, and Unicode file names", async () => {
    await expect(resolveRequestFile(root, "nested/page.html")).resolves.toBe(
      await realpath(join(root, "nested", "page.html")),
    );
    await expect(resolveRequestFile(root, "space%20file.html")).resolves.toBe(
      await realpath(join(root, "space file.html")),
    );
    await expect(
      resolveRequestFile(root, encodeURIComponent("日本語.html")),
    ).resolves.toBe(await realpath(join(root, "日本語.html")));
  });

  it("returns null for files that do not exist", async () => {
    await expect(resolveRequestFile(root, "missing.html")).resolves.toBeNull();
  });

  it("does not follow a symlink outside the content root", async () => {
    const outsidePath = join(fixtureRoot, "outside.html");
    await writeFile(outsidePath, "outside");
    await symlink(outsidePath, join(root, "outside-link.html"));

    await expect(
      resolveRequestFile(root, "outside-link.html"),
    ).resolves.toBeNull();
  });

  it.each([
    "",
    "../outside.html",
    "nested/../page.html",
    "%2E%2E/outside.html",
    "nested%2Fpage.html",
    "nested%5Cpage.html",
    "%00.html",
    "%ZZ.html",
  ])("rejects an invalid request path: %s", async (path) => {
    await expect(resolveRequestFile(root, path)).rejects.toBeInstanceOf(
      InvalidRequestPathError,
    );
  });
});
