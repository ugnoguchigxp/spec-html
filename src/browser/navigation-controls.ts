import type { NavigationView } from "../content/document-path.js";
import type { HistoryMode } from "./history.js";
import { isPlainPrimaryClick } from "./links.js";
import { renderLoadState } from "./layout.js";
import { documentPathFromContentUrl } from "./router.js";
import type {
  NavigationItem,
  RouteParseResult,
  RouteState,
  ViewerElements,
} from "./types.js";

export function updateNavigationViewButton(
  elements: ViewerElements,
  view: NavigationView,
): void {
  const label = view === "documents" ? "Archived" : "Documents";
  elements.navigationViewButton.textContent = label;
  elements.navigationViewButton.setAttribute(
    "aria-label",
    view === "documents" ? "Show archived documents" : "Show documents",
  );
}

export function renderEmptyNavigation(
  elements: ViewerElements,
  view: NavigationView,
): void {
  renderLoadState(elements, {
    kind: "error",
    doc: null,
    message:
      view === "archive"
        ? "No archived documents."
        : "No documents are available.",
  });
}

export async function showInitialRoute(
  parsedRoute: RouteParseResult,
  navigationItems: readonly NavigationItem[],
  navigate: (route: RouteState, historyMode: HistoryMode) => Promise<void>,
  elements: ViewerElements,
): Promise<void> {
  if (parsedRoute.kind === "valid") {
    await navigate(parsedRoute.route, "none");
    return;
  }
  if (parsedRoute.kind === "invalid") {
    renderLoadState(elements, {
      kind: "error",
      doc: parsedRoute.rawDoc,
      message: "Invalid document path",
    });
    return;
  }

  const firstItem = navigationItems[0];
  if (firstItem === undefined) {
    renderEmptyNavigation(elements, parsedRoute.route.view);
    return;
  }

  await navigate(
    {
      doc: firstItem.doc,
      hash: firstItem.hash,
      view: parsedRoute.route.view,
    },
    "replace",
  );
}

export function installSidebarLinkHandler(
  elements: ViewerElements,
  navigate: (route: RouteState, historyMode: HistoryMode) => Promise<void>,
  currentView: () => NavigationView,
): void {
  elements.sidebar.addEventListener("click", (event) => {
    if (!(event instanceof MouseEvent) || !isPlainPrimaryClick(event)) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const anchor = target.closest<HTMLAnchorElement>("a");
    if (anchor === null) {
      return;
    }
    if (anchor.dataset.specHtmlBlocked === "javascript") {
      event.preventDefault();
      return;
    }
    let url: URL;
    try {
      url = new URL(anchor.href, window.location.href);
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
