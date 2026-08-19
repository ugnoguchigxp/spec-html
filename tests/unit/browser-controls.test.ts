// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { updateDocumentArchiveButton } from "../../src/browser/archive-controls.js";
import {
  clearDocumentActionStatus,
  closeDocumentActionsMenu,
} from "../../src/browser/document-actions.js";
import { updateNavigationViewButton } from "../../src/browser/navigation-controls.js";
import { installSidebarController } from "../../src/browser/sidebar-controller.js";
import { SortController } from "../../src/browser/sort-controller.js";
import type { ViewerElements } from "../../src/browser/types.js";

describe("browser controls", () => {
  it("renders migration-managed archive state", () => {
    const archiveButton = document.createElement("button");
    const elements = { documentArchiveButton: archiveButton } as unknown as ViewerElements;

    updateDocumentArchiveButton(elements, {
      archived: true,
      restoreAllowed: false,
      migrationId: "migration-1",
    });

    expect(archiveButton.textContent).toBe("Restore");
    expect(archiveButton.disabled).toBe(true);
    expect(archiveButton.title).toContain("migration-1");
  });

  it("updates navigation view labels", () => {
    const button = document.createElement("button");
    const elements = { navigationViewButton: button } as unknown as ViewerElements;

    updateNavigationViewButton(elements, "documents");
    expect(button.textContent).toBe("Archived");
    expect(button.getAttribute("aria-label")).toBe("Show archived documents");

    updateNavigationViewButton(elements, "archive");
    expect(button.textContent).toBe("Documents");
  });

  it("keeps mobile sidebar accessibility state in sync", () => {
    const root = document.createElement("div");
    const sidebar = document.createElement("aside");
    const menuButton = document.createElement("button");
    document.body.append(root, sidebar, menuButton);
    const elements = { root, sidebar, menuButton } as unknown as ViewerElements;
    const viewport = {
      matches: true,
      addEventListener: vi.fn(),
    } as unknown as MediaQueryList;

    const controller = installSidebarController(elements, viewport);
    expect(sidebar.getAttribute("aria-hidden")).toBe("true");

    menuButton.click();
    expect(controller.isOpen()).toBe(true);
    expect(sidebar.hasAttribute("aria-hidden")).toBe(false);

    controller.close(true);
    expect(controller.isOpen()).toBe(false);
    expect(document.activeElement).toBe(menuButton);
  });

  it("owns sort state and button labels outside viewer startup", () => {
    const navigation = document.createElement("nav");
    const name = document.createElement("button");
    const date = document.createElement("button");
    const elements = {
      navigation,
      sortButtons: { name, date },
    } as unknown as ViewerElements;

    const controller = new SortController(elements);
    expect(name.getAttribute("aria-pressed")).toBe("true");
    expect(controller.direction).toBe("ascending");

    date.click();
    expect(controller.preference).toBe("date");
    expect(controller.direction).toBe("descending");
    expect(date.textContent).toContain("↓");
  });

  it("clears status and closes the document action menu", () => {
    const menu = document.createElement("div");
    menu.hidden = false;
    const button = document.createElement("button");
    const status = document.createElement("p");
    status.textContent = "Failed";
    status.hidden = false;
    document.body.append(button);
    const elements = {
      documentActionsMenu: menu,
      documentActionsButton: button,
      documentActionStatus: status,
    } as unknown as ViewerElements;

    clearDocumentActionStatus(elements);
    closeDocumentActionsMenu(elements, true);

    expect(status.textContent).toBe("");
    expect(status.hidden).toBe(true);
    expect(menu.hidden).toBe(true);
    expect(document.activeElement).toBe(button);
  });
});
