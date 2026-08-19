import { documentPathFromContentUrl } from "./router.js";
import type {
  NavigationItem,
  RouteState,
  SortDirection,
  SortPreference,
} from "./types.js";

export function mountNavigation(
  container: HTMLElement,
  html: string,
  contentBaseUrl: URL,
): NavigationItem[] {
  const parsedDocument = new DOMParser().parseFromString(html, "text/html");
  const navigation = parsedDocument.querySelector("nav");
  if (navigation === null) {
    throw new Error("Navigation does not contain a nav element");
  }

  container.replaceChildren(navigation);
  const items: NavigationItem[] = [];

  let navigationOrder = 0;
  for (const anchor of navigation.querySelectorAll<HTMLAnchorElement>(
    "a[href]",
  )) {
    anchor.dataset.navigationOrder = String(navigationOrder);
    navigationOrder += 1;
    const href = anchor.getAttribute("href")?.trim();
    if (href === undefined || href.length === 0) {
      console.warn("Spec HTML: Ignored an empty href in navigation");
      continue;
    }
    let url: URL;
    try {
      url = new URL(href, contentBaseUrl);
    } catch {
      console.warn(`Spec HTML: Could not parse navigation URL: ${href}`);
      continue;
    }
    if (url.protocol === "javascript:") {
      anchor.dataset.specHtmlBlocked = "javascript";
      anchor.removeAttribute("href");
      console.warn("Spec HTML: Disabled a javascript: URL in navigation");
      continue;
    }

    anchor.href = url.href;
    const doc =
      url.origin === contentBaseUrl.origin
        ? documentPathFromContentUrl(url)
        : null;
    if (
      doc !== null &&
      !anchor.hasAttribute("target") &&
      !anchor.hasAttribute("download")
    ) {
      items.push({ anchor, doc, hash: url.hash });
    }
  }

  return items;
}

export function sortNavigation(
  container: HTMLElement,
  preference: SortPreference,
  direction: SortDirection,
): void {
  const navigation = container.querySelector("nav");
  if (navigation === null) {
    return;
  }

  const sections: Array<{
    anchors: HTMLAnchorElement[];
    boundary: HTMLHeadingElement | null;
  }> = [];
  let anchors: HTMLAnchorElement[] = [];

  for (const child of Array.from(navigation.children)) {
    if (child instanceof HTMLHeadingElement) {
      sections.push({ anchors, boundary: child });
      anchors = [];
    } else if (child instanceof HTMLAnchorElement) {
      anchors.push(child);
    }
  }
  sections.push({ anchors, boundary: null });

  for (const section of sections) {
    section.anchors.sort((left, right) =>
      compareNavigationAnchors(left, right, preference, direction),
    );
    for (const anchor of section.anchors) {
      navigation.insertBefore(anchor, section.boundary);
    }
  }
}

function compareNavigationAnchors(
  left: HTMLAnchorElement,
  right: HTMLAnchorElement,
  preference: SortPreference,
  direction: SortDirection,
): number {
  const originalOrder =
    Number(left.dataset.navigationOrder) -
    Number(right.dataset.navigationOrder);
  const comparison =
    preference === "name"
      ? originalOrder
      : Date.parse(left.querySelector("time")?.dateTime ?? "") -
        Date.parse(right.querySelector("time")?.dateTime ?? "");
  const directedComparison =
    direction === "ascending" ? comparison : -comparison;
  return directedComparison || originalOrder;
}

export function updateActiveNavigation(
  items: readonly NavigationItem[],
  route: RouteState,
): void {
  for (const item of items) {
    if (item.doc === route.doc) {
      item.anchor.setAttribute("aria-current", "page");
    } else {
      item.anchor.removeAttribute("aria-current");
    }
  }
}
