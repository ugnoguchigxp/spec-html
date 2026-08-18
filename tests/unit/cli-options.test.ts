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
        port: 4173,
        openBrowser: true,
      },
    });
  });

  it("parses a directory and all run options", () => {
    expect(
      parseCliCommand(
        ["docs/specs", "--host", "localhost", "--port", "0", "--no-open"],
        CWD,
      ),
    ).toEqual({
      kind: "run",
      options: {
        contentRoot: resolve(CWD, "docs/specs"),
        host: "localhost",
        port: 0,
        openBrowser: false,
      },
    });
  });

  it("returns help and version commands", () => {
    expect(parseCliCommand(["--help"], CWD)).toEqual({ kind: "help" });
    expect(parseCliCommand(["--version"], CWD)).toEqual({ kind: "version" });
  });

  it("parses lint commands without changing a viewer directory named lint", () => {
    expect(parseCliCommand(["lint", "docs", "--format", "json", "--warnings-as-errors", "--max-issues", "0"], CWD)).toEqual({
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

  it("reports parseArgs failures in Japanese", () => {
    expect(() => parseCliCommand(["--unknown"], CWD)).toThrow(
      "未対応のoptionです: --unknown",
    );
    expect(() => parseCliCommand(["--port"], CWD)).toThrow(
      "optionの値が必要です: --port",
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
    ["--unknown"],
    ["lint", "--format", "other"],
    ["lint", "--max-issues", "1e2"],
    ["lint", "--explain", "UNKNOWN"],
    ["lint", "docs", "--explain", "DOC001"],
  ])("rejects invalid arguments: %j", (...args: string[]) => {
    expect(() => parseCliCommand(args, CWD)).toThrow(CliUsageError);
  });
});
