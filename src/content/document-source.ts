import { rename } from "node:fs/promises";
import type { ContentDocument } from "./documents.js";
import {
  ContentDocumentNotFoundError,
  DocumentArchiveConflictError,
  withDocumentArchiveSnapshot,
} from "./archive.js";
import {
  atomicReplace,
  createFileSnapshot,
  digestText,
  fileMatchesSnapshot,
  readUtf8File,
} from "./safe-write.js";
import { acquireContentMutationLock } from "./mutation-lock.js";
import { normalizeDocumentPath } from "./document-path.js";
import type { DocumentFormat } from "./document-format.js";

export class DocumentSourceConflictError extends Error {
  override name = "DocumentSourceConflictError";

  constructor(readonly documentPath: string) {
    super(`Document source changed before it could be saved: ${documentPath}`);
  }
}

export interface DocumentSourceSnapshot {
  readonly doc: string;
  readonly format: DocumentFormat;
  readonly source: string;
  readonly revision: string;
  readonly absolutePath: string;
}

export async function readDocumentSource(
  contentRoot: string,
  documentPath: string,
): Promise<DocumentSourceSnapshot> {
  assertDocumentPath(documentPath);
  return withDocumentArchiveSnapshot(contentRoot, async (snapshot) => {
    const document = findDocument(snapshot, documentPath);
    return snapshotForExistingDocument(document, documentPath);
  });
}

export async function writeDocumentSource(
  contentRoot: string,
  documentPath: string,
  source: string,
  expectedRevision: string,
): Promise<DocumentSourceSnapshot> {
  assertDocumentPath(documentPath);
  return withDocumentArchiveSnapshot(contentRoot, async (snapshot) => {
    const lock = await acquireContentMutationLock(contentRoot);
    try {
      const document = findDocument(snapshot, documentPath);
      const current = await snapshotForExistingDocument(document, documentPath);
      if (current.revision !== expectedRevision) {
        throw new DocumentSourceConflictError(documentPath);
      }

      const fileSnapshot = createFileSnapshot(
        document.absolutePath,
        current.source,
      );
      if (!(await sourceFileMatches(document, documentPath, fileSnapshot))) {
        throw new DocumentSourceConflictError(documentPath);
      }

      try {
        await atomicReplace(document.absolutePath, source, "source", {
          rename,
        });
      } catch (error: unknown) {
        if (isNotFoundError(error)) {
          throw new DocumentSourceConflictError(documentPath);
        }
        throw error;
      }
      return {
        doc: documentPath,
        format: document.format,
        source,
        revision: digestText(source),
        absolutePath: document.absolutePath,
      };
    } finally {
      await lock.release();
    }
  });
}

function findDocument(
  snapshot: {
    readonly active: readonly ContentDocument[];
    readonly archived: readonly ContentDocument[];
  },
  documentPath: string,
): ContentDocument {
  const active = snapshot.active.find(
    (document) => document.path === documentPath,
  );
  const archived = snapshot.archived.find(
    (document) => document.path === documentPath,
  );
  if (active !== undefined && archived !== undefined) {
    throw new DocumentArchiveConflictError(documentPath);
  }
  const document = active ?? archived;
  if (document === undefined) {
    throw new ContentDocumentNotFoundError(documentPath);
  }
  return document;
}

async function snapshotForDocument(
  document: ContentDocument,
): Promise<DocumentSourceSnapshot> {
  const source = await readUtf8File(document.absolutePath, document.path);
  return {
    doc: document.path,
    format: document.format,
    source,
    revision: digestText(source),
    absolutePath: document.absolutePath,
  };
}

async function snapshotForExistingDocument(
  document: ContentDocument,
  documentPath: string,
): Promise<DocumentSourceSnapshot> {
  try {
    return await snapshotForDocument(document);
  } catch (error: unknown) {
    if (isNotFoundError(error)) {
      throw new DocumentSourceConflictError(documentPath);
    }
    throw error;
  }
}

async function sourceFileMatches(
  document: ContentDocument,
  documentPath: string,
  snapshot: ReturnType<typeof createFileSnapshot>,
): Promise<boolean> {
  try {
    return await fileMatchesSnapshot(
      document.absolutePath,
      documentPath,
      snapshot,
    );
  } catch (error: unknown) {
    if (isNotFoundError(error)) {
      return false;
    }
    throw error;
  }
}

function assertDocumentPath(documentPath: string): void {
  if (normalizeDocumentPath(documentPath) !== documentPath) {
    throw new ContentDocumentNotFoundError(documentPath);
  }
}

function isNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error.code === "ENOENT" || error.code === "ENOTDIR")
  );
}
