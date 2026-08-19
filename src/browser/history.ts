import { createShellUrl } from "./router.js";
import type { RouteState } from "./types.js";

export type HistoryMode = "push" | "replace" | "none";

export function updateHistory(route: RouteState, mode: HistoryMode): void {
  if (mode === "none") {
    return;
  }
  const shellUrl = createShellUrl(route, new URL(window.location.href));
  if (mode === "push") {
    history.pushState(null, "", shellUrl.href);
  } else {
    history.replaceState(null, "", shellUrl.href);
  }
}
