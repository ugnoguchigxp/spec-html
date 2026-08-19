export function installPrintController(frame: HTMLIFrameElement): void {
  let openedForPrint: HTMLDetailsElement[] = [];
  window.addEventListener("beforeprint", () => {
    const frameDocument = frame.contentDocument;
    if (frameDocument === null) {
      return;
    }
    if (openedForPrint.length === 0) {
      openedForPrint = Array.from(
        frameDocument.querySelectorAll<HTMLDetailsElement>(
          "details:not([open])",
        ),
      );
      for (const details of openedForPrint) {
        details.open = true;
      }
    }
    const printHeight = Math.max(
      frameDocument.documentElement.scrollHeight,
      frameDocument.body.scrollHeight,
    );
    frame.style.height = `${String(printHeight)}px`;
  });
  window.addEventListener("afterprint", () => {
    for (const details of openedForPrint) {
      details.open = false;
    }
    openedForPrint = [];
    frame.style.removeProperty("height");
  });
}
