import { request } from "node:http";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isClientDisconnectError } from "../../src/server/routes.js";
import { startServer } from "../../src/server/start.js";
import type { RunningServer } from "../../src/server/types.js";

let fixtureRoot: string;
let contentRoot: string;
let runtimeRoot: string;
let chartFile: string;
let mermaidRoot: string;
let runningServer: RunningServer | undefined;

beforeEach(async () => {
  fixtureRoot = await mkdtemp(join(tmpdir(), "html-docs-server-"));
  contentRoot = join(fixtureRoot, "content");
  runtimeRoot = join(fixtureRoot, "runtime");
  chartFile = join(fixtureRoot, "chart.js");
  mermaidRoot = join(fixtureRoot, "mermaid");
  await mkdir(join(contentRoot, "nested"), { recursive: true });
  await mkdir(join(contentRoot, "assets"), { recursive: true });
  await mkdir(runtimeRoot, { recursive: true });
  await mkdir(join(mermaidRoot, "chunks"), { recursive: true });

  await Promise.all([
    writeFile(join(contentRoot, "nav.html"), "<nav>Navigation</nav>"),
    writeFile(join(contentRoot, "nested", "page.html"), "<article>Nested</article>"),
    writeFile(join(contentRoot, "assets", "pixel.svg"), "<svg></svg>"),
    writeFile(join(runtimeRoot, "viewer.js"), "export {};"),
    writeFile(join(runtimeRoot, "shell.css"), "body {}"),
    writeFile(join(runtimeRoot, "document.css"), "body {}"),
    writeFile(join(runtimeRoot, "mermaid.js"), "export {};"),
    writeFile(chartFile, "globalThis.Chart = {};"),
    writeFile(join(mermaidRoot, "mermaid.esm.min.mjs"), "export default {};"),
    writeFile(join(mermaidRoot, "chunks", "flow.mjs"), "export {};"),
  ]);

  runningServer = await startServer({
    contentRoot,
    runtimeRoot,
    host: "127.0.0.1",
    port: 0,
    integrations: { chartFile, mermaidRoot },
  });
});

afterEach(async () => {
  await runningServer?.close();
  await rm(fixtureRoot, { recursive: true, force: true });
});

describe("local content server", () => {
  it("serves the shell, runtime files, content files, and assets", async () => {
    const server = requireServer();
    const shell = await fetch(`${server.origin}/`);
    const viewer = await fetch(`${server.origin}/_html-docs/viewer.js`);
    const shellCss = await fetch(`${server.origin}/_html-docs/shell.css`);
    const documentCss = await fetch(`${server.origin}/_html-docs/document.css`);
    const mermaidLoader = await fetch(`${server.origin}/_html-docs/mermaid.js`);
    const chart = await fetch(`${server.origin}/_html-docs/integrations/chart.js`);
    const mermaid = await fetch(
      `${server.origin}/_html-docs/integrations/mermaid/mermaid.esm.min.mjs`,
    );
    const mermaidChunk = await fetch(
      `${server.origin}/_html-docs/integrations/mermaid/chunks/flow.mjs`,
    );
    const navigation = await fetch(`${server.origin}/_content/nav.html`);
    const nested = await fetch(`${server.origin}/_content/nested/page.html`);
    const asset = await fetch(`${server.origin}/_content/assets/pixel.svg`);

    expect(shell.status).toBe(200);
    const shellBody = await shell.text();
    expect(shellBody).toContain('id="app"');
    expect(shellBody).toContain('data-chart-js="true"');
    expect(shellBody).toContain('data-mermaid="true"');
    expect(viewer.headers.get("content-type")).toContain("text/javascript");
    expect(viewer.headers.get("cache-control")).toBe("private, max-age=300");
    expect(shellCss.status).toBe(200);
    expect(documentCss.status).toBe(200);
    expect(mermaidLoader.status).toBe(200);
    expect(chart.status).toBe(200);
    expect(mermaid.status).toBe(200);
    expect(mermaidChunk.status).toBe(200);
    expect(await navigation.text()).toContain("Navigation");
    expect(await nested.text()).toContain("Nested");
    expect(asset.headers.get("content-type")).toBe("image/svg+xml");
  });

  it("runs without optional Chart.js and Mermaid installations", async () => {
    await requireServer().close();
    runningServer = await startServer({
      contentRoot,
      runtimeRoot,
      host: "127.0.0.1",
      port: 0,
    });

    const server = requireServer();
    const shell = await fetch(`${server.origin}/`);
    const body = await shell.text();
    expect(body).toContain('data-chart-js="false"');
    expect(body).toContain('data-mermaid="false"');
    expect(
      (await fetch(`${server.origin}/_html-docs/integrations/chart.js`)).status,
    ).toBe(404);
    expect(
      (
        await fetch(
          `${server.origin}/_html-docs/integrations/mermaid/mermaid.esm.min.mjs`,
        )
      ).status,
    ).toBe(404);
  });

  it("responds to HEAD without a body", async () => {
    const response = await fetch(`${requireServer().origin}/_content/nav.html`, {
      method: "HEAD",
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-length")).toBe("21");
    expect(await response.text()).toBe("");
  });

  it("returns useful HTTP errors", async () => {
    const server = requireServer();
    expect((await fetch(`${server.origin}/missing`)).status).toBe(404);
    expect(
      (await fetch(`${server.origin}/_content/missing.html`)).status,
    ).toBe(404);
    expect(
      (await fetch(`${server.origin}/_content/nested`)).status,
    ).toBe(404);
    expect(
      (await fetch(`${server.origin}/`, { method: "POST" })).status,
    ).toBe(405);
  });

  it("rejects malformed request paths", async () => {
    const response = await rawRequest(requireServer().origin, "/_content/%ZZ.html");

    expect(response.status).toBe(400);
  });

  it("closes idempotently", async () => {
    const server = requireServer();
    await server.close();
    await expect(server.close()).resolves.toBeUndefined();
    runningServer = undefined;
  });
});

describe("client disconnect handling", () => {
  it("recognizes expected stream cancellation errors", () => {
    expect(
      isClientDisconnectError(
        Object.assign(new Error("aborted"), {
          code: "ERR_STREAM_PREMATURE_CLOSE",
        }),
      ),
    ).toBe(true);
    expect(
      isClientDisconnectError(Object.assign(new Error("reset"), { code: "ECONNRESET" })),
    ).toBe(true);
    expect(
      isClientDisconnectError(Object.assign(new Error("disk"), { code: "EIO" })),
    ).toBe(false);
    expect(isClientDisconnectError("aborted")).toBe(false);
  });
});

function requireServer(): RunningServer {
  if (runningServer === undefined) {
    throw new Error("Server was not started");
  }
  return runningServer;
}

function rawRequest(
  origin: string,
  path: string,
): Promise<{ status: number; body: string }> {
  const url = new URL(origin);
  return new Promise((resolve, reject) => {
    const clientRequest = request(
      {
        hostname: url.hostname,
        port: url.port,
        method: "GET",
        path,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          resolve({
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    clientRequest.once("error", reject);
    clientRequest.end();
  });
}
