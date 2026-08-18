# Local use policy

## このprojectの用途

Spec HTMLは、LLMがMarkdownで生成しがちな設計書や仕様書を構造的なHTMLへ置き換え、Markdown以上の表現力を持つ読みやすい文書として手元のbrowserで活用するためのprojectです。semantic HTMLのfragmentを中心にし、見出し、table、code、callout、details、画像、図表などを表現しながら、文書ごとのCSS、navigation、Web application開発を不要にすることを目指します。

Viewer、対象HTML、生成した図表は、すべてローカルの信頼済み環境で扱います。

## 公開しない

このprojectは公開npm package、公開Web service、第三者向け配布物ではありません。次の操作を行わないでください。

- `npm publish`または他のregistryへのpackage公開
- npm Trusted Publishingの設定
- package配布を目的とした公開GitHub Releaseの作成
- ViewerをInternetからアクセスできるhostへ配置すること
- `package.json`の`private: true`を公開目的で解除すること
- `prepublishOnly`の拒否処理を削除または`--ignore-scripts`で回避すること

npmはローカルのdependency管理、build、test、および一時tarballによる動作確認にだけ使用します。`package.json`の`private: true`と`prepublishOnly`は誤公開を防ぐためのguardです。`npm pack`で作るtarballはローカル検証用であり、外部へ配布しません。

## ローカルでの確認

```bash
npm ci
npm run check
```

別projectへinstallした状態を確認する処理も、一時directoryとローカルtarballだけで完結します。registryへの接続やpublishは検証手順に含めません。

## 方針変更

将来、外部公開や第三者配布が必要になった場合でも、この文書を読み替えて自動的に公開してはいけません。目的、公開範囲、権利者、license、security model、配布方法についてproject ownerの明示的な承認を得たうえで、別の変更として設計・レビューします。
