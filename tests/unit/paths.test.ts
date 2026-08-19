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
  openResolvedRequestFile,
  ResolvedRequestFileChangedError,
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
  await mkdir(join(root, ".git"));
  await writeFile(join(root, ".env"), "secret");
  await writeFile(join(root, ".git", "config"), "secret");
});

afterEach(async () => {
  await rm(fixtureRoot, { recursive: true, force: true });
});

describe("resolveRequestFile", () => {
  it("resolves nested, space, and Unicode file names", async () => {
    await expect(resolveRequestFile(root, "nested/page.html")).resolves.toMatchObject({
      filePath: await realpath(join(root, "nested", "page.html")),
    });
    await expect(resolveRequestFile(root, "space%20file.html")).resolves.toMatchObject({
      filePath: await realpath(join(root, "space file.html")),
    });
    await expect(
      resolveRequestFile(root, encodeURIComponent("日本語.html")),
    ).resolves.toMatchObject({ filePath: await realpath(join(root, "日本語.html")) });
  });

  it("returns null for files that do not exist", async () => {
    await expect(resolveRequestFile(root, "missing.html")).resolves.toBeNull();
  });

  it.each([".env", ".git/config", "%2Egit/config"])(
    "can deny a hidden request path without revealing whether it exists: %s",
    async (path) => {
      await expect(
        resolveRequestFile(root, path, { denyDotSegments: true }),
      ).resolves.toBeNull();
    },
  );

  it("keeps hidden paths available to package-managed static roots by default", async () => {
    await expect(resolveRequestFile(root, ".env")).resolves.toMatchObject({
      filePath: await realpath(join(root, ".env")),
    });
  });

  it("does not follow a symlink outside the content root", async () => {
    const outsidePath = join(fixtureRoot, "outside.html");
    await writeFile(outsidePath, "outside");
    await symlink(outsidePath, join(root, "outside-link.html"));

    await expect(
      resolveRequestFile(root, "outside-link.html"),
    ).resolves.toBeNull();
  });

  it("rejects a file replaced after path validation", async () => {
    const requestedPath = join(root, "nested", "page.html");
    const outsidePath = join(fixtureRoot, "outside.html");
    const resolved = await resolveRequestFile(root, "nested/page.html");
    expect(resolved).not.toBeNull();
    await writeFile(outsidePath, "outside");
    await rm(requestedPath);
    await symlink(outsidePath, requestedPath);

    await expect(openResolvedRequestFile(resolved!)).rejects.toBeInstanceOf(
      ResolvedRequestFileChangedError,
    );
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
