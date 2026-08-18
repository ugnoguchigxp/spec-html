# Release guide

## 初回公開の前提

MIT Licenseと`HTML Docs contributors`の著作権表記は設定済みです。正式な権利者名を記載する必要がある場合は、初回公開前に`LICENSE`、`package.json`、READMEを同時に更新してください。

1. 公開GitHub repositoryを作成し、`repository`、`homepage`、`bugs`を`package.json`へ追加する。
2. npmで`html-docs`というpackage名が空いていることを再確認する。名前を確保できない場合はscope付きの名前へ変更する。
3. `CHANGELOG.md`の対象versionを`Unreleased`から公開日へ変更する。
4. `npm run release:check`が成功することを確認する。

初回公開は、2要素認証を有効にしたnpm accountで次を実行する。

```bash
npm login
npm whoami
npm publish
```

## 継続公開

npm package settingsでGitHub ActionsのTrusted Publisherを設定する。

- Organization or user: GitHub repositoryのowner
- Repository: repository名
- Workflow filename: `publish.yml`
- Environment: `npm`

GitHub側にも`npm` environmentを作成し、必要に応じて承認者とdeployment branchを制限する。以後は次の順序で公開する。

1. `package.json`のversionを更新する。
2. `npm ci`と`npm run release:check`を実行する。
3. `v<version>` tagを作る。
4. 同じtagから通常のGitHub Releaseを公開する。

`.github/workflows/publish.yml`はrelease tagとpackage versionの一致を検査し、OIDCでnpmへ公開する。pre-releaseのGitHub Releaseは自動公開しない。

## 緊急時

誤ったversionを公開しても、利用者が取得済みのpackageを壊す可能性があるため原則としてunpublishしない。修正版を新しいversionで公開し、必要なら問題のversionを`npm deprecate`で非推奨にする。
