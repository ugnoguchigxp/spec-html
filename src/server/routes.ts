import type { IncomingMessage, RequestListener, ServerResponse } from "node:http";
import type { LiveReload } from "./live-reload.js";
import type { StartServerOptions } from "./types.js";
import { createNavigationHtml } from "./navigation.js";
import { createShellHtml } from "./shell.js";
import {
  InvalidRequestPathError,
  resolveRequestFile,
  sendFile,
} from "./static-file.js";

const CONTENT_PREFIX = "/_content/";
const RUNTIME_PREFIX = "/_spec-html/";
const NAVIGATION_PATH = "/_spec-html/navigation";
const LIVE_RELOAD_PATH = "/_spec-html/live-reload";
const CHART_PATH = "/_spec-html/integrations/chart.js";
const MERMAID_PREFIX = "/_spec-html/integrations/mermaid/";
const RUNTIME_CACHE_CONTROL = "private, max-age=300";

type RequestHandlerOptions = Pick<
  StartServerOptions,
  "contentRoot" | "runtimeRoot" | "integrations"
> & { liveReload: LiveReload };

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
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end(request.method === "HEAD" ? undefined : "Method Not Allowed");
    return;
  }

  let url: URL;
  try {
    url = new URL(request.url ?? "/", "http://localhost");
  } catch {
    sendText(request, response, 400, "Bad Request");
    return;
  }

  if (url.pathname === "/") {
    sendHtml(
      request,
      response,
      createShellHtml({
        chartJs: options.integrations?.chartFile !== undefined,
        mermaid: options.integrations?.mermaidRoot !== undefined,
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
    sendHtml(request, response, await createNavigationHtml(options.contentRoot));
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
    await sendStaticRoute(
      request,
      response,
      options.contentRoot,
      url.pathname.slice(CONTENT_PREFIX.length),
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
