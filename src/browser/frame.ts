import { RUNTIME_PREFIX } from "./constants.js";

export interface FrameIntegrations {
  chartJs: boolean;
  mermaid: boolean;
}

export function buildSrcdoc(
  fragment: string,
  documentUrl: URL,
  integrations: FrameIntegrations,
): string {
  const frameDocument = document.implementation.createHTMLDocument("");
  frameDocument.documentElement.lang = "ja";
  frameDocument.head.querySelector("title")?.remove();

  appendMeta(frameDocument, "charset", "utf-8");
  appendMeta(frameDocument, "name", "viewport", "width=device-width, initial-scale=1");

  const base = frameDocument.createElement("base");
  base.href = documentUrl.href;
  frameDocument.head.append(base);

  appendStyleSheet(frameDocument, runtimeUrl(documentUrl, "document.css"));
  if (integrations.chartJs) {
    appendScript(
      frameDocument,
      runtimeUrl(documentUrl, "integrations/chart.js"),
    );
    appendScript(frameDocument, runtimeUrl(documentUrl, "chart-theme.js"));
  }
  if (integrations.mermaid) {
    appendScript(frameDocument, runtimeUrl(documentUrl, "mermaid.js"), "module");
  }

  frameDocument.body.innerHTML = fragment;
  return `<!doctype html>\n${frameDocument.documentElement.outerHTML}`;
}

function appendMeta(documentToEdit: Document, name: string, value: string, content?: string): void {
  const meta = documentToEdit.createElement("meta");
  meta.setAttribute(name, value);
  if (content !== undefined) {
    meta.content = content;
  }
  documentToEdit.head.append(meta);
}

function appendStyleSheet(documentToEdit: Document, href: string): void {
  const link = documentToEdit.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  documentToEdit.head.append(link);
}

function appendScript(
  documentToEdit: Document,
  src: string,
  type?: "module",
): void {
  const script = documentToEdit.createElement("script");
  script.src = src;
  if (type !== undefined) {
    script.type = type;
  }
  documentToEdit.head.append(script);
}

function runtimeUrl(documentUrl: URL, path: string): string {
  return new URL(`${RUNTIME_PREFIX}${path}`, documentUrl.origin).href;
}
