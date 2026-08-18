# Spec HTML

LLMが通常Markdownで生成する設計書や仕様書を、構造的なHTMLへ置き換えてローカルで読みやすく閲覧するためのViewerです。標準のsemantic HTMLを使うことで、Markdown以上の表現力を持つ文書を簡単に作成し、navigation、文書間リンク、画像、Chart.js、Mermaidを活用できます。

## Purpose and scope

Spec HTMLの目的は、LLMにWeb application一式を実装させることではありません。LLMに構造的なHTML fragmentを直接生成させ、見出し、table、code、callout、details、画像、図表など、Markdownだけでは表現しにくい情報を読みやすい設計書・仕様書として活用できるようにすることです。共通Viewerが表示とnavigationを整えるため、文書ごとにCSSやメニューを作る必要はありません。

このprojectと生成した文書は、手元の信頼済み環境で利用します。公開npm package、公開Web service、第三者向けhostingを目的としておらず、npm registryへのpublishや公開用GitHub Releaseを行いません。npmは開発dependencyの管理、ローカルbuild、ローカルpackage検証のためだけに使用します。

## Features

- content directory内のHTML fragmentからnavigationを自動構成
- content directory内の変更を検知してbrowserを自動reload
- 文書間の相対リンク、画像、browser historyに対応
- mobile向けnavigationとkeyboard操作に対応
- OS設定へ追従するlight／dark表示と文書印刷に対応
- content directory外へのpath traversalとsymbolic link escapeを拒否
- Chart.jsとMermaidはoptional dependency
- Mermaidは実行時に公式ES moduleを読み込むため、仕様変更時のSVG変換は不要

## Requirements

- Node.js 24以上
- ローカルの信頼済みHTML

## Local setup

このrepositoryをローカルへcheckoutし、dependencyとViewerを準備します。

```bash
npm ci
npm run build
```

別のローカルprojectから使用する場合は、npm registryではなく、このrepositoryのpathを指定します。

```bash
npm install --save-dev /absolute/path/to/spec-html
```

Chart.jsとMermaidも使う場合は、利用projectへ追加します。どちらか一方だけでも導入でき、未導入のintegrationは通常のHTML、CSS、画像、navigationへ影響しません。

```bash
npm install --save-dev chart.js mermaid
```

## Quick start

```text
specs/
├─ overview.html
├─ architecture.html
└─ assets/
   └─ diagram.svg
```

Viewerはdirectory内の`.html`を再帰的に読み取り、最初の`h1`を表示名とするnavigationを実行時に構成します。メニュー用fileを作成したりrepositoryで管理したりする必要はありません。起動中は指定directory配下だけを監視し、文書や画像を変更・追加・削除するとbrowserを自動reloadします。

各設計書はHTML document全体ではなく、`article`などから始まるfragmentとして保存します。

```html
<article lang="en">
  <h1>Authentication</h1>
  <p>Authentication is based on OpenID Connect.</p>
  <img src="./assets/login-flow.svg" alt="Authentication flow">
</article>
```

ローカルpathからinstallしたViewerを起動します。`--no-install`により、registryから同名packageを取得しません。

```bash
npx --no-install spec-html ./specs
```

Viewerで開く前に、文書構造、参照、accessibilityを静的検査できます。通常は簡潔な診断を使い、修正方法が不明なruleだけ説明を表示します。

```bash
npx --no-install spec-html lint ./specs
npx --no-install spec-html lint ./specs --warnings-as-errors
npx --no-install spec-html lint --explain DOC001
```

普段使う場合は利用プロジェクトの`package.json`へ登録します。

```json
{
  "scripts": {
    "docs": "spec-html ./specs"
  }
}
```

詳しい記述規約、リンク解決、integrationの使い方は[Authoring guide](./docs/authoring.html)を参照してください。`docs/`全体はSpec HTML自身で閲覧できる構造的なHTMLになっています。

## Appearance

Sidebar上部の「Name」「Date」で、各directory内の文書を名前順または更新日順に並び替えられます。選択中のボタンをもう一度押すと、昇順と降順が反転します。「Light」「Dark」からは表示themeを選択でき、選択内容はbrowserへ保存されます。初回表示ではOS設定に合うthemeを使用します。Shell、文書、Chart.js、Mermaidは同時に切り替わり、dark表示は[Tokyo Night Storm](https://github.com/folke/tokyonight.nvim)を参考にした青みのあるpaletteです。Sidebar幅を超える文書タイトルは末尾を省略表示し、hover時のtooltipで全文を確認できます。

見出し、list、table、code、blockquote、details、figureなどのsemantic HTMLには既定styleが適用されます。`aside`はnote表示になり、`data-type`へ`warning`、`danger`、`success`を指定できます。

```html
<aside data-type="warning" aria-labelledby="migration-warning">
  <strong id="migration-warning">注意</strong>
  <p>この変更にはdatabase migrationが必要です。</p>
</aside>
```

印刷時はSidebarとmobile menu buttonを除外し、現在の文書をlight配色で印刷します。

## Chart.js

`chart.js`が導入されている場合、通常のChart.jsコードをinline scriptで使用できます。

```html
<canvas id="latency-chart" width="320" height="180" aria-label="P95 latency chart"></canvas>
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
spec-html [directory] [options]

--host <host>    listenするhost（既定: 127.0.0.1）
--port <port>    listenするport（既定: 4173、0で自動割り当て）
--open           起動後にbrowserを開く（既定）
--no-open        browserを開かない
--help           helpを表示
--version        versionを表示

spec-html lint [directory] [options]
```

## Security model

Spec HTMLはローカルの信頼済みHTMLを対象にします。設計書内のinline scriptは実行されるため、第三者から受け取ったHTMLを確認せずに開かないでください。

既定では`127.0.0.1`だけで待ち受けます。`--host`を変更して、信頼できないnetworkへ公開しないでください。content directory外を指すpath traversalとsymbolic linkは配信しません。

package自体も外部公開を禁止しています。公開npm registryへのpublish、公開用GitHub Release、ViewerのInternet hostingは行わないでください。方針の詳細は[Local use policy](./RELEASING.md)を参照してください。

## v0.1 limitations

- 検索、Markdown変換は含みません。
- browser自動テストの対象はChromiumです。
- Node.js 24未満はサポートしません。

## Development

開発環境の構築、検証command、変更時のchecklistは[CONTRIBUTING.md](./CONTRIBUTING.md)を参照してください。ローカル利用と非公開の方針は[Local use policy](./RELEASING.md)、変更履歴は[CHANGELOG.md](./CHANGELOG.md)にあります。

## License

[MIT License](./LICENSE) © 2026 Spec HTML contributors
