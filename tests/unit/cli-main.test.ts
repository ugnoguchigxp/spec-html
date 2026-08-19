import { EventEmitter } from "node:events";
import {
  access,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  main,
  runCheck,
  runConvert,
  runFix,
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
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("lint CLI execution", () => {
  it("writes a compact result to stdout and returns zero for a valid project", async () => {
    const root = await project('<article lang="en"><h1>Valid</h1></article>');
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await expect(
      runLint({
        contentRoot: root,
        format: "compact",
        warningsAsErrors: false,
        maxIssues: 50,
      }),
    ).resolves.toBe(0);
    expect(output).toHaveBeenCalledWith("summary files=1 errors=0 warnings=0");
  });

  it("keeps warning severity but changes the exit code when requested", async () => {
    const root = await project(
      '<article lang="en"><h1>Warning</h1><section><h2>Section</h2></section></article>',
    );
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await expect(
      runLint({
        contentRoot: root,
        format: "json",
        warningsAsErrors: false,
        maxIssues: 50,
      }),
    ).resolves.toBe(0);
    await expect(
      runLint({
        contentRoot: root,
        format: "json",
        warningsAsErrors: true,
        maxIssues: 50,
      }),
    ).resolves.toBe(1);
  });

  it("returns exit code 2 and stderr for a lint operational failure", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await expect(
      main(["lint", join(tmpdir(), "missing-spec-html-project")]),
    ).resolves.toBe(2);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("spec-html:"));
  });
});

describe("format CLI execution", () => {
  it("returns one for check changes without writing", async () => {
    const root = await project(
      '<article lang="en"><h1>Changed</h1><p>Text</p></article>',
    );
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await expect(
      runFormat({ targetPath: root, mode: "check", reporter: "compact" }),
    ).resolves.toBe(1);
    expect(output).toHaveBeenCalledWith(expect.stringContaining("changed=1"));
  });

  it("writes changes and returns zero", async () => {
    const root = await project(
      '<article lang="en"><h1>Changed</h1><p>Text</p></article>',
    );
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await expect(
      runFormat({ targetPath: root, mode: "write", reporter: "json" }),
    ).resolves.toBe(0);
    await expect(
      readFile(join(root, "document.html"), "utf8"),
    ).resolves.toContain("\n  <h1>");
  });

  it("returns one and writes nothing for blocked input", async () => {
    const source =
      '<html><head><style>body { color: red }</style></head><body><article lang="en"><h1>X</h1></article></body></html>';
    const root = await project(source);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await expect(
      runFormat({ targetPath: root, mode: "write", reporter: "compact" }),
    ).resolves.toBe(1);
    await expect(readFile(join(root, "document.html"), "utf8")).resolves.toBe(
      source,
    );
  });

  it("returns exit code 2 for a format operational failure", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    await expect(
      main(["format", join(tmpdir(), "missing-spec-html-project"), "--check"]),
    ).resolves.toBe(2);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("spec-html:"));
  });
});

describe("fix CLI execution", () => {
  it("returns one for check changes without writing", async () => {
    const source =
      '<article lang="en"><h1>Changed</h1><sectoin>Text</sectoin></article>';
    const root = await project(source);
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await expect(
      runFix({ targetPath: root, mode: "check", reporter: "compact" }),
    ).resolves.toBe(1);
    expect(output).toHaveBeenCalledWith(expect.stringContaining("fixes=1"));
    await expect(readFile(join(root, "document.html"), "utf8")).resolves.toBe(
      source,
    );
  });

  it("writes fixes and returns zero without changing script content", async () => {
    const javascript = 'const teh = "<div>";';
    const root = await project(
      `<article lang="en"><h1>Changed</h1><scritp>${javascript}</scritp></article>`,
    );
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await expect(
      runFix({ targetPath: root, mode: "write", reporter: "json" }),
    ).resolves.toBe(0);
    await expect(
      readFile(join(root, "document.html"), "utf8"),
    ).resolves.toContain(`<script>${javascript}</script>`);
  });

  it("returns one and writes nothing for ambiguous syntax", async () => {
    const source =
      '<article lang="en"><h1>X</h1><img src="x alt="X" broken="y></article>';
    const root = await project(source);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await expect(
      runFix({ targetPath: root, mode: "write", reporter: "compact" }),
    ).resolves.toBe(1);
    await expect(readFile(join(root, "document.html"), "utf8")).resolves.toBe(
      source,
    );
  });

  it("returns exit code 2 for a fix operational failure", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    await expect(
      main(["fix", join(tmpdir(), "missing-spec-html-project"), "--check"]),
    ).resolves.toBe(2);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("spec-html:"));
  });
});

describe("check CLI execution", () => {
  it("checks every stage without writing and reports every result", async () => {
    const source = '<article lang="en"><h1>Changed</h1><p>Text</p></article>';
    const root = await project(source);
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await expect(
      runCheck({
        targetPath: root,
        stages: ["fixer", "formatter", "linter"],
        mode: "check",
        reporter: "compact",
        warningsAsErrors: false,
        maxIssues: 50,
      }),
    ).resolves.toBe(1);
    expect(output).toHaveBeenCalledWith(expect.stringContaining("== fixer =="));
    expect(output).toHaveBeenCalledWith(
      expect.stringContaining("== formatter =="),
    );
    expect(output).toHaveBeenCalledWith(
      expect.stringContaining("== linter =="),
    );
    await expect(readFile(join(root, "document.html"), "utf8")).resolves.toBe(
      source,
    );
  });

  it("fixes, formats, and then lints the resulting files", async () => {
    const root = await project(
      '<article lang="en"><h1>Changed</h1><sectoin><h2>Section</h2><p>Text</p></sectoin></article>',
    );
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await expect(
      runCheck({
        targetPath: root,
        stages: ["fixer", "formatter", "linter"],
        mode: "fix",
        reporter: "compact",
        warningsAsErrors: false,
        maxIssues: 50,
      }),
    ).resolves.toBe(0);
    const written = await readFile(join(root, "document.html"), "utf8");
    expect(written).toContain("<section>");
    expect(written).toContain("\n  <h1>");
  });

  it("supports formatter and fixer without running the linter", async () => {
    const root = await project(
      '<article lang="en"><h1>Changed</h1><sectoin><p>Text</p></sectoin></article>',
    );
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await expect(
      runCheck({
        targetPath: root,
        stages: ["fixer", "formatter"],
        mode: "fix",
        reporter: "json",
        warningsAsErrors: false,
        maxIssues: 50,
      }),
    ).resolves.toBe(0);
    const report = JSON.parse(String(output.mock.calls[0]?.[0])) as {
      stages: Record<string, unknown>;
    };
    expect(Object.keys(report.stages)).toEqual(["fixer", "formatter"]);
  });

  it("supports linter and fixer without running the formatter", async () => {
    const root = await project(
      '<article lang="en"><h1>Changed</h1><sectoin><h2>Section</h2></sectoin></article>',
    );
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await expect(
      runCheck({
        targetPath: root,
        stages: ["fixer", "linter"],
        mode: "fix",
        reporter: "compact",
        warningsAsErrors: false,
        maxIssues: 50,
      }),
    ).resolves.toBe(0);
    expect(output).toHaveBeenCalledWith(
      expect.stringContaining("== linter =="),
    );
    expect(output).toHaveBeenCalledWith(
      expect.not.stringContaining("== formatter =="),
    );
    const written = await readFile(join(root, "document.html"), "utf8");
    expect(written).toContain("<section>");
    expect(written).not.toContain("\n");
  });

  it("stops fix mode before later stages when the fixer is blocked", async () => {
    const source =
      '<article lang="en"><h1>X</h1><img src="x alt="X" broken="y></article>';
    const root = await project(source);
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await expect(
      runCheck({
        targetPath: root,
        stages: ["fixer", "formatter", "linter"],
        mode: "fix",
        reporter: "compact",
        warningsAsErrors: false,
        maxIssues: 50,
      }),
    ).resolves.toBe(1);
    expect(output).toHaveBeenCalledWith(
      expect.not.stringContaining("== formatter =="),
    );
    expect(output).toHaveBeenCalledWith(
      expect.not.stringContaining("== linter =="),
    );
    await expect(readFile(join(root, "document.html"), "utf8")).resolves.toBe(
      source,
    );
  });

  it("returns exit code 2 for a check operational failure", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    await expect(
      main(["check", join(tmpdir(), "missing-spec-html-project")]),
    ).resolves.toBe(2);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("spec-html:"));
  });
});

describe("convert CLI execution", () => {
  it("writes only generated HTML to stdout and does not create a file", async () => {
    const root = await mkdtemp(join(tmpdir(), "spec-html-cli-convert-"));
    roots.push(root);
    const input = join(root, "design.md");
    await writeFile(input, "# Design\n");
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    await expect(
      runConvert({ inputPath: input, language: "en" }),
    ).resolves.toBe(0);

    expect(stdout).toHaveBeenCalledTimes(1);
    expect(stdout).toHaveBeenCalledWith(`<article lang="en">
  <h1 id="design">Design</h1>
</article>
`);
    expect(stderr).toHaveBeenCalledWith(
      "summary lint-errors=0 lint-warnings=0 markdown-notices=0\n",
    );
    await expect(access(join(root, "design.html"))).rejects.toThrow();
  });

  it("creates an explicit lint-clean table draft", async () => {
    const root = await mkdtemp(join(tmpdir(), "spec-html-cli-convert-"));
    roots.push(root);
    const input = join(root, "table.md");
    const output = join(root, "table.html");
    await writeFile(
      input,
      "# Table\n\n| Key | Value |\n| --- | --- |\n| A | B |\n",
    );
    const logs = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    await expect(
      runConvert({ inputPath: input, outputPath: output, language: "en" }),
    ).resolves.toBe(0);

    expect(logs).toHaveBeenCalledWith(
      `Created: ${join(await realpath(root), "table.html")}`,
    );
    expect(logs).toHaveBeenCalledWith(
      `Source retained (not synchronized): ${join(await realpath(root), "table.md")}`,
    );
    expect(logs).toHaveBeenCalledWith(
      "summary lint-errors=0 lint-warnings=0 markdown-notices=0",
    );
    expect(stderr).not.toHaveBeenCalled();
    await expect(readFile(output, "utf8")).resolves.toContain("<table>");
  });

  it("returns exit code 2 for a convert usage or operational failure", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await expect(main(["convert"])).resolves.toBe(2);
    await expect(
      main(["convert", join(tmpdir(), "missing-spec-html.md"), "--lang", "en"]),
    ).resolves.toBe(2);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("spec-html:"));
  });
});

describe("migrate CLI execution", () => {
  it("checks a Markdown migration without creating output or state files", async () => {
    const root = await mkdtemp(join(tmpdir(), "spec-html-cli-migrate-"));
    roots.push(root);
    await writeFile(join(root, "guide.md"), "# Guide\n");
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await expect(
      main(["migrate", root, "--lang", "en", "--check"]),
    ).resolves.toBe(0);
    expect(output).toHaveBeenCalledWith(
      expect.stringContaining(
        "summary markdown=1 creates=1 captions=0 html-rewrites=0 archives=1 parity=1/1 errors=0 warnings=0 ready=true",
      ),
    );
    await expect(access(join(root, "guide.html"))).rejects.toThrow();
    await expect(access(join(root, ".spec-html"))).rejects.toThrow();
  });

  it("applies an exact-path language map during migration checks", async () => {
    const root = await mkdtemp(join(tmpdir(), "spec-html-cli-language-map-"));
    roots.push(root);
    await writeFile(join(root, "guide.md"), "# Guide\n");
    const languageMap = join(root, "languages.json");
    await writeFile(languageMap, '{"guide.md":"ja-jp"}\n');
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await expect(
      main([
        "migrate",
        root,
        "--lang",
        "en",
        "--language-map",
        languageMap,
        "--reporter",
        "json",
        "--check",
      ]),
    ).resolves.toBe(0);
    expect(output).toHaveBeenCalledWith(expect.stringContaining('"language": "ja-JP"'));
  });

  it("returns exit code 2 for migrate usage errors", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(main(["migrate"])).resolves.toBe(2);
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
