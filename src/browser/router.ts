import { CONTENT_PREFIX } from "./constants.js";
import { normalizeDocumentPath } from "../content/document-path.js";
import type { RouteParseResult, RouteState } from "./types.js";

export { normalizeDocumentPath } from "../content/document-path.js";

export function parseRoute(url: URL): RouteParseResult {
  const hash = url.hash;
  const view = url.searchParams.get("view") === "archive"
    ? "archive"
    : "documents";
  if (!url.searchParams.has("doc")) {
    return { kind: "missing", route: { doc: null, hash, view } };
  }

  const rawDoc = url.searchParams.get("doc") ?? "";
  const doc = normalizeDocumentPath(rawDoc);
  if (doc === null) {
    return { kind: "invalid", rawDoc, hash, view };
  }

  return { kind: "valid", route: { doc, hash, view } };
}

export function createShellUrl(route: RouteState, base: URL): URL {
  const url = new URL("/", base);
  if (route.doc !== null) {
    url.searchParams.set("doc", route.doc);
  }
  if (route.view === "archive") {
    url.searchParams.set("view", "archive");
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
