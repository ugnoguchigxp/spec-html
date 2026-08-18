# Contributing

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
| `npm run check` | 上記の公開前品質検証を一括実行 |
| `npm run release:check` | 公開metadataとnpm publish dry-runを追加検証 |

## Project layout

```text
src/                 TypeScript source
tests/unit/          pure unit tests
tests/server/        local HTTP server tests
tests/browser/       Playwright tests
scripts/             build and release scripts
docs/                authoring guide and implementation notes
examples/            example specifications
dist/                generated package files
```

`dist`は直接編集せず、`npm run build`で生成してください。Chart.jsとMermaidはoptional peer dependencyのまま維持し、本体をpackageへbundleしないでください。

## Change checklist

1. user-visibleな挙動を変更した場合はREADMEまたはauthoring guideを更新する。
2. regression testを追加する。
3. `npm run check`を実行する。
4. npm配布内容へ影響する場合は`npm run release:check`も実行する。
5. user-visibleな変更を`CHANGELOG.md`へ追加する。

## Security

このViewerは信頼済みのローカルHTMLを対象とし、inline scriptを許可します。この前提を変更する場合は、互換性とsecurity modelを同時にレビューしてください。path解決、iframe、script実行、network bindingに関わる変更には必ずregression testを追加してください。
