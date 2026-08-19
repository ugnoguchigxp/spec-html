import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { RULE_BY_ID } from "../lint/rules.js";
import type { RuleId } from "../lint/diagnostics.js";
import { canonicalizeLanguageTag } from "../markdown/language.js";
import {
  documentFormatFromPath,
  isHtmlDocumentPath,
} from "../content/document-format.js";

export interface CliRunOptions {
  contentRoot: string;
  host: string;
  allowedHosts: readonly string[];
  port: number;
  openBrowser: boolean;
  markdownLanguage: string;
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

export interface CliFixOptions {
  targetPath: string;
  mode: "check" | "write";
  reporter: "compact" | "json";
}

export type CliCheckStage = "fixer" | "formatter" | "linter";

export interface CliCheckOptions {
  targetPath: string;
  stages: readonly CliCheckStage[];
  mode: "check" | "fix";
  reporter: "compact" | "json";
  warningsAsErrors: boolean;
  maxIssues: number;
}

export interface CliConvertOptions {
  inputPath: string;
  outputPath?: string;
  language: string;
}

export type CliMigrateOptions =
  | {
      contentRoot: string;
      action: "check" | "write";
      language: string;
      reporter: "compact" | "json";
      warningsAsErrors: boolean;
      allowLossy?: boolean;
      languageMapPath?: string;
    }
  | {
      contentRoot: string;
      action: "rollback" | "finalize";
      migrationId: string;
      reporter: "compact" | "json";
    };

export type CliCommand =
  | { kind: "run"; options: CliRunOptions }
  | { kind: "lint"; options: CliLintOptions }
  | { kind: "format"; options: CliFormatOptions }
  | { kind: "fix"; options: CliFixOptions }
  | { kind: "check"; options: CliCheckOptions }
  | { kind: "convert"; options: CliConvertOptions }
  | { kind: "migrate"; options: CliMigrateOptions }
  | { kind: "explain"; rule: RuleId }
  | { kind: "help" }
  | { kind: "lint-help" }
  | { kind: "format-help" }
  | { kind: "fix-help" }
  | { kind: "check-help" }
  | { kind: "convert-help" }
  | { kind: "migrate-help" }
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
  if (args[0] === "fix") {
    return parseFixCommand(args.slice(1), cwd);
  }
  if (args[0] === "check") {
    return parseCheckCommand(args.slice(1), cwd);
  }
  if (args[0] === "convert") {
    return parseConvertCommand(args.slice(1), cwd);
  }
  if (args[0] === "migrate") {
    return parseMigrateCommand(args.slice(1), cwd);
  }

  return parseRunCommand(args, cwd);
}

function parseMigrateCommand(args: readonly string[], cwd: string): CliCommand {
  let parsed: ReturnType<typeof parseMigrateArgs>;
  try {
    parsed = parseMigrateArgs([...args]);
  } catch (error: unknown) {
    throw new CliUsageError(messageForParseArgsError(error));
  }
  if (parsed.positionals.length > 1) {
    throw new CliUsageError("Specify at most one directory");
  }
  const hasOptions =
    parsed.values.check === true ||
    parsed.values.write === true ||
    parsed.values.rollback !== undefined ||
    parsed.values.finalize !== undefined ||
    parsed.values.lang !== undefined ||
    parsed.values["language-map"] !== undefined ||
    parsed.values.reporter !== undefined ||
    parsed.values["warnings-as-errors"] === true ||
    parsed.values["allow-lossy"] === true;
  if (parsed.values.help === true) {
    if (parsed.positionals.length > 0 || hasOptions) {
      throw new CliUsageError(
        "--help cannot be combined with a directory or migrate options",
      );
    }
    return { kind: "migrate-help" };
  }

  const actions = [
    parsed.values.check === true ? "check" : null,
    parsed.values.write === true ? "write" : null,
    parsed.values.rollback === undefined ? null : "rollback",
    parsed.values.finalize === undefined ? null : "finalize",
  ].filter((action): action is "check" | "write" | "rollback" | "finalize" =>
    action !== null
  );
  if (actions.length !== 1) {
    throw new CliUsageError(
      "Specify exactly one of --check, --write, --rollback, or --finalize",
    );
  }
  const action = actions[0]!;
  const reporter = parsed.values.reporter ?? "compact";
  if (reporter !== "compact" && reporter !== "json") {
    throw new CliUsageError("reporter must be compact or json");
  }
  const contentRoot = resolve(cwd, parsed.positionals[0] ?? "./specs");
  if (action === "check" || action === "write") {
    if (parsed.values.lang === undefined) {
      throw new CliUsageError("Specify --lang");
    }
    return {
      kind: "migrate",
      options: {
        contentRoot,
        action,
        language: parseLanguageTag(parsed.values.lang, "lang"),
        reporter,
        warningsAsErrors: parsed.values["warnings-as-errors"] === true,
        ...(parsed.values["allow-lossy"] === true
          ? { allowLossy: true }
          : {}),
        ...(parsed.values["language-map"] === undefined
          ? {}
          : { languageMapPath: resolve(cwd, parsed.values["language-map"]) }),
      },
    };
  }
  if (
    parsed.values.lang !== undefined ||
    parsed.values["language-map"] !== undefined ||
    parsed.values["warnings-as-errors"] === true ||
    parsed.values["allow-lossy"] === true
  ) {
    throw new CliUsageError(
      "--lang, --language-map, --allow-lossy, and --warnings-as-errors are only valid with --check or --write",
    );
  }
  const migrationId = action === "rollback"
    ? parsed.values.rollback
    : parsed.values.finalize;
  if (migrationId === undefined || migrationId.trim().length === 0) {
    throw new CliUsageError("Specify a migration ID");
  }
  return {
    kind: "migrate",
    options: { contentRoot, action, migrationId, reporter },
  };
}

function parseConvertCommand(args: readonly string[], cwd: string): CliCommand {
  let parsed: ReturnType<typeof parseConvertArgs>;
  try {
    parsed = parseConvertArgs([...args]);
  } catch (error: unknown) {
    throw new CliUsageError(messageForParseArgsError(error));
  }

  const hasOptions =
    parsed.values.lang !== undefined || parsed.values.output !== undefined;
  if (parsed.values.help === true) {
    if (parsed.positionals.length > 0 || hasOptions) {
      throw new CliUsageError(
        "--help cannot be combined with an input or convert options",
      );
    }
    return { kind: "convert-help" };
  }
  if (parsed.positionals.length !== 1) {
    throw new CliUsageError("Specify exactly one Markdown input");
  }
  const input = parsed.positionals[0]!;
  if (documentFormatFromPath(input) !== "markdown") {
    throw new CliUsageError("input must use the .md or .markdown extension");
  }
  if (parsed.values.lang === undefined) {
    throw new CliUsageError("Specify --lang");
  }
  const output = parsed.values.output;
  if (output !== undefined && !isHtmlDocumentPath(output)) {
    throw new CliUsageError("--output must use the .html extension");
  }

  return {
    kind: "convert",
    options: {
      inputPath: resolve(cwd, input),
      ...(output === undefined ? {} : { outputPath: resolve(cwd, output) }),
      language: parseLanguageTag(parsed.values.lang, "lang"),
    },
  };
}

function parseCheckCommand(args: readonly string[], cwd: string): CliCommand {
  let parsed: ReturnType<typeof parseCheckArgs>;
  try {
    parsed = parseCheckArgs([...args]);
  } catch (error: unknown) {
    throw new CliUsageError(messageForParseArgsError(error));
  }

  if (parsed.positionals.length > 1) {
    throw new CliUsageError("Specify at most one path");
  }
  const hasOptions =
    parsed.values.fix === true ||
    parsed.values.lint === true ||
    parsed.values.format === true ||
    parsed.values.fixer === true ||
    parsed.values.reporter !== undefined ||
    parsed.values["warnings-as-errors"] === true ||
    parsed.values["max-issues"] !== undefined;
  if (parsed.values.help === true) {
    if (parsed.positionals.length > 0 || hasOptions) {
      throw new CliUsageError(
        "--help cannot be combined with a path or check options",
      );
    }
    return { kind: "check-help" };
  }

  const selectedStages: CliCheckStage[] = [];
  if (parsed.values.fixer === true) {
    selectedStages.push("fixer");
  }
  if (parsed.values.format === true) {
    selectedStages.push("formatter");
  }
  if (parsed.values.lint === true) {
    selectedStages.push("linter");
  }
  const stages =
    selectedStages.length === 0
      ? (["fixer", "formatter", "linter"] as const)
      : selectedStages;
  if (
    parsed.values.fix === true &&
    !stages.some((stage) => stage === "fixer" || stage === "formatter")
  ) {
    throw new CliUsageError("--fix requires --fixer or --format");
  }
  const reporter = parsed.values.reporter ?? "compact";
  if (reporter !== "compact" && reporter !== "json") {
    throw new CliUsageError("reporter must be compact or json");
  }
  const target = parsed.positionals[0] ?? "./specs";
  return {
    kind: "check",
    options: {
      targetPath: resolve(cwd, target),
      stages,
      mode: parsed.values.fix === true ? "fix" : "check",
      reporter,
      warningsAsErrors: parsed.values["warnings-as-errors"] === true,
      maxIssues: parseMaxIssues(parsed.values["max-issues"]),
    },
  };
}

function parseFixCommand(args: readonly string[], cwd: string): CliCommand {
  let parsed: ReturnType<typeof parseFixArgs>;
  try {
    parsed = parseFixArgs([...args]);
  } catch (error: unknown) {
    throw new CliUsageError(messageForParseArgsError(error));
  }

  if (parsed.positionals.length > 1) {
    throw new CliUsageError("Specify at most one path");
  }
  if (parsed.values.help === true) {
    if (
      parsed.positionals.length > 0 ||
      parsed.values.check === true ||
      parsed.values.write === true ||
      parsed.values.reporter !== undefined
    ) {
      throw new CliUsageError("--help cannot be combined with a path or fix options");
    }
    return { kind: "fix-help" };
  }
  const check = parsed.values.check === true;
  const write = parsed.values.write === true;
  if (check === write) {
    throw new CliUsageError(
      "Specify exactly one of --check or --write",
    );
  }
  const reporter = parsed.values.reporter ?? "compact";
  if (reporter !== "compact" && reporter !== "json") {
    throw new CliUsageError("reporter must be compact or json");
  }
  const target = parsed.positionals[0] ?? "./specs";
  return {
    kind: "fix",
    options: {
      targetPath: resolve(cwd, target),
      mode: check ? "check" : "write",
      reporter,
    },
  };
}

function parseFormatCommand(args: readonly string[], cwd: string): CliCommand {
  let parsed: ReturnType<typeof parseFormatArgs>;
  try {
    parsed = parseFormatArgs([...args]);
  } catch (error: unknown) {
    throw new CliUsageError(messageForParseArgsError(error));
  }

  if (parsed.positionals.length > 1) {
    throw new CliUsageError("Specify at most one path");
  }
  if (parsed.values.help === true) {
    if (
      parsed.positionals.length > 0 ||
      parsed.values.check === true ||
      parsed.values.write === true ||
      parsed.values.reporter !== undefined
    ) {
      throw new CliUsageError(
        "--help cannot be combined with a path or format options",
      );
    }
    return { kind: "format-help" };
  }
  const check = parsed.values.check === true;
  const write = parsed.values.write === true;
  if (check === write) {
    throw new CliUsageError(
      "Specify exactly one of --check or --write",
    );
  }
  const reporter = parsed.values.reporter ?? "compact";
  if (reporter !== "compact" && reporter !== "json") {
    throw new CliUsageError("reporter must be compact or json");
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
    throw new CliUsageError("Specify at most one directory");
  }

  if (parsed.values.help === true && parsed.values.version === true) {
    throw new CliUsageError("--help and --version cannot be combined");
  }

  if (parsed.values.help === true) {
    return { kind: "help" };
  }

  if (parsed.values.version === true) {
    return { kind: "version" };
  }

  if (parsed.values.open === true && parsed.values["no-open"] === true) {
    throw new CliUsageError("--open and --no-open cannot be combined");
  }

  const portValue = parsed.values.port ?? "4173";
  if (!/^[0-9]+$/.test(portValue)) {
    throw new CliUsageError("port must be an integer from 0 to 65535");
  }

  const port = Number(portValue);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
    throw new CliUsageError("port must be an integer from 0 to 65535");
  }

  const host = (parsed.values.host ?? "127.0.0.1").trim();
  if (host.length === 0) {
    throw new CliUsageError("host cannot be empty");
  }

  const directory = parsed.positionals[0] ?? "./specs";
  const allowedHosts = (parsed.values["allowed-host"] ?? []).map((value) => {
    const hostValue = value.trim();
    if (hostValue.length === 0) {
      throw new CliUsageError("allowed-host cannot be empty");
    }
    return hostValue;
  });

  return {
    kind: "run",
    options: {
      contentRoot: resolve(cwd, directory),
      host,
      allowedHosts,
      port,
      openBrowser: parsed.values["no-open"] !== true,
      markdownLanguage: parseLanguageTag(
        parsed.values["markdown-lang"] ?? "en",
        "markdown-lang",
      ),
    },
  };
}

function parseLanguageTag(value: string, option: string): string {
  try {
    return canonicalizeLanguageTag(value);
  } catch {
    throw new CliUsageError(`${option} must be a valid BCP 47 language tag`);
  }
}

function parseLintCommand(args: readonly string[], cwd: string): CliCommand {
  let parsed: ReturnType<typeof parseLintArgs>;
  try {
    parsed = parseLintArgs([...args]);
  } catch (error: unknown) {
    throw new CliUsageError(messageForParseArgsError(error));
  }

  if (parsed.positionals.length > 1) {
    throw new CliUsageError("Specify at most one directory");
  }

  const hasExplain = parsed.values.explain !== undefined;
  const hasLintOptions =
    parsed.values.format !== undefined ||
    parsed.values["warnings-as-errors"] === true ||
    parsed.values["max-issues"] !== undefined;
  if (hasExplain && (parsed.positionals.length > 0 || hasLintOptions)) {
    throw new CliUsageError(
      "--explain cannot be combined with a directory or lint options",
    );
  }
  if (parsed.values.help === true && hasExplain) {
    throw new CliUsageError("--help and --explain cannot be combined");
  }
  if (parsed.values.help === true) {
    return { kind: "lint-help" };
  }
  if (hasExplain) {
    const rule = parsed.values.explain;
    if (rule === undefined || !RULE_BY_ID.has(rule as RuleId)) {
      throw new CliUsageError(`Unknown rule: ${rule ?? ""}`);
    }
    return { kind: "explain", rule: rule as RuleId };
  }

  const format = parsed.values.format ?? "compact";
  if (format !== "compact" && format !== "json") {
    throw new CliUsageError("format must be compact or json");
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
    throw new CliUsageError("max-issues must be a non-negative integer");
  }
  const maxIssues = Number(value);
  if (!Number.isSafeInteger(maxIssues)) {
    throw new CliUsageError("max-issues exceeds the safe integer range");
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
      ? "An unknown option was specified"
      : `Unknown option: ${option}`;
  }
  if (
    error instanceof Error &&
    "code" in error &&
    error.code === "ERR_PARSE_ARGS_INVALID_OPTION_VALUE"
  ) {
    const option = /Option '([^']+)'/.exec(error.message)?.[1];
    return option === undefined
      ? "An option value is invalid"
      : `Option requires a value: ${option}`;
  }
  return "Could not parse arguments";
}

function parseCommandArgs(args: string[]) {
  return parseArgs({
    args,
    allowPositionals: true,
    strict: true,
    options: {
      host: { type: "string" },
      "allowed-host": { type: "string", multiple: true },
      port: { type: "string" },
      open: { type: "boolean" },
      "no-open": { type: "boolean" },
      "markdown-lang": { type: "string" },
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

function parseFixArgs(args: string[]) {
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

function parseCheckArgs(args: string[]) {
  return parseArgs({
    args,
    allowPositionals: true,
    strict: true,
    options: {
      fix: { type: "boolean" },
      lint: { type: "boolean" },
      format: { type: "boolean" },
      fixer: { type: "boolean" },
      reporter: { type: "string" },
      "warnings-as-errors": { type: "boolean" },
      "max-issues": { type: "string" },
      help: { type: "boolean" },
    },
  });
}

function parseConvertArgs(args: string[]) {
  return parseArgs({
    args,
    allowPositionals: true,
    strict: true,
    options: {
      lang: { type: "string" },
      output: { type: "string" },
      help: { type: "boolean" },
    },
  });
}

function parseMigrateArgs(args: string[]) {
  return parseArgs({
    args,
    allowPositionals: true,
    strict: true,
    options: {
      check: { type: "boolean" },
      write: { type: "boolean" },
      rollback: { type: "string" },
      finalize: { type: "string" },
      lang: { type: "string" },
      "language-map": { type: "string" },
      reporter: { type: "string" },
      "warnings-as-errors": { type: "boolean" },
      "allow-lossy": { type: "boolean" },
      help: { type: "boolean" },
    },
  });
}
