export interface ViewerFeatures {
  chartJs: boolean;
  mermaid: boolean;
  markdownLanguage?: string;
}

export function createShellHtml(features: ViewerFeatures): string {
  const markdownLanguage = escapeAttribute(features.markdownLanguage ?? "en");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Spec HTML</title>
  <link rel="stylesheet" href="/_spec-html/shell.css">
</head>
<body>
  <div id="app" data-chart-js="${String(features.chartJs)}" data-mermaid="${String(features.mermaid)}" data-markdown-language="${markdownLanguage}"></div>
  <script type="module" src="/_spec-html/viewer.js"></script>
</body>
</html>`;
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
