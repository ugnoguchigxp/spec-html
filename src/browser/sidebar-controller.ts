import type { ViewerElements } from "./types.js";

export interface SidebarController {
  close(restoreFocus?: boolean): void;
  isOpen(): boolean;
}

export function installSidebarController(
  elements: ViewerElements,
  viewport = window.matchMedia("(max-width: 767px)"),
): SidebarController {
  const syncInteractivity = (): void => {
    const isHidden =
      viewport.matches && elements.root.dataset.sidebarOpen !== "true";
    elements.sidebar.inert = isHidden;
    if (isHidden) {
      elements.sidebar.setAttribute("aria-hidden", "true");
    } else {
      elements.sidebar.removeAttribute("aria-hidden");
    }
  };
  const setOpen = (isOpen: boolean): void => {
    elements.root.dataset.sidebarOpen = String(isOpen);
    elements.menuButton.setAttribute("aria-expanded", String(isOpen));
    syncInteractivity();
  };

  syncInteractivity();
  viewport.addEventListener("change", syncInteractivity);
  elements.menuButton.addEventListener("click", () => {
    setOpen(elements.root.dataset.sidebarOpen !== "true");
  });

  return {
    close(restoreFocus = false): void {
      setOpen(false);
      if (restoreFocus) {
        elements.menuButton.focus();
      }
    },
    isOpen(): boolean {
      return elements.root.dataset.sidebarOpen === "true";
    },
  };
}
