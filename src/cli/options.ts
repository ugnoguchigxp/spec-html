import { parseArgs } from "node:util";
import { resolve } from "node:path";

export interface CliRunOptions {
  contentRoot: string;
  host: string;
  port: number;
  openBrowser: boolean;
}

export type CliCommand =
  | { kind: "run"; options: CliRunOptions }
  | { kind: "help" }
  | { kind: "version" };

export class CliUsageError extends Error {
  override name = "CliUsageError";
}

export function parseCliCommand(
  args: readonly string[],
  cwd: string,
): CliCommand {
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
