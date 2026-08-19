import { createServer } from "node:http";
import { canonicalizeLanguageTag } from "../markdown/language.js";
import { createLiveReload } from "./live-reload.js";
import type { LiveReload } from "./live-reload.js";
import { createHostPolicy } from "./host-policy.js";
import { createRequestHandler } from "./routes.js";
import { NavigationTitleCache } from "./navigation.js";
import type { RunningServer, StartServerOptions } from "./types.js";

export async function startServer(
  options: StartServerOptions,
): Promise<RunningServer> {
  const markdownLanguage = canonicalizeLanguageTag(
    options.markdownLanguage ?? "en",
  );
  const hostPolicy = createHostPolicy(options.host, options.allowedHosts);
  const liveReload = await createLiveReload(options.contentRoot);
  const server = createServer(
    createRequestHandler({
      ...options,
      markdownLanguage,
      hostPolicy,
      liveReload,
      navigationTitleCache: new NavigationTitleCache(),
    }),
  );

  return new Promise((resolve, reject) => {
    const onError = (error: Error): void => {
      liveReload.close();
      reject(error);
    };

    server.once("error", onError);
    server.listen({ host: options.host, port: options.port }, () => {
      server.off("error", onError);
      const address = server.address();
      if (address === null || typeof address === "string") {
        liveReload.close();
        reject(new Error("Server addressを取得できません"));
        return;
      }

      let closePromise: Promise<void> | undefined;
      resolve({
        origin: createOrigin(hostPolicy.browserHost, address.port),
        port: address.port,
        close: (): Promise<void> => {
          closePromise ??= closeRunningServer(server, liveReload);
          return closePromise;
        },
      });
    });
  });
}

async function closeRunningServer(
  server: ReturnType<typeof createServer>,
  liveReload: LiveReload,
): Promise<void> {
  liveReload.close();
  await closeServer(server);
}

function createOrigin(host: string, port: number): string {
  const formattedHost = host.includes(":") ? `[${host}]` : host;
  return `http://${formattedHost}:${port}`;
}

function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (
        error !== undefined &&
        !("code" in error && error.code === "ERR_SERVER_NOT_RUNNING")
      ) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
