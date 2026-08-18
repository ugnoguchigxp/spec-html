import { CliUsageError } from "./options.js";

export function messageForCliError(error: unknown): string {
  if (error instanceof CliUsageError) {
    return `引数が不正です: ${error.message}`;
  }
  if (
    error instanceof Error &&
    "code" in error &&
    error.code === "EADDRINUSE" &&
    "port" in error &&
    typeof error.port === "number"
  ) {
    return `ポートを使用できません: ${error.port}`;
  }
  return error instanceof Error ? error.message : String(error);
}
