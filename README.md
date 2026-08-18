# HTML Docs

HTML fragmentで書いた設計書を、ローカルで閲覧するための軽量Viewerです。設計書側のbuildや`index.html`は不要で、navigation、文書間リンク、画像、Chart.js、Mermaidをそのまま扱えます。

## Features

- `nav.html`とHTML fragmentだけで設計書Viewerを構成
- 文書間の相対リンク、画像、browser historyに対応
- mobile向けnavigationとkeyboard操作に対応
- content directory外へのpath traversalとsymbolic link escapeを拒否
- Chart.jsとMermaidはoptional dependency
- Mermaidは実行時に公式ES moduleを読み込むため、仕様変更時のSVG変換は不要

## Requirements

- Node.js 24以上
- ローカルの信頼済みHTML

## Install

基本Viewerだけを使う場合:

```bash
npm install --save-dev html-docs
```

Chart.jsとMermaidも使う場合は、一緒にインストールすることを推奨します。

```bash
npm install --save-dev html-docs chart.js mermaid
```

Chart.jsとMermaidはどちらか一方だけでも導入できます。未導入のintegrationは読み込まれず、通常のHTML、CSS、画像、navigationには影響しません。

## Quick start

```text
specs/
├─ nav.html
├─ overview.html
├─ architecture.html
└─ assets/
   └─ diagram.svg
```

`nav.html`に設計書へのリンクを書きます。

```html
<nav aria-label="設計書">
  <h2>Overview</h2>
  <a href="./overview.html">Overview</a>
  <a href="./architecture.html">Architecture</a>
</nav>
```

各設計書はHTML document全体ではなく、`article`などから始まるfragmentとして保存します。

```html
<article>
  <h1>Authentication</h1>
  <p>Authentication is based on OpenID Connect.</p>
  <img src="./assets/login-flow.svg" alt="Authentication flow">
</article>
```

Viewerを起動します。

```bash
npx html-docs ./specs
```

普段使う場合は利用プロジェクトの`package.json`へ登録します。

```json
{
  "scripts": {
    "docs": "html-docs ./specs"
  }
}
```

詳しい記述規約、リンク解決、integrationの使い方は[Authoring guide](./docs/authoring.md)を参照してください。

## Chart.js

`chart.js`が導入されている場合、通常のChart.jsコードをinline scriptで使用できます。

```html
<canvas id="latency-chart" width="320" height="180"></canvas>
<script>
  const canvas = document.getElementById("latency-chart");
  new Chart(canvas, {
    type: "line",
    data: {
      labels: ["2.1", "2.2", "2.3"],
      datasets: [{ label: "P95", data: [180, 220, 230] }]
    }
  });
</script>
```

## Mermaid

`mermaid`が導入されている場合、`.mermaid`要素を自動描画します。初期化scriptやSVGへの事前変換は不要です。公式ES moduleと現在の図種に必要なchunkだけを読み込みます。

```html
<pre class="mermaid">
sequenceDiagram
  Browser->>API: Login
  API-->>Browser: Session
</pre>
```

## CLI

```text
html-docs [directory] [options]

--host <host>    listenするhost（既定: 127.0.0.1）
--port <port>    listenするport（既定: 4173、0で自動割り当て）
--open           起動後にbrowserを開く（既定）
--no-open        browserを開かない
--help           helpを表示
--version        versionを表示
```

## Security model

HTML Docsはローカルの信頼済みHTMLを対象にします。設計書内のinline scriptは実行されるため、第三者から受け取ったHTMLを確認せずに開かないでください。

既定では`127.0.0.1`だけで待ち受けます。`--host`を変更して、信頼できないnetworkへ公開しないでください。content directory外を指すpath traversalとsymbolic linkは配信しません。

## v0.1 limitations

- file watcherと自動reloadはありません。編集後にbrowserをreloadしてください。
- 検索、theme切り替え、Markdown変換は含みません。
- browser自動テストの対象はChromiumです。
- Node.js 24未満はサポートしません。

## Development

開発環境の構築、検証command、変更時のchecklistは[CONTRIBUTING.md](./CONTRIBUTING.md)を参照してください。npm公開手順は[RELEASING.md](./RELEASING.md)、変更履歴は[CHANGELOG.md](./CHANGELOG.md)にあります。

## License

[MIT License](./LICENSE) © 2026 HTML Docs contributors
