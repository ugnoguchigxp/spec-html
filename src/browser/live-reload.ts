import { LIVE_RELOAD_PATH } from "./constants.js";

export interface LiveReloadController {
  deferReload(): () => void;
}

export function installLiveReload(): LiveReloadController {
  const events = new EventSource(LIVE_RELOAD_PATH);
  let deferrals = 0;
  let reloadPending = false;
  let reloaded = false;

  const reload = (): void => {
    if (reloaded) {
      return;
    }
    reloaded = true;
    events.close();
    window.location.reload();
  };

  events.addEventListener("message", (event) => {
    if (event.data !== "reload") {
      return;
    }
    if (deferrals > 0) {
      reloadPending = true;
      return;
    }
    reload();
  });

  return {
    deferReload: (): (() => void) => {
      deferrals += 1;
      let released = false;
      return (): void => {
        if (released) {
          return;
        }
        released = true;
        deferrals -= 1;
        if (deferrals === 0 && reloadPending) {
          reload();
        }
      };
    },
  };
}
