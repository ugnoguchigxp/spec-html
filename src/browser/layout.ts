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

  const documentScrollTopButton = document.createElement("button");
  documentScrollTopButton.className = "document-scroll-top-button";
  documentScrollTopButton.type = "button";
  documentScrollTopButton.textContent = "↑";
  documentScrollTopButton.setAttribute("aria-label", "Scroll to top");
  documentScrollTopButton.title = "Scroll to top";
  documentScrollTopButton.hidden = true;

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

  const documentCopyRelativePathButton = document.createElement("button");
  documentCopyRelativePathButton.className = "document-menu-button";
  documentCopyRelativePathButton.type = "button";
  documentCopyRelativePathButton.textContent = "Copy relative path";
  documentCopyRelativePathButton.setAttribute("role", "menuitem");

  const documentCopyAbsolutePathButton = document.createElement("button");
  documentCopyAbsolutePathButton.className = "document-menu-button";
  documentCopyAbsolutePathButton.type = "button";
  documentCopyAbsolutePathButton.textContent = "Copy absolute path";
  documentCopyAbsolutePathButton.setAttribute("role", "menuitem");
  documentCopyAbsolutePathButton.hidden = true;

  const documentShowOutlineButton = document.createElement("button");
  documentShowOutlineButton.className = "document-menu-button";
  documentShowOutlineButton.type = "button";
  documentShowOutlineButton.textContent = "Show outline";
  documentShowOutlineButton.setAttribute("role", "menuitem");

  const documentActionsDivider = document.createElement("hr");
  documentActionsDivider.className = "document-actions-divider";
  documentActionsDivider.setAttribute("role", "separator");

  const documentArchiveButton = document.createElement("button");
  documentArchiveButton.className =
    "document-menu-button document-archive-button";
  documentArchiveButton.type = "button";
  documentArchiveButton.textContent = "Archive";
  documentArchiveButton.setAttribute("role", "menuitem");
  documentActionsMenu.append(
    documentCopyRelativePathButton,
    documentCopyAbsolutePathButton,
    documentShowOutlineButton,
    documentActionsDivider,
    documentArchiveButton,
  );

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

  const sourceDialogEditor = document.createElement("div");
  sourceDialogEditor.className = "source-dialog-editor";

  const sourceDialogEditorBody = document.createElement("div");
  sourceDialogEditorBody.className = "source-dialog-editor-body";

  const sourceDialogGutter = document.createElement("div");
  sourceDialogGutter.className = "source-dialog-gutter";
  sourceDialogGutter.setAttribute("aria-hidden", "true");

  const sourceDialogLineNumbers = document.createElement("pre");
  sourceDialogLineNumbers.className = "source-dialog-line-numbers";
  sourceDialogGutter.append(sourceDialogLineNumbers);

  const sourceDialogTextarea = document.createElement("textarea");
  sourceDialogTextarea.className = "source-dialog-code";
  sourceDialogTextarea.spellcheck = false;
  sourceDialogTextarea.autocomplete = "off";
  sourceDialogTextarea.autocapitalize = "off";
  sourceDialogTextarea.wrap = "off";
  sourceDialogTextarea.setAttribute("aria-label", "Source editor");

  const sourceDialogEditorStatus = document.createElement("div");
  sourceDialogEditorStatus.className = "source-dialog-editor-status";

  const sourceDialogLanguage = document.createElement("span");
  sourceDialogLanguage.className = "source-dialog-language";
  sourceDialogLanguage.textContent = "HTML";

  const sourceDialogIndent = document.createElement("span");
  sourceDialogIndent.textContent = "Spaces: 2";

  const sourceDialogPosition = document.createElement("output");
  sourceDialogPosition.className = "source-dialog-position";
  sourceDialogPosition.textContent = "Ln 1, Col 1";

  sourceDialogEditorBody.append(sourceDialogGutter, sourceDialogTextarea);
  sourceDialogEditorStatus.append(
    sourceDialogLanguage,
    sourceDialogIndent,
    sourceDialogPosition,
  );
  sourceDialogEditor.append(sourceDialogEditorBody, sourceDialogEditorStatus);

  const sourceDialogFooter = document.createElement("div");
  sourceDialogFooter.className = "source-dialog-footer";

  const sourceDialogStatus = document.createElement("div");
  sourceDialogStatus.className = "source-dialog-status";
  sourceDialogStatus.setAttribute("role", "status");
  sourceDialogStatus.setAttribute("aria-live", "polite");

  const sourceDialogSaveButton = document.createElement("button");
  sourceDialogSaveButton.className = "source-dialog-save";
  sourceDialogSaveButton.type = "button";
  sourceDialogSaveButton.textContent = "Save";
  sourceDialogSaveButton.disabled = true;

  sourceDialogHeader.append(sourceDialogTitle, sourceDialogCloseButton);
  sourceDialogFooter.append(sourceDialogStatus, sourceDialogSaveButton);
  sourceDialog.append(
    sourceDialogHeader,
    sourceDialogEditor,
    sourceDialogFooter,
  );

  const documentOutline = document.createElement("aside");
  documentOutline.className = "document-outline";
  documentOutline.setAttribute("aria-labelledby", "document-outline-title");
  documentOutline.hidden = true;

  const documentOutlineHeader = document.createElement("div");
  documentOutlineHeader.className = "document-outline-header";

  const documentOutlineTitle = document.createElement("h2");
  documentOutlineTitle.id = "document-outline-title";
  documentOutlineTitle.textContent = "On this page";

  const documentOutlineControls = document.createElement("div");
  documentOutlineControls.className = "document-outline-controls";
  documentOutlineControls.setAttribute("role", "group");
  documentOutlineControls.setAttribute("aria-label", "Outline position");

  const documentOutlineLeftButton = document.createElement("button");
  documentOutlineLeftButton.className = "document-outline-control";
  documentOutlineLeftButton.type = "button";
  documentOutlineLeftButton.textContent = "←";
  documentOutlineLeftButton.setAttribute("aria-label", "Show outline on left");
  documentOutlineLeftButton.setAttribute("aria-pressed", "false");
  documentOutlineLeftButton.title = "Show outline on left";

  const documentOutlineRightButton = document.createElement("button");
  documentOutlineRightButton.className = "document-outline-control";
  documentOutlineRightButton.type = "button";
  documentOutlineRightButton.textContent = "→";
  documentOutlineRightButton.setAttribute(
    "aria-label",
    "Show outline on right",
  );
  documentOutlineRightButton.setAttribute("aria-pressed", "true");
  documentOutlineRightButton.title = "Show outline on right";

  const documentOutlineCloseButton = document.createElement("button");
  documentOutlineCloseButton.className = "document-outline-control";
  documentOutlineCloseButton.type = "button";
  documentOutlineCloseButton.textContent = "×";
  documentOutlineCloseButton.setAttribute("aria-label", "Hide outline");
  documentOutlineCloseButton.setAttribute("aria-pressed", "false");
  documentOutlineCloseButton.title = "Hide outline";

  const documentOutlineList = document.createElement("ol");
  documentOutlineList.className = "document-outline-list";
  documentOutlineList.setAttribute("aria-label", "Document outline");

  documentOutlineControls.append(
    documentOutlineLeftButton,
    documentOutlineRightButton,
    documentOutlineCloseButton,
  );
  documentOutlineHeader.append(documentOutlineTitle, documentOutlineControls);
  documentOutline.append(documentOutlineHeader, documentOutlineList);

  main.append(
    status,
    frame,
    documentActions,
    documentModeButton,
    documentScrollTopButton,
    documentOutline,
  );
  root.append(menuButton, sidebar, main, sourceDialog);
  container.replaceChildren(root);

  return {
    root,
    menuButton,
    documentActions,
    documentActionsButton,
    documentActionsMenu,
    documentCopyRelativePathButton,
    documentCopyAbsolutePathButton,
    documentShowOutlineButton,
    documentArchiveButton,
    documentActionStatus,
    documentModeButton,
    documentScrollTopButton,
    documentOutline,
    documentOutlineList,
    documentOutlineLeftButton,
    documentOutlineRightButton,
    documentOutlineCloseButton,
    sourceDialog,
    sourceDialogTitle,
    sourceDialogEditor,
    sourceDialogGutter,
    sourceDialogLineNumbers,
    sourceDialogLanguage,
    sourceDialogPosition,
    sourceDialogTextarea,
    sourceDialogCloseButton,
    sourceDialogSaveButton,
    sourceDialogStatus,
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
      elements.documentScrollTopButton.hidden = true;
      elements.documentOutline.hidden = true;
      break;
    case "loading":
      elements.status.textContent = "Loading…";
      elements.status.setAttribute("role", "status");
      elements.status.hidden = false;
      elements.frame.hidden = true;
      elements.documentActions.hidden = true;
      elements.documentModeButton.hidden = true;
      elements.documentScrollTopButton.hidden = true;
      elements.documentOutline.hidden = true;
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
      elements.documentScrollTopButton.hidden = true;
      elements.documentOutline.hidden = true;
      break;
  }
}
