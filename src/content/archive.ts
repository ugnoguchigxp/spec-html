import { lstat, mkdir, readdir, rename, rmdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { findViewerDocuments, type ContentDocument } from "./documents.js";
import { normalizeDocumentPath } from "./document-path.js";
import { documentFormatFromPath } from "./document-format.js";

export const ARCHIVED_DIRECTORY = ".archived";

export class ContentDocumentNotFoundError extends Error {
  override name = "ContentDocumentNotFoundError";
}

export class DocumentArchiveConflictError extends Error {
  override name = "DocumentArchiveConflictError";
}

const operationQueues = new Map<string, Promise<void>>();

export interface DocumentArchiveSnapshot {
  readonly active: readonly ContentDocument[];
  readonly archived: readonly ContentDocument[];
}

export async function findArchivedDocuments(
  contentRoot: string,
): Promise<ContentDocument[]> {
  return enqueueArchiveOperation(contentRoot, () =>
    findArchivedDocumentsUnlocked(contentRoot),
  );
}

export function withDocumentArchiveSnapshot<T>(
  contentRoot: string,
  read: (snapshot: DocumentArchiveSnapshot) => Promise<T>,
): Promise<T> {
  return enqueueArchiveOperation(contentRoot, async () =>
    read(await findDocumentArchiveSnapshotUnlocked(contentRoot)),
  );
}

async function findArchivedDocumentsUnlocked(
  contentRoot: string,
): Promise<ContentDocument[]> {
  const documents: ContentDocument[] = [];
  await visitArchivedDirectories(contentRoot, "", documents);
  return documents.sort((left, right) =>
    left.path.localeCompare(right.path, "en"),
  );
}

export async function getDocumentArchived(
  contentRoot: string,
  documentPath: string,
): Promise<boolean> {
  assertDocumentPath(documentPath);
  return enqueueArchiveOperation(contentRoot, () =>
    getDocumentArchivedUnlocked(contentRoot, documentPath),
  );
}

async function getDocumentArchivedUnlocked(
  contentRoot: string,
  documentPath: string,
): Promise<boolean> {
  const documents = await findDocumentArchiveSnapshotUnlocked(contentRoot);
  const active = documents.active.some(
    (document) => document.path === documentPath,
  );
  const archived = documents.archived.some(
    (document) => document.path === documentPath,
  );
  if (active && archived) {
    throw new DocumentArchiveConflictError(documentPath);
  }
  if (!active && !archived) {
    throw new ContentDocumentNotFoundError(documentPath);
  }
  return archived;
}

export async function setDocumentArchived(
  contentRoot: string,
  documentPath: string,
  archived: boolean,
): Promise<boolean> {
  assertDocumentPath(documentPath);
  return enqueueArchiveOperation(contentRoot, async () => {
    const currentArchived = await getDocumentArchivedUnlocked(
      contentRoot,
      documentPath,
    );
    if (currentArchived === archived) {
      return archived;
    }

    const activePath = join(contentRoot, ...documentPath.split("/"));
    const archiveDirectory = join(
      contentRoot,
      ...dirname(documentPath)
        .split("/")
        .filter((segment) => segment !== "."),
      ARCHIVED_DIRECTORY,
    );
    const archivedPath = join(archiveDirectory, basename(documentPath));
    const sourcePath = archived ? activePath : archivedPath;
    const targetPath = archived ? archivedPath : activePath;
    if (await pathExists(targetPath)) {
      throw new DocumentArchiveConflictError(documentPath);
    }

    if (archived) {
      await mkdir(archiveDirectory, { recursive: true });
    }
    await rename(sourcePath, targetPath);
    if (!archived) {
      await removeEmptyArchiveDirectory(archiveDirectory);
    }
    return archived;
  });
}

async function findDocumentArchiveSnapshotUnlocked(
  contentRoot: string,
): Promise<DocumentArchiveSnapshot> {
  const [active, archived] = await Promise.all([
    findViewerDocuments(contentRoot),
    findArchivedDocumentsUnlocked(contentRoot),
  ]);
  return { active, archived };
}

async function visitArchivedDirectories(
  directory: string,
  relativeDirectory: string,
  documents: ContentDocument[],
): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name, "en"));

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    if (entry.name === ARCHIVED_DIRECTORY) {
      await collectArchivedDocuments(
        join(directory, entry.name),
        relativeDirectory,
        documents,
      );
      continue;
    }
    if (entry.name.startsWith(".") || entry.name === "node_modules") {
      continue;
    }
    const childRelativeDirectory = relativeDirectory
      ? `${relativeDirectory}/${entry.name}`
      : entry.name;
    await visitArchivedDirectories(
      join(directory, entry.name),
      childRelativeDirectory,
      documents,
    );
  }
}

async function collectArchivedDocuments(
  archiveDirectory: string,
  relativeDirectory: string,
  documents: ContentDocument[],
): Promise<void> {
  const entries = await readdir(archiveDirectory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }
    const format = entry.isFile() ? documentFormatFromPath(entry.name) : null;
    if (
      format === null ||
      (format === "html" && entry.name.toLowerCase() === "nav.html")
    ) {
      continue;
    }
    documents.push({
      absolutePath: join(archiveDirectory, entry.name),
      path: relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name,
      format,
    });
  }
}

function assertDocumentPath(documentPath: string): void {
  if (normalizeDocumentPath(documentPath) !== documentPath) {
    throw new ContentDocumentNotFoundError(documentPath);
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error: unknown) {
    if (isNotFoundError(error)) {
      return false;
    }
    throw error;
  }
}

async function removeEmptyArchiveDirectory(directory: string): Promise<void> {
  try {
    await rmdir(directory);
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error.code === "ENOENT" || error.code === "ENOTEMPTY")
    ) {
      return;
    }
    throw error;
  }
}

function enqueueArchiveOperation<T>(
  contentRoot: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = operationQueues.get(contentRoot) ?? Promise.resolve();
  const result = previous.catch(() => undefined).then(operation);
  const tail = result.then(
    () => undefined,
    () => undefined,
  );
  operationQueues.set(contentRoot, tail);
  void tail.then(() => {
    if (operationQueues.get(contentRoot) === tail) {
      operationQueues.delete(contentRoot);
    }
  });
  return result;
}

function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error.code === "ENOENT" || error.code === "ENOTDIR")
  );
}
