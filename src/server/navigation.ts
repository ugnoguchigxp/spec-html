import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";

interface NavigationDocument {
  path: string;
  title: string;
}

const IGNORED_DIRECTORIES = new Set(["node_modules"]);

export async function createNavigationHtml(contentRoot: string): Promise<string> {
  const documents = await findDocuments(contentRoot);
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
      lines.push(
        `  <a href="./${encodePath(document.path)}" title="${title}">${title}</a>`,
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

async function findDocuments(
  directory: string,
  relativeDirectory = "",
): Promise<NavigationDocument[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name, "en"));

  const documents: NavigationDocument[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    const relativePath = relativeDirectory
      ? `${relativeDirectory}/${entry.name}`
      : entry.name;
    const absolutePath = join(directory, entry.name);

    if (entry.isDirectory() && !IGNORED_DIRECTORIES.has(entry.name)) {
      documents.push(...(await findDocuments(absolutePath, relativePath)));
      continue;
    }
    if (
      !entry.isFile() ||
      extname(entry.name).toLowerCase() !== ".html" ||
      entry.name.toLowerCase() === "nav.html"
    ) {
      continue;
    }

    const html = await readFile(absolutePath, "utf8");
    documents.push({ path: relativePath, title: documentTitle(html, entry.name) });
  }
  return documents;
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
