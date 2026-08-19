import { CliUsageError } from "./options.js";

export function messageForCliError(error: unknown): string {
  if (error instanceof CliUsageError) {
    return `Invalid arguments: ${error.message}`;
  }
  if (
    error instanceof Error &&
    "code" in error &&
    error.code === "EADDRINUSE" &&
    "port" in error &&
    typeof error.port === "number"
  ) {
    return `Port is unavailable: ${error.port}`;
  }
  return error instanceof Error ? error.message : String(error);
}
