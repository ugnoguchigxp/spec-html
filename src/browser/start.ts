import {
  CONTENT_PREFIX,
  DOCUMENT_STATE_PATH,
  LIVE_RELOAD_PATH,
  NAVIGATION_PATH,
} from "./constants.js";
import type { NavigationView } from "../content/document-path.js";
import { documentFormatFromPath } from "../content/document-format.js";
import { compileMarkdown } from "../markdown/compiler.js";
import { fetchDocument, DocumentHttpError } from "./document-loader.js";
import { buildSrcdoc } from "./frame.js";
import type { FrameIntegrations } from "./frame.js";
import { createLayout, renderLoadState } from "./layout.js";
import { isPlainPrimaryClick } from "./links.js";
import {
  mountNavigation,
  sortNavigation,
  updateActiveNavigation,
} from "./navigation.js";
import {
  createContentUrl,
  createShellUrl,
  documentPathFromContentUrl,
  normalizeDocumentPath,
  parseRoute,
} from "./router.js";
import {
  applyDocumentTitle,
  getFragmentTitle,
  resetDocumentTitle,
} from "./title.js";
import {
  applyThemePreference,
  readThemePreference,
  saveThemePreference,
  THEME_PREFERENCES,
} from "./theme.js";
import type { ThemePreference } from "./theme.js";
import type {
  NavigationItem,
  RouteParseResult,
  RouteState,
  SortDirection,
  SortPreference,
  ViewerElements,
} from "./types.js";

type HistoryMode = "push" | "replace" | "none";

interface DocumentStateResponse {
  doc: string;
  archived: boolean;
}

void initializeViewer().catch((error: unknown) => {
  console.error("Spec HTML failed to initialize", error);
});

async function initializeViewer(): Promise<void> {
  const app = document.querySelector<HTMLElement>("#app");
  if (app === null) {
    throw new Error("Viewer mount element was not found");
  }

  installLiveReload();

  const integrations: FrameIntegrations = {
    chartJs: app.dataset.chartJs === "true",
    mermaid: app.dataset.mermaid === "true",
  };
  const markdownLanguage = app.dataset.markdownLanguage ?? "en";

  let themePreference = readThemePreference();
  let sortPreference: SortPreference = "name";
  let sortDirection: SortDirection = "ascending";
  const initialRoute = parseRoute(new URL(window.location.href));
  let navigationView =
    initialRoute.kind === "invalid"
      ? initialRoute.view
      : initialRoute.route.view;
  applyThemePreference(document.documentElement, themePreference);
  const elements = createLayout(app);
  updateThemeButtons(elements, themePreference);
  updateSortButtons(elements, sortPreference, sortDirection);
  updateNavigationViewButton(elements, navigationView);
  elements.root.dataset.navigationView = navigationView;
  const contentBaseUrl = new URL(CONTENT_PREFIX, window.location.origin);
  let navigationItems: NavigationItem[] = [];
  let activeAbortController: AbortController | undefined;
  let currentDocument: string | null = null;
  let currentDocumentSource: string | null = null;
  let currentDocumentArchived: boolean | null = null;
  let currentRoute: RouteState = { doc: null, hash: "", view: navigationView };
  let detailsOpenedForPrint: HTMLDetailsElement[] = [];
  const mobileViewport = window.matchMedia("(max-width: 767px)");

  const syncSidebarInteractivity = (): void => {
    const isHidden =
      mobileViewport.matches && elements.root.dataset.sidebarOpen !== "true";
    elements.sidebar.inert = isHidden;
    if (isHidden) {
      elements.sidebar.setAttribute("aria-hidden", "true");
    } else {
      elements.sidebar.removeAttribute("aria-hidden");
    }
  };

  const setSidebarOpen = (isOpen: boolean): void => {
    elements.root.dataset.sidebarOpen = String(isOpen);
    elements.menuButton.setAttribute("aria-expanded", String(isOpen));
    syncSidebarInteractivity();
  };

  syncSidebarInteractivity();
  mobileViewport.addEventListener("change", syncSidebarInteractivity);

  const closeSourceDialog = (): void => {
    if (elements.sourceDialog.open) {
      elements.sourceDialog.close();
    }
  };

  const closeDocumentActionsMenu = (restoreFocus = false): void => {
    if (!elements.documentActionsMenu.hidden) {
      elements.documentActionsMenu.hidden = true;
      elements.documentActionsButton.setAttribute("aria-expanded", "false");
      if (restoreFocus) {
        elements.documentActionsButton.focus();
      }
    }
  };

  const clearDocumentActionStatus = (): void => {
    elements.documentActionStatus.replaceChildren();
    elements.documentActionStatus.hidden = true;
  };

  const clearDocument = (): void => {
    activeAbortController?.abort();
    activeAbortController = undefined;
    currentDocument = null;
    currentDocumentSource = null;
    currentDocumentArchived = null;
    closeSourceDialog();
    closeDocumentActionsMenu();
    clearDocumentActionStatus();
    elements.frame.title = "Document";
    updateSourceLabels(elements, "html");
    resetDocumentTitle();
    updateActiveNavigation(navigationItems, {
      doc: null,
      hash: "",
      view: navigationView,
    });
  };

  const loadNavigation = async (
    view: NavigationView,
  ): Promise<NavigationItem[]> => {
    const navigationUrl = new URL(NAVIGATION_PATH, window.location.origin);
    if (view === "archive") {
      navigationUrl.searchParams.set("view", "archive");
    }
    const navigationResponse = await fetch(navigationUrl);
    if (!navigationResponse.ok) {
      throw new Error(
        `Failed to load navigation: HTTP ${navigationResponse.status}`,
      );
    }
    const items = mountNavigation(
      elements.navigation,
      await navigationResponse.text(),
      contentBaseUrl,
    );
    navigationItems = items;
    navigationView = view;
    elements.root.dataset.navigationView = view;
    updateNavigationViewButton(elements, view);
    sortNavigation(elements.navigation, sortPreference, sortDirection);
    updateActiveNavigation(navigationItems, currentRoute);
    return items;
  };

  const scrollToHash = (hash: string): void => {
    if (hash.length === 0) {
      return;
    }

    const frameDocument = elements.frame.contentDocument;
    if (frameDocument === null) {
      return;
    }

    let targetId = hash.slice(1);
    try {
      targetId = decodeURIComponent(targetId);
    } catch {
      // Keep the raw hash when it is not valid percent encoding.
    }

    const target =
      frameDocument.getElementById(targetId) ??
      frameDocument.getElementsByName(targetId).item(0);
    target?.scrollIntoView();
  };

  const navigate = async (
    requestedRoute: RouteState,
    historyMode: HistoryMode,
  ): Promise<void> => {
    if (requestedRoute.doc === null) {
      currentRoute = requestedRoute;
      updateHistory(requestedRoute, historyMode);
      clearDocument();
      renderLoadState(elements, { kind: "idle" });
      return;
    }

    const doc = normalizeDocumentPath(requestedRoute.doc);
    if (doc === null) {
      currentRoute = requestedRoute;
      clearDocument();
      renderLoadState(elements, {
        kind: "error",
        doc: requestedRoute.doc,
        message: "Invalid document path",
      });
      return;
    }

    if (doc === currentDocument && currentDocumentArchived !== null) {
      const resolvedView = viewForArchived(currentDocumentArchived);
      if (navigationView !== resolvedView) {
        await loadNavigation(resolvedView);
      }
      const route: RouteState = {
        doc,
        hash: requestedRoute.hash,
        view: resolvedView,
      };
      updateHistory(
        route,
        historyMode === "none" && requestedRoute.view !== resolvedView
          ? "replace"
          : historyMode,
      );
      currentRoute = route;
      activeAbortController?.abort();
      activeAbortController = undefined;
      updateActiveNavigation(navigationItems, route);
      scrollToHash(route.hash);
      setSidebarOpen(false);
      return;
    }

    activeAbortController?.abort();
    const abortController = new AbortController();
    activeAbortController = abortController;
    currentDocument = null;
    currentDocumentSource = null;
    currentDocumentArchived = null;
    closeSourceDialog();
    closeDocumentActionsMenu();
    clearDocumentActionStatus();
    renderLoadState(elements, { kind: "loading", doc });
    setSidebarOpen(false);

    try {
      const documentUrl = createContentUrl(doc, new URL(window.location.href));
      const source = await fetchDocument(documentUrl, abortController.signal);
      const archived = await fetchDocumentArchived(doc, abortController.signal);
      if (!isCurrentRequest(activeAbortController, abortController)) {
        return;
      }

      const resolvedView = viewForArchived(archived);
      if (navigationView !== resolvedView) {
        await loadNavigation(resolvedView);
      }
      if (!isCurrentRequest(activeAbortController, abortController)) {
        return;
      }
      const route: RouteState = {
        doc,
        hash: requestedRoute.hash,
        view: resolvedView,
      };
      updateHistory(
        route,
        historyMode === "none" && requestedRoute.view !== resolvedView
          ? "replace"
          : historyMode,
      );
      currentRoute = route;

      const format = documentFormatFromPath(doc);
      if (format === null) {
        throw new Error(`Unsupported document format: ${doc}`);
      }
      const fragment =
        format === "markdown"
          ? compileMarkdown(source, { language: markdownLanguage }).fragment
          : source;
      const title = getFragmentTitle(fragment, doc);
      const srcdoc = buildSrcdoc(
        fragment,
        documentUrl,
        integrations,
        themePreference,
      );
      elements.frame.hidden = false;
      await setFrameDocument(elements.frame, srcdoc);
      if (!isCurrentRequest(activeAbortController, abortController)) {
        return;
      }

      activeAbortController = undefined;
      currentDocument = doc;
      currentDocumentSource = source;
      currentDocumentArchived = archived;
      elements.frame.title = title;
      updateSourceLabels(elements, format);
      applyDocumentTitle(title);
      updateActiveNavigation(navigationItems, route);
      const frameDocument = elements.frame.contentDocument;
      if (frameDocument === null) {
        throw new Error("iframe document is unavailable");
      }
      installFrameLinkHandler(frameDocument, navigate, () => navigationView);
      updateDocumentArchiveButton(elements, archived);
      renderLoadState(elements, { kind: "ready", doc, title });
      scrollToHash(route.hash);
    } catch (error: unknown) {
      if (abortController.signal.aborted) {
        return;
      }

      clearDocument();
      renderLoadState(elements, {
        kind: "error",
        doc,
        message: messageForDocumentError(error, doc),
      });
      console.error("Spec HTML: Could not display document", error);
    }
  };

  for (const preference of THEME_PREFERENCES) {
    elements.themeButtons[preference].addEventListener("click", () => {
      if (themePreference === preference) {
        return;
      }
      themePreference = preference;
      applyThemePreference(document.documentElement, themePreference);
      saveThemePreference(themePreference);
      updateThemeButtons(elements, themePreference);
      if (currentDocument !== null || activeAbortController !== undefined) {
        currentDocument = null;
        void navigate(currentRoute, "none");
      }
    });
  }

  elements.documentActionsButton.addEventListener("click", () => {
    clearDocumentActionStatus();
    const willOpen = elements.documentActionsMenu.hidden;
    elements.documentActionsMenu.hidden = !willOpen;
    elements.documentActionsButton.setAttribute(
      "aria-expanded",
      String(willOpen),
    );
    if (willOpen) {
      elements.documentArchiveButton.focus();
    }
  });

  elements.documentArchiveButton.addEventListener("click", () => {
    if (currentDocument === null || currentDocumentArchived === null) {
      return;
    }
    const documentPath = currentDocument;
    const archived = !currentDocumentArchived;
    elements.documentArchiveButton.disabled = true;
    elements.documentArchiveButton.setAttribute("aria-busy", "true");
    clearDocumentActionStatus();

    void (async () => {
      try {
        const updatedArchived = await updateDocumentArchived(
          documentPath,
          archived,
        );
        if (currentDocument !== documentPath) {
          return;
        }
        currentDocumentArchived = updatedArchived;
        const view = viewForArchived(updatedArchived);
        updateDocumentArchiveButton(elements, updatedArchived);
        await loadNavigation(view);
        currentRoute = { ...currentRoute, view };
        updateHistory(currentRoute, "replace");
        updateActiveNavigation(navigationItems, currentRoute);
        closeDocumentActionsMenu(true);
      } catch (error: unknown) {
        closeDocumentActionsMenu();
        elements.documentActionStatus.textContent = messageForArchiveError(
          error,
          archived,
        );
        elements.documentActionStatus.hidden = false;
      } finally {
        elements.documentArchiveButton.disabled = false;
        elements.documentArchiveButton.removeAttribute("aria-busy");
      }
    })();
  });

  elements.navigationViewButton.addEventListener("click", () => {
    const requestedView: NavigationView =
      navigationView === "documents" ? "archive" : "documents";
    elements.navigationViewButton.disabled = true;
    void (async () => {
      try {
        const items = await loadNavigation(requestedView);
        const firstItem = items[0];
        if (firstItem === undefined) {
          await navigate({ doc: null, hash: "", view: requestedView }, "push");
          renderEmptyNavigation(elements, requestedView);
          return;
        }
        await navigate(
          {
            doc: firstItem.doc,
            hash: firstItem.hash,
            view: requestedView,
          },
          "push",
        );
      } catch (error: unknown) {
        elements.navigation.textContent = "Navigation could not be loaded";
        renderLoadState(elements, {
          kind: "error",
          doc: null,
          message: "Navigation could not be loaded",
        });
        console.error("Spec HTML: Navigation could not be loaded", error);
      } finally {
        elements.navigationViewButton.disabled = false;
      }
    })();
  });

  elements.documentModeButton.addEventListener("click", () => {
    if (
      currentDocumentSource === null ||
      elements.root.dataset.state !== "ready"
    ) {
      return;
    }
    elements.sourceDialogCode.textContent = currentDocumentSource;
    elements.sourceDialog.showModal();
  });
  elements.sourceDialogCloseButton.addEventListener("click", closeSourceDialog);

  document.addEventListener("pointerdown", (event) => {
    const target = event.target;
    if (target instanceof Node && !elements.documentActions.contains(target)) {
      closeDocumentActionsMenu();
    }
  });

  for (const preference of ["name", "date"] as const) {
    elements.sortButtons[preference].addEventListener("click", () => {
      if (sortPreference === preference) {
        sortDirection =
          sortDirection === "ascending" ? "descending" : "ascending";
      } else {
        sortPreference = preference;
        sortDirection = preference === "date" ? "descending" : "ascending";
      }
      sortNavigation(elements.navigation, sortPreference, sortDirection);
      updateSortButtons(elements, sortPreference, sortDirection);
    });
  }

  window.addEventListener("beforeprint", () => {
    const frameDocument = elements.frame.contentDocument;
    if (frameDocument === null) {
      return;
    }
    if (detailsOpenedForPrint.length === 0) {
      detailsOpenedForPrint = Array.from(
        frameDocument.querySelectorAll<HTMLDetailsElement>(
          "details:not([open])",
        ),
      );
      for (const details of detailsOpenedForPrint) {
        details.open = true;
      }
    }
    const printHeight = Math.max(
      frameDocument.documentElement.scrollHeight,
      frameDocument.body.scrollHeight,
    );
    elements.frame.style.height = `${String(printHeight)}px`;
  });
  window.addEventListener("afterprint", () => {
    for (const details of detailsOpenedForPrint) {
      details.open = false;
    }
    detailsOpenedForPrint = [];
    elements.frame.style.removeProperty("height");
  });

  elements.menuButton.addEventListener("click", () => {
    setSidebarOpen(elements.root.dataset.sidebarOpen !== "true");
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.documentActionsMenu.hidden) {
      closeDocumentActionsMenu(true);
      return;
    }
    if (
      event.key === "Escape" &&
      elements.root.dataset.sidebarOpen === "true"
    ) {
      setSidebarOpen(false);
      elements.menuButton.focus();
    }
  });
  installSidebarLinkHandler(elements, navigate, () => navigationView);

  window.addEventListener("popstate", () => {
    void (async () => {
      const parsed = parseRoute(new URL(window.location.href));
      const requestedView =
        parsed.kind === "invalid" ? parsed.view : parsed.route.view;
      if (requestedView !== navigationView) {
        await loadNavigation(requestedView);
      }
      if (parsed.kind === "valid") {
        await navigate(parsed.route, "none");
      } else if (parsed.kind === "invalid") {
        currentRoute = {
          doc: parsed.rawDoc,
          hash: parsed.hash,
          view: parsed.view,
        };
        clearDocument();
        renderLoadState(elements, {
          kind: "error",
          doc: parsed.rawDoc,
          message: "Invalid document path",
        });
      } else {
        const firstItem = navigationItems[0];
        if (firstItem === undefined) {
          await navigate(parsed.route, "none");
          renderEmptyNavigation(elements, requestedView);
        } else {
          await navigate(
            {
              doc: firstItem.doc,
              hash: firstItem.hash,
              view: requestedView,
            },
            "none",
          );
        }
      }
    })().catch((error: unknown) => {
      console.error(
        "Spec HTML: Could not restore view from browser history",
        error,
      );
    });
  });

  window.addEventListener("hashchange", () => {
    const parsed = parseRoute(new URL(window.location.href));
    if (parsed.kind === "valid" && parsed.route.doc === currentDocument) {
      currentRoute = parsed.route;
      updateActiveNavigation(navigationItems, currentRoute);
      scrollToHash(currentRoute.hash);
    }
  });

  try {
    renderLoadState(elements, { kind: "loading", doc: "Navigation" });
    await loadNavigation(navigationView);
  } catch (error: unknown) {
    elements.navigation.textContent = "Navigation could not be loaded";
    renderLoadState(elements, {
      kind: "error",
      doc: null,
      message: "Navigation could not be loaded",
    });
    console.error("Spec HTML: Navigation could not be loaded", error);
    return;
  }

  await showInitialRoute(initialRoute, navigationItems, navigate, elements);
}

function installLiveReload(): void {
  const events = new EventSource(LIVE_RELOAD_PATH);
  events.addEventListener("message", (event) => {
    if (event.data !== "reload") {
      return;
    }
    events.close();
    window.location.reload();
  });
}

function updateHistory(route: RouteState, mode: HistoryMode): void {
  if (mode === "none") {
    return;
  }
  const shellUrl = createShellUrl(route, new URL(window.location.href));
  if (mode === "push") {
    history.pushState(null, "", shellUrl.href);
  } else {
    history.replaceState(null, "", shellUrl.href);
  }
}

function viewForArchived(archived: boolean): NavigationView {
  return archived ? "archive" : "documents";
}

async function fetchDocumentArchived(
  documentPath: string,
  signal: AbortSignal,
): Promise<boolean> {
  const state = await requestDocumentState(documentPath, { signal });
  return state.archived;
}

async function updateDocumentArchived(
  documentPath: string,
  archived: boolean,
): Promise<boolean> {
  const state = await requestDocumentState(documentPath, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ archived }),
  });
  return state.archived;
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
    typeof value.archived !== "boolean"
  ) {
    throw new Error("Document state response is invalid");
  }
  return { doc: value.doc, archived: value.archived };
}

function updateDocumentArchiveButton(
  elements: ViewerElements,
  archived: boolean,
): void {
  elements.documentArchiveButton.textContent = archived ? "Restore" : "Archive";
}

function updateSourceLabels(
  elements: ViewerElements,
  format: "html" | "markdown",
): void {
  const formatLabel = format === "markdown" ? "Markdown" : "HTML";
  const actionLabel = `View source ${formatLabel}`;
  elements.documentModeButton.setAttribute("aria-label", actionLabel);
  elements.documentModeButton.title = actionLabel;
  elements.sourceDialogTitle.textContent = `Source ${formatLabel}`;
}

function updateNavigationViewButton(
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

function renderEmptyNavigation(
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

function messageForArchiveError(error: unknown, archived: boolean): string {
  console.error(
    `Spec HTML: Could not ${archived ? "archive" : "restore"} document`,
    error,
  );
  return archived
    ? "Document could not be archived."
    : "Document could not be restored.";
}

async function showInitialRoute(
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

function installSidebarLinkHandler(
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
    const doc =
      url.origin === window.location.origin
        ? documentPathFromContentUrl(url)
        : null;
    if (doc === null) {
      return;
    }
    event.preventDefault();
    void navigate({ doc, hash: url.hash, view: currentView() }, "push");
  });
}

function installFrameLinkHandler(
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
    const doc =
      url.origin === window.location.origin
        ? documentPathFromContentUrl(url)
        : null;
    if (doc === null) {
      return;
    }
    event.preventDefault();
    void navigate({ doc, hash: url.hash, view: currentView() }, "push");
  });
}

function setFrameDocument(
  frame: HTMLIFrameElement,
  srcdoc: string,
): Promise<void> {
  return new Promise((resolve) => {
    frame.addEventListener("load", () => resolve(), { once: true });
    frame.srcdoc = srcdoc;
  });
}

function isCurrentRequest(
  active: AbortController | undefined,
  request: AbortController,
): boolean {
  return active === request && !request.signal.aborted;
}

function messageForDocumentError(error: unknown, doc: string): string {
  if (error instanceof DocumentHttpError && error.status === 404) {
    return `Document not found: ${doc}`;
  }
  if (error instanceof DocumentHttpError) {
    return `Could not load document: HTTP ${error.status}. Reload the page and try again.`;
  }
  return "Document could not be displayed";
}

function updateSortButtons(
  elements: ViewerElements,
  preference: SortPreference,
  direction: SortDirection,
): void {
  for (const value of ["name", "date"] as const) {
    const button = elements.sortButtons[value];
    const isActive = value === preference;
    const label = value === "name" ? "Name" : "Date";
    button.setAttribute("aria-pressed", String(isActive));
    button.textContent = isActive
      ? `${label} ${direction === "ascending" ? "↑" : "↓"}`
      : label;
    button.setAttribute(
      "aria-label",
      isActive ? `${label}, ${direction}` : `Sort by ${label.toLowerCase()}`,
    );
    if (isActive) {
      button.title = "Reverse sort order";
    } else {
      button.removeAttribute("title");
    }
  }
}

function updateThemeButtons(
  elements: ViewerElements,
  preference: ThemePreference,
): void {
  for (const value of THEME_PREFERENCES) {
    elements.themeButtons[value].setAttribute(
      "aria-pressed",
      String(value === preference),
    );
  }
}
