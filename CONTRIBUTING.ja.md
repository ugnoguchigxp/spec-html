# Contributing

[English](./CONTRIBUTING.md) | 日本語

Spec HTMLは、LLM生成ドキュメントをMarkdownから構造的なHTMLへ置き換え、Markdown以上の表現力を持つ読みやすい設計書・仕様書としてローカルで活用するためのprojectです。変更時はREADMEに記載した用途とsecurity modelを維持してください。

## Development environment

- Node.js 20.19以上、22.16以上、または24以上
- Bun 1.3以上（compatibility check用）
- npm
- Chromium、Firefox、WebKit（browser test用）

```bash
npm ci
npx playwright install chromium firefox webkit
npm run check
```

## Commands

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | TypeScriptの型検査 |
| `npm run lint` | source、test、scriptのlint |
| `npm test` | unit testとserver integration test |
| `npm run test:coverage` | coverage下限を適用してNode側testを実行 |
| `npm run build` | CLIとbrowser assetを`dist`へ生成 |
| `npm run fix:check` | repository内HTMLの明白な修正対象を検査 |
| `npm run test:browser` | Chromiumで全件、Firefox/WebKitでsmoke testを実行 |
| `npm run test:pack` | tarballを別projectへinstallしてCLIを検証 |
| `npm run check` | 上記のローカル品質検証を一括実行 |

CIでは追加で`bun --bun`による型検査とtestを行い、BunでbuildしたpackageのViewerもBun上で直接起動して検証します。

## Project layout

```text
src/                 TypeScript source
tests/unit/          pure unit tests
tests/server/        local HTTP server tests
tests/browser/       Playwright tests
scripts/             local build and test scripts
specs/               authoring guide and implementation notes
examples/            example specifications
dist/                generated package files
```

`dist`は直接編集せず、`npm run build`で生成してください。Chart.jsとMermaidはoptional peer dependencyのまま維持し、本体をpackageへbundleしないでください。

## Change checklist

1. user-visibleな挙動を変更した場合はREADMEまたはauthoring guideを更新する。
2. regression testを追加する。
3. `npm run check`を実行する。
4. packageの構成または利用projectでの動作へ影響する場合は`npm run test:pack`も実行する。
5. user-visibleな変更を`CHANGELOG.md`へ追加する。
6. 日英両方がある文書を変更した場合は、双方の内容を同期する。CHANGELOGは英語版だけを管理する。

publishはmaintainerだけが行います。[RELEASING.ja.md](./RELEASING.ja.md)の検証手順に従い、reviewされていないworking treeから公開しないでください。

## Security

このViewerは信頼済みのローカルHTMLを対象とし、inline scriptを許可します。この前提を変更する場合は、互換性とsecurity modelを同時にレビューしてください。path解決、iframe、script実行、network bindingに関わる変更には必ずregression testを追加してください。
