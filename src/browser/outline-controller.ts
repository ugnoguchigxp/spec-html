import type { ViewerElements } from "./types.js";

export type OutlinePosition = "left" | "right" | "hidden";

interface OutlineEntry {
  readonly id: string;
  readonly level: number;
  readonly text: string;
}

export interface OutlineController {
  setDocument(documentToRead: Document): void;
  clear(): void;
}

const OUTLINE_POSITION_STORAGE_KEY = "spec-html-outline-position";

export function installOutlineController(
  elements: ViewerElements,
  navigate: (hash: string) => void,
): OutlineController {
  let entries: readonly OutlineEntry[] = [];
  let position = readOutlinePosition();
  let currentDocument: Document | null = null;

  const applyPosition = (): void => {
    const visible = entries.length > 0 && position !== "hidden";
    elements.root.dataset.outlinePosition = position;
    elements.root.dataset.outlineVisible = String(visible);
    elements.documentOutline.hidden = !visible;
    elements.documentShowOutlineButton.disabled = entries.length === 0;
    if (currentDocument !== null) {
      if (visible) {
        currentDocument.documentElement.dataset.viewerOutlinePosition =
          position;
      } else {
        delete currentDocument.documentElement.dataset.viewerOutlinePosition;
      }
    }
    elements.documentOutlineLeftButton.setAttribute(
      "aria-pressed",
      String(position === "left"),
    );
    elements.documentOutlineRightButton.setAttribute(
      "aria-pressed",
      String(position === "right"),
    );
    elements.documentOutlineCloseButton.setAttribute(
      "aria-pressed",
      String(position === "hidden"),
    );
  };

  const setPosition = (nextPosition: OutlinePosition): void => {
    position = nextPosition;
    saveOutlinePosition(nextPosition);
    applyPosition();
  };

  elements.documentShowOutlineButton.addEventListener("click", () => {
    setPosition(position === "hidden" ? "right" : position);
  });
  elements.documentOutlineLeftButton.addEventListener("click", () =>
    setPosition("left"),
  );
  elements.documentOutlineRightButton.addEventListener("click", () =>
    setPosition("right"),
  );
  elements.documentOutlineCloseButton.addEventListener("click", () =>
    setPosition("hidden"),
  );
  elements.documentOutlineList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const link = target.closest<HTMLAnchorElement>("a[data-outline-id]");
    const id = link?.dataset.outlineId;
    if (id === undefined) {
      return;
    }
    event.preventDefault();
    navigate(`#${encodeURIComponent(id)}`);
  });

  applyPosition();
  return {
    setDocument: (documentToRead): void => {
      if (currentDocument !== null && currentDocument !== documentToRead) {
        delete currentDocument.documentElement.dataset.viewerOutlinePosition;
      }
      currentDocument = documentToRead;
      entries = collectOutlineEntries(documentToRead);
      const fragment = document.createDocumentFragment();
      for (const entry of entries) {
        const item = document.createElement("li");
        item.dataset.level = String(entry.level);
        const link = document.createElement("a");
        link.href = `#${encodeURIComponent(entry.id)}`;
        link.dataset.outlineId = entry.id;
        link.textContent = entry.text;
        item.append(link);
        fragment.append(item);
      }
      elements.documentOutlineList.replaceChildren(fragment);
      applyPosition();
    },
    clear: (): void => {
      if (currentDocument !== null) {
        delete currentDocument.documentElement.dataset.viewerOutlinePosition;
      }
      currentDocument = null;
      entries = [];
      elements.documentOutlineList.replaceChildren();
      applyPosition();
    },
  };
}

function collectOutlineEntries(documentToRead: Document): OutlineEntry[] {
  const allIds = new Set(
    Array.from(
      documentToRead.querySelectorAll<HTMLElement>("[id]"),
      (element) => element.id,
    ),
  );
  const usedIds = new Set<string>();
  let generatedId = 1;
  const nextId = (): string => {
    let candidate: string;
    do {
      candidate = `spec-html-outline-${generatedId}`;
      generatedId += 1;
    } while (allIds.has(candidate) || usedIds.has(candidate));
    allIds.add(candidate);
    return candidate;
  };

  return Array.from(
    documentToRead.querySelectorAll<HTMLElement>("h1, h2, h3"),
    (heading) => {
      const existingId = heading.id.trim();
      const id =
        existingId.length > 0 && !usedIds.has(existingId)
          ? existingId
          : nextId();
      heading.id = id;
      usedIds.add(id);
      const level = Number.parseInt(heading.tagName.slice(1), 10);
      return {
        id,
        level,
        text:
          heading.textContent?.replace(/\s+/gu, " ").trim() ||
          "Untitled section",
      };
    },
  );
}

function readOutlinePosition(): OutlinePosition {
  try {
    const stored = window.localStorage.getItem(OUTLINE_POSITION_STORAGE_KEY);
    if (stored === "left" || stored === "right" || stored === "hidden") {
      return stored;
    }
  } catch {
    // Keep the default when storage is unavailable.
  }
  return "right";
}

function saveOutlinePosition(position: OutlinePosition): void {
  try {
    window.localStorage.setItem(OUTLINE_POSITION_STORAGE_KEY, position);
  } catch {
    // The selected position remains active for this page session.
  }
}
