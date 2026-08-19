import { watch } from "node:fs";
import type { FSWatcher } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";

const RELOAD_DEBOUNCE_MS = 50;

export interface LiveReload {
  connect(request: IncomingMessage, response: ServerResponse): void;
  close(): void;
}

export function createLiveReload(contentRoot: string): LiveReload {
  const clients = new Set<ServerResponse>();
  let reloadTimer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;

  const reload = (): void => {
    reloadTimer = undefined;
    for (const client of clients) {
      client.write("data: reload\n\n");
    }
  };

  const scheduleReload = (
    _eventType: string,
    filename: string | Buffer | null,
  ): void => {
    if (closed) {
      return;
    }
    const changedPath =
      typeof filename === "string" ? filename : filename?.toString("utf8");
    if (changedPath?.split(/[\\/]/, 1)[0] === ".spec-html") {
      return;
    }
    if (reloadTimer !== undefined) {
      clearTimeout(reloadTimer);
    }
    reloadTimer = setTimeout(reload, RELOAD_DEBOUNCE_MS);
  };

  const watcher: FSWatcher = watch(
    contentRoot,
    { recursive: true },
    scheduleReload,
  );

  return {
    connect: (request, response): void => {
      if (request.method === "HEAD") {
        response.writeHead(200, liveReloadHeaders());
        response.end();
        return;
      }

      response.writeHead(200, liveReloadHeaders());
      response.flushHeaders();
      response.write(": connected\n\n");
      clients.add(response);
      response.once("close", () => clients.delete(response));
    },
    close: (): void => {
      if (closed) {
        return;
      }
      closed = true;
      if (reloadTimer !== undefined) {
        clearTimeout(reloadTimer);
      }
      watcher.close();
      for (const client of clients) {
        client.end();
      }
      clients.clear();
    },
  };
}

function liveReloadHeaders(): Record<string, string> {
  return {
    "Cache-Control": "no-store",
    Connection: "keep-alive",
    "Content-Type": "text/event-stream; charset=utf-8",
  };
}
