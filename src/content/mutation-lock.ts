import { lstat, mkdir, open, readFile, rm, type FileHandle } from "node:fs/promises";
import { join } from "node:path";

export const CONTENT_STATE_DIRECTORY = ".spec-html";
export const CONTENT_MUTATION_LOCK_FILE = "mutation.lock";

export class ContentMutationLockedError extends Error {
  override name = "ContentMutationLockedError";
}

export interface ContentMutationLock {
  release(): Promise<void>;
}

/** Serialize archive and migration mutations across processes. */
export async function acquireContentMutationLock(
  contentRoot: string,
): Promise<ContentMutationLock> {
  const stateRoot = join(contentRoot, CONTENT_STATE_DIRECTORY);
  await ensureDirectory(stateRoot);
  const lockPath = join(stateRoot, CONTENT_MUTATION_LOCK_FILE);
  let handle: FileHandle;
  try {
    handle = await open(lockPath, "wx", 0o600);
  } catch (error: unknown) {
    if (!isNodeError(error, "EEXIST")) {
      throw error;
    }
    if (!(await removeStaleLock(lockPath))) {
      throw new ContentMutationLockedError(
        `Another content mutation is running: ${lockPath}`,
      );
    }
    try {
      handle = await open(lockPath, "wx", 0o600);
    } catch (retryError: unknown) {
      if (isNodeError(retryError, "EEXIST")) {
        throw new ContentMutationLockedError(
          `Another content mutation is running: ${lockPath}`,
        );
      }
      throw retryError;
    }
  }
  try {
    await handle.writeFile(
      `${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })}\n`,
      "utf8",
    );
    await handle.sync();
  } catch (error: unknown) {
    try {
      await handle.close();
    } finally {
      await rm(lockPath, { force: true });
    }
    throw error;
  }
  let released = false;
  return {
    async release(): Promise<void> {
      if (released) {
        return;
      }
      released = true;
      try {
        await handle.close();
      } finally {
        await rm(lockPath, { force: true });
      }
    },
  };
}

async function ensureDirectory(path: string): Promise<void> {
  try {
    await mkdir(path, { mode: 0o700 });
  } catch (error: unknown) {
    if (!isNodeError(error, "EEXIST")) {
      throw error;
    }
  }
  const stats = await lstat(path);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error(`Content state path is not a regular directory: ${path}`);
  }
}

async function removeStaleLock(lockPath: string): Promise<boolean> {
  let stats;
  try {
    stats = await lstat(lockPath);
  } catch (error: unknown) {
    if (isNodeError(error, "ENOENT")) return true;
    throw error;
  }
  if (!stats.isFile() || stats.isSymbolicLink()) {
    return false;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(lockPath, "utf8"));
  } catch {
    return false;
  }
  if (
    !isRecord(parsed) ||
    typeof parsed.pid !== "number" ||
    !Number.isSafeInteger(parsed.pid) ||
    parsed.pid <= 0
  ) {
    return false;
  }
  try {
    process.kill(parsed.pid, 0);
    return false;
  } catch (error: unknown) {
    if (!isNodeError(error, "ESRCH")) {
      return false;
    }
  }
  await rm(lockPath);
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
