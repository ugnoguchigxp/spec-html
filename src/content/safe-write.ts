import { createHash } from "node:crypto";
import { lstat, open, readFile, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { TextDecoder } from "node:util";

export interface FileSnapshot {
  readonly absolutePath: string;
  readonly digest: string;
}

export interface AtomicWriteOperations {
  readonly rename: typeof rename;
}

const utf8Decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

export async function readUtf8File(
  absolutePath: string,
  displayPath: string,
): Promise<string> {
  const source = await readFile(absolutePath);
  try {
    return utf8Decoder.decode(source);
  } catch (error: unknown) {
    throw new Error(`UTF-8として解釈できないfileです: ${displayPath}`, {
      cause: error,
    });
  }
}

export function createFileSnapshot(
  absolutePath: string,
  source: string,
): FileSnapshot {
  return { absolutePath, digest: digest(source) };
}

export async function fileMatchesSnapshot(
  absolutePath: string,
  displayPath: string,
  snapshot: FileSnapshot,
): Promise<boolean> {
  return absolutePath === snapshot.absolutePath &&
    digest(await readUtf8File(absolutePath, displayPath)) === snapshot.digest;
}

export async function atomicReplace(
  targetPath: string,
  output: string,
  temporaryTag: string,
  operations: AtomicWriteOperations,
): Promise<void> {
  const stats = await lstat(targetPath);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`書込対象が通常fileではありません: ${targetPath}`);
  }

  const directory = dirname(targetPath);
  const file = basename(targetPath);
  const mode = stats.mode & 0o777;
  let temporaryPath: string | undefined;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = join(
      directory,
      `.${file}.${temporaryTag}-${process.pid}-${attempt}.tmp`,
    );
    try {
      const handle = await open(candidate, "wx", mode);
      temporaryPath = candidate;
      try {
        await handle.writeFile(output, "utf8");
        await handle.chmod(mode);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await operations.rename(candidate, targetPath);
      temporaryPath = undefined;
      return;
    } catch (error: unknown) {
      if (temporaryPath === undefined && isNodeError(error, "EEXIST")) {
        continue;
      }
      throw error;
    } finally {
      if (temporaryPath !== undefined) {
        await rm(temporaryPath, { force: true });
      }
    }
  }
  throw new Error(`一時file名を確保できません: ${targetPath}`);
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
