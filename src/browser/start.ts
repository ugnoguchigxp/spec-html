import { CONTENT_PREFIX, NAVIGATION_PATH } from "./constants.js";
import type { NavigationView } from "../content/document-path.js";
import { documentFormatFromPath } from "../content/document-format.js";
import { renderMarkdownDocument } from "./markdown.js";
import { fetchDocument } from "./document-loader.js";
import {
  DocumentSourceHttpError,
  fetchDocumentSource,
  saveDocumentSource,
  type DocumentSourceSnapshot,
} from "./document-source.js";
import { copyText } from "./clipboard.js";
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
  installOutlineController,
  type OutlineController,
} from "./outline-controller.js";
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
import { installScrollTopController } from "./scroll-top-controller.js";

void initializeViewer().catch((error: unknown) => {
  console.error("Spec HTML failed to initialize", error);
});

async function initializeViewer(): Promise<void> {
  const app = document.querySelector<HTMLElement>("#app");
  if (app === null) {
    throw new Error("Viewer mount element was not found");
  }

  const liveReload = installLiveReload();

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
  const absolutePathCopyAvailable = isLoopbackHostname(
    window.location.hostname,
  );
  elements.documentCopyAbsolutePathButton.hidden = !absolutePathCopyAvailable;
  updateThemeButtons(elements, themePreference);
  const sortController = new SortController(elements);
  updateNavigationViewButton(elements, navigationView);
  const sidebarController = installSidebarController(elements);
  const scrollTopController = installScrollTopController(
    elements.documentScrollTopButton,
  );
  installPrintController(elements.frame);
  elements.root.dataset.navigationView = navigationView;
  const contentBaseUrl = new URL(CONTENT_PREFIX, window.location.origin);
  let navigationItems: NavigationItem[] = [];
  let activeAbortController: AbortController | undefined;
  let currentDocument: string | null = null;
  let currentDocumentSource: string | null = null;
  let currentDocumentAbsolutePath: string | null = null;
  let currentDocumentArchived: boolean | null = null;
  let currentDocumentRestoreAllowed = true;
  let currentDocumentMigrationId: string | null = null;
  let currentRoute: RouteState = { doc: null, hash: "", view: navigationView };
  let sourceDialogSnapshot: DocumentSourceSnapshot | undefined;
  let sourceDialogInitialSource: string | undefined;
  let sourceDialogRequiresReload = false;
  let sourceFetchAbortController: AbortController | undefined;
  let sourceDialogSaving = false;
  let documentActionStatusTimer: ReturnType<typeof setTimeout> | undefined;

  const resetSourceEditor = (): void => {
    sourceFetchAbortController?.abort();
    sourceFetchAbortController = undefined;
    sourceDialogSnapshot = undefined;
    sourceDialogInitialSource = undefined;
    sourceDialogRequiresReload = false;
    sourceDialogSaving = false;
    elements.sourceDialogTextarea.value = "";
    elements.sourceDialogStatus.replaceChildren();
    elements.sourceDialogSaveButton.disabled = true;
    elements.sourceDialogSaveButton.removeAttribute("aria-busy");
  };

  const sourceEditorIsDirty = (): boolean =>
    sourceDialogInitialSource !== undefined &&
    elements.sourceDialogTextarea.value !== sourceDialogInitialSource;

  const updateSourceSaveButton = (): void => {
    elements.sourceDialogSaveButton.disabled =
      sourceDialogSaving ||
      sourceDialogSnapshot === undefined ||
      sourceDialogRequiresReload ||
      !sourceEditorIsDirty();
  };

  const closeSourceEditor = (): boolean => {
    if (
      elements.sourceDialog.open &&
      sourceEditorIsDirty() &&
      !window.confirm("Discard unsaved source changes?")
    ) {
      return false;
    }
    closeSourceDialog(elements);
    return true;
  };

  const showDocumentActionStatus = (message: string): void => {
    if (documentActionStatusTimer !== undefined) {
      clearTimeout(documentActionStatusTimer);
    }
    elements.documentActionStatus.textContent = message;
    elements.documentActionStatus.dataset.tone = "neutral";
    elements.documentActionStatus.hidden = false;
    documentActionStatusTimer = setTimeout(() => {
      clearDocumentActionStatus(elements);
      documentActionStatusTimer = undefined;
    }, 2_500);
  };

  const clearDocument = (): void => {
    activeAbortController?.abort();
    activeAbortController = undefined;
    currentDocument = null;
    currentDocumentSource = null;
    currentDocumentAbsolutePath = null;
    currentDocumentArchived = null;
    currentDocumentRestoreAllowed = true;
    currentDocumentMigrationId = null;
    closeSourceDialog(elements);
    resetSourceEditor();
    closeDocumentActionsMenu(elements);
    clearDocumentActionStatus(elements);
    scrollTopController.clear();
    outlineController?.clear();
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
    currentDocumentAbsolutePath = null;
    currentDocumentArchived = null;
    closeSourceDialog(elements);
    resetSourceEditor();
    closeDocumentActionsMenu(elements);
    clearDocumentActionStatus(elements);
    scrollTopController.clear();
    outlineController?.clear();
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
      outlineController?.setDocument(frameDocument);
      scrollTopController.setFrame(elements.frame);
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

  const outlineController: OutlineController = installOutlineController(
    elements,
    (hash) => {
      if (currentDocument === null) {
        return;
      }
      void navigate(
        { doc: currentDocument, hash, view: navigationView },
        "push",
      );
    },
  );
  elements.documentShowOutlineButton.addEventListener("click", () =>
    closeDocumentActionsMenu(elements, true),
  );

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
      elements.documentCopyRelativePathButton.focus();
    }
  });

  const visibleDocumentMenuItems = (): HTMLButtonElement[] =>
    [
      elements.documentCopyRelativePathButton,
      elements.documentCopyAbsolutePathButton,
      elements.documentShowOutlineButton,
      elements.documentArchiveButton,
    ].filter((button) => !button.hidden && !button.disabled);

  elements.documentActionsButton.addEventListener("keydown", (event) => {
    if (
      (event.key !== "ArrowDown" && event.key !== "ArrowUp") ||
      !elements.documentActionsMenu.hidden
    ) {
      return;
    }
    event.preventDefault();
    elements.documentActionsButton.click();
    const items = visibleDocumentMenuItems();
    (event.key === "ArrowUp" ? items.at(-1) : items[0])?.focus();
  });
  elements.documentActionsMenu.addEventListener("keydown", (event) => {
    const items = visibleDocumentMenuItems();
    if (items.length === 0) {
      return;
    }
    const currentIndex = items.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    if (event.key === "Escape") {
      event.preventDefault();
      closeDocumentActionsMenu(elements, true);
      return;
    }
    if (event.key === "Tab") {
      closeDocumentActionsMenu(elements);
      return;
    }
    let nextIndex: number | undefined;
    if (event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1 + items.length) % items.length;
    } else if (event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + items.length) % items.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = items.length - 1;
    }
    if (nextIndex !== undefined) {
      event.preventDefault();
      items[nextIndex]?.focus();
    }
  });

  elements.documentCopyRelativePathButton.addEventListener("click", () => {
    if (currentDocument === null) {
      return;
    }
    const documentPath = currentDocument;
    void copyText(documentPath)
      .then(() => {
        closeDocumentActionsMenu(elements, true);
        showDocumentActionStatus("Copied relative path");
      })
      .catch((error: unknown) => {
        console.error("Spec HTML: Could not copy relative path", error);
        elements.documentActionStatus.textContent =
          "Could not copy relative path.";
        elements.documentActionStatus.dataset.tone = "error";
        elements.documentActionStatus.hidden = false;
      });
  });

  elements.documentCopyAbsolutePathButton.addEventListener("click", () => {
    if (currentDocument === null) {
      return;
    }
    const documentPath = currentDocument;
    void (async () => {
      try {
        let absolutePath = currentDocumentAbsolutePath;
        if (absolutePath === null) {
          const snapshot = await fetchDocumentSource(documentPath);
          if (
            currentDocument !== documentPath ||
            snapshot.absolutePath === null
          ) {
            throw new Error("Absolute path is unavailable");
          }
          currentDocumentAbsolutePath = snapshot.absolutePath;
          absolutePath = snapshot.absolutePath;
        }
        await copyText(absolutePath);
        closeDocumentActionsMenu(elements, true);
        showDocumentActionStatus("Copied absolute path");
      } catch (error: unknown) {
        console.error("Spec HTML: Could not copy absolute path", error);
        elements.documentActionStatus.textContent =
          "Could not copy absolute path.";
        elements.documentActionStatus.dataset.tone = "error";
        elements.documentActionStatus.hidden = false;
      }
    })();
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
        currentDocumentAbsolutePath = null;
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
        elements.documentActionStatus.dataset.tone = "error";
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
    const documentPath = currentDocument;
    if (documentPath === null) {
      return;
    }
    resetSourceEditor();
    const sourceAtOpen = currentDocumentSource;
    sourceDialogInitialSource = normalizeSourceEditorValue(sourceAtOpen);
    elements.sourceDialogTextarea.value = sourceAtOpen;
    elements.sourceDialogStatus.textContent = "Loading current source…";
    elements.sourceDialog.showModal();
    elements.sourceDialogTextarea.focus();
    const abortController = new AbortController();
    sourceFetchAbortController = abortController;
    void fetchDocumentSource(documentPath, abortController.signal)
      .then((snapshot) => {
        if (
          abortController.signal.aborted ||
          currentDocument !== documentPath ||
          !elements.sourceDialog.open
        ) {
          return;
        }
        sourceDialogSnapshot = snapshot;
        currentDocumentAbsolutePath = snapshot.absolutePath;
        currentDocumentSource = snapshot.source;
        const hasUnsavedInput = sourceEditorIsDirty();
        if (!hasUnsavedInput) {
          elements.sourceDialogTextarea.value = snapshot.source;
          sourceDialogInitialSource = normalizeSourceEditorValue(
            snapshot.source,
          );
        } else if (snapshot.source !== sourceAtOpen) {
          sourceDialogRequiresReload = true;
          elements.sourceDialogStatus.textContent =
            "File changed on disk. Close and reopen the editor before saving.";
          updateSourceSaveButton();
          return;
        }
        sourceDialogInitialSource = normalizeSourceEditorValue(snapshot.source);
        elements.sourceDialogStatus.replaceChildren();
        updateSourceSaveButton();
      })
      .catch((error: unknown) => {
        if (abortController.signal.aborted) {
          return;
        }
        console.error("Spec HTML: Could not load source for editing", error);
        elements.sourceDialogStatus.textContent =
          "Could not load the current source.";
        updateSourceSaveButton();
      });
  });
  elements.sourceDialogTextarea.addEventListener("input", () => {
    if (sourceDialogSnapshot !== undefined && !sourceDialogRequiresReload) {
      elements.sourceDialogStatus.replaceChildren();
    }
    updateSourceSaveButton();
  });
  elements.sourceDialogCloseButton.addEventListener("click", () => {
    closeSourceEditor();
  });
  elements.sourceDialog.addEventListener("cancel", (event) => {
    if (
      sourceEditorIsDirty() &&
      !window.confirm("Discard unsaved source changes?")
    ) {
      event.preventDefault();
    }
  });
  elements.sourceDialog.addEventListener("close", resetSourceEditor);
  elements.sourceDialogSaveButton.addEventListener("click", () => {
    if (
      sourceDialogSnapshot === undefined ||
      sourceDialogSaving ||
      sourceDialogRequiresReload ||
      !sourceEditorIsDirty()
    ) {
      return;
    }
    const snapshot = sourceDialogSnapshot;
    const source = restoreSourceLineEndings(
      elements.sourceDialogTextarea.value,
      snapshot.source,
    );
    sourceDialogSaving = true;
    elements.sourceDialogSaveButton.setAttribute("aria-busy", "true");
    elements.sourceDialogStatus.textContent = "Saving…";
    updateSourceSaveButton();
    const releaseReload = liveReload.deferReload();
    void saveDocumentSource(snapshot.doc, source, snapshot.revision)
      .then((result) => {
        if (currentDocument !== snapshot.doc) {
          return;
        }
        currentDocumentSource = source;
        sourceDialogSnapshot = {
          ...snapshot,
          source,
          revision: result.revision,
        };
        elements.sourceDialogStatus.textContent = "Saved. Refreshing preview…";
        showDocumentActionStatus("Source saved. Refreshing preview…");
        closeSourceDialog(elements);
      })
      .catch((error: unknown) => {
        console.error("Spec HTML: Could not save source", error);
        elements.sourceDialogStatus.textContent =
          messageForSourceSaveError(error);
      })
      .finally(() => {
        sourceDialogSaving = false;
        elements.sourceDialogSaveButton.removeAttribute("aria-busy");
        updateSourceSaveButton();
        releaseReload();
      });
  });

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
  window.addEventListener("beforeunload", (event) => {
    if (!sourceEditorIsDirty()) {
      return;
    }
    event.preventDefault();
    event.returnValue = "";
  });
  installSidebarLinkHandler(elements, navigate, () => navigationView);

  window.addEventListener("popstate", () => {
    if (
      sourceEditorIsDirty() &&
      !window.confirm("Discard unsaved source changes?")
    ) {
      updateHistory(currentRoute, "replace");
      return;
    }
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

function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === "127.0.0.1" ||
    hostname === "localhost" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

function messageForSourceSaveError(error: unknown): string {
  if (error instanceof DocumentSourceHttpError && error.status === 409) {
    return "File changed on disk. Reload the document before saving again.";
  }
  if (error instanceof DocumentSourceHttpError && error.status === 423) {
    return "Document is being changed by another operation. Try again shortly.";
  }
  if (error instanceof DocumentSourceHttpError && error.status === 413) {
    return "Source is too large to save from the viewer.";
  }
  return "Could not save source.";
}

function normalizeSourceEditorValue(source: string): string {
  return source.replace(/\r\n?/gu, "\n");
}

function restoreSourceLineEndings(source: string, original: string): string {
  const containsCrLf = original.includes("\r\n");
  const containsBareLf = original.replace(/\r\n/gu, "").includes("\n");
  return containsCrLf && !containsBareLf
    ? source.replace(/\n/gu, "\r\n")
    : source;
}
