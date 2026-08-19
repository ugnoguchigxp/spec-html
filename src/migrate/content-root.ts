import { lstat, realpath } from "node:fs/promises";
import { resolve } from "node:path";

export async function resolveMigrationContentRoot(
  requestedRoot: string,
): Promise<string> {
  const absoluteRoot = resolve(requestedRoot);
  let stats;
  try {
    stats = await lstat(absoluteRoot);
  } catch {
    throw new Error(`Target directory not found: ${absoluteRoot}`);
  }
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error(`Target must be a regular directory: ${absoluteRoot}`);
  }
  return realpath(absoluteRoot);
}
