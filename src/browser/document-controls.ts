import type { NavigationView } from "../content/document-path.js";
import { DocumentHttpError } from "./document-loader.js";
import { isPlainPrimaryClick } from "./links.js";
import { documentPathFromContentUrl } from "./router.js";
import type { HistoryMode } from "./history.js";
import type { RouteState, ViewerElements } from "./types.js";

export function updateSourceLabels(
  elements: ViewerElements,
  format: "html" | "markdown",
): void {
  const formatLabel = format === "markdown" ? "Markdown" : "HTML";
  const actionLabel = `View source ${formatLabel}`;
  elements.documentModeButton.setAttribute("aria-label", actionLabel);
  elements.documentModeButton.title = actionLabel;
  elements.sourceDialogTitle.textContent = `Source ${formatLabel}`;
}

export function installFrameLinkHandler(
  frameDocument: Document,
  navigate: (route: RouteState, historyMode: HistoryMode) => Promise<void>,
  currentView: () => NavigationView,
): void {
  frameDocument.addEventListener("click", (event) => {
    const frameWindow = frameDocument.defaultView;
    if (
      frameWindow === null ||
      !(event instanceof frameWindow.MouseEvent) ||
      !isPlainPrimaryClick(event)
    ) {
      return;
    }
    const target = event.target;
    if (!(target instanceof frameWindow.Element)) {
      return;
    }
    const anchor = target.closest<HTMLAnchorElement>("a[href]");
    if (anchor === null) {
      return;
    }

    let url: URL;
    try {
      url = new URL(anchor.href, frameDocument.baseURI);
    } catch {
      return;
    }
    if (url.protocol === "javascript:") {
      event.preventDefault();
      return;
    }
    if (anchor.hasAttribute("target") || anchor.hasAttribute("download")) {
      return;
    }
    const doc = url.origin === window.location.origin
      ? documentPathFromContentUrl(url)
      : null;
    if (doc === null) {
      return;
    }
    event.preventDefault();
    void navigate({ doc, hash: url.hash, view: currentView() }, "push");
  });
}

export function setFrameDocument(
  frame: HTMLIFrameElement,
  srcdoc: string,
): Promise<void> {
  return new Promise((resolve) => {
    frame.addEventListener("load", () => resolve(), { once: true });
    frame.srcdoc = srcdoc;
  });
}

export function isCurrentRequest(
  active: AbortController | undefined,
  request: AbortController,
): boolean {
  return active === request && !request.signal.aborted;
}

export function messageForDocumentError(error: unknown, doc: string): string {
  if (error instanceof DocumentHttpError && error.status === 404) {
    return `Document not found: ${doc}`;
  }
  if (error instanceof DocumentHttpError) {
    return `Could not load document: HTTP ${error.status}. Reload the page and try again.`;
  }
  return "Document could not be displayed";
}
