import type { NavigationView } from "../content/document-path.js";
import { DOCUMENT_STATE_PATH } from "./constants.js";
import type { ViewerElements } from "./types.js";

export interface DocumentStateResponse {
  doc: string;
  archived: boolean;
  restoreAllowed: boolean;
  migrationId: string | null;
  migrationOutputPath: string | null;
}

export function viewForArchived(archived: boolean): NavigationView {
  return archived ? "archive" : "documents";
}

export function fetchDocumentState(
  documentPath: string,
  signal: AbortSignal,
): Promise<DocumentStateResponse> {
  return requestDocumentState(documentPath, { signal });
}

export function updateDocumentArchived(
  documentPath: string,
  archived: boolean,
): Promise<DocumentStateResponse> {
  return requestDocumentState(documentPath, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ archived }),
  });
}

async function requestDocumentState(
  documentPath: string,
  init?: RequestInit,
): Promise<DocumentStateResponse> {
  const url = new URL(DOCUMENT_STATE_PATH, window.location.origin);
  url.searchParams.set("doc", documentPath);
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`Document state request failed: HTTP ${response.status}`);
  }
  const value: unknown = await response.json();
  if (
    typeof value !== "object" ||
    value === null ||
    !("doc" in value) ||
    value.doc !== documentPath ||
    !("archived" in value) ||
    typeof value.archived !== "boolean" ||
    !("restoreAllowed" in value) ||
    typeof value.restoreAllowed !== "boolean" ||
    !("migrationId" in value) ||
    (value.migrationId !== null && typeof value.migrationId !== "string") ||
    !("migrationOutputPath" in value) ||
    (value.migrationOutputPath !== null &&
      typeof value.migrationOutputPath !== "string")
  ) {
    throw new Error("Document state response is invalid");
  }
  return {
    doc: value.doc,
    archived: value.archived,
    restoreAllowed: value.restoreAllowed,
    migrationId: value.migrationId,
    migrationOutputPath: value.migrationOutputPath,
  };
}

export function updateDocumentArchiveButton(
  elements: ViewerElements,
  state: Pick<
    DocumentStateResponse,
    "archived" | "restoreAllowed" | "migrationId"
  >,
): void {
  elements.documentArchiveButton.textContent = state.archived
    ? "Restore"
    : "Archive";
  elements.documentArchiveButton.disabled =
    state.archived && !state.restoreAllowed;
  elements.documentArchiveButton.title =
    state.archived && !state.restoreAllowed && state.migrationId !== null
      ? `Use migrate --rollback ${state.migrationId}`
      : "";
}

export function messageForArchiveError(
  error: unknown,
  archived: boolean,
): string {
  console.error(
    `Spec HTML: Could not ${archived ? "archive" : "restore"} document`,
    error,
  );
  return archived
    ? "Document could not be archived."
    : "Document could not be restored.";
}
