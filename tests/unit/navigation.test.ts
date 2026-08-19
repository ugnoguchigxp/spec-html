import { mkdtemp, mkdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createNavigationHtml } from "../../src/server/navigation.js";
import { setDocumentArchived } from "../../src/content/archive.js";

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
    const now = new Date("2026-08-18T12:00:00.000Z");
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
    await Promise.all([
      utimes(join(root, "overview.html"), now, now),
      utimes(join(root, "release-notes.html"), now, now),
      utimes(join(root, "api", "end points.html"), now, now),
    ]);

    await expect(createNavigationHtml(root, now)).resolves.toBe(
      [
        '<nav aria-label="Documents">',
        '  <a href="./overview.html" title="Overview &amp; goals"><span class="viewer-navigation-title">Overview &amp; goals</span><time datetime="2026-08-18T12:00:00.000Z">just now</time></a>',
        '  <a href="./release-notes.html" title="release notes"><span class="viewer-navigation-title">release notes</span><time datetime="2026-08-18T12:00:00.000Z">just now</time></a>',
        "  <h2>api</h2>",
        '  <a href="./api/end%20points.html" title="API &lt;endpoints&gt;"><span class="viewer-navigation-title">API &lt;endpoints&gt;</span><time datetime="2026-08-18T12:00:00.000Z">just now</time></a>',
        "</nav>",
        "",
      ].join("\n"),
    );
  });

  it("shows recent updates relatively and older updates as dates", async () => {
    const now = new Date(2026, 7, 18, 12, 0, 0);
    const files = [
      ["minute.html", 60 * 1000, "1 min"],
      ["minutes.html", 3 * 60 * 1000, "3 min"],
      ["hours.html", 5 * 60 * 60 * 1000, "5 hours ago"],
      ["days.html", 6 * 24 * 60 * 60 * 1000, "6 days ago"],
      ["week.html", 7 * 24 * 60 * 60 * 1000, "2026-08-11"],
    ] as const;

    for (const [filename, elapsed] of files) {
      const path = join(root, filename);
      const updatedAt = new Date(now.getTime() - elapsed);
      await writeFile(path, `<h1>${filename}</h1>`);
      await utimes(path, updatedAt, updatedAt);
    }

    const navigation = await createNavigationHtml(root, now);
    for (const [filename, , label] of files) {
      expect(navigation).toContain(
        `<span class="viewer-navigation-title">${filename}</span><time datetime=`,
      );
      expect(navigation).toContain(`>${label}</time></a>`);
    }
  });

  it("returns an empty nav for a directory without documents", async () => {
    await expect(createNavigationHtml(root)).resolves.toBe(
      '<nav aria-label="Documents">\n</nav>\n',
    );
  });

  it("separates current and archived documents without moving source files", async () => {
    await Promise.all([
      writeFile(join(root, "current.html"), "<h1>Current</h1>"),
      writeFile(join(root, "archived.html"), "<h1>Archived</h1>"),
    ]);
    await setDocumentArchived(root, "archived.html", true);

    const documents = await createNavigationHtml(root);
    const archive = await createNavigationHtml(root, new Date(), "archive");

    expect(documents).toContain('aria-label="Documents"');
    expect(documents).toContain("Current");
    expect(documents).not.toContain("Archived");
    expect(archive).toContain('aria-label="Archive"');
    expect(archive).toContain("Archived");
    expect(archive).not.toContain("Current");
    await expect(readFile(join(root, "archived.html"), "utf8")).resolves.toContain(
      "Archived",
    );
  });
});
