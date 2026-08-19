import type { LoadState, SortPreference, ViewerElements } from "./types.js";
import { THEME_PREFERENCES } from "./theme.js";
import type { ThemePreference } from "./theme.js";

export function createLayout(container: HTMLElement): ViewerElements {
  const root = document.createElement("div");
  root.className = "viewer";
  root.dataset.sidebarOpen = "false";

  const menuButton = document.createElement("button");
  menuButton.className = "menu-button";
  menuButton.type = "button";
  menuButton.textContent = "☰";
  menuButton.setAttribute("aria-label", "Menu");
  menuButton.setAttribute("aria-controls", "viewer-sidebar");
  menuButton.setAttribute("aria-expanded", "false");

  const sortSwitcher = document.createElement("div");
  sortSwitcher.className = "sort-switcher";
  sortSwitcher.setAttribute("role", "group");
  sortSwitcher.setAttribute("aria-label", "Sort by");
  const sortLabels: Record<SortPreference, string> = {
    name: "Name",
    date: "Date",
  };
  const sortButtons = Object.fromEntries(
    (Object.keys(sortLabels) as SortPreference[]).map((preference) => {
      const button = document.createElement("button");
      button.className = "sort-button";
      button.type = "button";
      button.dataset.sortValue = preference;
      button.textContent = sortLabels[preference];
      button.setAttribute("aria-pressed", String(preference === "name"));
      return [preference, button];
    }),
  ) as Record<SortPreference, HTMLButtonElement>;
  sortSwitcher.append(sortButtons.name, sortButtons.date);

  const themeSwitcher = document.createElement("div");
  themeSwitcher.className = "theme-switcher";
  themeSwitcher.setAttribute("role", "group");
  themeSwitcher.setAttribute("aria-label", "Theme");
  const themeLabels: Record<ThemePreference, string> = {
    light: "Light",
    dark: "Dark",
  };
  const themeButtons = Object.fromEntries(
    THEME_PREFERENCES.map((preference) => {
      const button = document.createElement("button");
      button.className = "theme-button";
      button.type = "button";
      button.dataset.themeValue = preference;
      button.textContent = themeLabels[preference];
      button.setAttribute("aria-pressed", "false");
      return [preference, button];
    }),
  ) as Record<ThemePreference, HTMLButtonElement>;
  themeSwitcher.append(
    ...THEME_PREFERENCES.map((value) => themeButtons[value]),
  );

  const sidebar = document.createElement("aside");
  sidebar.className = "viewer-sidebar";
  sidebar.id = "viewer-sidebar";

  const sidebarControls = document.createElement("div");
  sidebarControls.className = "viewer-sidebar-controls";
  sidebarControls.append(sortSwitcher, themeSwitcher);

  const navigation = document.createElement("div");
  navigation.className = "viewer-navigation";

  const sidebarFooter = document.createElement("div");
  sidebarFooter.className = "viewer-sidebar-footer";

  const navigationViewButton = document.createElement("button");
  navigationViewButton.className = "navigation-view-button";
  navigationViewButton.type = "button";
  navigationViewButton.textContent = "Archived";
  sidebarFooter.append(navigationViewButton);
  sidebar.append(sidebarControls, navigation, sidebarFooter);

  const main = document.createElement("main");
  main.className = "viewer-main";

  const status = document.createElement("div");
  status.className = "viewer-status";
  status.hidden = true;

  const frame = document.createElement("iframe");
  frame.className = "viewer-document";
  frame.title = "Document";
  frame.hidden = true;

  const documentActions = document.createElement("div");
  documentActions.className = "document-actions";
  documentActions.hidden = true;

  const documentActionsButton = document.createElement("button");
  documentActionsButton.className = "document-actions-button";
  documentActionsButton.type = "button";
  documentActionsButton.textContent = "•••";
  documentActionsButton.setAttribute("aria-label", "Document actions");
  documentActionsButton.setAttribute("aria-controls", "document-actions-menu");
  documentActionsButton.setAttribute("aria-expanded", "false");
  documentActionsButton.setAttribute("aria-haspopup", "menu");

  const documentActionsMenu = document.createElement("div");
  documentActionsMenu.className = "document-actions-menu";
  documentActionsMenu.id = "document-actions-menu";
  documentActionsMenu.setAttribute("role", "menu");
  documentActionsMenu.hidden = true;

  const documentArchiveButton = document.createElement("button");
  documentArchiveButton.className = "document-archive-button";
  documentArchiveButton.type = "button";
  documentArchiveButton.textContent = "Archive";
  documentArchiveButton.setAttribute("role", "menuitem");
  documentActionsMenu.append(documentArchiveButton);

  const documentActionStatus = document.createElement("div");
  documentActionStatus.className = "document-action-status";
  documentActionStatus.hidden = true;
  documentActionStatus.setAttribute("role", "alert");

  documentActions.append(
    documentActionsButton,
    documentActionsMenu,
    documentActionStatus,
  );

  const documentModeButton = document.createElement("button");
  documentModeButton.className = "document-mode-button";
  documentModeButton.type = "button";
  documentModeButton.textContent = "</>";
  documentModeButton.setAttribute("aria-label", "View source HTML");
  documentModeButton.title = "View source HTML";
  documentModeButton.hidden = true;

  const sourceDialog = document.createElement("dialog");
  sourceDialog.className = "source-dialog";
  sourceDialog.setAttribute("aria-labelledby", "source-dialog-title");

  const sourceDialogHeader = document.createElement("div");
  sourceDialogHeader.className = "source-dialog-header";

  const sourceDialogTitle = document.createElement("h2");
  sourceDialogTitle.id = "source-dialog-title";
  sourceDialogTitle.textContent = "Source HTML";

  const sourceDialogCloseButton = document.createElement("button");
  sourceDialogCloseButton.className = "source-dialog-close";
  sourceDialogCloseButton.type = "button";
  sourceDialogCloseButton.setAttribute("aria-label", "Close");
  sourceDialogCloseButton.title = "Close";

  const sourceDialogCloseIcon = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "svg",
  );
  sourceDialogCloseIcon.classList.add("source-dialog-close-icon");
  sourceDialogCloseIcon.setAttribute("viewBox", "0 0 24 24");
  sourceDialogCloseIcon.setAttribute("aria-hidden", "true");
  sourceDialogCloseIcon.setAttribute("focusable", "false");

  const sourceDialogClosePath = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "path",
  );
  sourceDialogClosePath.setAttribute("d", "M5 5l14 14M19 5 5 19");
  sourceDialogClosePath.setAttribute("fill", "none");
  sourceDialogClosePath.setAttribute("stroke", "currentColor");
  sourceDialogClosePath.setAttribute("stroke-linecap", "round");
  sourceDialogClosePath.setAttribute("stroke-width", "2");
  sourceDialogCloseIcon.append(sourceDialogClosePath);
  sourceDialogCloseButton.append(sourceDialogCloseIcon);

  const sourceDialogCode = document.createElement("pre");
  sourceDialogCode.className = "source-dialog-code";

  sourceDialogHeader.append(sourceDialogTitle, sourceDialogCloseButton);
  sourceDialog.append(sourceDialogHeader, sourceDialogCode);

  main.append(status, frame, documentActions, documentModeButton);
  root.append(menuButton, sidebar, main, sourceDialog);
  container.replaceChildren(root);

  return {
    root,
    menuButton,
    documentActions,
    documentActionsButton,
    documentActionsMenu,
    documentArchiveButton,
    documentActionStatus,
    documentModeButton,
    sourceDialog,
    sourceDialogTitle,
    sourceDialogCode,
    sourceDialogCloseButton,
    sortButtons,
    themeButtons,
    sidebar,
    navigationViewButton,
    navigation,
    status,
    frame,
  };
}

export function renderLoadState(
  elements: ViewerElements,
  state: LoadState,
): void {
  elements.root.dataset.state = state.kind;
  elements.status.removeAttribute("role");

  switch (state.kind) {
    case "idle":
      elements.status.replaceChildren();
      elements.status.hidden = true;
      elements.frame.hidden = true;
      elements.documentActions.hidden = true;
      elements.documentModeButton.hidden = true;
      break;
    case "loading":
      elements.status.textContent = "Loading…";
      elements.status.setAttribute("role", "status");
      elements.status.hidden = false;
      elements.frame.hidden = true;
      elements.documentActions.hidden = true;
      elements.documentModeButton.hidden = true;
      break;
    case "ready":
      elements.status.replaceChildren();
      elements.status.hidden = true;
      elements.frame.hidden = false;
      elements.documentActions.hidden = false;
      elements.documentModeButton.hidden = false;
      break;
    case "error":
      elements.status.textContent = state.message;
      elements.status.setAttribute("role", "alert");
      elements.status.hidden = false;
      elements.frame.hidden = true;
      elements.documentActions.hidden = true;
      elements.documentModeButton.hidden = true;
      break;
  }
}
