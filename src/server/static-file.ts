import { open, realpath, stat, type FileHandle } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { getContentType } from "./mime.js";

export class InvalidRequestPathError extends Error {
  override name = "InvalidRequestPathError";
}

export class ResolvedRequestFileChangedError extends Error {
  override name = "ResolvedRequestFileChangedError";
}

export interface ResolvedRequestFile {
  readonly filePath: string;
  readonly identity: {
    readonly dev: bigint;
    readonly ino: bigint;
  };
}

export interface ResolveRequestFileOptions {
  readonly denyDotSegments?: boolean;
}

export async function resolveRequestFile(
  root: string,
  encodedRelativePath: string,
  options: ResolveRequestFileOptions = {},
): Promise<ResolvedRequestFile | null> {
  const encodedSegments = encodedRelativePath.split("/");
  if (
    encodedSegments.length === 0 ||
    encodedSegments.some((segment) => segment.length === 0)
  ) {
    throw new InvalidRequestPathError("空のpath segmentは使用できません");
  }

  const segments: string[] = [];
  for (const segment of encodedSegments) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      throw new InvalidRequestPathError("pathのencodingが不正です");
    }

    if (
      decoded.length === 0 ||
      decoded === "." ||
      decoded === ".." ||
      decoded.includes("\0") ||
      decoded.includes("/") ||
      decoded.includes("\\")
    ) {
      throw new InvalidRequestPathError("path segmentが不正です");
    }

    if (options.denyDotSegments === true && decoded.startsWith(".")) {
      return null;
    }

    segments.push(decoded);
  }

  const resolvedRoot = await realpath(root);
  const resolvedPath = resolve(resolvedRoot, ...segments);
  const relativePath = relative(resolvedRoot, resolvedPath);
  if (
    relativePath.startsWith(`..${sep}`) ||
    relativePath === ".." ||
    isAbsolute(relativePath)
  ) {
    return null;
  }

  try {
    const canonicalPath = await realpath(resolvedPath);
    const canonicalRelativePath = relative(resolvedRoot, canonicalPath);
    if (
      canonicalRelativePath.startsWith(`..${sep}`) ||
      canonicalRelativePath === ".." ||
      isAbsolute(canonicalRelativePath)
    ) {
      return null;
    }
    const fileStats = await stat(canonicalPath, { bigint: true });
    return fileStats.isFile()
      ? {
          filePath: canonicalPath,
          identity: { dev: fileStats.dev, ino: fileStats.ino },
        }
      : null;
  } catch (error: unknown) {
    if (isNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

export async function sendFile(
  request: IncomingMessage,
  response: ServerResponse,
  file: string | ResolvedRequestFile,
  cacheControl = "no-store",
): Promise<void> {
  const filePath = typeof file === "string" ? file : file.filePath;
  const handle = typeof file === "string"
    ? await open(filePath, "r")
    : await openResolvedRequestFile(file);
  try {
    const fileStats = await handle.stat();
    response.writeHead(200, {
      "Cache-Control": cacheControl,
      "Content-Length": String(fileStats.size),
      "Content-Type": getContentType(filePath),
    });

    if (request.method === "HEAD") {
      response.end();
      return;
    }

    await pipeline(handle.createReadStream({ autoClose: false }), response);
  } finally {
    await handle.close();
  }
}

/** Open a previously resolved file and reject path replacement before serving bytes. */
export async function openResolvedRequestFile(
  file: ResolvedRequestFile,
): Promise<FileHandle> {
  const handle = await open(file.filePath, "r");
  try {
    const openedStats = await handle.stat({ bigint: true });
    if (
      !openedStats.isFile() ||
      openedStats.dev !== file.identity.dev ||
      openedStats.ino !== file.identity.ino
    ) {
      throw new ResolvedRequestFileChangedError(
        "Resolved request file changed before it was opened",
      );
    }
    return handle;
  } catch (error: unknown) {
    await handle.close();
    throw error;
  }
}

function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    (error.code === "ENOENT" ||
      error.code === "ENOTDIR" ||
      error.code === "ELOOP")
  );
}
