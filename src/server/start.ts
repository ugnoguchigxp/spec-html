import { createServer } from "node:http";
import { createRequestHandler } from "./routes.js";
import type { RunningServer, StartServerOptions } from "./types.js";

export function startServer(
  options: StartServerOptions,
): Promise<RunningServer> {
  const server = createServer(createRequestHandler(options));

  return new Promise((resolve, reject) => {
    const onError = (error: Error): void => {
      reject(error);
    };

    server.once("error", onError);
    server.listen({ host: options.host, port: options.port }, () => {
      server.off("error", onError);
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("Server addressを取得できません"));
        return;
      }

      let closePromise: Promise<void> | undefined;
      resolve({
        origin: createOrigin(options.host, address.port),
        port: address.port,
        close: (): Promise<void> => {
          closePromise ??= closeServer(server);
          return closePromise;
        },
      });
    });
  });
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
