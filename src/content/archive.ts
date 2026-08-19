import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { findContentDocuments } from "./documents.js";
import { normalizeDocumentPath } from "./document-path.js";

export const ARCHIVE_STATE_DIRECTORY = ".spec-html";
const ARCHIVE_FILENAME = "archive.json";
const ARCHIVE_VERSION = 1;

interface ArchiveManifest {
  version: typeof ARCHIVE_VERSION;
  documents: string[];
}

export class ContentDocumentNotFoundError extends Error {
  override name = "ContentDocumentNotFoundError";
}

const updateQueues = new Map<string, Promise<void>>();

export async function readArchivedDocuments(
  contentRoot: string,
): Promise<Set<string>> {
  const path = archiveManifestPath(contentRoot);
  let source: string;
  try {
    source = await readFile(path, "utf8");
  } catch (error: unknown) {
    if (isNotFoundError(error)) {
      return new Set();
    }
    throw error;
  }

  return new Set(parseArchiveManifest(source).documents);
}

export async function getDocumentArchived(
  contentRoot: string,
  documentPath: string,
): Promise<boolean> {
  await assertContentDocumentExists(contentRoot, documentPath);
  return (await readArchivedDocuments(contentRoot)).has(documentPath);
}

export async function setDocumentArchived(
  contentRoot: string,
  documentPath: string,
  archived: boolean,
): Promise<void> {
  const previous = updateQueues.get(contentRoot) ?? Promise.resolve();
  const update = previous.catch(() => undefined).then(async () => {
    await assertContentDocumentExists(contentRoot, documentPath);
    const documents = await readArchivedDocuments(contentRoot);
    if (archived) {
      documents.add(documentPath);
    } else {
      documents.delete(documentPath);
    }
    await writeArchiveManifest(contentRoot, documents);
  });
  updateQueues.set(contentRoot, update);

  try {
    await update;
  } finally {
    if (updateQueues.get(contentRoot) === update) {
      updateQueues.delete(contentRoot);
    }
  }
}

async function assertContentDocumentExists(
  contentRoot: string,
  documentPath: string,
): Promise<void> {
  const normalized = normalizeDocumentPath(documentPath);
  if (normalized === null || normalized !== documentPath) {
    throw new ContentDocumentNotFoundError(documentPath);
  }
  const documents = await findContentDocuments(contentRoot);
  if (!documents.some((document) => document.path === documentPath)) {
    throw new ContentDocumentNotFoundError(documentPath);
  }
}

function parseArchiveManifest(source: string): ArchiveManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error("Archive manifestのJSONが不正です");
  }
  if (
    !isRecord(parsed) ||
    parsed.version !== ARCHIVE_VERSION ||
    !isDocumentPathArray(parsed.documents)
  ) {
    throw new Error("Archive manifestの形式が不正です");
  }
  return {
    version: ARCHIVE_VERSION,
    documents: [...new Set(parsed.documents)].sort((left, right) =>
      left.localeCompare(right, "en"),
    ),
  };
}

async function writeArchiveManifest(
  contentRoot: string,
  documents: ReadonlySet<string>,
): Promise<void> {
  const directory = join(contentRoot, ARCHIVE_STATE_DIRECTORY);
  const path = join(directory, ARCHIVE_FILENAME);
  const temporaryPath = join(
    directory,
    `${ARCHIVE_FILENAME}.${process.pid}.${randomUUID()}.tmp`,
  );
  const manifest: ArchiveManifest = {
    version: ARCHIVE_VERSION,
    documents: [...documents].sort((left, right) =>
      left.localeCompare(right, "en"),
    ),
  };

  await mkdir(directory, { recursive: true });
  try {
    await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await rename(temporaryPath, path);
  } catch (error: unknown) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

function archiveManifestPath(contentRoot: string): string {
  return join(contentRoot, ARCHIVE_STATE_DIRECTORY, ARCHIVE_FILENAME);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDocumentPathArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every(
      (document: unknown) =>
        typeof document === "string" &&
        normalizeDocumentPath(document) === document,
    )
  );
}

function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error.code === "ENOENT" || error.code === "ENOTDIR")
  );
}
