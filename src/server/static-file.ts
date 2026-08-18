import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { getContentType } from "./mime.js";

export class InvalidRequestPathError extends Error {
  override name = "InvalidRequestPathError";
}

export async function resolveRequestFile(
  root: string,
  encodedRelativePath: string,
): Promise<string | null> {
  const encodedSegments = encodedRelativePath.split("/");
  if (encodedSegments.length === 0 || encodedSegments.some((segment) => segment.length === 0)) {
    throw new InvalidRequestPathError("空のpath segmentは使用できません");
  }

  const segments = encodedSegments.map((segment) => {
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

    return decoded;
  });

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
    const fileStats = await stat(canonicalPath);
    return fileStats.isFile() ? canonicalPath : null;
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
  filePath: string,
  cacheControl = "no-store",
): Promise<void> {
  const fileStats = await stat(filePath);
  response.writeHead(200, {
    "Cache-Control": cacheControl,
    "Content-Length": String(fileStats.size),
    "Content-Type": getContentType(filePath),
  });

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  await pipeline(createReadStream(filePath), response);
}

function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    (error.code === "ENOENT" || error.code === "ENOTDIR" || error.code === "ELOOP")
  );
}
