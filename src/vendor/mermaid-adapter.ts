interface MermaidApi {
  initialize(config: Record<string, unknown>): void;
  run(options: { querySelector: string }): Promise<void>;
}

void renderMermaid().catch((error: unknown) => {
  console.error("Mermaidの描画に失敗しました", error);
});

async function renderMermaid(): Promise<void> {
  await domReady();
  const moduleUrl = new URL(
    "/_html-docs/integrations/mermaid/mermaid.esm.min.mjs",
    document.baseURI,
  ).href;
  const imported: unknown = await import(moduleUrl);
  const mermaid = getMermaidApi(imported);
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "loose",
    theme: dark ? "dark" : "default",
  });
  await mermaid.run({ querySelector: ".mermaid" });
}

function domReady(): Promise<void> {
  if (document.readyState !== "loading") {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    document.addEventListener("DOMContentLoaded", () => resolve(), { once: true });
  });
}

function getMermaidApi(value: unknown): MermaidApi {
  if (
    typeof value !== "object" ||
    value === null ||
    !("default" in value) ||
    typeof value.default !== "object" ||
    value.default === null ||
    !("initialize" in value.default) ||
    typeof value.default.initialize !== "function" ||
    !("run" in value.default) ||
    typeof value.default.run !== "function"
  ) {
    throw new Error("Mermaid moduleを初期化できません");
  }
  return value.default as MermaidApi;
}
