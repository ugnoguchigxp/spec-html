import type { LoadState, ViewerElements } from "./types.js";

export function createLayout(container: HTMLElement): ViewerElements {
  const root = document.createElement("div");
  root.className = "viewer";
  root.dataset.sidebarOpen = "false";

  const header = document.createElement("header");
  header.className = "viewer-header";

  const menuButton = document.createElement("button");
  menuButton.className = "menu-button";
  menuButton.type = "button";
  menuButton.textContent = "メニュー";
  menuButton.setAttribute("aria-controls", "viewer-sidebar");
  menuButton.setAttribute("aria-expanded", "false");

  const title = document.createElement("span");
  title.className = "viewer-title";
  title.textContent = "HTML Docs";
  header.append(menuButton, title);

  const sidebar = document.createElement("aside");
  sidebar.className = "viewer-sidebar";
  sidebar.id = "viewer-sidebar";

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
  root.append(header, sidebar, main);
  container.replaceChildren(root);

  return { root, menuButton, title, sidebar, status, frame };
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
