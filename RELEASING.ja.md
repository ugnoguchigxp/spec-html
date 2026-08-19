# Releasing

[English](./RELEASING.md) | 日本語

この文書はSpec HTMLをnpmへ公開するmaintainer向け手順です。releaseはdefault branch上のreview済みかつcleanなcommitから行います。

## 初回公開の前に

release直前に、npm registryで`spec-html`が引き続き利用可能な名前であることを確認します。初回公開でpackageが作成されるため、2要素認証を有効にしたnpm account ownerが対話的に公開してください。npm tokenをrepositoryへ追加してはいけません。

公開はmaintainerがローカルから明示的に行います。CIはpackageを検証しますが、publishは行いません。

## Releaseの準備

1. 日英両方がある文書について、command、要件、security上の制約、対応機能が一致していることを確認する。
2. `CHANGELOG.md`を更新し、`Unreleased`をrelease日へ置き換える。
3. Semantic Versioningに従ってversionを選び、`npm version <major|minor|patch> --no-git-tag-version`を実行する。
4. 全検証を実行する。

   ```bash
   npm ci
   npx playwright install chromium firefox webkit
   npm run check
   ```

5. 公開されるpackageの内容とmetadataを確認する。

   ```bash
   npm pack --dry-run
   npm publish --dry-run
   ```

6. versionとchangelogの変更をcommitし、reviewを経てdefault branchへmergeする。

## Publish

review済みのrelease commitをcleanなworktreeへcheckoutし、対話的に公開します。

```bash
npm publish
```

npmでの公開成功を確認してから、同じversionの署名付き`vX.Y.Z` Git tagとGitHub Releaseを作成します。release notesにはchangelogの内容を使用します。

## 公開後の確認

registry metadataを確認し、cleanな一時projectへ公開済みversionをinstallします。

```bash
npm view spec-html version dist-tags repository
npm install --save-dev spec-html@<version>
npx --no-install spec-html --version
```

確認に失敗した場合は作業を止めて原因を調査します。公開済みのnpm versionは上書きせず、必要に応じて修正版のpatch releaseを公開してください。
