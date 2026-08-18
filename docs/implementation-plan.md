# HTML設計書Viewer 実装計画

## 1. 文書の位置づけ

本書は、AIが生成した設計書をMarkdownではなくHTMLでローカル閲覧するためのnpmパッケージを実装する計画書である。

利用プロジェクトでは本パッケージを`devDependency`としてインストールし、利用側でTypeScriptやCSS、Chart.js、Mermaidのビルドを行わず、1コマンドでViewerを起動できることを目標とする。

実装上のpackage名とCLI名はともに`html-docs`で固定する。npm registryへ公開する直前にpackage名の変更が必要になった場合だけ、`package.json`とREADMEの表記を一括変更する。実装中は仮のscopeや別名を使わない。

### 1.1 実装者向けの読み方

- 実装仕様の正本は本書とする。rootの`plan.md`は検討時の背景資料であり、内容が衝突する場合は本書を優先する。
- 最初に2.2節の固定値と3節のスコープを確認する。
- 実装は17節のT0.1からT5.3まで番号順に行う。
- 各taskでは「対象file」以外を同時に変更せず、記載された確認commandが成功してから次へ進む。
- 詳細仕様が必要なときだけ、taskから参照されている4節から16節を読む。
- 本書にない機能を補完しない。必要に見えても3.2節の非目標なら実装しない。
- placeholder、空のstub、未完了TODOを残した状態でtaskを完了にしない。

## 2. 目標

利用者が次の手順だけで、プロジェクト内のHTML設計書を閲覧できる状態を作る。

```bash
npm install --save-dev html-docs
npx html-docs ./specs
```

日常利用では、利用プロジェクトの`package.json`に次のscriptを登録できる。

```json
{
  "scripts": {
    "docs": "html-docs ./specs"
  }
}
```

```bash
npm run docs
```

### 2.1 成功状態

- CLIがローカルHTTPサーバーを起動し、Viewerをブラウザで開く。
- Viewerが`nav.html`をサイドバーとして表示する。
- HTML fragment形式の設計書をiframe内に表示する。
- 設計書から参照する画像などの相対パスが、設計書自身の位置を基準に解決される。
- 設計書間のリンク、再読み込み、戻る・進む、文書内アンカーが動作する。
- 任意dependencyとしてChart.jsとMermaidを導入すれば、利用側の追加ビルドなしで使用できる。
- publish相当のtarballを別プロジェクトにインストールしても動作する。

### 2.2 実装時の固定値

実装者は次を選び直さず、この値で実装する。

| 項目 | 固定値 |
| --- | --- |
| npm package名 | `html-docs` |
| executable名 | `html-docs` |
| 対応Node.js | 24以上（開発環境の`v24.11.1`を基準） |
| 既定content directory | `./specs` |
| 既定host | `127.0.0.1` |
| 既定port | `4173` |
| browser自動起動 | 既定で有効 |
| UI、CLI、エラーメッセージ | 日本語 |
| Viewer page title suffix | `HTML Docs` |
| mobile breakpoint | `768px`未満 |
| Sidebar幅 | desktopで`280px` |
| Document最大幅 | `920px` |
| 対応browser | v0.1はPlaywright Chromium |
| HTMLの信頼モデル | ローカルの信頼済みコンテンツ |
| Chart.js / Mermaid | optional peer dependency。未導入でも起動可能 |
| sourcemap | v0.1では生成しない |
| minify | v0.1では行わない |

package名を公開前に変更することはリリース作業であり、M0からM5の実装判断には含めない。

## 3. スコープ

### 3.1 v0.1に含めるもの

- npmパッケージとしてのビルドと配布設定
- `html-docs` CLI
- ローカル専用HTTPサーバー
- Viewer Shell
- `nav.html`の読み込みと表示
- HTML fragmentの読み込みとiframe表示
- URL queryを使ったルーティング
- 相対パス解決
- ページタイトルとactive navigationの同期
- Shell用CSSとDocument用CSS
- Chart.jsとMermaidの任意integrationと遅延配信
- 単体テスト、サーバー統合テスト、Chromiumによるブラウザテスト
- `npm pack`を用いた配布物のスモークテスト

### 3.2 v0.1に含めないもの

- インターネット上へのViewer公開を前提とした機能
- 信頼できないHTMLを安全に実行するためのsandbox設計
- CSP、nonce、Trusted Types対応
- CDN配布
- 認証、権限管理、共同編集
- Markdown変換
- HTML編集機能
- ファイル監視と自動リロード
- 検索、全文索引
- themeの手動選択UI
- Sidebarのリサイズ
- Plugin API、設定ファイル、独自DSL
- 自動的な`nav.html`生成
- npm以外のパッケージマネージャー固有対応
- Chromium以外のブラウザに対するv0.1での動作保証

## 4. 利用側の契約

### 4.1 ディレクトリ構成

Viewer対象ディレクトリには、`nav.html`と1つ以上の設計書を配置する。

```text
project/
├─ package.json
├─ specs/
│  ├─ nav.html
│  ├─ overview.html
│  ├─ architecture.html
│  ├─ authentication.html
│  ├─ api/
│  │  └─ endpoints.html
│  └─ assets/
│     └─ login-flow.png
└─ node_modules/
```

利用側の`index.html`は不要とする。Viewer Shellはパッケージが提供する。

### 4.2 `nav.html`

`nav.html`は`<nav>`をルートとするHTML fragmentとする。

```html
<nav aria-label="設計書">
  <h2>Overview</h2>
  <a href="./overview.html">Overview</a>
  <a href="./architecture.html">Architecture</a>

  <h2>API</h2>
  <a href="./api/endpoints.html">Endpoints</a>
</nav>
```

リンク先は`nav.html`の配置場所を基準とする相対URLで記述する。

### 4.3 設計書

設計書は標準HTML要素で構成したHTML fragmentとする。DOCTYPE、`html`、`head`、`body`は記述しない。

```html
<article>
  <h1>Authentication</h1>
  <p>Authentication is based on OpenID Connect.</p>

  <h2>Flow</h2>
  <img src="./assets/login-flow.png" alt="Authentication flow">
</article>
```

v0.1では次を利用契約とする。

- 原則として1文書に1つの`h1`を置く。
- 文書タイトルは最初の`h1`から取得する。
- 画像、リンクなどは設計書自身を基準とした相対URLで記述する。
- inline scriptの実行を許可する。
- AIが生成したローカル文書を信頼済みコンテンツとして扱う。
- Viewerなしで直接開いた場合は文章構造が読めればよく、Chart.jsやMermaidの描画は保証しない。

## 5. パッケージ構成

### 5.1 ソース構成

```text
html-docs/
├─ package.json
├─ package-lock.json
├─ tsconfig.json
├─ eslint.config.js
├─ playwright.config.ts
├─ vitest.config.ts
├─ scripts/
│  ├─ build.mjs
│  ├─ clean.mjs
│  └─ test-pack.mjs
├─ src/
│  ├─ globals.d.ts
│  ├─ cli/
│  │  ├─ main.ts
│  │  ├─ errors.ts
│  │  ├─ options.ts
│  │  └─ open-browser.ts
│  ├─ server/
│  │  ├─ start.ts
│  │  ├─ routes.ts
│  │  ├─ static-file.ts
│  │  ├─ mime.ts
│  │  ├─ shell.ts
│  │  ├─ integrations.ts
│  │  └─ types.ts
│  ├─ browser/
│  │  ├─ start.ts
│  │  ├─ constants.ts
│  │  ├─ types.ts
│  │  ├─ layout.ts
│  │  ├─ navigation.ts
│  │  ├─ router.ts
│  │  ├─ document-loader.ts
│  │  ├─ frame.ts
│  │  ├─ links.ts
│  │  └─ title.ts
│  ├─ vendor/
│  │  ├─ chart-theme.ts
│  │  └─ mermaid-adapter.ts
│  └─ styles/
│     ├─ shell.css
│     └─ document.css
├─ examples/
│  ├─ basic/
│  ├─ nested/
│  ├─ charts/
│  └─ mermaid/
└─ tests/
   ├─ unit/
   │  ├─ cli-errors.test.ts
   │  ├─ cli-options.test.ts
   │  ├─ mime.test.ts
   │  ├─ paths.test.ts
   │  └─ router.test.ts
   ├─ server/
   │  └─ server.test.ts
   ├─ browser/
   │  └─ viewer.spec.ts
   └─ fixtures/
      └─ browser/
         ├─ nav.html
         ├─ overview.html
         ├─ nested/
         └─ assets/
```

### 5.2 配布物

```text
dist/
├─ cli.js
└─ browser/
   ├─ viewer.js
   ├─ chart-theme.js
   ├─ mermaid.js
   ├─ shell.css
   └─ document.css
```

publish時は`dist`のみを実行物として含める。Chart.jsとMermaid本体は同梱せず、optional peer dependencyとして利用プロジェクトに導入された配布物をサーバーが検出して配信する。

### 5.3 `package.json`の基本方針

```json
{
  "name": "html-docs",
  "version": "0.1.0",
  "license": "MIT",
  "author": "HTML Docs contributors",
  "type": "module",
  "bin": {
    "html-docs": "dist/cli.js"
  },
  "files": [
    "dist",
    "README.md",
    "RELEASING.md",
    "CHANGELOG.md",
    "CONTRIBUTING.md",
    "docs/authoring.md"
  ],
  "engines": {
    "node": ">=24"
  },
  "publishConfig": {
    "access": "public",
    "registry": "https://registry.npmjs.org/"
  },
  "peerDependencies": {
    "chart.js": "^4.5.1",
    "mermaid": "^11.16.1"
  },
  "peerDependenciesMeta": {
    "chart.js": { "optional": true },
    "mermaid": { "optional": true }
  },
  "scripts": {
    "clean": "node ./scripts/clean.mjs",
    "build": "node ./scripts/build.mjs",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run",
    "test:browser": "playwright test",
    "test:pack": "node ./scripts/test-pack.mjs",
    "check": "npm run typecheck && npm run lint && npm test && npm run build && npm run test:browser && npm run test:pack",
    "release:metadata": "node ./scripts/check-release.mjs",
    "release:check": "npm run release:metadata && npm run check && npm publish --dry-run --ignore-scripts",
    "prepack": "npm run typecheck && npm test && npm run build",
    "prepublishOnly": "npm run release:check"
  }
}
```

実装時の方針は次のとおり。

- `dist/cli.js`の先頭に`#!/usr/bin/env node`を付ける。
- CLIとサーバーは単一の`dist/cli.js`へNode.js向けにbundleする。
- ブラウザコードはES moduleとしてbundleする。
- Chart.jsとMermaidはoptional peer dependencyとし、未導入でもViewerを起動できる。
- 既定ブラウザを開く処理だけは`open`をruntime dependencyとして使用し、CLI bundleではexternalにする。
- Chart.jsは導入済みpackageのUMD、Mermaidは公式ESMと必要なdiagram chunkだけを配信する。
- esbuildの`legalComments: "eof"`を全bundleへ設定し、dependencyのlicense commentを成果物末尾へ保持する。

依存の追加は次のコマンドで行い、実行時点のversionを`package-lock.json`へ固定する。計画書中のversion placeholderを手作業でpackage.jsonへ転記しない。

```bash
npm install open
npm install --save-dev typescript esbuild vitest @playwright/test @types/node chart.js mermaid eslint @eslint/js typescript-eslint globals
npx playwright install chromium
```

## 6. 実行時アーキテクチャ

```text
npm script / npx
        │
        ▼
 html-docs CLI
        │
        ├─ 対象ディレクトリ検証
        ├─ HTTPサーバー起動
        └─ ブラウザ起動
                │
                ▼
          Viewer Shell
                │
                ├─ nav.htmlを取得
                ├─ URLを状態源として文書を選択
                └─ iframe srcdocを生成
                         │
                         ├─ document.css
                         ├─ Chart.js（導入時のみ）
                         ├─ Chart theme adapter（Chart.js導入時のみ）
                         ├─ Mermaid（導入時のみ、図種を遅延load）
                         └─ HTML設計書
```

ブラウザの現在URLを、現在表示中の文書を示すsource of truthとする。別の永続状態は持たない。

### 6.1 モジュール依存方向

依存方向を次で固定し、逆方向のimportを作らない。

```text
cli/main
├─ cli/options
├─ cli/open-browser
└─ server/start
   ├─ server/routes
   │  ├─ server/static-file
   │  ├─ server/mime
   │  └─ server/shell
   └─ server/types

browser/start
├─ browser/layout
├─ browser/navigation ── browser/router
├─ browser/router
├─ browser/document-loader
├─ browser/frame
├─ browser/links ─────── browser/router
├─ browser/title
├─ browser/constants
└─ browser/types
```

- `cli`は`browser` sourceをimportしない。
- `server`はBrowser bundleを静的ファイルとして配信するだけで、Browser内部状態を知らない。
- Browser moduleはNode.js moduleをimportしない。
- `navigation.ts`と`links.ts`はURL変換のため`router.ts`をimportしてよい。それ以外のfeature module間importは作らない。
- `start.ts`がfeature moduleを組み合わせる。循環参照を作らない。
- barrel fileは作らず、必要なmoduleを直接importする。

### 6.2 Node側の型と関数契約

次のsignatureを基準に実装する。テストからも同じ関数を直接呼べるよう、CLIのtop-level処理以外はexportする。

```ts
// src/cli/options.ts
export interface CliRunOptions {
  contentRoot: string;
  host: string;
  port: number;
  openBrowser: boolean;
}

export type CliCommand =
  | { kind: "run"; options: CliRunOptions }
  | { kind: "help" }
  | { kind: "version" };

export class CliUsageError extends Error {}

export function parseCliCommand(
  args: readonly string[],
  cwd: string,
): CliCommand;

// src/server/types.ts
export interface StartServerOptions {
  contentRoot: string;
  runtimeRoot: string;
  host: string;
  port: number;
}

export interface RunningServer {
  origin: string;
  port: number;
  close(): Promise<void>;
}

// src/server/start.ts
export function startServer(
  options: StartServerOptions,
): Promise<RunningServer>;

// src/server/mime.ts
export function getContentType(filePath: string): string;

// src/server/static-file.ts
export class InvalidRequestPathError extends Error {}
export function resolveRequestFile(
  root: string,
  encodedRelativePath: string,
): Promise<string | null>;
export function sendFile(
  request: import("node:http").IncomingMessage,
  response: import("node:http").ServerResponse,
  filePath: string,
): Promise<void>;

// src/server/shell.ts
export function createShellHtml(): string;

// src/server/routes.ts
export function createRequestHandler(
  options: Pick<StartServerOptions, "contentRoot" | "runtimeRoot">,
): import("node:http").RequestListener;

// src/cli/open-browser.ts
export function openViewer(url: string): Promise<void>;
```

契約は次のとおり。

- `parseCliCommand`は`node:util`の`parseArgs`を使用する。
- `parseCliCommand`はfilesystemへアクセスしない。構文、型、値域だけを検証する。
- `contentRoot`は`resolve(cwd, directory)`で得た絶対パスを返す。
- CLIの`main`が`stat`と`nav.html`の存在確認を担当する。
- `startServer`はlisten完了後にresolveし、listen失敗時にrejectする。
- port `0`を渡した場合、`RunningServer.port`と`origin`にはOSが割り当てた実portを返す。
- `origin`は`http` scheme、指定host、実portから作り、末尾slashを含めない。IPv6 hostはURL中で角括弧を付ける。
- `close`は複数回呼ばれても失敗しない。
- `resolveRequestFile`は不正encodingまたは不正segmentで`InvalidRequestPathError`をthrowし、root配下の通常ファイルなら絶対パス、存在しないかroot外なら`null`を返す。
- `sendFile`はContent-Type、Content-Length、Cache-Controlを設定し、HEADではstreamを開始しない。
- `openViewer`は`open(url, { wait: false })`を呼び、browser processの終了は待たない。
- CLIのtop-level以外で`process.exit`を呼ばない。
- `unknown`のerrorは`instanceof Error`で絞り込み、`any`へcastしない。

### 6.3 Browser側の型と関数契約

```ts
// src/browser/types.ts
export interface RouteState {
  doc: string | null;
  // 空文字または「#」で始まる文字列
  hash: string;
}

export type RouteParseResult =
  | { kind: "missing"; route: RouteState }
  | { kind: "valid"; route: RouteState & { doc: string } }
  | { kind: "invalid"; rawDoc: string; hash: string };

export interface ViewerElements {
  root: HTMLDivElement;
  menuButton: HTMLButtonElement;
  title: HTMLSpanElement;
  sidebar: HTMLElement;
  status: HTMLDivElement;
  frame: HTMLIFrameElement;
}

export type LoadState =
  | { kind: "idle" }
  | { kind: "loading"; doc: string }
  | { kind: "ready"; doc: string; title: string }
  | { kind: "error"; doc: string | null; message: string };

export interface NavigationItem {
  anchor: HTMLAnchorElement;
  doc: string;
  hash: string;
}
```

主要関数は次の責務に固定する。

```ts
// layout.ts
export function createLayout(container: HTMLElement): ViewerElements;
export function renderLoadState(elements: ViewerElements, state: LoadState): void;

// router.ts
export function parseRoute(url: URL): RouteParseResult;
export function normalizeDocumentPath(value: string): string | null;
export function createShellUrl(route: RouteState, base: URL): URL;
export function createContentUrl(doc: string, base: URL): URL;
export function documentPathFromContentUrl(url: URL): string | null;

// navigation.ts
export function mountNavigation(
  container: HTMLElement,
  html: string,
  contentBaseUrl: URL,
): NavigationItem[];
export function updateActiveNavigation(
  items: readonly NavigationItem[],
  route: RouteState,
): void;

// frame.ts
export function buildSrcdoc(fragment: string, documentUrl: URL): string;

// title.ts
export function getFrameTitle(frameDocument: Document, doc: string): string;

// document-loader.ts
export class DocumentHttpError extends Error {
  readonly status: number;
}
export function fetchDocument(url: URL, signal: AbortSignal): Promise<string>;

// links.ts
export function isPlainPrimaryClick(event: MouseEvent): boolean;
```

`browser/start.ts`が上記を組み合わせ、現在の`AbortController`、現在のroute、navigation itemsだけをmodule内の一時状態として保持する。表示文書の永続的な正解は常に`location.href`とする。

## 7. CLI仕様

### 7.1 コマンド

```text
html-docs [directory] [options]
```

### 7.2 引数とオプション

| 項目 | 既定値 | 内容 |
| --- | --- | --- |
| `directory` | `./specs` | Viewer対象ディレクトリ |
| `--host` | `127.0.0.1` | listenするhost |
| `--port` | `4173` | listenするport。`0`はテスト用の自動割り当て |
| `--open` | 有効 | 起動後にブラウザを開く |
| `--no-open` | - | ブラウザを開かない |
| `--help` | - | 使用方法を表示 |
| `--version` | - | package versionを表示 |

### 7.3 起動処理

1. `parseArgs`へ`process.argv.slice(2)`、`allowPositionals: true`、`strict: true`を渡す。option schemaは`host: string`、`port: string`、`open: boolean`、`no-open: boolean`、`help: boolean`、`version: boolean`とする。
2. positional argumentが2件以上なら`CliUsageError`にする。
3. `--help`と`--version`が同時指定されたら`CliUsageError`にする。片方だけなら対応する`CliCommand`を返し、run用option validationは行わない。
4. `--open`と`--no-open`が同時指定されたら`CliUsageError`にする。
5. port文字列が`^[0-9]+$`に一致することを確認して10進整数へ変換し、`0`から`65535`以外なら`CliUsageError`にする。
6. hostがtrim後に空なら`CliUsageError`にする。
7. `directory`を現在ディレクトリ基準で絶対パスにする。
8. CLI mainが`stat`でdirectoryの存在と、directoryであることを検証する。
9. CLI mainが`<directory>/nav.html`を`stat`と`access(R_OK)`で検証する。
10. `runtimeRoot`を`fileURLToPath(new URL("./browser/", import.meta.url))`で求める。
11. HTTPサーバーを起動する。
12. `HTML Docs: <origin>/`の1行を標準出力へ表示する。この形式をpack testからも利用するため変更しない。
13. `--open`が有効なら`openViewer`を呼ぶ。browser起動だけが失敗した場合はwarningを表示し、サーバーは停止しない。
14. `SIGINT`または`SIGTERM`を最初に受けたときだけ`close`を呼び、完了後に終了code `0`で終了する。

### 7.4 CLIエラー

`--help`と`--version`は標準出力へ表示して終了code `0`とする。それ以外の次のケースでは、`html-docs: <message>`を標準エラーへ1件表示し、終了code `1`とする。

- 対象ディレクトリが存在しない。
- 対象がディレクトリではない。
- `nav.html`が存在しない。
- portが使用中でlistenできない。
- 引数またはオプションが不正である。

主要messageを次で固定する。`<path>`、`<port>`には実値を入れる。

| 条件 | message |
| --- | --- |
| directoryなし | `対象ディレクトリが見つかりません: <path>` |
| directoryでない | `対象パスはディレクトリではありません: <path>` |
| navなし | `nav.htmlが見つかりません: <path>` |
| nav読み取り不能 | `nav.htmlを読み取れません: <path>` |
| port使用不能 | `ポートを使用できません: <port>` |
| option不正 | `引数が不正です: <reason>` |

stack traceは通常表示しない。予期しないerrorだけ、`HTML_DOCS_DEBUG=1`の場合にstack traceも表示する。

## 8. HTTPサーバー仕様

### 8.1 URL空間

| URL | 応答 |
| --- | --- |
| `/` | パッケージが生成するViewer Shell |
| `/_html-docs/viewer.js` | Browser Viewer bundle |
| `/_html-docs/shell.css` | Shell CSS |
| `/_html-docs/document.css` | Document CSS |
| `/_html-docs/chart-theme.js` | Chart.jsのlight／dark既定色adapter |
| `/_html-docs/mermaid.js` | Mermaid loader |
| `/_html-docs/integrations/chart.js` | 導入済みChart.jsのUMD |
| `/_html-docs/integrations/mermaid/<path>` | 導入済みMermaidのESMとchunk |
| `/_content/nav.html` | 利用側の`nav.html` |
| `/_content/<path>` | 利用側の設計書またはasset |

`/_html-docs/`と`/_content/`を予約prefixとし、Viewerの資産と利用側ファイルを混在させない。

### 8.2 静的配信

- Node.js標準の`node:http`、`node:fs`、`node:path`を基本とする。
- v0.1で必要なMIME typeを明示的に対応する。
  - HTML、CSS、JavaScript、JSON
  - PNG、JPEG、GIF、SVG、WebP
  - WOFF、WOFF2
- 未知の拡張子は`application/octet-stream`とする。
- text系にはUTF-8 charsetを付与する。
- contentとShellはローカル編集後の再読み込みを妨げないよう`Cache-Control: no-store`とする。runtimeとintegrationは文書遷移ごとの再取得を避けるため`private, max-age=300`とする。
- `HEAD`を`GET`と同じheaderでbodyなしとして扱う。
- 対象外methodは`405 Method Not Allowed`を返す。
- 存在しないファイルは`404 Not Found`を返す。
- 予期しない読み込みエラーは`500 Internal Server Error`を返し、詳細はCLI側へ表示する。
- response bodyはHTML routeではUTF-8 HTML、その他のerrorではUTF-8 plain textにする。
- directory listingとindex fileの暗黙補完は行わない。
- file bodyは`createReadStream`で返し、ファイル全体をmemoryへ読み込まない。

### 8.3 パス処理

ローカル専用であっても、誤ったパス解決で対象ディレクトリ外を配信しないようにする。

1. `new URL(request.url ?? "/", "http://localhost")`でrequest URLをparseする。pathnameだけを使い、parse不能なら`400`を返す。
2. pathnameをsegment単位で`decodeURIComponent`する。decode不能またはNULを含む場合は`400`を返す。
3. `/_content/`より後ろを相対パスとして扱う。
4. 空segment、`.`、`..`、backslashを含むsegmentを拒否する。
5. segmentを`resolve(contentRoot, ...segments)`でOS上の絶対パスにする。
6. `relative(contentRoot, resolvedPath)`が`..`から始まるか絶対パスなら`404`を返す。
7. `stat`結果が通常ファイルでなければ`404`を返す。directoryは配信しない。
8. `realpath`でrootと対象fileを正規化し、symbolic linkの実体がroot外なら`404`を返す。

Runtime assetも同じhelperで解決し、rootだけを`runtimeRoot`へ差し替える。`runtimeRoot`は`dist/cli.js`と同じ階層にある`dist/browser/`を指す。server testではfixture runtime rootを明示的に渡し、source tree上の`dist`へ依存させない。

## 9. Viewer Shell仕様

サーバーは`/`に最小限の完全なHTML documentを返す。

```html
<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Documentation</title>
  <link rel="stylesheet" href="/_html-docs/shell.css">
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/_html-docs/viewer.js"></script>
</body>
</html>
```

Browser bundleは次のDOMを構築する。

```text
div.viewer
├─ header.viewer-header
│  ├─ button.menu-button
│  └─ span.viewer-title
├─ aside.viewer-sidebar
│  └─ nav content
└─ main.viewer-main
   ├─ div.viewer-status
   └─ iframe.viewer-document
```

iframeには現在の文書名を使った`title`属性を設定する。

Viewer起動時は次の順番を変えない。

1. `#app`が存在することを確認する。なければ例外にする。
2. `createLayout`でShell DOMを作る。
3. `loading`状態を表示する。
4. `/_content/nav.html`を取得する。
5. navigationをmountし、Viewer内文書linkの一覧を得る。
6. `location.href`を`parseRoute`する。
7. URLに有効な`doc`がなければ最初のnavigation itemを選び、`replaceState`する。
8. 対象文書を読み込む。
9. Sidebar、iframe、`popstate`、`hashchange`、mobile menuのevent listenerを登録する。

起動途中で失敗した場合は`error`状態を表示し、未処理のPromise rejectionを残さない。

## 10. ナビゲーション仕様

### 10.1 初期化

1. `/_content/nav.html`をfetchする。
2. responseが`ok`でなければ例外にする。
3. `DOMParser`の`text/html`としてparseする。このparse中にscriptは実行しない。
4. 最初の`nav`を取得する。存在しない場合は「nav.htmlにnav要素がありません」として例外にする。
5. `nav`をShellのSidebarへ移す。
6. 各`a[href]`を`new URL(anchor.getAttribute("href"), contentBaseUrl)`で解決する。
7. 解決後のURLをanchorの`href`へ設定し、修飾キーによる新規tabではraw HTML URLを開けるようにする。
8. Viewer内文書へのlinkだけを`NavigationItem`として返す。

### 10.2 リンク分類

次をViewer内文書リンクとして扱う。

- 同一originである。
- pathnameが`/_content/`配下である。
- pathnameが`.html`で終わる。
- `target`と`download`が指定されていない。

`javascript:` URLは実行せず、click handlerで`preventDefault`する。`href`が空、URLとしてparse不能、または`doc`へ変換不能なlinkはnavigation itemへ含めず、browser consoleへwarningを1件出す。

次はブラウザ標準動作へ委ねる。

- `http:`または`https:`の外部リンク
- `mailto:`、`tel:`
- `target`または`download`付きリンク
- Ctrl、Cmd、Shift、Altを伴うクリック

### 10.3 active表示

- 現在の`doc`と一致するSidebarリンクへ`aria-current="page"`を付ける。
- 前のactive linkから`aria-current`を除去する。
- ネストした相対パスも正規化後の値で比較する。

文書表示完了時のタイトルは次の順で決める。

1. iframe document内の最初の`h1`の、trim後に空でない`textContent`
2. `doc`の最後のpath segmentから`.html`を除いた文字列

決定したタイトルをHeaderの`.viewer-title`とiframeの`title`へ設定し、Shellの`document.title`は`<title> — HTML Docs`とする。

## 11. URLルーティング仕様

### 11.1 URL形式

```text
http://127.0.0.1:4173/?doc=authentication.html
http://127.0.0.1:4173/?doc=api%2Fendpoints.html
```

`doc`には対象ディレクトリからのPOSIX形式相対パスを格納する。先頭の`/`は含めない。

文書内アンカーはShell URLのhashとして保持する。

```text
/?doc=authentication.html#token-rotation
```

### 11.2 文書パスの正規化

`normalizeDocumentPath`は次のすべてを満たす場合だけ正規化した文字列を返し、それ以外は`null`を返す。

1. 空文字ではない。
2. 先頭が`/`またはbackslashではない。
3. NULとbackslashを含まない。
4. `/`で分割した各segmentが空、`.`、`..`ではない。
5. 最後のsegmentが大文字小文字を区別せず`.html`で終わる。

Unicode、space、hyphen、underscoreは許可する。内部の`doc`はdecode済みのPOSIX相対パスとし、content URLを作るときだけ各segmentへ`encodeURIComponent`を適用する。slash全体をまとめてencodeしない。

`createShellUrl`はbase URLから既存queryとhashを除去し、有効な`doc`だけを`URLSearchParams.set("doc", doc)`で設定してからhashを設定する。未知のquery parameterは保持しない。

### 11.3 初期文書

表示対象は次の優先順で決める。

1. URL queryの、正規化に成功した`doc`
2. `nav.html`内で最初に見つかったViewer内文書リンク

queryに`doc`が存在するが正規化に失敗した場合は、navigationへfallbackせず「文書パスが不正です」と表示する。query自体が存在しない場合だけ最初のnavigation itemへfallbackする。どちらも存在しない場合は、文書領域へ「表示可能な設計書がありません」と表示する。

### 11.4 履歴

- ユーザー操作による文書遷移は`history.pushState`を使う。
- 初期URLの正規化には`history.replaceState`を使う。
- `popstate`でURLから文書を再選択する。
- `hashchange`では文書を再取得せず、現在iframe内の表示位置だけを同期する。
- 同一文書内のアンカー移動では不要な文書fetchを行わない。
- 再読み込み後もqueryとhashから同じ文書・位置へ復元する。

遷移処理は`navigate(route, historyMode)`相当の1か所へ集約する。Sidebar click、iframe click、`popstate`、初期表示から直接fetch処理を呼ばない。`historyMode`は`push`、`replace`、`none`の3値とし、`popstate`では`none`を使う。`hashchange`はfetchを伴う`navigate`を呼ばず、scroll同期だけを行う。

### 11.5 `navigate`処理

1. `route.doc`が`null`なら`idle`を表示して終了する。
2. `normalizeDocumentPath`が失敗したら`error`を表示して終了する。
3. `historyMode`が`push`なら`pushState`、`replace`なら`replaceState`でShell URLを反映する。`none`ではhistoryを変更しない。
4. `doc`が現在iframeへ表示済みのdocと同じなら、active navigationとhash scrollだけを更新して終了する。
5. 異なるdocなら12.1節のDocument読み込みを実行する。
6. `AbortError`は無視する。
7. `DocumentHttpError`はstatusに応じたmessageへ変換し、それ以外は一般error messageへ変換する。
8. error時もShell URLは選択したrouteのまま保持し、再読み込みで同じerrorを再現できるようにする。

`popstate` handlerは`location.href`をparseして`navigate(..., "none")`を呼ぶ。`hashchange` handlerは、parse結果のdocが現在表示中のdocと同じ場合だけhash scrollを行う。両eventが同じ履歴移動で連続してもDocument fetchは1回以下になることをbrowser testで確認する。

## 12. Document読み込みとiframe仕様

### 12.1 読み込み

1. 既存の`AbortController`があればabortする。
2. 新しい`AbortController`を作り、`loading`状態を表示する。
3. `doc`を`createContentUrl`で`/_content/`配下のURLへ変換する。
4. `signal`付きでHTMLをfetchする。
5. responseが`ok`でなければHTTP statusを持つerrorへ変換する。
6. response bodyをtextとして読む。
7. `buildSrcdoc`で完全なiframe documentを組み立てる。
8. iframeの次回`load`を待つlistenerを、`srcdoc`設定前に1回だけ登録する。
9. iframeの`srcdoc`へ設定する。
10. `load`後、今回のcontrollerが現在のcontrollerでなければ何も更新せず終了する。
11. タイトル、文書内link listener、active navigationを同期する。
12. `ready`状態を表示する。
13. Shell URLにhashがあれば、iframe内の対応する`id`または`name`へscrollする。

abortされたrequestはerror表示へ遷移させない。fetch、body読み込み、iframe loadの各await後に、現在のcontrollerと一致することを確認する。

### 12.2 生成するiframe document

概念的には次の構造とする。実装では属性値の文字列連結を避け、DOM APIで構築してserializeする。

```html
<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <base href="http://127.0.0.1:4173/_content/authentication.html">
  <link rel="stylesheet" href="/_html-docs/document.css">
  <!-- 導入済みのintegrationだけを追加する -->
  <script src="/_html-docs/integrations/chart.js"></script>
  <script src="/_html-docs/chart-theme.js"></script>
  <script type="module" src="/_html-docs/mermaid.js"></script>
</head>
<body>
  <!-- fetchしたHTML fragment -->
</body>
</html>
```

`base`には常に現在の設計書URLを設定する。これにより、画像やリンクは設計書自身のディレクトリを基準に解決される。

`buildSrcdoc`は次の手順で文字列を返す。

1. `document.implementation.createHTMLDocument("")`で一時documentを作る。
2. `documentElement.lang`を`ja`にする。
3. 自動生成されたtitleを削除する。
4. `documentUrl.origin`とBrowser定数からDocument CSSと、有効なintegrationだけの絶対URLを作る。hostやportをhard-codeしない。
5. charset、viewport、base、Document CSS、Chart.js、Chart theme adapter、Mermaid loaderの順で、有効な要素だけをheadへappendする。
6. `body.innerHTML = fragment`でHTML fragmentを挿入する。
7. `<!doctype html>\n`と`documentElement.outerHTML`を連結する。

Chart.jsとChart theme adapterのscriptには`async`と`defer`を付けず、body内のinline scriptより先にtheme設定済みの`globalThis.Chart`を提供する。Mermaid loaderはmoduleとして読み込み、DOM構築後に描画する。

### 12.3 文書内リンク

- iframeはsandboxなしで使用する。
- iframeの読み込み後、同一originの`contentDocument`へclick listenerを登録する。
- Viewer内文書リンクはShell routingへ渡す。
- 同一文書内のhashリンクはShell URLのhashと同期する。
- 外部リンクや修飾キー付きクリックはブラウザ標準動作へ委ねる。

click handlerはevent targetから`closest("a[href]")`を探し、`isPlainPrimaryClick`が`true`の場合だけ処理する。同一文書内hashまたは別のViewer内HTML文書なら`preventDefault`してShellの`navigate`へ渡す。それ以外は何もしない。

hashをscrollするときは`decodeURIComponent(location.hash.slice(1))`を試し、decode不能なら元の文字列を使う。`getElementById`、次に`getElementsByName`の順で対象を探し、見つかった場合だけ`scrollIntoView()`する。

### 12.4 読み込み状態

状態は次の4種類に限定する。

- `idle`: 初期化前または表示対象なし
- `loading`: 文書を取得中
- `ready`: 文書を表示中
- `error`: 文書取得または表示に失敗

新しい遷移が始まった場合は、古いfetchを`AbortController`で中止する。遅い古い応答で新しい画面を上書きしない。

`renderLoadState`のDOM動作を次で固定する。

- `idle`: statusを空にし、iframeを非表示にする。
- `loading`: statusへ「読み込み中…」を表示し、`role="status"`を付け、iframeを非表示にする。
- `ready`: statusを空にし、iframeを表示する。
- `error`: statusへmessageを表示し、`role="alert"`を付け、iframeを非表示にする。

### 12.5 エラー表示

- `404`: 「設計書が見つかりません」と対象パスを表示する。
- その他のHTTPエラー: status codeと再読み込み案内を表示する。
- HTML parseまたはiframe生成エラー: 「設計書を表示できません」と表示し、browser consoleへ詳細を出す。
- nav読み込み失敗: Sidebarと文書領域の両方に起動不能であることを表示する。

## 13. Chart.jsとMermaid

### 13.1 Chart.js

- `chart.js`をoptional peer dependencyとする。
- CLI起動時に`chart.js/auto`を解決し、同packageの`dist/chart.umd.min.js`を検出する。
- 導入済みの場合だけ`/_html-docs/integrations/chart.js`でUMDを配信し、iframe内の`globalThis.Chart`を提供する。
- 未導入の場合はChart scriptをiframeへ追加せず、通常のViewer機能を継続する。
- 利用側は通常のChart.jsコードを書ける。
- `chart-theme.ts`は初回表示時の`prefers-color-scheme`に応じて、文字、grid、tooltipの既定色を設定する。
- DOM要素の暗黙globalには依存せず、`document.getElementById`を使用する例をREADMEへ掲載する。
- TypeScriptではadapter内だけに必要なglobal型宣言を置き、Browser Viewer本体からChartへ依存しない。

```html
<canvas id="latency-chart"></canvas>
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

### 13.2 Mermaid

- `.mermaid`を持つ要素を対象とする。
- `mermaid`をoptional peer dependencyとする。
- CLI起動時に公式`dist/mermaid.esm.min.mjs`を検出し、ESMと相対chunkを`/_html-docs/integrations/mermaid/`で配信する。
- `mermaid-adapter.ts`はruntime URLから公式ESMをdynamic importし、`startOnLoad: false`、`securityLevel: "loose"`、初回表示時の`prefers-color-scheme`に応じたthemeで初期化する。
- adapter bundleは小さなES moduleとして出力する。Mermaid本体と全diagram typeを単一bundleへまとめない。
- 未導入の場合はMermaid loaderをiframeへ追加せず、source textをそのまま表示する。
- `DOMContentLoaded`後に`mermaid.run({ querySelector: ".mermaid" })`を1回呼ぶ。
- Mermaidの設定は上記で固定し、利用側から変更するAPIを作らない。
- HTML fragment側にMermaid初期化scriptを書かせない。
- 描画失敗はcatchしてbrowser consoleへ出し、他の文書表示とnavigationは継続する。

```html
<pre class="mermaid">
sequenceDiagram
  Browser->>API: Login
  API-->>Browser: Session
</pre>
```

## 14. CSS方針

### 14.1 Shell CSS

Shell CSSは次だけを担当する。

- Header、Sidebar、Document領域のlayout
- mobile幅でのSidebar表示切り替え
- navigationのactive、hover、focus表示
- loading、error表示
- iframeの幅と高さ

desktopではHeaderを高さ`48px`、Sidebarを幅`280px`、Document領域を残り幅とする。iframeはborderなしでDocument領域の幅と高さを埋め、Shell body自体はscrollさせない。`768px`未満ではSidebarをoverlayとして既定で閉じ、menu buttonで開閉する。文書遷移後はmobile Sidebarを閉じる。

### 14.2 Document CSS

Document CSSはsemantic HTMLの既定表示だけを担当する。

- body、article、section
- h1からh6
- p、a、ul、ol、dl
- table、th、td
- pre、code
- blockquote、aside
- details、summary
- figure、figcaption、img
- canvas、SVG
- hr、mark、kbd、abbr、sub、sup、caption
- `aside[data-type]`によるnote、warning、danger、success callout

CSS Custom Propertiesは内部実装として使用してよいが、v0.1では公開theme APIとして互換性を保証しない。ShellとDocumentは`prefers-color-scheme`へ自動追従し、light／dark双方で十分なcontrastを保つ。手動切り替えUIとOS設定変更後のintegration再描画は提供しない。

Document body自身を`box-sizing: border-box`、`max-width: 920px`、`margin: 0 auto`として中央寄せし、desktopで`32px`、mobileで`16px`のpaddingを持たせる。横長tableと`pre`は要素単位で横scrollさせ、ページ全体の不要な横scrollを発生させない。画像とSVGには`max-width: 100%`を設定する。

### 14.3 アクセシビリティ最低要件

- keyboardでSidebar linkへ移動できる。
- focus indicatorを消さない。
- active linkへ`aria-current="page"`を付ける。
- iframeへ内容を表す`title`を付ける。
- mobile menu buttonへ`aria-expanded`と`aria-controls`を付ける。
- mobile Sidebarは閉じている間`inert`と`aria-hidden="true"`にし、画面外linkへfocusしない。
- Escapeでmobile Sidebarを閉じ、menu buttonへfocusを戻す。
- `prefers-reduced-motion: reduce`ではSidebar transitionを無効にする。
- 文字色と背景色は通常テキストでWCAG AA相当のcontrastを目標とする。

## 15. ビルド計画

### 15.1 Node bundle

- entry point: `src/cli/main.ts`
- platform: `node`
- format: `esm`
- target: Node.js 24
- CLIから必要なサーバーコードをbundleする。
- `open`だけをexternalとして残す。
- `banner.js`に`#!/usr/bin/env node`を設定する。
- build scriptが`package.json`のversionを読み、`define`で`__HTML_DOCS_VERSION__`へ埋め込む。`src/globals.d.ts`でこの定数をdeclareし、CLIの`--version`はこの値を表示する。
- minifyとsourcemapは無効にする。

### 15.2 Browser bundle

- entry point: `src/browser/start.ts`
- platform: `browser`
- format: `esm`
- target: `es2022`
- `src/browser/start.ts`を`dist/browser/viewer.js`へ出力する。
- `src/vendor/chart-theme.ts`をformat `iife`で`dist/browser/chart-theme.js`へ出力する。
- `src/vendor/mermaid-adapter.ts`をformat `esm`で`dist/browser/mermaid.js`へ出力する。Mermaid本体はbundleしない。
- `src/styles/shell.css`と`document.css`は変換せず`dist/browser/`へcopyする。
- すべてminifyとsourcemapを無効にする。

### 15.3 build scriptの処理順

`scripts/build.mjs`は次の順で処理し、途中で失敗したら非0で終了する。

1. `dist`を再帰的に削除する。
2. `dist/browser`を作る。
3. CLI bundleを生成する。
4. Viewer bundleを生成する。
5. Mermaid loader bundleを生成する。
6. Chart theme adapter bundleを生成する。
7. 2つのCSSをcopyする。
8. 次の6ファイルが通常ファイルとして存在することを検証する。
   - `dist/cli.js`
   - `dist/browser/viewer.js`
   - `dist/browser/shell.css`
   - `dist/browser/document.css`
   - `dist/browser/mermaid.js`
   - `dist/browser/chart-theme.js`
9. `chmod 0o755`で`dist/cli.js`へ実行権限を付ける。

`scripts/clean.mjs`は`dist`だけを削除し、存在しない場合も0で終了する。

### 15.4 TypeScriptとlint

`tsconfig.json`は少なくとも次を有効にする。

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "tests", "scripts", "*.config.ts"]
}
```

BrowserとNodeの両方を同一projectでtypecheckする。Node専用globalをBrowser moduleで使用しない。ESLintはflat configと`typescript-eslint`のrecommended type-checked rulesを使い、generated `dist`、Playwright output、pack testの一時directoryをignoreする。

### 15.5 再現性

- lockfileをcommitする。
- build前に`dist`をcleanする。
- build後に必要ファイル一覧を検証する。
- `npm pack --dry-run`で意図しないsource、test、fixtureが含まれないことを確認する。

## 16. テスト計画

### 16.1 単体テスト

`vitest.config.ts`の既定environmentを`node`にし、test fileと対象を次で固定する。

| test file | 必須ケース |
| --- | --- |
| `cli-options.test.ts` | 引数なし、directory指定、全option、port `0`、port境界値、不正整数、未知option、複数directory、`--open`競合 |
| `mime.test.ts` | 対応する全拡張子、大文字拡張子、未知拡張子 |
| `paths.test.ts` | nested path、space、Unicode、`.`、`..`、backslash、NUL、malformed percent encoding、root外path |
| `router.test.ts` | queryなし、有効doc、不正doc、encoded slash、space、Unicode、hash、content URLとの往復、未知queryの除去 |

DOMを必要とする`navigation.ts`と`frame.ts`の細部はunit testでDOM emulatorを追加せず、Playwrightで検証する。v0.1ではjsdomをdependencyへ追加しない。

### 16.2 サーバー統合テスト

`tests/server/server.test.ts`から`startServer`を直接呼ぶ。`port: 0`、一時content fixture、テスト用runtime fixtureを渡し、返された`origin`へNode.jsのglobal `fetch`でrequestする。

- `/`がShell HTMLを返す。
- `/_html-docs/viewer.js`、2つのCSS、2つのvendor scriptが200を返す。
- `/_content/nav.html`が利用側ファイルを返す。
- nested HTMLと画像を正しいContent-Typeで返す。
- `HEAD`がbodyなしで返る。
- 存在しないファイルが404になる。
- 対象ディレクトリ外のパスを取得できない。
- 未対応methodが405になる。
- 終了処理でlisten socketが閉じる。
- malformed URLが400になる。
- 通常ファイルでないdirectory requestが404になる。

各testは`afterEach`で`RunningServer.close()`と一時directory削除を必ず行う。失敗したtestでもlisten socketと一時fileを残さない。

### 16.3 ブラウザテスト

`playwright.config.ts`はtest directoryを`tests/browser`、browserをChromiumだけにする。`webServer.command`は`node dist/cli.js ./tests/fixtures/browser --port 4173 --no-open`、`webServer.url`は`http://127.0.0.1:4173/`、`reuseExistingServer`は`false`とする。browser fixtureには基本文書、nested文書、画像、Chart、Mermaidを1つのnavigation配下に置く。`npm run test:browser`の前提として`npm run build`済みであることをREADMEと`check` scriptで保証する。

`tests/browser/viewer.spec.ts`で次を検証する。

- 初期表示で最初のnavigation itemが開く。
- query指定した文書が直接開く。
- Sidebarから文書を遷移できる。
- iframe内リンクから別文書へ遷移できる。
- nested文書の相対画像が表示される。
- 文書内アンカーへ移動できる。
- 戻る、進む、再読み込みで表示文書が一致する。
- hash付き履歴移動でDocument fetchが重複しない。
- active navigationとdocument titleが更新される。
- 404時にViewerが残ったままエラーを表示する。
- MermaidがSVGへ変換される。
- Chart.jsがcanvasへ描画する。
- mobile viewportでmenu buttonを操作できる。

iframe内要素はPlaywrightの`frameLocator("iframe.viewer-document")`から取得する。Chart.jsはcanvasが存在するだけでなく、iframe内でChart instanceが作成されcanvasのpixel dataが変化したことを確認する。Mermaidは`.mermaid svg`の出現を待つ。

### 16.4 配布物スモークテスト

`scripts/test-pack.mjs`はworkspace上のsourceを直接参照せず、次の手順を自動実行する。

1. `mkdtemp`でworkspace外の一時directoryを作る。
2. `npm pack --json --silent`をchild processで実行し、JSONから生成tarballの絶対パスを取得する。
3. 一時directoryで`npm init --yes`を実行する。
4. 最小の`specs/nav.html`、`specs/overview.html`、`specs/assets/pixel.svg`を作る。
5. `npm install --save-dev <tarball>`を実行する。
6. `npm exec -- html-docs ./specs --port 0 --no-open`をspawnする。
7. stdoutの`HTML Docs: <origin>/`を最大10秒待ち、originを取得する。
8. root、navigation、overview、assetへfetchし、statusと主要contentを確認する。
9. root HTMLが`/_html-docs/viewer.js`を参照し、そのassetが200になることを確認する。
10. child processへ`SIGINT`を送り、最大5秒以内に終了code `0`となることを確認する。
11. `finally`でchild process、tarball、一時directoryを削除する。

pack test自身ではconsumer projectにbuild scriptを追加せず、`npm exec`以外のconsumer側コマンドを実行しない。これを「利用側buildなし」の検証とする。

## 17. 実装マイルストーン

実装者はT0.1からT5.3まで番号順に進める。各taskの確認が失敗した場合は次へ進まず、そのtask内で修正する。異なるtaskのついで実装を行わない。

### M0: プロジェクト基盤

#### T0.1 npmと開発toolの初期化

対象file:

- `package.json`
- `package-lock.json`
- `.gitignore`

作業:

1. `npm init --yes`を実行する。
2. package名、version、type、bin、files、engines、scriptsを5.3節どおりに設定する。
3. 5.3節の`npm install`コマンドでdependencyを追加する。
4. `.gitignore`へ`node_modules/`、`dist/`、`test-results/`、`playwright-report/`、`*.tgz`を追加する。

確認:

```bash
npm install
npm ls --depth=0
```

#### T0.2 TypeScript、lint、test設定

対象file:

- `tsconfig.json`
- `eslint.config.js`
- `vitest.config.ts`
- `playwright.config.ts`
- `src/globals.d.ts`
- `src/cli/main.ts`
- `src/browser/start.ts`

作業:

1. 15.4節のTypeScript optionを設定する。
2. ESLint flat configを作り、source、script、testを対象にする。
3. VitestをNode environment、test timeout 5秒で設定する。testが0件なら失敗させる。
4. PlaywrightをChromiumのみ、test timeout 15秒で設定する。
5. TypeScriptの入力が0件にならないよう、CLIとBrowser entryに`export {}`だけの最小fileを置く。

確認:

```bash
npm run typecheck
npm run lint
npm test
```

testが0件の場合は設定誤りとして失敗させる。

#### T0.3 build pipelineの作成

対象file:

- `scripts/build.mjs`
- `scripts/clean.mjs`
- `src/vendor/mermaid-adapter.ts`
- `src/styles/shell.css`
- `src/styles/document.css`

作業:

1. CLIとBrowserの最小entryをbuild対象にする。
2. 15.3節の順序でbuild scriptを実装する。
3. `dist/cli.js`へshebangと実行権限を付ける。
4. Mermaid loaderを13節どおり実装し、Chart.jsとMermaid本体を成果物へbundleしない。

確認:

```bash
npm run clean
npm run build
node --check dist/cli.js
npm pack --dry-run
```

M0完了条件:

- 上記すべてが0で終了する。
- 15.3節の6成果物だけで次工程を開始できる。

### M1: CLIとローカルサーバー

#### T1.1 CLI option parser

対象file:

- `src/cli/options.ts`
- `tests/unit/cli-options.test.ts`

作業:

1. `CliRunOptions`、`CliCommand`、`CliUsageError`を定義する。
2. `parseArgs`を使い、7.2節と7.3節の構文・値域を実装する。
3. filesystem validationは実装しない。
4. 16.1節の必須caseをtable-driven testにする。

確認:

```bash
npx vitest run tests/unit/cli-options.test.ts
npm run typecheck
```

#### T1.2 MIMEと安全なfile解決

対象file:

- `src/server/mime.ts`
- `src/server/static-file.ts`
- `tests/unit/mime.test.ts`
- `tests/unit/paths.test.ts`

作業:

1. 拡張子からContent-Typeを返すpure functionを実装する。
2. 8.3節のsegment検証とroot配下確認をpure functionとして分離する。
3. 通常ファイルだけをstreamする処理を実装する。
4. malformed path、Unicode、space、nested pathをtestする。

確認:

```bash
npx vitest run tests/unit/mime.test.ts tests/unit/paths.test.ts
npm run typecheck
```

#### T1.3 HTTP routeとserver lifecycle

対象file:

- `src/server/types.ts`
- `src/server/shell.ts`
- `src/server/routes.ts`
- `src/server/start.ts`
- `tests/server/server.test.ts`

作業:

1. 6.2節の`StartServerOptions`と`RunningServer`を定義する。
2. 9節のShell HTMLを返すfunctionを実装する。
3. 8.1節のroute tableを明示的な分岐で実装する。
4. GET、HEAD、405、400、404、500を実装する。
5. port `0`から実portを返す処理とidempotentな`close`を実装する。
6. 16.2節のserver testを完成させる。

確認:

```bash
npx vitest run tests/server/server.test.ts
npm run typecheck
```

#### T1.4 CLI top-levelとbrowser起動

対象file:

- `src/cli/open-browser.ts`
- `src/cli/main.ts`
- `examples/basic/nav.html`
- `examples/basic/overview.html`

作業:

1. `open` packageを呼ぶ`openViewer`を実装する。
2. directoryと`nav.html`をfilesystemで検証する。
3. runtime rootを`import.meta.url`から解決する。
4. serverを起動し、固定形式のURLをstdoutへ出す。
5. signal handling、debug stack、exit codeを7.3節と7.4節どおり実装する。

確認:

```bash
npm run build
node dist/cli.js --help
node dist/cli.js --version
node dist/cli.js ./examples/basic --port 0 --no-open
```

上の手動確認では表示されたURLへ別terminalからrequestし、最後にCtrl+Cで終了する。M1完了時点で`examples/basic/nav.html`と最小文書を作成しておく。

### M2: Viewer Shellと基本表示

#### T2.1 Browser型、定数、layout

対象file:

- `src/browser/constants.ts`
- `src/browser/types.ts`
- `src/browser/layout.ts`

作業:

1. Runtime prefix、Content prefix、title suffixを定数化する。
2. 6.3節の型を定義する。
3. 9節のDOMを`createElement`で組み立てる。
4. `renderLoadState`の4状態を実装する。
5. HTML文字列をlayoutへ直接代入しない。

確認:

```bash
npm run typecheck
npm run lint
npm run build
```

#### T2.2 Router pure functions

対象file:

- `src/browser/router.ts`
- `tests/unit/router.test.ts`

作業:

1. `normalizeDocumentPath`を11.2節どおり実装する。
2. Shell URLとContent URLの生成・逆変換を実装する。
3. `parseRoute`を実装する。
4. 16.1節のrouter caseをすべてtestする。

確認:

```bash
npx vitest run tests/unit/router.test.ts
npm run typecheck
```

#### T2.3 Navigationのparseとmount

対象file:

- `src/browser/navigation.ts`

作業:

1. 10.1節の8手順を実装する。
2. Viewer内linkの分類、hrefの絶対URL化、invalid linkのwarningを実装する。
3. `updateActiveNavigation`を実装する。
4. event listenerはまだこのfileへ実装せず、`start.ts`から登録する。

確認:

```bash
npm run typecheck
npm run lint
npm run build
```

#### T2.4 iframe生成と基本orchestration

対象file:

- `src/browser/frame.ts`
- `src/browser/document-loader.ts`
- `src/browser/title.ts`
- `src/browser/start.ts`
- `tests/browser/viewer.spec.ts`
- `tests/fixtures/browser/**`
- `examples/nested/**`

作業:

1. `buildSrcdoc`とtitle決定を12.2節どおり実装する。
2. `document-loader.ts`にfetchとHTTP error変換だけを実装する。
3. `start.ts`に9節の初期化手順と12.1節の読み込み手順を実装する。
4. navigationの最初の文書を`replaceState`して表示する。
5. loading、ready、404、一般errorを表示する。
6. Browser fixtureと、初期表示・nested画像・404のPlaywright testを作る。
7. `examples/nested`へnested文書と相対画像の最小例を作る。

確認:

```bash
npm run build
npm run test:browser
```

M2完了条件:

- Browser fixtureのSidebarと最初の文書が表示される。
- Browser fixtureとnested exampleの相対画像がiframe内に表示される。
- 不存在文書でViewer全体が消えず、error状態になる。

### M3: ルーティング、リンク、競合制御

#### T3.1 click分類とShell navigation

対象file:

- `src/browser/links.ts`
- `src/browser/start.ts`
- `tests/browser/viewer.spec.ts`

作業:

1. plain primary clickの判定を実装する。
2. Sidebar clickとiframe clickを同じ`navigate`処理へ接続する。
3. Viewer内HTML、同一文書hash、外部URL、modifier clickを分類する。
4. `push`、`replace`、`none`のhistory modeを実装する。

確認:

```bash
npm run typecheck
npm run build
npm run test:browser
```

#### T3.2 履歴、anchor、title、abort

対象file:

- `src/browser/start.ts`
- `src/browser/title.ts`
- `src/browser/navigation.ts`
- `tests/browser/viewer.spec.ts`

作業:

1. `popstate`と`hashchange`を接続する。
2. anchorのdecode、探索、scrollを実装する。
3. Header、iframe、Shell titleを同期する。
4. active navigationを同期する。
5. `AbortController`と各await後のcurrent request確認を実装する。

確認:

```bash
npm run typecheck
npm run build
npm run test:browser
```

M3完了条件:

- Sidebar、iframe、戻る、進む、再読み込みから同じ文書へ到達できる。
- nested pathと文書内anchorが動作する。
- 素早い連続遷移で最後に選んだ文書だけが表示される。
- 外部linkとmodifier clickを壊さない。

### M4: 表示品質、Chart.js、Mermaid

#### T4.1 Shell CSSとmobile menu

対象file:

- `src/styles/shell.css`
- `src/browser/layout.ts`
- `src/browser/start.ts`
- `tests/browser/viewer.spec.ts`

作業:

1. 14.1節のdesktop layoutを実装する。
2. `768px`未満のoverlay Sidebarを実装する。
3. menu buttonのARIAと、文書遷移後に閉じる処理を実装する。
4. focus、active、loading、errorの見た目を実装する。

確認:

```bash
npm run typecheck
npm run build
npm run test:browser
```

#### T4.2 Document CSS

対象file:

- `src/styles/document.css`
- `examples/basic/*.html`
- `examples/nested/**`
- `tests/fixtures/browser/**`
- `tests/browser/viewer.spec.ts`

作業:

1. 14.2節のsemantic elementをすべてstyleする。
2. table、pre、長いURL、画像で横overflowしないことを確認する。
3. basic exampleに主要semantic elementを1つずつ含める。

確認:

```bash
npm run build
npm run test:browser
```

#### T4.3 ChartとMermaid example

対象file:

- `examples/charts/nav.html`
- `examples/charts/chart.html`
- `examples/mermaid/nav.html`
- `examples/mermaid/diagram.html`
- `tests/fixtures/browser/chart.html`
- `tests/fixtures/browser/diagram.html`
- `tests/browser/viewer.spec.ts`

作業:

1. 13.1節のChart例を作る。
2. 13.2節のMermaid例を作る。
3. Browser fixtureにも同じ最小例を追加する。
4. canvas描画とMermaid SVGを検証する。

確認:

```bash
npm run typecheck
npm run lint
npm run build
npm run test:browser
```

M4完了条件:

- desktopとmobile viewportのbrowser testが通る。
- semantic HTMLは追加installなしで表示され、Chart.jsとMermaidはoptional peerを導入した場合に表示される。

### M5: 配布検証とv0.1完成

#### T5.1 READMEと利用例

対象file:

- `README.md`

READMEへ次をこの順で記載する。

1. 目的
2. install
3. `npx html-docs ./specs`
4. npm script例
5. directory構成
6. `nav.html`例
7. HTML fragment例
8. Chart.js例
9. Mermaid例
10. CLI option
11. v0.1の制約

確認:

```bash
npm run build
npm pack --dry-run
```

tarballのfile一覧に`README.md`が含まれ、README記載のcommandと7節のCLI仕様が一致することを確認する。

#### T5.2 pack test

対象file:

- `scripts/test-pack.mjs`

作業:

1. 16.4節の11手順を実装する。
2. timeout時にもchild processと一時fileを必ず片付ける。
3. source treeへのsymlinkや相対参照がないことを確認する。

確認:

```bash
npm run test:pack
```

#### T5.3 最終検証

対象file:

- なし（検証のみ。失敗を直す場合は、原因となったtaskへ戻ってそのtaskの対象fileを修正する）

確認:

次を記載順に実行する。

```bash
npm ci
npx playwright install chromium
npm run clean
npm run typecheck
npm run lint
npm test
npm run build
npm run test:browser
npm run test:pack
npm pack --dry-run
```

途中で1つでも失敗した場合は完了にしない。すべて成功後、18節のchecklistを上から確認してv0.1完成とする。

## 18. 最終受け入れ条件

- [x] npm packageをdevDependencyとしてインストールできる。
- [x] インストールにより`html-docs` binaryが利用可能になる。
- [x] `npx html-docs ./specs`でViewerが起動し、ブラウザが開く。
- [x] 利用プロジェクト側でbuild、copy、設定ファイル作成が不要である。
- [x] 利用側にViewer用`index.html`が不要である。
- [x] `nav.html`がSidebarとして表示される。
- [x] HTML fragment形式の設計書を表示できる。
- [x] nested文書と相対assetを表示できる。
- [x] Sidebarと文書内リンクで遷移できる。
- [x] 再読み込み、戻る、進む、文書内アンカーが動作する。
- [x] 文書タイトルとactive navigationが同期する。
- [x] Chart.jsとMermaidがoptional peerを導入した場合に動作し、未導入でもViewerが起動する。
- [x] 読み込み失敗時にViewer内で理解可能なエラーを表示する。
- [x] Ctrl+Cでサーバーが終了する。
- [x] `npm pack`した成果物を別fixtureへインストールして同じ動作を確認できる。
- [x] v0.1の全自動テストが通る。

## 19. 実装判断の扱い

M0からM5までを開始するための未確定事項はない。2.2節の固定値を使用する。

実装中に本書で扱っていない選択肢が現れた場合は、次の優先順位で判断する。

1. 利用側の作業を増やさない。
2. 標準HTMLを維持し、独自記法を追加しない。
3. 新しいdependencyを追加せず、Node.jsまたはBrowser標準APIを使う。
4. module間の依存方向を維持する。
5. v0.1の非目標に該当する場合は実装しない。
6. それでも決められない場合だけ、実装を止めて計画書を更新する。

npm registry上のpackage名の利用可否と公開先はリリース時の運用判断であり、実装のblockerにしない。将来拡張はv0.1完了後に実利用のフィードバックを基に判断する。
