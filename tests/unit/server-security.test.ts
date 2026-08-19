import { access, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDocumentArchived } from "../../src/content/archive.js";
import { startServer } from "../../src/server/start.js";
import type { RunningServer } from "../../src/server/types.js";

let fixtureRoot: string;
let contentRoot: string;
let runtimeRoot: string;
let runningServer: RunningServer | undefined;

beforeEach(async () => {
  fixtureRoot = await mkdtemp(join(tmpdir(), "spec-html-security-"));
  contentRoot = join(fixtureRoot, "content");
  runtimeRoot = join(fixtureRoot, "runtime");
  await Promise.all([
    mkdir(join(contentRoot, ".git"), { recursive: true }),
    mkdir(join(contentRoot, "nested", ".private"), { recursive: true }),
    mkdir(runtimeRoot),
  ]);
  await Promise.all([
    writeFile(join(contentRoot, "document.html"), "<h1>Document</h1>"),
    writeFile(join(contentRoot, ".env"), "SECRET=value"),
    writeFile(join(contentRoot, ".git", "config"), "secret"),
    writeFile(join(contentRoot, "nested", ".private", "file.html"), "secret"),
  ]);
  runningServer = await startServer({
    contentRoot,
    runtimeRoot,
    host: "127.0.0.1",
    port: 0,
  });
});

afterEach(async () => {
  await runningServer?.close();
  runningServer = undefined;
  await rm(fixtureRoot, { recursive: true, force: true });
});

describe("server request boundary", () => {
  it.each([
    ".env",
    ".git/config",
    "%2Egit/config",
    "nested/.private/file.html",
  ])("does not expose hidden content paths: %s", async (path) => {
    const response = await sendRequest(`/_content/${path}`);

    expect(response.status).toBe(404);
    expect(response.body).toBe("Not Found");
  });

  it("rejects an untrusted Host before routing", async () => {
    const response = await sendRequest("/_content/document.html", {
      host: "attacker.example",
    });

    expect(response.status).toBe(421);
    expect(response.body).toBe("Misdirected Request");
  });

  it("accepts another loopback spelling", async () => {
    const response = await sendRequest("/_content/document.html", {
      host: `localhost:${runningServer!.port}`,
    });

    expect(response.status).toBe(200);
  });

  it("rejects a cross-origin archive update without moving the document", async () => {
    const response = await sendRequest(
      "/_spec-html/document-state?doc=document.html",
      {
        method: "PUT",
        origin: "http://attacker.example",
        body: JSON.stringify({ archived: true }),
      },
    );

    expect(response.status).toBe(403);
    await expect(
      getDocumentArchived(contentRoot, "document.html"),
    ).resolves.toBe(false);
    await access(join(contentRoot, "document.html"));
  });

  it("allows a same-origin archive update", async () => {
    const response = await sendRequest(
      "/_spec-html/document-state?doc=document.html",
      {
        method: "PUT",
        origin: runningServer!.origin,
        body: JSON.stringify({ archived: true }),
      },
    );

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      doc: "document.html",
      archived: true,
      restoreAllowed: true,
      migrationId: null,
      migrationOutputPath: null,
    });
    await expect(
      getDocumentArchived(contentRoot, "document.html"),
    ).resolves.toBe(true);
  });

  it("requires Origin for archive updates on a non-loopback listener", async () => {
    await runningServer?.close();
    runningServer = await startServer({
      contentRoot,
      runtimeRoot,
      host: "0.0.0.0",
      allowedHosts: ["127.0.0.1"],
      port: 0,
    });

    const response = await sendRequest(
      "/_spec-html/document-state?doc=document.html",
      {
        method: "PUT",
        body: JSON.stringify({ archived: true }),
      },
    );

    expect(response.status).toBe(403);
    await expect(
      getDocumentArchived(contentRoot, "document.html"),
    ).resolves.toBe(false);
  });

  it("rejects a misleading JSON-prefixed content type without moving the document", async () => {
    const response = await sendRequest(
      "/_spec-html/document-state?doc=document.html",
      {
        method: "PUT",
        contentType: "application/jsonp",
        body: JSON.stringify({ archived: true }),
      },
    );

    expect(response.status).toBe(400);
    await expect(
      getDocumentArchived(contentRoot, "document.html"),
    ).resolves.toBe(false);
  });
});

interface RequestOptions {
  readonly method?: string;
  readonly host?: string;
  readonly origin?: string;
  readonly contentType?: string;
  readonly body?: string;
}

function sendRequest(
  path: string,
  options: RequestOptions = {},
): Promise<{ readonly status: number; readonly body: string }> {
  const body = options.body ?? "";
  return new Promise((resolve, reject) => {
    const outgoing = request(
      `${runningServer!.origin}${path}`,
      {
        method: options.method ?? "GET",
        headers: {
          ...(options.host === undefined ? {} : { Host: options.host }),
          ...(options.origin === undefined ? {} : { Origin: options.origin }),
          ...(body.length === 0
            ? {}
            : {
                "Content-Length": String(Buffer.byteLength(body)),
                "Content-Type": options.contentType ?? "application/json",
              }),
        },
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
    outgoing.on("error", reject);
    outgoing.end(body);
  });
}
