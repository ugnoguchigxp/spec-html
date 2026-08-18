import type {
  LoadState,
  SortPreference,
  ViewerElements,
} from "./types.js";
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
  menuButton.setAttribute("aria-label", "メニュー");
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
  themeSwitcher.append(...THEME_PREFERENCES.map((value) => themeButtons[value]));

  const sidebar = document.createElement("aside");
  sidebar.className = "viewer-sidebar";
  sidebar.id = "viewer-sidebar";

  const sidebarControls = document.createElement("div");
  sidebarControls.className = "viewer-sidebar-controls";
  sidebarControls.append(sortSwitcher, themeSwitcher);

  const navigation = document.createElement("div");
  navigation.className = "viewer-navigation";
  sidebar.append(sidebarControls, navigation);

  const main = document.createElement("main");
  main.className = "viewer-main";

  const status = document.createElement("div");
  status.className = "viewer-status";
  status.hidden = true;

  const frame = document.createElement("iframe");
  frame.className = "viewer-document";
  frame.title = "設計書";
  frame.hidden = true;

  const documentModeButton = document.createElement("button");
  documentModeButton.className = "document-mode-button";
  documentModeButton.type = "button";
  documentModeButton.textContent = "</>";
  documentModeButton.setAttribute("aria-label", "ソースHTMLを表示");
  documentModeButton.title = "ソースHTMLを表示";
  documentModeButton.hidden = true;

  const sourceDialog = document.createElement("dialog");
  sourceDialog.className = "source-dialog";
  sourceDialog.setAttribute("aria-labelledby", "source-dialog-title");

  const sourceDialogHeader = document.createElement("div");
  sourceDialogHeader.className = "source-dialog-header";

  const sourceDialogTitle = document.createElement("h2");
  sourceDialogTitle.id = "source-dialog-title";
  sourceDialogTitle.textContent = "ソースHTML";

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

  main.append(status, frame, documentModeButton);
  root.append(menuButton, sidebar, main, sourceDialog);
  container.replaceChildren(root);

  return {
    root,
    menuButton,
    documentModeButton,
    sourceDialog,
    sourceDialogCode,
    sourceDialogCloseButton,
    sortButtons,
    themeButtons,
    sidebar,
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
      elements.documentModeButton.hidden = true;
      break;
    case "loading":
      elements.status.textContent = "読み込み中…";
      elements.status.setAttribute("role", "status");
      elements.status.hidden = false;
      elements.frame.hidden = true;
      elements.documentModeButton.hidden = true;
      break;
    case "ready":
      elements.status.replaceChildren();
      elements.status.hidden = true;
      elements.frame.hidden = false;
      elements.documentModeButton.hidden = false;
      break;
    case "error":
      elements.status.textContent = state.message;
      elements.status.setAttribute("role", "alert");
      elements.status.hidden = false;
      elements.frame.hidden = true;
      elements.documentModeButton.hidden = true;
      break;
  }
}
