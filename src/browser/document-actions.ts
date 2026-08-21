import type { ViewerElements } from "./types.js";

export function closeSourceDialog(elements: ViewerElements): void {
  if (elements.sourceDialog.open) {
    elements.sourceDialog.close();
  }
}

export function closeDocumentActionsMenu(
  elements: ViewerElements,
  restoreFocus = false,
): void {
  if (!elements.documentActionsMenu.hidden) {
    elements.documentActionsMenu.hidden = true;
    elements.documentActionsButton.setAttribute("aria-expanded", "false");
    if (restoreFocus) {
      elements.documentActionsButton.focus();
    }
  }
}

export function clearDocumentActionStatus(elements: ViewerElements): void {
  elements.documentActionStatus.replaceChildren();
  delete elements.documentActionStatus.dataset.tone;
  elements.documentActionStatus.hidden = true;
}
