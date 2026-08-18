はい。この前提まで固まったなら、かなり明確な雛形にできます。

私なら **「保存フォーマットは普通のHTML」「独自なのはViewerだけ」** を設計原則にします。さらに、利用プロジェクト側にはビルド環境を要求せず、Framework package側だけTypeScriptでビルドします。

## 1. Framework側のプロジェクト

仮にパッケージ名を `@org/html-docs` とします。

```text
html-docs/
├─ package.json
├─ tsconfig.json
├─ eslint.config.js
│
├─ src/
│  ├─ auto.ts
│  ├─ index.ts
│  │
│  ├─ shell/
│  │  ├─ start.ts
│  │  ├─ layout.ts
│  │  ├─ navigation.ts
│  │  └─ router.ts
│  │
│  ├─ document/
│  │  ├─ load.ts
│  │  ├─ frame.ts
│  │  ├─ paths.ts
│  │  └─ title.ts
│  │
│  ├─ enhancers/
│  │  ├─ headings.ts
│  │  ├─ mermaid.ts
│  │  └─ external-links.ts
│  │
│  └─ styles/
│     ├─ shell.css
│     ├─ document.css
│     └─ themes/
│        ├─ default.css
│        └─ dark.css
│
├─ dist/
│  ├─ auto.js
│  ├─ index.js
│  ├─ shell.css
│  ├─ document.css
│  ├─ themes/
│  │  └─ ...
│  └─ vendor/
│     ├─ chart.js
│     └─ mermaid.js
│
├─ examples/
│  ├─ basic/
│  ├─ nested/
│  ├─ charts/
│  └─ mermaid/
│
└─ tests/
   ├─ navigation.test.ts
   ├─ paths.test.ts
   └─ browser/
```

ポイントは **`dist/` がbrowser-readyであること**です。

利用側では、

```text
TypeScript
esbuild
Chart.js
Mermaid
CSS processor
```

などを一切動かしません。

Frameworkをpublishするときに全部処理しておきます。

---

# 2. 利用側はこうなる

あるプロジェクトでは、

```text
project/
├─ package.json
├─ src/
│  └─ ...
│
├─ specs/
│  ├─ index.html
│  ├─ nav.html
│  │
│  ├─ overview.html
│  ├─ architecture.html
│  ├─ authentication.html
│  ├─ api.html
│  │
│  └─ assets/
│     └─ ...
│
└─ node_modules/
```

別のプロジェクトなら、

```text
project/
├─ spec/
│  └─ docs/
│     ├─ index.html
│     ├─ nav.html
│     ├─ overview.html
│     └─ ...
```

さらに別なら、

```text
project/
├─ docs/
│  ├─ index.html
│  ├─ nav.html
│  └─ ...
```

全部同じです。

**ディレクトリ名はFrameworkにとって意味を持ちません。**

---

# 3. `index.html` はShell bootstrapだけ

私はこれくらいまで削ります。

```html
<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <title>Documentation</title>
</head>

<body>
  <script
    type="module"
    src="/node_modules/@org/html-docs/dist/auto.js">
  </script>
</body>
</html>
```

これだけです。

`auto.js` は、

```ts
start({
  root: new URL(".", location.href)
});
```

相当を自動的に実行します。

したがって、

```text
/docs/index.html

/specs/index.html

/spec/docs/index.html
```

どこでも同じ `index.html` が使えます。

---

# 4. `nav.html` も純粋HTML

ここにもJSONやYAMLを持ち込みません。

```html
<nav>
  <h2>Overview</h2>

  <a href="./overview.html">Overview</a>
  <a href="./architecture.html">Architecture</a>

  <h2>Specifications</h2>

  <a href="./authentication.html">Authentication</a>
  <a href="./api.html">API</a>
</nav>
```

これをShellが、

```text
┌──────────────────────┬───────────────────────────────────┐
│ Overview             │ Authentication                    │
│                      │                                   │
│  Overview            │ Authentication uses OIDC...      │
│  Architecture        │                                   │
│                      │ Requirements                      │
│ Specifications       │                                   │
│                      │ ...                               │
│  Authentication      │                                   │
│  API                 │                                   │
│                      │                                   │
└──────────────────────┴───────────────────────────────────┘
```

の左側にします。

ここも重要で、

**NavigationもHTMLなのでAIが特別なschemaを覚える必要がありません。**

---

# 5. Documentは完全に「内容物」

`authentication.html`：

```html
<article>
  <h1>Authentication</h1>

  <p>
    Authentication is based on OpenID Connect.
  </p>

  <section>
    <h2>Requirements</h2>

    <ul>
      <li>Authorization Code Flow with PKCE must be used.</li>
      <li>Access tokens expire after 15 minutes.</li>
      <li>Refresh tokens must be rotated.</li>
    </ul>
  </section>

  <section>
    <h2>Authentication Flow</h2>

    <pre class="mermaid">
sequenceDiagram
  Browser->>API: Login
  API->>IdP: Authorization
  IdP-->>API: Code
  API-->>Browser: Session
    </pre>
  </section>
</article>
```

DOCTYPEも、

```html
<html>
<head>
<link>
```

もありません。

AIに書かせたい対象はほぼここだけです。

---

# 6. Chart.jsも普通のJSとして書ける

例えば、

```html
<section>
  <h2>Latency</h2>

  <canvas id="latency"></canvas>

  <script>
    new Chart(latency, {
      type: "line",
      data: {
        labels: ["2.1", "2.2", "2.3", "2.4"],
        datasets: [{
          label: "P95",
          data: [180, 220, 230, 410]
        }]
      }
    });
  </script>
</section>
```

ここには独自DSLがありません。

AIが知っている、

```text
HTML
DOM
JavaScript
Chart.js
```

だけです。

Mermaidだけが例外です。

---

# 7. 内部的には iframe にした方がよい

これはかなり強く推します。

Shell本体とDocumentを同じDOMに混ぜるのではなく、

```text
Shell DOM
│
├─ Sidebar
│
└─ iframe
      │
      └─ Document
```

とします。

Shellが `authentication.html` をfetchして、

```html
<!doctype html>
<html>
<head>

  <base href="http://localhost:5500/specs/authentication.html">

  <link
    rel="stylesheet"
    href="/node_modules/@org/html-docs/dist/document.css">

  <script
    src="/node_modules/@org/html-docs/dist/vendor/chart.js">
  </script>

</head>

<body>

  <!-- authentication.html -->

</body>
</html>
```

という完全なdocumentを `srcdoc` としてiframeに渡します。

この構成にはかなりメリットがあります。

### Shell CSSとDocument CSSが完全分離される

```text
shell.css

sidebar
navigation
layout
mobile menu
resizer


document.css

h1
h2
p
table
blockquote
figure
code
details
canvas
```

Document CSSを全部捨てて違うthemeにしてもSidebarが壊れません。

---

# 8. Asset pathも自然に扱える

例えばDocumentが、

```html
<img src="./assets/login-flow.png">

<a href="./api.html">
  API specification
</a>
```

としていても、

Shellがiframeに

```html
<base href=".../authentication.html">
```

を追加するので、

Document自身の場所から相対解決できます。

つまりAIには普通に、

```html
<img src="./assets/image.png">
```

と書かせられます。

これは結構重要です。

---

# 9. Runtime自身のパスは `import.meta.url` で解決

さらにPackage内部では、

```ts
const runtimeRoot = new URL(".", import.meta.url);

const documentCss =
  new URL("./document.css", runtimeRoot);

const chartJs =
  new URL("./vendor/chart.js", runtimeRoot);

const mermaidJs =
  new URL("./vendor/mermaid.js", runtimeRoot);
```

とします。

これによって、

```text
Document Root
```

と

```text
Runtime Root
```

を完全分離できます。

したがってFramework内部には、

```text
/docs
/spec
/specs
```

といった文字列が一切登場しません。

---

# 10. URL routingもShellだけで担当

例えば現在、

```text
/specs/index.html
```

を見ているとしてAuthenticationをクリックしたら、

```text
/specs/index.html?doc=authentication.html
```

にします。

Document側のリンク自体は、

```html
<a href="./authentication.html">
```

という普通のリンクです。

Shellがクリックをinterceptして、

```text
./authentication.html
        ↓
?doc=authentication.html
```

にするだけです。

これならブラウザreloadしても同じdocumentに戻れます。

またDocument単体のURL、

```text
/specs/authentication.html
```

を直接開くこともできます。

その場合はCSSなしでも**普通のHTMLとしてそのまま読める**。

これは今回の思想にかなり合っています。

---

# 11. CSSは最初から独自の小さいものにしてもよいと思います

ここまで整理すると、私はむしろSimple.cssを依存として持たず、

```text
document.css
```

を自前で200〜400行くらい持つ方向に傾きます。

対象が限定されているからです。

例えば、

```css
:root {
  --doc-background: #fff;
  --doc-text: #24292f;
  --doc-muted: #59636e;
  --doc-border: #d1d9e0;
  --doc-accent: #0969da;

  --doc-content-width: 920px;
  --doc-font:
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}
```

を契約にして、

```css
body {}
main {}
article {}

h1 {}
h2 {}
h3 {}

p {}
a {}

table {}
th {}
td {}

pre {}
code {}

blockquote {}
aside {}

details {}
summary {}

figure {}
figcaption {}
```

だけちゃんと作る。

HTML側にはclassをほぼ要求しません。

さらに、

```text
default.css
github.css
minimal.css
```

などに後から差し替えられます。

**CSS Custom Propertiesをtheme APIにする**のが一番単純です。

Tailwindのようなutility classは一切Documentに漏れません。

---

# 12. Package dependenciesもかなり小さくできます

完成形としては、この程度を想定します。

```json
{
  "devDependencies": {
    "typescript": "...",
    "esbuild": "...",
    "vitest": "...",
    "playwright": "...",
    "chart.js": "...",
    "mermaid": "..."
  }
}
```

重要なのは、**Chart.js / MermaidもFramework packageのbuild時に `dist` へ封じ込めてしまう**ことです。

利用プロジェクト側は、

```json
{
  "devDependencies": {
    "@org/html-docs": "..."
  }
}
```

だけ。

これは当初の、

> なるべくパッケージに封じ込めたい

にも合います。

---

## 最終的な責務分離

私はこの境界を固定するとよいと思います。

| 層                | 責務                |
| ---------------- | ----------------- |
| `index.html`     | Viewer起動          |
| `nav.html`       | ドキュメント一覧          |
| `*.html`         | **内容だけ**          |
| `shell.ts`       | Sidebar / routing |
| `frame.ts`       | Document隔離・依存注入   |
| `document.css`   | Semantic HTMLの見た目 |
| Chart.js         | 数値可視化             |
| Mermaid          | 構造・関係・sequence    |
| `@org/html-docs` | 上記全部を封じ込める        |

この設計だと、AIとのインターフェースは最終的にほぼ、

```text
*.html
```

だけになります。

**Frameworkを将来完全に削除しても、ドキュメントは普通のHTMLとして残る。**

ここを最上位の設計原則にしておくと、ReSpecのようにFramework独自syntaxが蓄積してロックインされる問題も避けやすいです。

個人的には、この雛形なら **v0.1では `HTML + CSS + Chart.js + Mermaid + TypeScript Shell` 以外を入れない**くらいがちょうどよいと思います。

