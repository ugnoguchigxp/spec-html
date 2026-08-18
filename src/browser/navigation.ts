import { documentPathFromContentUrl } from "./router.js";
import type { NavigationItem, RouteState } from "./types.js";

export function mountNavigation(
  container: HTMLElement,
  html: string,
  contentBaseUrl: URL,
): NavigationItem[] {
  const parsedDocument = new DOMParser().parseFromString(html, "text/html");
  const navigation = parsedDocument.querySelector("nav");
  if (navigation === null) {
    throw new Error("Navigationにnav要素がありません");
  }

  container.replaceChildren(navigation);
  const items: NavigationItem[] = [];

  for (const anchor of navigation.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    const href = anchor.getAttribute("href")?.trim();
    if (href === undefined || href.length === 0) {
      console.warn("Spec HTML: Navigation内の空のhrefを無視しました");
      continue;
    }
    if (href.toLowerCase().startsWith("javascript:")) {
      anchor.dataset.specHtmlBlocked = "javascript";
      anchor.removeAttribute("href");
      console.warn("Spec HTML: Navigation内のjavascript: URLを無効化しました");
      continue;
    }

    let url: URL;
    try {
      url = new URL(href, contentBaseUrl);
    } catch {
      console.warn(`Spec HTML: Navigation内のURLを解釈できません: ${href}`);
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
