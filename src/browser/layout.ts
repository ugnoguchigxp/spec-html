import type { LoadState, ViewerElements } from "./types.js";
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

  const themeSwitcher = document.createElement("div");
  themeSwitcher.className = "theme-switcher";
  themeSwitcher.setAttribute("role", "group");
  themeSwitcher.setAttribute("aria-label", "Theme");
  const themeLabels: Record<ThemePreference, string> = {
    light: "Light",
    system: "Auto",
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
  const brand = document.createElement("span");
  brand.className = "viewer-brand";
  brand.textContent = "spec-html";
  sidebarControls.append(brand, themeSwitcher);

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

  main.append(status, frame);
  root.append(menuButton, sidebar, main);
  container.replaceChildren(root);

  return {
    root,
    menuButton,
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
      break;
    case "loading":
      elements.status.textContent = "読み込み中…";
      elements.status.setAttribute("role", "status");
      elements.status.hidden = false;
      elements.frame.hidden = true;
      break;
    case "ready":
      elements.status.replaceChildren();
      elements.status.hidden = true;
      elements.frame.hidden = false;
      break;
    case "error":
      elements.status.textContent = state.message;
      elements.status.setAttribute("role", "alert");
      elements.status.hidden = false;
      elements.frame.hidden = true;
      break;
  }
}
