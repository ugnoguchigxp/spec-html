import { readdir } from "node:fs/promises";
import { join } from "node:path";

import {
  documentFormatFromPath,
  type DocumentFormat,
} from "./document-format.js";

export interface ContentDocument {
  absolutePath: string;
  /** Content-root relative, always using POSIX separators. */
  path: string;
  format: DocumentFormat;
}

/** Reuse one immutable directory snapshot across a composite command. */
export class DocumentDiscoveryCache {
  private readonly entries = new Map<string, Promise<readonly ContentDocument[]>>();

  read(contentRoot: string): Promise<readonly ContentDocument[]> {
    let documents = this.entries.get(contentRoot);
    if (documents === undefined) {
      documents = discoverDocuments(contentRoot);
      this.entries.set(contentRoot, documents);
    }
    return documents;
  }
}

const IGNORED_DIRECTORIES = new Set(["node_modules"]);

/**
 * Find the HTML and Markdown documents that Spec HTML can serve.
 *
 * The viewer deliberately does not follow symlinks: a content root is the
 * complete trust boundary for document discovery.
 */
export async function findViewerDocuments(
  contentRoot: string,
  cache?: DocumentDiscoveryCache,
): Promise<ContentDocument[]> {
  return findDocuments(
    contentRoot,
    new Set<DocumentFormat>(["html", "markdown"]),
    cache,
  );
}

export async function findHtmlDocuments(
  contentRoot: string,
  cache?: DocumentDiscoveryCache,
): Promise<ContentDocument[]> {
  return findDocuments(
    contentRoot,
    new Set<DocumentFormat>(["html"]),
    cache,
  );
}

async function findDocuments(
  contentRoot: string,
  formats: ReadonlySet<DocumentFormat>,
  cache?: DocumentDiscoveryCache,
): Promise<ContentDocument[]> {
  const documents = cache === undefined
    ? await discoverDocuments(contentRoot)
    : await cache.read(contentRoot);
  return documents.filter((document) => formats.has(document.format));
}

async function discoverDocuments(
  contentRoot: string,
): Promise<ContentDocument[]> {
  const documents: ContentDocument[] = [];
  await visit(contentRoot, "", documents);
  return documents.sort((left, right) =>
    left.path.localeCompare(right.path, "en"),
  );
}

async function visit(
  directory: string,
  relativeDirectory: string,
  documents: ContentDocument[],
): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name, "en"));

  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    const path = relativeDirectory
      ? `${relativeDirectory}/${entry.name}`
      : entry.name;
    const absolutePath = join(directory, entry.name);

    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name)) {
        await visit(absolutePath, path, documents);
      }
      continue;
    }

    const format = entry.isFile() ? documentFormatFromPath(entry.name) : null;
    if (
      format !== null &&
      !(format === "html" && entry.name.toLowerCase() === "nav.html")
    ) {
      documents.push({ absolutePath, path, format });
    }
  }
}
