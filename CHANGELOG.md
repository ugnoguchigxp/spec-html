# Changelog

LLM生成ドキュメントをMarkdownから構造的なHTMLへ置き換え、Markdown以上の表現力を持つ読みやすい設計書・仕様書としてローカルで活用するためのこのprojectの変更を記録します。このversionはローカル成果物の識別用であり、npm registryへの公開versionを意味しません。

## 0.1.0 - Unreleased

### Added

- HTML fragmentを表示し、content directoryからnavigationを構成するローカルViewer CLI
- content directory内の変更だけを監視するbrowser自動reload
- 文書間navigation、browser history、画像と相対linkの解決
- optional Chart.js integration
- 公式ES moduleを遅延読み込みするoptional Mermaid integration
- desktop・mobile navigationとkeyboard accessibility
- 上部タイトルバーを省いた全高layoutとSidebar上部のtheme controls
- Tokyo Night Stormを参考にしたlight／darkの表示切り替え、初回表示でのOS設定反映、選択内容の保存、文書印刷、theme変更時の図表再描画
- semantic HTMLの既定styleとアクセシブルなcallout pattern
- HTML fragmentの構文、構造、参照、accessibilityを検査する`spec-html lint` CLI
- HTML fragmentと安全なfull HTML documentを決定的なfragmentへ整形する`spec-html format` CLI
- unit、server、Chromium、consumer package test
- GitHub Actionsによるcross-platform CI
- 公開npm packageや公開serviceを対象外とするlocal-only方針

### Security

- 既定のloopback binding
- content root外へのpath traversalとsymbolic link escapeの拒否

### License

- MIT License
