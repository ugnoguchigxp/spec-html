import { TITLE_SUFFIX } from "./constants.js";

export function getFrameTitle(frameDocument: Document, doc: string): string {
  const heading = frameDocument.querySelector("h1")?.textContent?.trim();
  if (heading !== undefined && heading.length > 0) {
    return heading;
  }

  const filename = doc.split("/").at(-1) ?? "Documentation";
  return filename.replace(/\.html$/i, "") || "Documentation";
}

export function applyDocumentTitle(title: string): void {
  document.title = `${title} — ${TITLE_SUFFIX}`;
}

export function resetDocumentTitle(): void {
  document.title = TITLE_SUFFIX;
}
