import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { RULE_BY_ID } from "../lint/rules.js";
import type { RuleId } from "../lint/diagnostics.js";

export interface CliRunOptions {
  contentRoot: string;
  host: string;
  port: number;
  openBrowser: boolean;
}

export interface CliLintOptions {
  contentRoot: string;
  format: "compact" | "json";
  warningsAsErrors: boolean;
  maxIssues: number;
}

export interface CliFormatOptions {
  targetPath: string;
  mode: "check" | "write";
  reporter: "compact" | "json";
}

export type CliCommand =
  | { kind: "run"; options: CliRunOptions }
  | { kind: "lint"; options: CliLintOptions }
  | { kind: "format"; options: CliFormatOptions }
  | { kind: "explain"; rule: RuleId }
  | { kind: "help" }
  | { kind: "lint-help" }
  | { kind: "format-help" }
  | { kind: "version" };

export class CliUsageError extends Error {
  override name = "CliUsageError";
}

export function parseCliCommand(
  args: readonly string[],
  cwd: string,
): CliCommand {
  if (args[0] === "lint") {
    return parseLintCommand(args.slice(1), cwd);
  }
  if (args[0] === "format") {
    return parseFormatCommand(args.slice(1), cwd);
  }

  return parseRunCommand(args, cwd);
}

function parseFormatCommand(args: readonly string[], cwd: string): CliCommand {
  let parsed: ReturnType<typeof parseFormatArgs>;
  try {
    parsed = parseFormatArgs([...args]);
  } catch (error: unknown) {
    throw new CliUsageError(messageForParseArgsError(error));
  }

  if (parsed.positionals.length > 1) {
    throw new CliUsageError("pathは1つだけ指定してください");
  }
  if (parsed.values.help === true) {
    if (
      parsed.positionals.length > 0 ||
      parsed.values.check === true ||
      parsed.values.write === true ||
      parsed.values.reporter !== undefined
    ) {
      throw new CliUsageError("--helpはpathやformat optionと同時に指定できません");
    }
    return { kind: "format-help" };
  }
  const check = parsed.values.check === true;
  const write = parsed.values.write === true;
  if (check === write) {
    throw new CliUsageError("--checkまたは--writeのどちらか1つを指定してください");
  }
  const reporter = parsed.values.reporter ?? "compact";
  if (reporter !== "compact" && reporter !== "json") {
    throw new CliUsageError("reporterはcompactまたはjsonで指定してください");
  }
  const target = parsed.positionals[0] ?? "./specs";
  return {
    kind: "format",
    options: {
      targetPath: resolve(cwd, target),
      mode: check ? "check" : "write",
      reporter,
    },
  };
}

function parseRunCommand(args: readonly string[], cwd: string): CliCommand {
  let parsed: ReturnType<typeof parseCommandArgs>;
  try {
    parsed = parseCommandArgs([...args]);
  } catch (error: unknown) {
    throw new CliUsageError(messageForParseArgsError(error));
  }

  if (parsed.positionals.length > 1) {
    throw new CliUsageError("directoryは1つだけ指定してください");
  }

  if (parsed.values.help === true && parsed.values.version === true) {
    throw new CliUsageError("--helpと--versionは同時に指定できません");
  }

  if (parsed.values.help === true) {
    return { kind: "help" };
  }

  if (parsed.values.version === true) {
    return { kind: "version" };
  }

  if (parsed.values.open === true && parsed.values["no-open"] === true) {
    throw new CliUsageError("--openと--no-openは同時に指定できません");
  }

  const portValue = parsed.values.port ?? "4173";
  if (!/^[0-9]+$/.test(portValue)) {
    throw new CliUsageError("portは0から65535までの整数で指定してください");
  }

  const port = Number(portValue);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
    throw new CliUsageError("portは0から65535までの整数で指定してください");
  }

  const host = (parsed.values.host ?? "127.0.0.1").trim();
  if (host.length === 0) {
    throw new CliUsageError("hostを空にすることはできません");
  }

  const directory = parsed.positionals[0] ?? "./specs";

  return {
    kind: "run",
    options: {
      contentRoot: resolve(cwd, directory),
      host,
      port,
      openBrowser: parsed.values["no-open"] !== true,
    },
  };
}

function parseLintCommand(args: readonly string[], cwd: string): CliCommand {
  let parsed: ReturnType<typeof parseLintArgs>;
  try {
    parsed = parseLintArgs([...args]);
  } catch (error: unknown) {
    throw new CliUsageError(messageForParseArgsError(error));
  }

  if (parsed.positionals.length > 1) {
    throw new CliUsageError("directoryは1つだけ指定してください");
  }

  const hasExplain = parsed.values.explain !== undefined;
  const hasLintOptions =
    parsed.values.format !== undefined ||
    parsed.values["warnings-as-errors"] === true ||
    parsed.values["max-issues"] !== undefined;
  if (hasExplain && (parsed.positionals.length > 0 || hasLintOptions)) {
    throw new CliUsageError("--explainはdirectoryやlint optionと同時に指定できません");
  }
  if (parsed.values.help === true && hasExplain) {
    throw new CliUsageError("--helpと--explainは同時に指定できません");
  }
  if (parsed.values.help === true) {
    return { kind: "lint-help" };
  }
  if (hasExplain) {
    const rule = parsed.values.explain;
    if (rule === undefined || !RULE_BY_ID.has(rule as RuleId)) {
      throw new CliUsageError(`未対応のruleです: ${rule ?? ""}`);
    }
    return { kind: "explain", rule: rule as RuleId };
  }

  const format = parsed.values.format ?? "compact";
  if (format !== "compact" && format !== "json") {
    throw new CliUsageError("formatはcompactまたはjsonで指定してください");
  }
  const maxIssues = parseMaxIssues(parsed.values["max-issues"]);
  const directory = parsed.positionals[0] ?? "./specs";
  return {
    kind: "lint",
    options: {
      contentRoot: resolve(cwd, directory),
      format,
      warningsAsErrors: parsed.values["warnings-as-errors"] === true,
      maxIssues,
    },
  };
}

function parseMaxIssues(value: string | undefined): number {
  if (value === undefined) {
    return 50;
  }
  if (!/^(?:0|[1-9][0-9]*)$/.test(value)) {
    throw new CliUsageError("max-issuesは0以上の整数で指定してください");
  }
  const maxIssues = Number(value);
  if (!Number.isSafeInteger(maxIssues)) {
    throw new CliUsageError("max-issuesは0以上の安全な整数で指定してください");
  }
  return maxIssues;
}

function messageForParseArgsError(error: unknown): string {
  if (
    error instanceof Error &&
    "code" in error &&
    error.code === "ERR_PARSE_ARGS_UNKNOWN_OPTION"
  ) {
    const option = /'([^']+)'/.exec(error.message)?.[1];
    return option === undefined
      ? "未対応のoptionが指定されました"
      : `未対応のoptionです: ${option}`;
  }
  if (
    error instanceof Error &&
    "code" in error &&
    error.code === "ERR_PARSE_ARGS_INVALID_OPTION_VALUE"
  ) {
    const option = /Option '([^']+)'/.exec(error.message)?.[1];
    return option === undefined
      ? "optionの値が不正です"
      : `optionの値が必要です: ${option}`;
  }
  return "引数を解釈できません";
}

function parseCommandArgs(args: string[]) {
  return parseArgs({
    args,
    allowPositionals: true,
    strict: true,
    options: {
      host: { type: "string" },
      port: { type: "string" },
      open: { type: "boolean" },
      "no-open": { type: "boolean" },
      help: { type: "boolean" },
      version: { type: "boolean" },
    },
  });
}

function parseLintArgs(args: string[]) {
  return parseArgs({
    args,
    allowPositionals: true,
    strict: true,
    options: {
      format: { type: "string" },
      "warnings-as-errors": { type: "boolean" },
      "max-issues": { type: "string" },
      explain: { type: "string" },
      help: { type: "boolean" },
    },
  });
}

function parseFormatArgs(args: string[]) {
  return parseArgs({
    args,
    allowPositionals: true,
    strict: true,
    options: {
      check: { type: "boolean" },
      write: { type: "boolean" },
      reporter: { type: "string" },
      help: { type: "boolean" },
    },
  });
}
