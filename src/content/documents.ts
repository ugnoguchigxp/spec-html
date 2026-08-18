import { readdir } from "node:fs/promises";
import { extname, join } from "node:path";

export interface ContentDocument {
  absolutePath: string;
  /** Content-root relative, always using POSIX separators. */
  path: string;
}

const IGNORED_DIRECTORIES = new Set(["node_modules"]);

/**
 * Find the HTML documents that Spec HTML can serve.
 *
 * The viewer deliberately does not follow symlinks: a content root is the
 * complete trust boundary for both navigation and linting.
 */
export async function findContentDocuments(
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

    if (
      entry.isFile() &&
      extname(entry.name).toLowerCase() === ".html" &&
      entry.name.toLowerCase() !== "nav.html"
    ) {
      documents.push({ absolutePath, path });
    }
  }
}
