import {
  link,
  mkdtemp,
  open,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { atomicCreate } from "../../src/content/safe-write.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "spec-html-create-"));
  roots.push(root);
  return root;
}

describe("atomicCreate", () => {
  it("publishes a complete new file and removes its temporary file", async () => {
    const root = await createRoot();
    const target = join(root, "document.html");

    await atomicCreate(target, "complete\n", "test");

    await expect(readFile(target, "utf8")).resolves.toBe("complete\n");
    await expect(readdir(root)).resolves.toEqual(["document.html"]);
  });

  it("never overwrites an existing target", async () => {
    const root = await createRoot();
    const target = join(root, "document.html");
    await writeFile(target, "existing\n");

    await expect(atomicCreate(target, "new\n", "test")).rejects.toMatchObject({
      code: "EEXIST",
    });

    await expect(readFile(target, "utf8")).resolves.toBe("existing\n");
    await expect(readdir(root)).resolves.toEqual(["document.html"]);
  });

  it("retries a colliding temporary name without changing it", async () => {
    const root = await createRoot();
    const target = join(root, "document.html");
    const collision = join(root, `.document.html.test-${process.pid}-0.tmp`);
    await writeFile(collision, "owned by another process\n");

    await atomicCreate(target, "output\n", "test");

    await expect(readFile(collision, "utf8")).resolves.toBe(
      "owned by another process\n",
    );
    await expect(readFile(target, "utf8")).resolves.toBe("output\n");
  });

  it("loses a publish race without overwriting the winner", async () => {
    const root = await createRoot();
    const target = join(root, "document.html");

    await expect(
      atomicCreate(target, "ours\n", "test", {
        open,
        rm,
        link: async (temporaryPath, targetPath) => {
          await writeFile(targetPath, "winner\n", { flag: "wx" });
          await link(temporaryPath, targetPath);
        },
      }),
    ).rejects.toMatchObject({ code: "EEXIST" });

    await expect(readFile(target, "utf8")).resolves.toBe("winner\n");
    expect((await readdir(root)).some((name) => name.endsWith(".tmp"))).toBe(
      false,
    );
  });

  it("falls back to cleanup when an injected cleanup operation fails", async () => {
    const root = await createRoot();
    const target = join(root, "document.html");

    await expect(
      atomicCreate(target, "complete\n", "test", {
        open,
        link,
        rm: () => Promise.reject(new Error("injected cleanup failure")),
      }),
    ).rejects.toThrow("injected cleanup failure");

    await expect(readFile(target, "utf8")).resolves.toBe("complete\n");
    expect((await readdir(root)).some((name) => name.endsWith(".tmp"))).toBe(
      false,
    );
  });
});
