export interface ViewerFeatures {
  chartJs: boolean;
  mermaid: boolean;
  markdownLanguage?: string;
}

export function createShellHtml(
  features: ViewerFeatures,
  runtimeAssetVersion: string,
): string {
  const markdownLanguage = escapeAttribute(features.markdownLanguage ?? "en");
  const encodedRuntimeAssetVersion = encodeURIComponent(runtimeAssetVersion);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Spec HTML</title>
  <link rel="stylesheet" href="${SHELL_STYLESHEET_PATH}?v=${encodedRuntimeAssetVersion}">
</head>
<body>
  <div id="app" data-chart-js="${String(features.chartJs)}" data-mermaid="${String(features.mermaid)}" data-markdown-language="${markdownLanguage}"></div>
  <script type="module" src="${VIEWER_SCRIPT_PATH}?v=${encodedRuntimeAssetVersion}"></script>
</body>
</html>`;
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
import {
  SHELL_STYLESHEET_PATH,
  VIEWER_SCRIPT_PATH,
} from "../shared/runtime-paths.js";
