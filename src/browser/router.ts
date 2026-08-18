import { CONTENT_PREFIX } from "./constants.js";
import type { RouteParseResult, RouteState } from "./types.js";

export function parseRoute(url: URL): RouteParseResult {
  const hash = url.hash;
  if (!url.searchParams.has("doc")) {
    return { kind: "missing", route: { doc: null, hash } };
  }

  const rawDoc = url.searchParams.get("doc") ?? "";
  const doc = normalizeDocumentPath(rawDoc);
  if (doc === null) {
    return { kind: "invalid", rawDoc, hash };
  }

  return { kind: "valid", route: { doc, hash } };
}

export function normalizeDocumentPath(value: string): string | null {
  if (value.length === 0 || value.startsWith("/") || value.startsWith("\\")) {
    return null;
  }
  if (value.includes("\0") || value.includes("\\")) {
    return null;
  }

  const segments = value.split("/");
  if (
    segments.some(
      (segment) =>
        segment.length === 0 || segment === "." || segment === "..",
    )
  ) {
    return null;
  }

  return segments.at(-1)?.toLowerCase().endsWith(".html") === true
    ? segments.join("/")
    : null;
}

export function createShellUrl(route: RouteState, base: URL): URL {
  const url = new URL("/", base);
  if (route.doc !== null) {
    url.searchParams.set("doc", route.doc);
  }
  url.hash = route.hash;
  return url;
}

export function createContentUrl(doc: string, base: URL): URL {
  const normalized = normalizeDocumentPath(doc);
  if (normalized === null) {
    throw new Error(`不正な文書pathです: ${doc}`);
  }
  const encodedPath = normalized
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return new URL(`${CONTENT_PREFIX}${encodedPath}`, base);
}

export function documentPathFromContentUrl(url: URL): string | null {
  if (!url.pathname.startsWith(CONTENT_PREFIX)) {
    return null;
  }

  const encodedPath = url.pathname.slice(CONTENT_PREFIX.length);
  if (encodedPath.length === 0) {
    return null;
  }

  let decodedPath: string;
  try {
    decodedPath = encodedPath
      .split("/")
      .map((segment) => decodeURIComponent(segment))
      .join("/");
  } catch {
    return null;
  }

  return normalizeDocumentPath(decodedPath);
}
