# Authoring guide

## Content directory

Viewerへ渡すdirectoryには、1つの`nav.html`と任意数のHTML fragmentを置きます。画像などのassetは同じdirectoryの配下へ置いてください。

```text
specs/
├─ nav.html
├─ overview.html
├─ api/
│  └─ endpoints.html
└─ assets/
   └─ architecture.svg
```

## Navigation

`nav.html`内のanchorが設計書一覧になります。リンクは`nav.html`を基準とした相対pathで記述します。

```html
<nav aria-label="設計書">
  <h2>General</h2>
  <a href="./overview.html">Overview</a>

  <h2>API</h2>
  <a href="./api/endpoints.html">Endpoints</a>
</nav>
```

directory外へのpath、absolute path、`javascript:` URLは使用できません。navigationに有効な文書linkがない場合、Viewerは案内messageを表示します。

## HTML fragments

各fileはDOCTYPEや`html`、`head`、`body`を持つ完全なHTML documentではなく、本文fragmentとして記述します。最初の`h1`がViewerのdocument titleになります。

```html
<article>
  <h1>API endpoints</h1>
  <p>Public endpoint definitions.</p>

  <h2 id="errors">Errors</h2>
  <p>Errors use the problem details format.</p>
</article>
```

文書間linkとasset URLは、現在表示しているHTML fileを基準に解決されます。

```html
<a href="../overview.html#authentication">Authentication overview</a>
<img src="../assets/architecture.svg" alt="System architecture">
```

## Mermaid

利用projectへ`mermaid`をインストールし、diagram sourceを`.mermaid`要素へ直接記述します。

```html
<pre class="mermaid">
flowchart LR
  Browser --> API
  API --> Database
</pre>
```

Viewerはページ表示時にdiagramを描画します。生成済みSVGをrepositoryへ保存する工程は不要なので、頻繁な仕様変更でもHTML内のdiagram sourceだけを更新できます。Mermaidが未導入の場合は描画処理を読み込みません。

## Chart.js

利用projectへ`chart.js`をインストールすると、fragmentのinline scriptからglobalの`Chart`を使用できます。

```html
<canvas id="request-count"></canvas>
<script>
  new Chart(document.getElementById("request-count"), {
    type: "bar",
    data: {
      labels: ["GET", "POST"],
      datasets: [{ label: "Requests", data: [120, 35] }]
    }
  });
</script>
```

DOM上のIDは同じfragment内で一意にしてください。Chart.jsが未導入の場合、`Chart`を参照するscriptは書かないでください。

## Trust boundary

fragment内のinline scriptは実行されます。HTML Docsはsanitizerではありません。内容を信頼できないHTMLや、外部入力をそのまま埋め込んだHTMLを開かないでください。

content directory外のfileは配信されません。共有assetも必ずcontent directory配下へ置いてください。

## Troubleshooting

- navigationが空になる: `nav.html`に相対URLのanchorがあるか確認する。
- documentが404になる: link先がcontent directory内にあり、大文字・小文字を含めfile名が一致するか確認する。
- Mermaidがsourceのままになる: 利用projectで`npm install --save-dev mermaid`を実行し、Viewerを再起動する。
- Chartが表示されない: `chart.js`のinstall、canvas ID、browser consoleを確認する。
- 変更が反映されない: v0.1にはfile watcherがないため、browserをreloadする。
