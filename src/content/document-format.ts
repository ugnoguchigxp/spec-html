export type DocumentFormat = "html" | "markdown";

const HTML_EXTENSION = ".html";
const MARKDOWN_EXTENSIONS = [".md", ".markdown"] as const;

export function documentFormatFromPath(path: string): DocumentFormat | null {
  const lowerPath = path.toLowerCase();
  if (lowerPath.endsWith(HTML_EXTENSION)) {
    return "html";
  }
  if (MARKDOWN_EXTENSIONS.some((extension) => lowerPath.endsWith(extension))) {
    return "markdown";
  }
  return null;
}

export function isHtmlDocumentPath(path: string): boolean {
  return documentFormatFromPath(path) === "html";
}

export function isViewerDocumentPath(path: string): boolean {
  return documentFormatFromPath(path) !== null;
}

export function removeDocumentExtension(path: string): string {
  const lowerPath = path.toLowerCase();
  if (lowerPath.endsWith(".markdown")) {
    return path.slice(0, -".markdown".length);
  }
  if (lowerPath.endsWith(".html") || lowerPath.endsWith(".md")) {
    return path.slice(0, path.lastIndexOf("."));
  }
  return path;
}
