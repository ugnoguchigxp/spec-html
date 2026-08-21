export interface ScrollTopController {
  setFrame(frame: HTMLIFrameElement): void;
  clear(): void;
}

const SCROLL_TOP_THRESHOLD = 480;

export function installScrollTopController(
  button: HTMLButtonElement,
): ScrollTopController {
  let currentWindow: Window | null = null;
  let onScroll: (() => void) | undefined;

  const clear = (): void => {
    if (currentWindow !== null && onScroll !== undefined) {
      currentWindow.removeEventListener("scroll", onScroll);
    }
    currentWindow = null;
    onScroll = undefined;
    button.hidden = true;
  };

  button.addEventListener("click", () => {
    if (currentWindow === null) {
      return;
    }
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    currentWindow.scrollTo({
      top: 0,
      behavior: reducedMotion ? "auto" : "smooth",
    });
  });

  return {
    setFrame: (frame): void => {
      clear();
      const frameWindow = frame.contentWindow;
      if (frameWindow === null) {
        return;
      }
      currentWindow = frameWindow;
      onScroll = (): void => {
        button.hidden = frameWindow.scrollY < SCROLL_TOP_THRESHOLD;
      };
      frameWindow.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
    },
    clear,
  };
}
