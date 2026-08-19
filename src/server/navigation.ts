import { readFile, stat } from "node:fs/promises";
import { basename, dirname } from "node:path";
import {
  withDocumentArchiveSnapshot,
  type DocumentArchiveSnapshot,
} from "../content/archive.js";
import type { ContentDocument } from "../content/documents.js";
import type { NavigationView } from "../content/document-path.js";
import { removeDocumentExtension } from "../content/document-format.js";
import { decodeHtmlCharacterReferences } from "../content/html-character-references.js";
import { compileMarkdown } from "../markdown/compiler.js";
import { canonicalizeLanguageTag } from "../markdown/language.js";

interface NavigationDocument {
  path: string;
  title: string;
  updatedAt: Date;
  format: ContentDocument["format"];
}

interface CachedNavigationTitle {
  readonly format: ContentDocument["format"];
  readonly language: string;
  readonly mtimeMs: number;
  readonly size: number;
  readonly title: string;
}

export interface NavigationTitleCacheOperations {
  readFile(path: string, encoding: "utf8"): Promise<string>;
  stat(path: string): Promise<{
    readonly mtime: Date;
    readonly mtimeMs: number;
    readonly size: number;
  }>;
}

const defaultCacheOperations: NavigationTitleCacheOperations = {
  readFile,
  stat,
};

/** Caches parsed navigation titles until a document's size or mtime changes. */
export class NavigationTitleCache {
  private readonly entries = new Map<string, CachedNavigationTitle>();

  constructor(
    private readonly operations: NavigationTitleCacheOperations =
      defaultCacheOperations,
  ) {}

  async read(
    document: ContentDocument,
    markdownLanguage: string,
  ): Promise<NavigationDocument> {
    const fileStats = await this.operations.stat(document.absolutePath);
    const cached = this.entries.get(document.absolutePath);
    const language = document.format === "markdown" ? markdownLanguage : "";
    if (
      cached !== undefined &&
      cached.format === document.format &&
      cached.language === language &&
      cached.mtimeMs === fileStats.mtimeMs &&
      cached.size === fileStats.size
    ) {
      return {
        path: document.path,
        title: cached.title,
        updatedAt: fileStats.mtime,
        format: document.format,
      };
    }

    const source = await this.operations.readFile(document.absolutePath, "utf8");
    const title = document.format === "markdown"
      ? (compileMarkdown(source, { language: markdownLanguage }).title ??
        fallbackDocumentTitle(document.path))
      : documentTitle(source, basename(document.path));
    this.entries.set(document.absolutePath, {
      format: document.format,
      language,
      mtimeMs: fileStats.mtimeMs,
      size: fileStats.size,
      title,
    });
    return {
      path: document.path,
      title,
      updatedAt: fileStats.mtime,
      format: document.format,
    };
  }
}

const MINUTE_IN_MS = 60 * 1000;
const HOUR_IN_MS = 60 * MINUTE_IN_MS;
const DAY_IN_MS = 24 * HOUR_IN_MS;
const RELATIVE_TIME_LIMIT_IN_MS = 7 * DAY_IN_MS;

export async function createNavigationHtml(
  contentRoot: string,
  now = new Date(),
  view: NavigationView = "documents",
  markdownLanguage = "en",
  titleCache = new NavigationTitleCache(),
): Promise<string> {
  const language = canonicalizeLanguageTag(markdownLanguage);
  return withDocumentArchiveSnapshot(contentRoot, (snapshot) =>
    createNavigationHtmlFromSnapshot(snapshot, now, view, language, titleCache),
  );
}

async function createNavigationHtmlFromSnapshot(
  snapshot: DocumentArchiveSnapshot,
  now: Date,
  view: NavigationView,
  markdownLanguage: string,
  titleCache: NavigationTitleCache,
): Promise<string> {
  const { active: activeDocuments, archived: archivedDocuments } = snapshot;
  const activePaths = new Set(activeDocuments.map((document) => document.path));
  const conflict = archivedDocuments.find((document) =>
    activePaths.has(document.path),
  );
  if (conflict !== undefined) {
    throw new Error(`Document archive conflict: ${conflict.path}`);
  }
  const documents = await findNavigationDocuments(
    view === "archive" ? archivedDocuments : activeDocuments,
    markdownLanguage,
    titleCache,
  );
  const groups = new Map<string, NavigationDocument[]>();

  for (const document of documents) {
    const directory = dirname(document.path);
    const group = directory === "." ? "" : directory;
    const groupDocuments = groups.get(group) ?? [];
    groupDocuments.push(document);
    groups.set(group, groupDocuments);
  }

  const navigationLabel = view === "archive" ? "Archived" : "Documents";
  const lines = [`<nav aria-label="${navigationLabel}">`];
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
      const formatBadge =
        document.format === "markdown"
          ? '<span class="viewer-navigation-format" aria-label="Markdown">MD</span>'
          : "";
      lines.push(
        `  <a href="./${encodePath(document.path)}" title="${title}"><span class="viewer-navigation-title">${title}</span>${formatBadge}<time datetime="${updatedAt}">${updatedLabel}</time></a>`,
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
  const stem = removeDocumentExtension(basename(path)).toLowerCase();
  if (stem === "index") {
    return 0;
  }
  if (stem === "overview") {
    return 1;
  }
  if (stem === "readme") {
    return 2;
  }
  return 3;
}

async function findNavigationDocuments(
  contentDocuments: readonly ContentDocument[],
  markdownLanguage: string,
  titleCache: NavigationTitleCache,
): Promise<NavigationDocument[]> {
  return Promise.all(
    contentDocuments.map((document) =>
      titleCache.read(document, markdownLanguage)
    ),
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
  const visibleHtml = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ");
  const heading = /<h1(?:\s[^>]*)?>([\s\S]*?)<\/h1\s*>/i.exec(visibleHtml)?.[1];
  if (heading !== undefined) {
    const title = decodeHtmlCharacterReferences(
      heading.replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]*>/g, " "),
    )
      .replace(/\s+/g, " ")
      .trim();
    if (title.length > 0) {
      return title;
    }
  }

  return fallbackDocumentTitle(filename);
}

function fallbackDocumentTitle(filename: string): string {
  const stem = removeDocumentExtension(basename(filename));
  return stem.replace(/[-_]+/g, " ").trim() || "Document";
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
