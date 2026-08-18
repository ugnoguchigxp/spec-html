import {
  CONTENT_PREFIX,
  LIVE_RELOAD_PATH,
  NAVIGATION_PATH,
} from "./constants.js";
import { fetchDocument, DocumentHttpError } from "./document-loader.js";
import { buildSrcdoc } from "./frame.js";
import type { FrameIntegrations } from "./frame.js";
import { createLayout, renderLoadState } from "./layout.js";
import { isPlainPrimaryClick } from "./links.js";
import { mountNavigation, updateActiveNavigation } from "./navigation.js";
import {
  createContentUrl,
  createShellUrl,
  documentPathFromContentUrl,
  normalizeDocumentPath,
  parseRoute,
} from "./router.js";
import {
  applyDocumentTitle,
  getFrameTitle,
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
  ViewerElements,
} from "./types.js";

type HistoryMode = "push" | "replace" | "none";

void initializeViewer().catch((error: unknown) => {
  console.error("Spec HTMLの初期化に失敗しました", error);
});

async function initializeViewer(): Promise<void> {
  const app = document.querySelector<HTMLElement>("#app");
  if (app === null) {
    throw new Error("Viewerのmount要素が見つかりません");
  }

  installLiveReload();

  const integrations: FrameIntegrations = {
    chartJs: app.dataset.chartJs === "true",
    mermaid: app.dataset.mermaid === "true",
  };

  let themePreference = readThemePreference();
  applyThemePreference(document.documentElement, themePreference);
  const elements = createLayout(app);
  updateThemeButtons(elements, themePreference);
  const contentBaseUrl = new URL(CONTENT_PREFIX, window.location.origin);
  const navigationUrl = new URL(NAVIGATION_PATH, window.location.origin);
  let navigationItems: NavigationItem[] = [];
  let activeAbortController: AbortController | undefined;
  let currentDocument: string | null = null;
  let currentRoute: RouteState = { doc: null, hash: "" };
  let detailsOpenedForPrint: HTMLDetailsElement[] = [];
  const mobileViewport = window.matchMedia("(max-width: 767px)");
  const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");

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

  const clearDocument = (): void => {
    activeAbortController?.abort();
    activeAbortController = undefined;
    currentDocument = null;
    elements.frame.title = "設計書";
    resetDocumentTitle();
    updateActiveNavigation(navigationItems, { doc: null, hash: "" });
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
        message: "文書パスが不正です",
      });
      return;
    }

    const route: RouteState = { doc, hash: requestedRoute.hash };
    if (historyMode !== "none") {
      const shellUrl = createShellUrl(route, new URL(window.location.href));
      if (historyMode === "push") {
        history.pushState(null, "", shellUrl.href);
      } else {
        history.replaceState(null, "", shellUrl.href);
      }
    }
    currentRoute = route;

    if (doc === currentDocument) {
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
    renderLoadState(elements, { kind: "loading", doc });
    setSidebarOpen(false);

    try {
      const documentUrl = createContentUrl(doc, new URL(window.location.href));
      const fragment = await fetchDocument(documentUrl, abortController.signal);
      if (!isCurrentRequest(activeAbortController, abortController)) {
        return;
      }

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

      const frameDocument = elements.frame.contentDocument;
      if (frameDocument === null) {
        throw new Error("iframe documentを取得できません");
      }

      const title = getFrameTitle(frameDocument, doc);
      activeAbortController = undefined;
      currentDocument = doc;
      elements.frame.title = title;
      applyDocumentTitle(title);
      updateActiveNavigation(navigationItems, route);
      installFrameLinkHandler(frameDocument, navigate);
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
      console.error("Spec HTML: 設計書を表示できません", error);
    }
  };

  colorScheme.addEventListener("change", () => {
    if (themePreference !== "system" || currentDocument === null) {
      return;
    }
    currentDocument = null;
    void navigate(currentRoute, "none");
  });

  for (const preference of THEME_PREFERENCES) {
    elements.themeButtons[preference].addEventListener("click", () => {
      if (themePreference === preference) {
        return;
      }
      themePreference = preference;
      applyThemePreference(document.documentElement, themePreference);
      saveThemePreference(themePreference);
      updateThemeButtons(elements, themePreference);
      if (currentDocument !== null) {
        currentDocument = null;
        void navigate(currentRoute, "none");
      }
    });
  }

  window.addEventListener("beforeprint", () => {
    const frameDocument = elements.frame.contentDocument;
    if (frameDocument === null) {
      return;
    }
    if (detailsOpenedForPrint.length === 0) {
      detailsOpenedForPrint = Array.from(
        frameDocument.querySelectorAll<HTMLDetailsElement>("details:not([open])"),
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
    if (
      event.key === "Escape" &&
      elements.root.dataset.sidebarOpen === "true"
    ) {
      setSidebarOpen(false);
      elements.menuButton.focus();
    }
  });
  installSidebarLinkHandler(elements, navigate);

  window.addEventListener("popstate", () => {
    const parsed = parseRoute(new URL(window.location.href));
    if (parsed.kind === "valid") {
      void navigate(parsed.route, "none");
    } else if (parsed.kind === "invalid") {
      currentRoute = { doc: parsed.rawDoc, hash: parsed.hash };
      clearDocument();
      renderLoadState(elements, {
        kind: "error",
        doc: parsed.rawDoc,
        message: "文書パスが不正です",
      });
    } else {
      void navigate(parsed.route, "none");
    }
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
    const navigationResponse = await fetch(navigationUrl);
    if (!navigationResponse.ok) {
      throw new Error(
        `Navigationの取得に失敗しました: HTTP ${navigationResponse.status}`,
      );
    }
    navigationItems = mountNavigation(
      elements.navigation,
      await navigationResponse.text(),
      contentBaseUrl,
    );
  } catch (error: unknown) {
    elements.navigation.textContent = "Navigationを読み込めません";
    renderLoadState(elements, {
      kind: "error",
      doc: null,
      message: "Navigationを読み込めません",
    });
    console.error("Spec HTML: Navigationを読み込めません", error);
    return;
  }

  await showInitialRoute(parseRoute(new URL(window.location.href)), navigationItems, navigate, elements);
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
      message: "文書パスが不正です",
    });
    return;
  }

  const firstItem = navigationItems[0];
  if (firstItem === undefined) {
    renderLoadState(elements, {
      kind: "error",
      doc: null,
      message: "表示可能な設計書がありません",
    });
    return;
  }

  await navigate({ doc: firstItem.doc, hash: firstItem.hash }, "replace");
}

function installSidebarLinkHandler(
  elements: ViewerElements,
  navigate: (route: RouteState, historyMode: HistoryMode) => Promise<void>,
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
    if (anchor.hasAttribute("target") || anchor.hasAttribute("download")) {
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
    const doc =
      url.origin === window.location.origin
        ? documentPathFromContentUrl(url)
        : null;
    if (doc === null) {
      return;
    }
    event.preventDefault();
    void navigate({ doc, hash: url.hash }, "push");
  });
}

function installFrameLinkHandler(
  frameDocument: Document,
  navigate: (route: RouteState, historyMode: HistoryMode) => Promise<void>,
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
    if (anchor.hasAttribute("target") || anchor.hasAttribute("download")) {
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
    const doc =
      url.origin === window.location.origin
        ? documentPathFromContentUrl(url)
        : null;
    if (doc === null) {
      return;
    }
    event.preventDefault();
    void navigate({ doc, hash: url.hash }, "push");
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
    return `設計書が見つかりません: ${doc}`;
  }
  if (error instanceof DocumentHttpError) {
    return `設計書を取得できません: HTTP ${error.status}。ページを再読み込みしてください`;
  }
  return "設計書を表示できません";
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
