export interface ViewerFeatures {
  chartJs: boolean;
  mermaid: boolean;
}

export function createShellHtml(features: ViewerFeatures): string {
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>HTML Docs</title>
  <link rel="stylesheet" href="/_html-docs/shell.css">
</head>
<body>
  <div id="app" data-chart-js="${String(features.chartJs)}" data-mermaid="${String(features.mermaid)}"></div>
  <script type="module" src="/_html-docs/viewer.js"></script>
</body>
</html>`;
}
