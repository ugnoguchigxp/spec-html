# Changelog

このprojectの利用者向け変更を記録します。versionは[Semantic Versioning](https://semver.org/)に従います。

## 0.1.0 - Unreleased

### Added

- HTML fragmentと`nav.html`を表示するローカルViewer CLI
- 文書間navigation、browser history、画像と相対linkの解決
- optional Chart.js integration
- 公式ES moduleを遅延読み込みするoptional Mermaid integration
- desktop・mobile navigationとkeyboard accessibility
- unit、server、Chromium、consumer package test
- GitHub Actionsによるcross-platform CIとnpm Trusted Publishing workflow

### Security

- 既定のloopback binding
- content root外へのpath traversalとsymbolic link escapeの拒否

### License

- MIT License
