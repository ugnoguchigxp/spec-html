import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  main,
  runFormat,
  runLint,
  waitForShutdownSignal,
} from "../../src/cli/main.js";

const roots: string[] = [];

async function project(source: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "spec-html-cli-"));
  roots.push(root);
  await writeFile(join(root, "document.html"), source, "utf8");
  return root;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("lint CLI execution", () => {
  it("writes a compact result to stdout and returns zero for a valid project", async () => {
    const root = await project('<article lang="en"><h1>Valid</h1></article>');
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await expect(runLint({ contentRoot: root, format: "compact", warningsAsErrors: false, maxIssues: 50 })).resolves.toBe(0);
    expect(output).toHaveBeenCalledWith("summary files=1 errors=0 warnings=0");
  });

  it("keeps warning severity but changes the exit code when requested", async () => {
    const root = await project('<article lang="en"><h1>Warning</h1><section><h2>Section</h2></section></article>');
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await expect(runLint({ contentRoot: root, format: "json", warningsAsErrors: false, maxIssues: 50 })).resolves.toBe(0);
    await expect(runLint({ contentRoot: root, format: "json", warningsAsErrors: true, maxIssues: 50 })).resolves.toBe(1);
  });

  it("returns exit code 2 and stderr for a lint operational failure", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(main(["lint", join(tmpdir(), "missing-spec-html-project")])).resolves.toBe(2);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("spec-html:"));
  });
});

describe("format CLI execution", () => {
  it("returns one for check changes without writing", async () => {
    const root = await project('<article lang="en"><h1>Changed</h1><p>Text</p></article>');
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await expect(runFormat({ targetPath: root, mode: "check", reporter: "compact" })).resolves.toBe(1);
    expect(output).toHaveBeenCalledWith(expect.stringContaining("changed=1"));
  });

  it("writes changes and returns zero", async () => {
    const root = await project('<article lang="en"><h1>Changed</h1><p>Text</p></article>');
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await expect(runFormat({ targetPath: root, mode: "write", reporter: "json" })).resolves.toBe(0);
    await expect(readFile(join(root, "document.html"), "utf8")).resolves.toContain("\n  <h1>");
  });

  it("returns one and writes nothing for blocked input", async () => {
    const source = '<html><head><style>body { color: red }</style></head><body><article lang="en"><h1>X</h1></article></body></html>';
    const root = await project(source);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await expect(runFormat({ targetPath: root, mode: "write", reporter: "compact" })).resolves.toBe(1);
    await expect(readFile(join(root, "document.html"), "utf8")).resolves.toBe(source);
  });

  it("returns exit code 2 for a format operational failure", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(main(["format", join(tmpdir(), "missing-spec-html-project"), "--check"])).resolves.toBe(2);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("spec-html:"));
  });
});

describe("viewer CLI shutdown", () => {
  it.each(["SIGINT", "SIGTERM"] as const)(
    "waits for %s and removes both signal handlers",
    async (signal) => {
      const signalSource = new EventEmitter();
      const shutdownSignal = waitForShutdownSignal(signalSource);

      expect(signalSource.listenerCount("SIGINT")).toBe(1);
      expect(signalSource.listenerCount("SIGTERM")).toBe(1);
      signalSource.emit(signal);

      await expect(shutdownSignal).resolves.toBe(signal);
      expect(signalSource.listenerCount("SIGINT")).toBe(0);
      expect(signalSource.listenerCount("SIGTERM")).toBe(0);
    },
  );
});
