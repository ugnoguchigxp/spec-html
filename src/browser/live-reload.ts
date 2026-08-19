import { LIVE_RELOAD_PATH } from "./constants.js";

export function installLiveReload(): void {
  const events = new EventSource(LIVE_RELOAD_PATH);
  events.addEventListener("message", (event) => {
    if (event.data !== "reload") {
      return;
    }
    events.close();
    window.location.reload();
  });
}
