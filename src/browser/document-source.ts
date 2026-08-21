import { DOCUMENT_SOURCE_PATH } from "./constants.js";
import type { DocumentFormat } from "../content/document-format.js";

export class DocumentSourceHttpError extends Error {
  constructor(readonly status: number) {
    super(`Document source request failed: HTTP ${status}`);
    this.name = "DocumentSourceHttpError";
  }
}

export interface DocumentSourceSnapshot {
  readonly doc: string;
  readonly format: DocumentFormat;
  readonly source: string;
  readonly revision: string;
  readonly absolutePath: string | null;
}

export interface DocumentSourceSaveResult {
  readonly doc: string;
  readonly format: DocumentFormat;
  readonly revision: string;
}

export async function fetchDocumentSource(
  documentPath: string,
  signal?: AbortSignal,
): Promise<DocumentSourceSnapshot> {
  const response = await fetch(
    documentSourceUrl(documentPath),
    signal === undefined ? undefined : { signal },
  );
  if (!response.ok) {
    throw new DocumentSourceHttpError(response.status);
  }
  const value: unknown = await response.json();
  if (!isSourceSnapshot(value, documentPath)) {
    throw new Error("Document source response is invalid");
  }
  return value;
}

export async function saveDocumentSource(
  documentPath: string,
  source: string,
  expectedRevision: string,
): Promise<DocumentSourceSaveResult> {
  const response = await fetch(documentSourceUrl(documentPath), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source, expectedRevision }),
  });
  if (!response.ok) {
    throw new DocumentSourceHttpError(response.status);
  }
  const value: unknown = await response.json();
  if (!isSourceSaveResult(value, documentPath)) {
    throw new Error("Document source save response is invalid");
  }
  return value;
}

function documentSourceUrl(documentPath: string): URL {
  const url = new URL(DOCUMENT_SOURCE_PATH, window.location.origin);
  url.searchParams.set("doc", documentPath);
  return url;
}

function isDocumentFormat(value: unknown): value is DocumentFormat {
  return value === "html" || value === "markdown";
}

function isRevision(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function isSourceSnapshot(
  value: unknown,
  documentPath: string,
): value is DocumentSourceSnapshot {
  return (
    typeof value === "object" &&
    value !== null &&
    "doc" in value &&
    value.doc === documentPath &&
    "format" in value &&
    isDocumentFormat(value.format) &&
    "source" in value &&
    typeof value.source === "string" &&
    "revision" in value &&
    isRevision(value.revision) &&
    "absolutePath" in value &&
    (value.absolutePath === null || typeof value.absolutePath === "string")
  );
}

function isSourceSaveResult(
  value: unknown,
  documentPath: string,
): value is DocumentSourceSaveResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "doc" in value &&
    value.doc === documentPath &&
    "format" in value &&
    isDocumentFormat(value.format) &&
    "revision" in value &&
    isRevision(value.revision)
  );
}
