import { isViewerDocumentPath } from "./document-format.js";

export type NavigationView = "documents" | "archive";

export function normalizeDocumentPath(value: string): string | null {
  if (value.length === 0 || value.startsWith("/") || value.startsWith("\\")) {
    return null;
  }
  if (value.includes("\0") || value.includes("\\")) {
    return null;
  }

  const segments = value.split("/");
  if (
    segments.some(
      (segment) => segment.length === 0 || segment === "." || segment === "..",
    )
  ) {
    return null;
  }

  return isViewerDocumentPath(segments.at(-1) ?? "")
    ? segments.join("/")
    : null;
}
