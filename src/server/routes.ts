import type {
  IncomingMessage,
  RequestListener,
  ServerResponse,
} from "node:http";
import {
  ARCHIVED_DIRECTORY,
  ContentDocumentNotFoundError,
  DocumentArchiveConflictError,
} from "../content/archive.js";
import {
  getDocumentArchiveState,
  MigrationManagedDocumentError,
  setDocumentArchived,
} from "../migrate/archive.js";
import {
  normalizeDocumentPath,
  type NavigationView,
} from "../content/document-path.js";
import { isViewerDocumentPath } from "../content/document-format.js";
import type { LiveReload } from "./live-reload.js";
import type { StartServerOptions } from "./types.js";
import {
  requestOriginMatches,
  validateRequestHost,
  type HostPolicy,
} from "./host-policy.js";
import {
  createNavigationHtml,
  type NavigationTitleCache,
} from "./navigation.js";
import { createShellHtml } from "./shell.js";
import {
  InvalidRequestPathError,
  ResolvedRequestFileChangedError,
  resolveRequestFile,
  sendFile,
} from "./static-file.js";
import {
  CHART_PATH,
  CONTENT_PREFIX,
  DOCUMENT_STATE_PATH,
  LIVE_RELOAD_PATH,
  MERMAID_PREFIX,
  NAVIGATION_PATH,
  RUNTIME_PREFIX,
} from "../shared/runtime-paths.js";

const RUNTIME_CACHE_CONTROL = "private, max-age=300";

type RequestHandlerOptions = Pick<
  StartServerOptions,
  "contentRoot" | "runtimeRoot" | "integrations"
> & {
  hostPolicy: HostPolicy;
  liveReload: LiveReload;
  markdownLanguage: string;
  navigationTitleCache: NavigationTitleCache;
};

export function createRequestHandler(
  options: RequestHandlerOptions,
): RequestListener {
  return (request, response) => {
    void handleRequest(request, response, options).catch((error: unknown) => {
      if (isClientDisconnectError(error)) {
        return;
      }
      console.error(error);
      if (response.headersSent) {
        response.destroy();
        return;
      }
      sendText(request, response, 500, "Internal Server Error");
    });
  };
}

export function isClientDisconnectError(error: unknown): boolean {
  if (!(error instanceof Error) || !("code" in error)) {
    return false;
  }

  return (
    error.code === "ECONNRESET" ||
    error.code === "EPIPE" ||
    error.code === "ERR_STREAM_PREMATURE_CLOSE" ||
    error.code === "ERR_STREAM_UNABLE_TO_PIPE"
  );
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: RequestHandlerOptions,
): Promise<void> {
  const hostValidation = validateRequestHost(request, options.hostPolicy);
  if (hostValidation.status === "invalid") {
    sendText(request, response, 400, "Bad Request");
    return;
  }
  if (hostValidation.status === "disallowed") {
    sendText(request, response, 421, "Misdirected Request");
    return;
  }

  let url: URL;
  try {
    url = new URL(request.url ?? "/", "http://localhost");
  } catch {
    sendText(request, response, 400, "Bad Request");
    return;
  }

  if (url.pathname === DOCUMENT_STATE_PATH) {
    await handleDocumentState(
      request,
      response,
      options.contentRoot,
      url,
      hostValidation.origin,
      options.hostPolicy.mutationOriginRequired,
    );
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    sendMethodNotAllowed(request, response, "GET, HEAD");
    return;
  }

  if (url.pathname === "/") {
    sendHtml(
      request,
      response,
      createShellHtml({
        chartJs: options.integrations?.chartFile !== undefined,
        mermaid: options.integrations?.mermaidRoot !== undefined,
        markdownLanguage: options.markdownLanguage,
      }),
    );
    return;
  }

  if (url.pathname === CHART_PATH) {
    if (options.integrations?.chartFile === undefined) {
      sendText(request, response, 404, "Not Found");
      return;
    }
    await sendFile(
      request,
      response,
      options.integrations.chartFile,
      RUNTIME_CACHE_CONTROL,
    );
    return;
  }

  if (url.pathname === NAVIGATION_PATH) {
    const view = parseNavigationView(url.searchParams.get("view"));
    if (view === null) {
      sendText(request, response, 400, "Invalid navigation view");
      return;
    }
    sendHtml(
      request,
      response,
      await createNavigationHtml(
        options.contentRoot,
        new Date(),
        view,
        options.markdownLanguage,
        options.navigationTitleCache,
      ),
    );
    return;
  }

  if (url.pathname === LIVE_RELOAD_PATH) {
    options.liveReload.connect(request, response);
    return;
  }

  if (url.pathname.startsWith(MERMAID_PREFIX)) {
    if (options.integrations?.mermaidRoot === undefined) {
      sendText(request, response, 404, "Not Found");
      return;
    }
    await sendStaticRoute(
      request,
      response,
      options.integrations.mermaidRoot,
      url.pathname.slice(MERMAID_PREFIX.length),
      RUNTIME_CACHE_CONTROL,
    );
    return;
  }

  if (url.pathname.startsWith(CONTENT_PREFIX)) {
    const encodedRelativePath = url.pathname.slice(CONTENT_PREFIX.length);
    await sendContentRoute(
      request,
      response,
      options.contentRoot,
      encodedRelativePath,
    );
    return;
  }

  if (url.pathname.startsWith(RUNTIME_PREFIX)) {
    await sendStaticRoute(
      request,
      response,
      options.runtimeRoot,
      url.pathname.slice(RUNTIME_PREFIX.length),
      RUNTIME_CACHE_CONTROL,
    );
    return;
  }

  sendText(request, response, 404, "Not Found");
}

async function handleDocumentState(
  request: IncomingMessage,
  response: ServerResponse,
  contentRoot: string,
  url: URL,
  requestOrigin: string,
  originRequired: boolean,
): Promise<void> {
  if (
    request.method !== "GET" &&
    request.method !== "HEAD" &&
    request.method !== "PUT"
  ) {
    sendMethodNotAllowed(request, response, "GET, HEAD, PUT");
    return;
  }

  const rawDocumentPath = url.searchParams.get("doc") ?? "";
  const documentPath = normalizeDocumentPath(rawDocumentPath);
  if (documentPath === null) {
    sendText(request, response, 400, "Invalid document path");
    return;
  }

  try {
    if (request.method === "PUT") {
      if (!requestOriginMatches(request, requestOrigin, originRequired)) {
        sendText(request, response, 403, "Forbidden");
        return;
      }
      const update = await readArchivedUpdate(request);
      if (update === null) {
        sendText(request, response, 400, "Invalid request body");
        return;
      }
      await setDocumentArchived(contentRoot, documentPath, update);
    }
    const state = await getDocumentArchiveState(contentRoot, documentPath);
    sendJson(request, response, { doc: documentPath, ...state });
  } catch (error: unknown) {
    if (error instanceof ContentDocumentNotFoundError) {
      sendText(request, response, 404, "Document not found");
      return;
    }
    if (error instanceof DocumentArchiveConflictError) {
      sendText(request, response, 409, "Document archive conflict");
      return;
    }
    if (error instanceof MigrationManagedDocumentError) {
      sendText(
        request,
        response,
        409,
        `Document is managed by migration ${error.migrationId}`,
      );
      return;
    }
    throw error;
  }
}

function parseNavigationView(value: string | null): NavigationView | null {
  if (value === null || value === "documents") {
    return "documents";
  }
  return value === "archive" ? "archive" : null;
}

async function sendContentRoute(
  request: IncomingMessage,
  response: ServerResponse,
  root: string,
  encodedRelativePath: string,
): Promise<void> {
  try {
    const activeFile = await resolveRequestFile(root, encodedRelativePath, {
      denyDotSegments: true,
    });
    if (activeFile !== null) {
      await sendFile(request, response, activeFile);
      return;
    }

    const archivedPath = createArchivedFallbackPath(encodedRelativePath);
    if (archivedPath !== null) {
      const archivedFile = await resolveRequestFile(root, archivedPath);
      if (archivedFile !== null) {
        await sendFile(request, response, archivedFile);
        return;
      }
    }
    sendText(request, response, 404, "Not Found");
  } catch (error: unknown) {
    if (error instanceof InvalidRequestPathError) {
      sendText(request, response, 400, "Bad Request");
      return;
    }
    if (error instanceof ResolvedRequestFileChangedError) {
      sendText(request, response, 404, "Not Found");
      return;
    }
    throw error;
  }
}

function createArchivedFallbackPath(
  encodedRelativePath: string,
): string | null {
  const segments = encodedRelativePath.split("/");
  const filename = segments.at(-1);
  if (filename === undefined) {
    return null;
  }
  let decodedSegments: string[];
  try {
    decodedSegments = segments.map((segment) => decodeURIComponent(segment));
  } catch {
    return null;
  }
  if (decodedSegments.some((segment) => segment.startsWith("."))) {
    return null;
  }
  const decodedFilename = decodedSegments.at(-1) ?? "";
  if (!isViewerDocumentPath(decodedFilename)) {
    return null;
  }
  segments.splice(-1, 0, ARCHIVED_DIRECTORY);
  return segments.join("/");
}

async function readArchivedUpdate(
  request: IncomingMessage,
): Promise<boolean | null> {
  if (!isJsonContentType(request.headers["content-type"])) {
    return null;
  }

  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of request as AsyncIterable<unknown>) {
    const buffer =
      typeof chunk === "string"
        ? Buffer.from(chunk)
        : chunk instanceof Uint8Array
          ? chunk
          : null;
    if (buffer === null) {
      return null;
    }
    size += buffer.length;
    if (size > 4096) {
      return null;
    }
    chunks.push(buffer);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("archived" in parsed) ||
    typeof parsed.archived !== "boolean"
  ) {
    return null;
  }
  return parsed.archived;
}

function isJsonContentType(value: string | undefined): boolean {
  return value?.split(";", 1)[0]?.trim().toLowerCase() === "application/json";
}

async function sendStaticRoute(
  request: IncomingMessage,
  response: ServerResponse,
  root: string,
  encodedRelativePath: string,
  cacheControl = "no-store",
): Promise<void> {
  try {
    const filePath = await resolveRequestFile(root, encodedRelativePath);
    if (filePath === null) {
      sendText(request, response, 404, "Not Found");
      return;
    }
    await sendFile(request, response, filePath, cacheControl);
  } catch (error: unknown) {
    if (error instanceof InvalidRequestPathError) {
      sendText(request, response, 400, "Bad Request");
      return;
    }
    if (error instanceof ResolvedRequestFileChangedError) {
      sendText(request, response, 404, "Not Found");
      return;
    }
    throw error;
  }
}

function sendHtml(
  request: IncomingMessage,
  response: ServerResponse,
  body: string,
): void {
  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Length": String(Buffer.byteLength(body)),
    "Content-Type": "text/html; charset=utf-8",
  });
  response.end(request.method === "HEAD" ? undefined : body);
}

function sendJson(
  request: IncomingMessage,
  response: ServerResponse,
  value: unknown,
): void {
  const body = `${JSON.stringify(value)}\n`;
  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Length": String(Buffer.byteLength(body)),
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(request.method === "HEAD" ? undefined : body);
}

function sendMethodNotAllowed(
  request: IncomingMessage,
  response: ServerResponse,
  allow: string,
): void {
  const body = "Method Not Allowed";
  response.writeHead(405, {
    Allow: allow,
    "Cache-Control": "no-store",
    "Content-Length": String(Buffer.byteLength(body)),
    "Content-Type": "text/plain; charset=utf-8",
  });
  response.end(request.method === "HEAD" ? undefined : body);
}

function sendText(
  request: IncomingMessage,
  response: ServerResponse,
  status: number,
  body: string,
): void {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Length": String(Buffer.byteLength(body)),
    "Content-Type": "text/plain; charset=utf-8",
  });
  response.end(request.method === "HEAD" ? undefined : body);
}
