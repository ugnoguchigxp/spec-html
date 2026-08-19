import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CliUsageError, parseCliCommand } from "../../src/cli/options.js";

const CWD = "/workspace/project";

describe("parseCliCommand", () => {
  it("uses the documented defaults", () => {
    expect(parseCliCommand([], CWD)).toEqual({
      kind: "run",
      options: {
        contentRoot: resolve(CWD, "specs"),
        host: "127.0.0.1",
        allowedHosts: [],
        port: 4173,
        openBrowser: true,
        markdownLanguage: "en",
      },
    });
  });

  it("parses a directory and all run options", () => {
    expect(
      parseCliCommand(
        [
          "docs/specs",
          "--host",
          "192.0.2.10",
          "--allowed-host",
          "viewer.local",
          "--allowed-host",
          "127.0.0.1",
          "--port",
          "0",
          "--no-open",
          "--markdown-lang",
          "ja-jp",
        ],
        CWD,
      ),
    ).toEqual({
      kind: "run",
      options: {
        contentRoot: resolve(CWD, "docs/specs"),
        host: "192.0.2.10",
        allowedHosts: ["viewer.local", "127.0.0.1"],
        port: 0,
        openBrowser: false,
        markdownLanguage: "ja-JP",
      },
    });
  });

  it("returns help and version commands", () => {
    expect(parseCliCommand(["--help"], CWD)).toEqual({ kind: "help" });
    expect(parseCliCommand(["--version"], CWD)).toEqual({ kind: "version" });
  });

  it("parses lint commands without changing a viewer directory named lint", () => {
    expect(
      parseCliCommand(
        [
          "lint",
          "docs",
          "--format",
          "json",
          "--warnings-as-errors",
          "--max-issues",
          "0",
        ],
        CWD,
      ),
    ).toEqual({
      kind: "lint",
      options: {
        contentRoot: resolve(CWD, "docs"),
        format: "json",
        warningsAsErrors: true,
        maxIssues: 0,
      },
    });
    expect(parseCliCommand(["./lint", "--no-open"], CWD)).toMatchObject({
      kind: "run",
      options: { contentRoot: resolve(CWD, "lint") },
    });
    expect(parseCliCommand(["lint", "--explain", "DOC001"], CWD)).toEqual({
      kind: "explain",
      rule: "DOC001",
    });
  });

  it("parses format commands without changing a viewer directory named format", () => {
    expect(
      parseCliCommand(["format", "docs", "--check", "--reporter", "json"], CWD),
    ).toEqual({
      kind: "format",
      options: {
        targetPath: resolve(CWD, "docs"),
        mode: "check",
        reporter: "json",
      },
    });
    expect(parseCliCommand(["format", "--write"], CWD)).toEqual({
      kind: "format",
      options: {
        targetPath: resolve(CWD, "specs"),
        mode: "write",
        reporter: "compact",
      },
    });
    expect(parseCliCommand(["./format", "--no-open"], CWD)).toMatchObject({
      kind: "run",
      options: { contentRoot: resolve(CWD, "format") },
    });
    expect(parseCliCommand(["format", "--help"], CWD)).toEqual({
      kind: "format-help",
    });
  });

  it("parses fix commands without changing a viewer directory named fix", () => {
    expect(
      parseCliCommand(["fix", "docs", "--check", "--reporter", "json"], CWD),
    ).toEqual({
      kind: "fix",
      options: {
        targetPath: resolve(CWD, "docs"),
        mode: "check",
        reporter: "json",
      },
    });
    expect(parseCliCommand(["fix", "--write"], CWD)).toEqual({
      kind: "fix",
      options: {
        targetPath: resolve(CWD, "specs"),
        mode: "write",
        reporter: "compact",
      },
    });
    expect(parseCliCommand(["./fix", "--no-open"], CWD)).toMatchObject({
      kind: "run",
      options: { contentRoot: resolve(CWD, "fix") },
    });
    expect(parseCliCommand(["fix", "--help"], CWD)).toEqual({
      kind: "fix-help",
    });
  });

  it("parses check commands with all stages by default", () => {
    expect(parseCliCommand(["check", "docs"], CWD)).toEqual({
      kind: "check",
      options: {
        targetPath: resolve(CWD, "docs"),
        stages: ["fixer", "formatter", "linter"],
        mode: "check",
        reporter: "compact",
        warningsAsErrors: false,
        maxIssues: 50,
      },
    });
    expect(parseCliCommand(["./check", "--no-open"], CWD)).toMatchObject({
      kind: "run",
      options: { contentRoot: resolve(CWD, "check") },
    });
    expect(parseCliCommand(["check", "--help"], CWD)).toEqual({
      kind: "check-help",
    });
  });

  it("parses convert commands without changing a viewer directory named convert", () => {
    expect(
      parseCliCommand(
        [
          "convert",
          "docs/design.md",
          "--lang",
          "ja-jp",
          "--output",
          "docs/design.html",
        ],
        CWD,
      ),
    ).toEqual({
      kind: "convert",
      options: {
        inputPath: resolve(CWD, "docs/design.md"),
        outputPath: resolve(CWD, "docs/design.html"),
        language: "ja-JP",
      },
    });
    expect(
      parseCliCommand(["convert", "docs/design.markdown", "--lang", "en"], CWD),
    ).toEqual({
      kind: "convert",
      options: {
        inputPath: resolve(CWD, "docs/design.markdown"),
        language: "en",
      },
    });
    expect(parseCliCommand(["convert", "--help"], CWD)).toEqual({
      kind: "convert-help",
    });
    expect(parseCliCommand(["./convert", "--no-open"], CWD)).toMatchObject({
      kind: "run",
      options: { contentRoot: resolve(CWD, "convert") },
    });
  });

  it("parses migrate check, write, rollback, and finalize commands", () => {
    expect(
      parseCliCommand(
        [
          "migrate",
          "docs",
          "--lang",
          "ja-jp",
          "--check",
          "--reporter",
          "json",
          "--warnings-as-errors",
        ],
        CWD,
      ),
    ).toEqual({
      kind: "migrate",
      options: {
        contentRoot: resolve(CWD, "docs"),
        action: "check",
        language: "ja-JP",
        reporter: "json",
        warningsAsErrors: true,
      },
    });
    expect(
      parseCliCommand(["migrate", "--lang", "en", "--write"], CWD),
    ).toMatchObject({
      kind: "migrate",
      options: { action: "write", contentRoot: resolve(CWD, "specs") },
    });
    expect(
      parseCliCommand(
        [
          "migrate",
          "docs",
          "--target",
          "./architecture/",
          "--target",
          "concepts",
          "--lang",
          "en",
          "--check",
        ],
        CWD,
      ),
    ).toMatchObject({
      kind: "migrate",
      options: {
        action: "check",
        contentRoot: resolve(CWD, "docs"),
        targetDirectories: ["architecture", "concepts"],
      },
    });
    expect(
      parseCliCommand(
        [
          "migrate",
          "docs",
          "--lang",
          "en",
          "--language-map",
          "languages.json",
          "--allow-lossy",
          "--check",
        ],
        CWD,
      ),
    ).toMatchObject({
      kind: "migrate",
      options: {
        action: "check",
        allowLossy: true,
        languageMapPath: resolve(CWD, "languages.json"),
      },
    });
    expect(
      parseCliCommand(["migrate", "docs", "--rollback", "migration-id"], CWD),
    ).toEqual({
      kind: "migrate",
      options: {
        contentRoot: resolve(CWD, "docs"),
        action: "rollback",
        migrationId: "migration-id",
        reporter: "compact",
      },
    });
    expect(
      parseCliCommand(["migrate", "--finalize", "migration-id"], CWD),
    ).toMatchObject({ kind: "migrate", options: { action: "finalize" } });
    expect(parseCliCommand(["migrate", "--help"], CWD)).toEqual({
      kind: "migrate-help",
    });
    expect(parseCliCommand(["./migrate", "--no-open"], CWD)).toMatchObject({
      kind: "run",
      options: { contentRoot: resolve(CWD, "migrate") },
    });
  });

  it("parses selected check stages and fix mode", () => {
    expect(
      parseCliCommand(
        [
          "check",
          "docs",
          "--lint",
          "--fixer",
          "--fix",
          "--reporter",
          "json",
          "--warnings-as-errors",
          "--max-issues",
          "0",
        ],
        CWD,
      ),
    ).toEqual({
      kind: "check",
      options: {
        targetPath: resolve(CWD, "docs"),
        stages: ["fixer", "linter"],
        mode: "fix",
        reporter: "json",
        warningsAsErrors: true,
        maxIssues: 0,
      },
    });
    expect(
      parseCliCommand(["check", "docs", "--format", "--fixer"], CWD),
    ).toMatchObject({
      kind: "check",
      options: { stages: ["fixer", "formatter"], mode: "check" },
    });
  });

  it("accepts the documented port boundaries and explicit --open", () => {
    expect(parseCliCommand(["--port", "0"], CWD)).toMatchObject({
      kind: "run",
      options: { port: 0 },
    });
    expect(parseCliCommand(["--port", "65535", "--open"], CWD)).toMatchObject({
      kind: "run",
      options: { port: 65_535, openBrowser: true },
    });
  });

  it("reports parseArgs failures in English", () => {
    expect(() => parseCliCommand(["--unknown"], CWD)).toThrow(
      "Unknown option: --unknown",
    );
    expect(() => parseCliCommand(["--port"], CWD)).toThrow(
      "Option requires a value: --port",
    );
  });

  it.each([
    ["--port", "-1"],
    ["--port", "65536"],
    ["--port", "1.5"],
    ["--port", "1e3"],
    ["first", "second"],
    ["--open", "--no-open"],
    ["--help", "--version"],
    ["--host", "   "],
    ["--markdown-lang", "invalid_tag"],
    ["--unknown"],
    ["lint", "--format", "other"],
    ["lint", "--max-issues", "1e2"],
    ["lint", "--explain", "UNKNOWN"],
    ["lint", "docs", "--explain", "DOC001"],
    ["format"],
    ["format", "--check", "--write"],
    ["format", "--check", "--reporter", "other"],
    ["format", "first", "second", "--check"],
    ["format", "docs", "--help"],
    ["fix"],
    ["fix", "--check", "--write"],
    ["fix", "--check", "--reporter", "other"],
    ["fix", "first", "second", "--check"],
    ["fix", "docs", "--help"],
    ["check", "first", "second"],
    ["check", "--lint", "--fix"],
    ["check", "--reporter", "other"],
    ["check", "--max-issues", "1e2"],
    ["check", "docs", "--help"],
    ["convert"],
    ["convert", "design.md"],
    ["convert", "design.txt", "--lang", "en"],
    ["convert", "design.md", "--lang", "invalid_tag"],
    ["convert", "design.md", "extra.md", "--lang", "en"],
    ["convert", "design.md", "--lang", "en", "--output", "design.txt"],
    ["convert", "design.md", "--lang", "en", "--help"],
    ["migrate"],
    ["migrate", "--check"],
    ["migrate", "--lang", "en", "--check", "--write"],
    ["migrate", "--rollback", "id", "--lang", "en"],
    ["migrate", "--rollback", "id", "--target", "concepts"],
    ["migrate", "--finalize", "id", "--warnings-as-errors"],
    ["migrate", "--check", "--lang", "en", "--target", "../outside"],
    ["migrate", "--check", "--lang", "en", "--target", "/absolute"],
    ["migrate", "--check", "--lang", "en", "--reporter", "other"],
    ["migrate", "docs", "--help"],
  ])("rejects invalid arguments: %j", (...args: string[]) => {
    expect(() => parseCliCommand(args, CWD)).toThrow(CliUsageError);
  });
});
