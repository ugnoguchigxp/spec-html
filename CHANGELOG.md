# Changelog

Notable changes to Spec HTML are recorded here. The project follows [Semantic Versioning](https://semver.org/).

## 0.1.0 - Unreleased

### Added

- Local viewer CLI that renders HTML fragments and builds navigation from a content directory
- Direct `.md` and `.markdown` preview with shared GFM rendering, stable heading IDs, source display, cross-format links, and visible navigation badges
- `spec-html convert` for create-only Markdown-to-HTML conversion with deterministic formatting and semantic lint diagnostics
- Browser reloads scoped to changes within the content directory
- Cross-document navigation, browser history, images, and relative-link resolution
- Optional Chart.js integration
- Optional Mermaid integration with lazy-loaded official ES modules
- Desktop and mobile navigation with keyboard accessibility
- Full-height layout, theme controls, and title display
- Light and dark themes inspired by Tokyo Night Storm, OS-preference detection, persisted selection, document printing, and diagram redraws on theme changes
- Default styles for semantic HTML and accessible callout patterns
- `spec-html lint` for document syntax, structure, references, and accessibility
- `spec-html format` for deterministic formatting of HTML fragments and safe full documents
- `spec-html fix` for unambiguous HTML tag, attribute, quote, closing-tag, and local-reference typos without rewriting JavaScript
- `spec-html check` for running the fixer, formatter, and linter together or in selected combinations, with optional safe writes
- Unit, server, Chromium, Firefox/WebKit smoke, and consumer-package tests with enforced Node coverage thresholds
- Compatibility checks for Node.js 20.19+, Node.js 22.16+, Node.js 24+, and Bun 1.3+
- Cross-platform CI with GitHub Actions
- English documentation with maintained Japanese counterparts

### Security

- Loopback-only binding by default
- Rejection of path traversal and symbolic-link escapes outside the content root
- Host allowlisting for every request, with explicit allowed hosts required for wildcard binds
- Rejection of dot-prefixed content paths and cross-origin document-state updates
- Literal rendering of Markdown raw HTML and removal of unsafe Markdown link and image schemes
- Strict Mermaid rendering for Markdown fences, preventing callback directives while preserving trusted HTML behavior
- Snapshot-checked, race-safe Markdown conversion that never overwrites existing files or symbolic links

### Fixed

- Fixer writes now reject invalid UTF-8 and concurrent file changes and use the same snapshot-checked atomic replacement as the formatter
- HTTP Host and Origin validation now works on Bun without weakening duplicate-header rejection

### License

- MIT License
