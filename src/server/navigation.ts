import { readFile, stat } from "node:fs/promises";
import { basename, dirname, extname } from "node:path";
import { findContentDocuments } from "../content/documents.js";

interface NavigationDocument {
  path: string;
  title: string;
  updatedAt: Date;
}

const MINUTE_IN_MS = 60 * 1000;
const HOUR_IN_MS = 60 * MINUTE_IN_MS;
const DAY_IN_MS = 24 * HOUR_IN_MS;
const RELATIVE_TIME_LIMIT_IN_MS = 7 * DAY_IN_MS;

export async function createNavigationHtml(
  contentRoot: string,
  now = new Date(),
): Promise<string> {
  const documents = await findNavigationDocuments(contentRoot);
  const groups = new Map<string, NavigationDocument[]>();

  for (const document of documents) {
    const directory = dirname(document.path);
    const group = directory === "." ? "" : directory;
    const groupDocuments = groups.get(group) ?? [];
    groupDocuments.push(document);
    groups.set(group, groupDocuments);
  }

  const lines = ['<nav aria-label="Documents">'];
  const sortedGroups = [...groups].sort(([left], [right]) => {
    if (left.length === 0) {
      return -1;
    }
    if (right.length === 0) {
      return 1;
    }
    return left.localeCompare(right, "en");
  });

  for (const [directory, groupDocuments] of sortedGroups) {
    groupDocuments.sort(compareDocuments);
    if (directory.length > 0) {
      lines.push(`  <h2>${escapeHtml(groupTitle(directory))}</h2>`);
    }
    for (const document of groupDocuments) {
      const title = escapeHtml(document.title);
      const updatedAt = document.updatedAt.toISOString();
      const updatedLabel = formatUpdatedAt(document.updatedAt, now);
      lines.push(
        `  <a href="./${encodePath(document.path)}" title="${title}"><span class="viewer-navigation-title">${title}</span><time datetime="${updatedAt}">${updatedLabel}</time></a>`,
      );
    }
  }
  lines.push("</nav>");
  return `${lines.join("\n")}\n`;
}

function compareDocuments(
  left: NavigationDocument,
  right: NavigationDocument,
): number {
  const leftRank = documentRank(left.path);
  const rightRank = documentRank(right.path);
  return leftRank - rightRank || left.path.localeCompare(right.path, "en");
}

function documentRank(path: string): number {
  const filename = basename(path).toLowerCase();
  if (filename === "index.html") {
    return 0;
  }
  if (filename === "overview.html") {
    return 1;
  }
  if (filename === "readme.html") {
    return 2;
  }
  return 3;
}

async function findNavigationDocuments(
  contentRoot: string,
): Promise<NavigationDocument[]> {
  const contentDocuments = await findContentDocuments(contentRoot);
  return Promise.all(
    contentDocuments.map(async ({ absolutePath, path }) => {
      const [html, fileStats] = await Promise.all([
        readFile(absolutePath, "utf8"),
        stat(absolutePath),
      ]);
      return {
        path,
        title: documentTitle(html, basename(path)),
        updatedAt: fileStats.mtime,
      };
    }),
  );
}

function formatUpdatedAt(updatedAt: Date, now: Date): string {
  const elapsed = Math.max(0, now.getTime() - updatedAt.getTime());

  if (elapsed < MINUTE_IN_MS) {
    return "just now";
  }
  if (elapsed < HOUR_IN_MS) {
    return `${Math.floor(elapsed / MINUTE_IN_MS)} min`;
  }
  if (elapsed < DAY_IN_MS) {
    return formatRelativeTime(Math.floor(elapsed / HOUR_IN_MS), "hour");
  }
  if (elapsed < RELATIVE_TIME_LIMIT_IN_MS) {
    return formatRelativeTime(Math.floor(elapsed / DAY_IN_MS), "day");
  }

  return [
    updatedAt.getFullYear(),
    String(updatedAt.getMonth() + 1).padStart(2, "0"),
    String(updatedAt.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatRelativeTime(value: number, unit: string): string {
  return `${value} ${unit}${value === 1 ? "" : "s"} ago`;
}

function documentTitle(html: string, filename: string): string {
  const heading = /<h1(?:\s[^>]*)?>([\s\S]*?)<\/h1\s*>/i.exec(html)?.[1];
  if (heading !== undefined) {
    const title = decodeHtmlEntities(
      heading
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<[^>]*>/g, " "),
    )
      .replace(/\s+/g, " ")
      .trim();
    if (title.length > 0) {
      return title;
    }
  }

  const stem = basename(filename, extname(filename));
  return stem.replace(/[-_]+/g, " ").trim() || "Document";
}

function decodeHtmlEntities(value: string): string {
  const namedEntities: Readonly<Record<string, string>> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };

  return value.replace(
    /&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/gi,
    (
      entity,
      decimal: string | undefined,
      hexadecimal: string | undefined,
      named: string | undefined,
    ) => {
      if (named !== undefined) {
        return namedEntities[named.toLowerCase()] ?? entity;
      }
      const codePoint = Number.parseInt(
        decimal ?? hexadecimal ?? "",
        decimal === undefined ? 16 : 10,
      );
      return isValidCodePoint(codePoint) ? String.fromCodePoint(codePoint) : entity;
    },
  );
}

function isValidCodePoint(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value > 0 &&
    value <= 0x10ffff &&
    !(value >= 0xd800 && value <= 0xdfff)
  );
}

function groupTitle(directory: string): string {
  if (directory.length === 0) {
    return "Documents";
  }
  return directory
    .split("/")
    .map((segment) => segment.replace(/[-_]+/g, " "))
    .join(" / ");
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
