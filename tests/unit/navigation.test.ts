import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createNavigationHtml } from "../../src/server/navigation.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "spec-html-navigation-"));
  await Promise.all([
    mkdir(join(root, "api")),
    mkdir(join(root, ".hidden")),
    mkdir(join(root, "node_modules")),
  ]);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("createNavigationHtml", () => {
  it("uses h1 titles and groups HTML files by directory", async () => {
    await Promise.all([
      writeFile(
        join(root, "overview.html"),
        "<article><h1>Overview &amp; <em>goals</em></h1></article>",
      ),
      writeFile(join(root, "release-notes.html"), "<article>No title</article>"),
      writeFile(
        join(root, "api", "end points.html"),
        "<article><h1>API &#x3c;endpoints&#x3e;</h1></article>",
      ),
      writeFile(join(root, "nav.html"), "<nav>Ignored</nav>"),
      writeFile(join(root, ".hidden", "secret.html"), "<h1>Secret</h1>"),
      writeFile(join(root, "node_modules", "package.html"), "<h1>Package</h1>"),
      writeFile(join(root, "asset.svg"), "<svg></svg>"),
    ]);

    await expect(createNavigationHtml(root)).resolves.toBe(
      [
        '<nav aria-label="Documents">',
        '  <a href="./overview.html" title="Overview &amp; goals">Overview &amp; goals</a>',
        '  <a href="./release-notes.html" title="release notes">release notes</a>',
        "  <h2>api</h2>",
        '  <a href="./api/end%20points.html" title="API &lt;endpoints&gt;">API &lt;endpoints&gt;</a>',
        "</nav>",
        "",
      ].join("\n"),
    );
  });

  it("returns an empty nav for a directory without documents", async () => {
    await expect(createNavigationHtml(root)).resolves.toBe(
      '<nav aria-label="Documents">\n</nav>\n',
    );
  });
});
