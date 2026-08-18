# Contributing

Spec HTMLは、LLM生成ドキュメントをMarkdownから構造的なHTMLへ置き換え、Markdown以上の表現力を持つ読みやすい設計書・仕様書としてローカルで活用するためのprojectです。公開npm packageや公開serviceとして扱わないでください。公開禁止の詳細は[Local use policy](./RELEASING.md)に従います。

## Development environment

- Node.js 24以上
- npm
- Chromium（browser test用）

```bash
npm ci
npx playwright install chromium
npm run check
```

## Commands

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | TypeScriptの型検査 |
| `npm run lint` | source、test、scriptのlint |
| `npm test` | unit testとserver integration test |
| `npm run build` | CLIとbrowser assetを`dist`へ生成 |
| `npm run test:browser` | ChromiumでViewerを検証 |
| `npm run test:pack` | tarballを別projectへinstallしてCLIを検証 |
| `npm run check` | 上記のローカル品質検証を一括実行 |

## Project layout

```text
src/                 TypeScript source
tests/unit/          pure unit tests
tests/server/        local HTTP server tests
tests/browser/       Playwright tests
scripts/             local build and test scripts
docs/                authoring guide and implementation notes
examples/            example specifications
dist/                generated package files
```

`dist`は直接編集せず、`npm run build`で生成してください。Chart.jsとMermaidはoptional peer dependencyのまま維持し、本体をpackageへbundleしないでください。

## Change checklist

1. user-visibleな挙動を変更した場合はREADMEまたはauthoring guideを更新する。
2. regression testを追加する。
3. `npm run check`を実行する。
4. ローカルpackageの構成へ影響する場合は`npm run test:pack`も実行する。
5. user-visibleな変更を`CHANGELOG.md`へ追加する。

`npm publish`、npm Trusted Publishing、公開用GitHub Releaseは使用しません。`private: true`と`prepublishOnly`の公開拒否処理を削除・回避しないでください。package化に関するtestは、ローカルtarballを一時projectへinstallする範囲に限定します。

## Security

このViewerは信頼済みのローカルHTMLを対象とし、inline scriptを許可します。この前提を変更する場合は、互換性とsecurity modelを同時にレビューしてください。path解決、iframe、script実行、network bindingに関わる変更には必ずregression testを追加してください。
