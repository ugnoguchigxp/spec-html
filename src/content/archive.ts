import { link, lstat, mkdir, readdir, realpath, rmdir, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { findViewerDocuments, type ContentDocument } from "./documents.js";
import { normalizeDocumentPath } from "./document-path.js";
import { documentFormatFromPath } from "./document-format.js";
import { acquireContentMutationLock } from "./mutation-lock.js";
import { isPathWithin } from "../shared/path-boundary.js";

export const ARCHIVED_DIRECTORY = ".archived";

export class ContentDocumentNotFoundError extends Error {
  override name = "ContentDocumentNotFoundError";
}

export class DocumentArchiveConflictError extends Error {
  override name = "DocumentArchiveConflictError";
}

export class DocumentArchiveUnsafeError extends Error {
  override name = "DocumentArchiveUnsafeError";
}

export interface DocumentArchiveDestination {
  readonly archiveDirectory: string;
  readonly archivedPath: string;
}

const operationQueues = new Map<string, Promise<void>>();

export interface DocumentArchiveSnapshot {
  readonly active: readonly ContentDocument[];
  readonly archived: readonly ContentDocument[];
}

export interface SetDocumentArchivedOptions {
  /** The migration runner already owns the cross-process mutation lock. */
  readonly migrationOperation?: boolean;
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
    getDocumentArchivedUnlocked(contentRoot, documentPath)
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
  options: SetDocumentArchivedOptions = {},
): Promise<boolean> {
  assertDocumentPath(documentPath);
  return enqueueArchiveOperation(contentRoot, async () => {
    const lock = options.migrationOperation === true
      ? null
      : await acquireContentMutationLock(contentRoot);
    try {
      const currentArchived = await getDocumentArchivedUnlocked(
        contentRoot,
        documentPath,
      );
      if (currentArchived === archived) {
        return archived;
      }
      const activePath = join(contentRoot, ...documentPath.split("/"));
      const { archiveDirectory, archivedPath } = archiveDestination(
        contentRoot,
        documentPath,
      );
      const sourcePath = archived ? activePath : archivedPath;
      const targetPath = archived ? archivedPath : activePath;

      if (archived) {
        await validateDocumentArchiveDestination(contentRoot, documentPath);
        await mkdir(archiveDirectory, { recursive: true });
        await validateDocumentArchiveDestination(contentRoot, documentPath);
      } else {
        await validateDocumentArchiveSource(contentRoot, documentPath);
      }
      await moveWithoutOverwrite(sourcePath, targetPath, documentPath);
      if (!archived) {
        await removeEmptyArchiveDirectory(archiveDirectory);
      }
      return archived;
    } finally {
      await lock?.release();
    }
  });
}

async function moveWithoutOverwrite(
  sourcePath: string,
  targetPath: string,
  documentPath: string,
): Promise<void> {
  try {
    await link(sourcePath, targetPath);
  } catch (error: unknown) {
    if (isNodeError(error, "EEXIST")) {
      throw new DocumentArchiveConflictError(documentPath);
    }
    throw error;
  }
  try {
    await unlink(sourcePath);
  } catch (error: unknown) {
    try {
      await unlink(targetPath);
    } catch {
      // Preserve the original failure; a duplicate hardlink is detectable as a conflict.
    }
    throw error;
  }
}

/**
 * Validates the complete archive destination before a Markdown source is moved.
 * A symlinked `.archived` directory or any pre-existing destination entry is a
 * hard conflict: following either would move content outside the content root or
 * make rollback ownership ambiguous.
 */
export async function validateDocumentArchiveDestination(
  contentRoot: string,
  documentPath: string,
): Promise<DocumentArchiveDestination> {
  assertDocumentPath(documentPath);
  const destination = archiveDestination(contentRoot, documentPath);
  await validateArchiveDirectory(contentRoot, documentPath, destination, true);
  if (await pathExists(destination.archivedPath)) {
    throw new DocumentArchiveConflictError(documentPath);
  }
  return destination;
}

async function validateDocumentArchiveSource(
  contentRoot: string,
  documentPath: string,
): Promise<DocumentArchiveDestination> {
  const destination = archiveDestination(contentRoot, documentPath);
  await validateArchiveDirectory(contentRoot, documentPath, destination, false);
  const sourceStats = await lstat(destination.archivedPath);
  if (!sourceStats.isFile() || sourceStats.isSymbolicLink()) {
    throw new DocumentArchiveUnsafeError(
      `Archived documentが通常fileではありません: ${documentPath}`,
    );
  }
  const activePath = join(contentRoot, ...documentPath.split("/"));
  if (await pathExists(activePath)) {
    throw new DocumentArchiveConflictError(documentPath);
  }
  return destination;
}

async function validateArchiveDirectory(
  contentRoot: string,
  documentPath: string,
  destination: DocumentArchiveDestination,
  allowMissing: boolean,
): Promise<void> {
  const canonicalRoot = await realpath(contentRoot);
  const canonicalParent = await realpath(dirname(destination.archiveDirectory));
  if (!isPathWithin(canonicalRoot, canonicalParent)) {
    throw new DocumentArchiveUnsafeError(
      `Archive parentがcontent root外を参照しています: ${documentPath}`,
    );
  }
  let archiveStats;
  try {
    archiveStats = await lstat(destination.archiveDirectory);
  } catch (error: unknown) {
    if (allowMissing && isNotFoundError(error)) {
      return;
    }
    throw error;
  }
  if (archiveStats.isSymbolicLink() || !archiveStats.isDirectory()) {
    throw new DocumentArchiveUnsafeError(
      `.archivedが通常directoryではありません: ${documentPath}`,
    );
  }
  const canonicalArchive = await realpath(destination.archiveDirectory);
  if (!isPathWithin(canonicalRoot, canonicalArchive)) {
    throw new DocumentArchiveUnsafeError(
      `.archivedがcontent root外を参照しています: ${documentPath}`,
    );
  }
  if (allowMissing) {
    const targetKey = canonicalArchiveName(basename(documentPath));
    const archiveEntries = await readdir(destination.archiveDirectory);
    if (archiveEntries.some((entry) => canonicalArchiveName(entry) === targetKey)) {
      throw new DocumentArchiveConflictError(documentPath);
    }
  }
}

function canonicalArchiveName(value: string): string {
  return value.normalize("NFC").toLocaleLowerCase("en-US");
}

function archiveDestination(
  contentRoot: string,
  documentPath: string,
): DocumentArchiveDestination {
  const archiveDirectory = join(
    contentRoot,
    ...dirname(documentPath)
      .split("/")
      .filter((segment) => segment !== "."),
    ARCHIVED_DIRECTORY,
  );
  return {
    archiveDirectory,
    archivedPath: join(archiveDirectory, basename(documentPath)),
  };
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

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
