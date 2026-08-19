import { CONTENT_PREFIX, NAVIGATION_PATH } from "./constants.js";
import type { NavigationView } from "../content/document-path.js";
import { documentFormatFromPath } from "../content/document-format.js";
import { renderMarkdownDocument } from "./markdown.js";
import { fetchDocument } from "./document-loader.js";
import { buildSrcdoc } from "./frame.js";
import type { FrameIntegrations } from "./frame.js";
import { createLayout, renderLoadState } from "./layout.js";
import { mountNavigation, updateActiveNavigation } from "./navigation.js";
import {
  createContentUrl,
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
import type { NavigationItem, RouteState } from "./types.js";
import {
  fetchDocumentState,
  messageForArchiveError,
  updateDocumentArchived,
  updateDocumentArchiveButton,
  viewForArchived,
} from "./archive-controls.js";
import {
  installFrameLinkHandler,
  isCurrentRequest,
  messageForDocumentError,
  setFrameDocument,
  updateSourceLabels,
} from "./document-controls.js";
import {
  clearDocumentActionStatus,
  closeDocumentActionsMenu,
  closeSourceDialog,
} from "./document-actions.js";
import { type HistoryMode, updateHistory } from "./history.js";
import { installLiveReload } from "./live-reload.js";
import {
  installSidebarLinkHandler,
  renderEmptyNavigation,
  showInitialRoute,
  updateNavigationViewButton,
} from "./navigation-controls.js";
import { installPrintController } from "./print-controller.js";
import { installSidebarController } from "./sidebar-controller.js";
import { SortController } from "./sort-controller.js";
import { updateThemeButtons } from "./theme-controls.js";

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
  const initialRoute = parseRoute(new URL(window.location.href));
  let navigationView =
    initialRoute.kind === "invalid"
      ? initialRoute.view
      : initialRoute.route.view;
  applyThemePreference(document.documentElement, themePreference);
  const elements = createLayout(app);
  updateThemeButtons(elements, themePreference);
  const sortController = new SortController(elements);
  updateNavigationViewButton(elements, navigationView);
  const sidebarController = installSidebarController(elements);
  installPrintController(elements.frame);
  elements.root.dataset.navigationView = navigationView;
  const contentBaseUrl = new URL(CONTENT_PREFIX, window.location.origin);
  let navigationItems: NavigationItem[] = [];
  let activeAbortController: AbortController | undefined;
  let currentDocument: string | null = null;
  let currentDocumentSource: string | null = null;
  let currentDocumentArchived: boolean | null = null;
  let currentDocumentRestoreAllowed = true;
  let currentDocumentMigrationId: string | null = null;
  let currentRoute: RouteState = { doc: null, hash: "", view: navigationView };
  const clearDocument = (): void => {
    activeAbortController?.abort();
    activeAbortController = undefined;
    currentDocument = null;
    currentDocumentSource = null;
    currentDocumentArchived = null;
    currentDocumentRestoreAllowed = true;
    currentDocumentMigrationId = null;
    closeSourceDialog(elements);
    closeDocumentActionsMenu(elements);
    clearDocumentActionStatus(elements);
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
    sortController.apply();
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
      sidebarController.close();
      return;
    }

    activeAbortController?.abort();
    const abortController = new AbortController();
    activeAbortController = abortController;
    currentDocument = null;
    currentDocumentSource = null;
    currentDocumentArchived = null;
    closeSourceDialog(elements);
    closeDocumentActionsMenu(elements);
    clearDocumentActionStatus(elements);
    renderLoadState(elements, { kind: "loading", doc });
    sidebarController.close();

    try {
      const documentUrl = createContentUrl(doc, new URL(window.location.href));
      const source = await fetchDocument(documentUrl, abortController.signal);
      const documentState = await fetchDocumentState(
        doc,
        abortController.signal,
      );
      const archived = documentState.archived;
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
          ? await renderMarkdownDocument(source, markdownLanguage)
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
      currentDocumentRestoreAllowed = documentState.restoreAllowed;
      currentDocumentMigrationId = documentState.migrationId;
      elements.frame.title = title;
      updateSourceLabels(elements, format);
      applyDocumentTitle(title);
      updateActiveNavigation(navigationItems, route);
      const frameDocument = elements.frame.contentDocument;
      if (frameDocument === null) {
        throw new Error("iframe document is unavailable");
      }
      installFrameLinkHandler(frameDocument, navigate, () => navigationView);
      updateDocumentArchiveButton(elements, documentState);
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
    clearDocumentActionStatus(elements);
    if (
      currentDocumentArchived === true &&
      !currentDocumentRestoreAllowed &&
      currentDocumentMigrationId !== null
    ) {
      elements.documentActionStatus.textContent =
        `Managed by migration ${currentDocumentMigrationId}. ` +
        `Use spec-html migrate --rollback ${currentDocumentMigrationId}.`;
      elements.documentActionStatus.hidden = false;
    }
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
    clearDocumentActionStatus(elements);

    void (async () => {
      try {
        const updatedState = await updateDocumentArchived(
          documentPath,
          archived,
        );
        if (currentDocument !== documentPath) {
          return;
        }
        currentDocumentArchived = updatedState.archived;
        currentDocumentRestoreAllowed = updatedState.restoreAllowed;
        currentDocumentMigrationId = updatedState.migrationId;
        const view = viewForArchived(updatedState.archived);
        updateDocumentArchiveButton(elements, updatedState);
        await loadNavigation(view);
        currentRoute = { ...currentRoute, view };
        updateHistory(currentRoute, "replace");
        updateActiveNavigation(navigationItems, currentRoute);
        closeDocumentActionsMenu(elements, true);
      } catch (error: unknown) {
        closeDocumentActionsMenu(elements);
        elements.documentActionStatus.textContent = messageForArchiveError(
          error,
          archived,
        );
        elements.documentActionStatus.hidden = false;
      } finally {
        elements.documentArchiveButton.disabled =
          currentDocumentArchived === true && !currentDocumentRestoreAllowed;
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
  elements.sourceDialogCloseButton.addEventListener("click", () =>
    closeSourceDialog(elements),
  );

  document.addEventListener("pointerdown", (event) => {
    const target = event.target;
    if (target instanceof Node && !elements.documentActions.contains(target)) {
      closeDocumentActionsMenu(elements);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.documentActionsMenu.hidden) {
      closeDocumentActionsMenu(elements, true);
      return;
    }
    if (event.key === "Escape" && sidebarController.isOpen()) {
      sidebarController.close(true);
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
