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
    "/_spec-html/integrations/mermaid/mermaid.esm.min.mjs",
    document.baseURI,
  ).href;
  const imported: unknown = await import(moduleUrl);
  const mermaid = getMermaidApi(imported);
  const markdownDiagram = document.querySelector(
    '.mermaid[data-spec-html-source="markdown"]',
  );
  const selectedTheme = document.documentElement.dataset.theme;
  const dark =
    selectedTheme === "dark" ||
    (selectedTheme !== "light" &&
      matchMedia("(prefers-color-scheme: dark)").matches);
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: markdownDiagram === null ? "loose" : "strict",
    theme: dark ? "base" : "default",
    ...(dark
      ? {
          themeVariables: {
            darkMode: true,
            background: "#24283b",
            primaryColor: "#292e42",
            primaryTextColor: "#c0caf5",
            primaryBorderColor: "#7aa2f7",
            secondaryColor: "#1f2335",
            secondaryTextColor: "#c0caf5",
            secondaryBorderColor: "#7dcfff",
            tertiaryColor: "#2e3c64",
            tertiaryTextColor: "#c0caf5",
            tertiaryBorderColor: "#bb9af7",
            noteBkgColor: "#373640",
            noteTextColor: "#c0caf5",
            noteBorderColor: "#e0af68",
            lineColor: "#a9b1d6",
            textColor: "#c0caf5",
            mainBkg: "#292e42",
          },
        }
      : {}),
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
