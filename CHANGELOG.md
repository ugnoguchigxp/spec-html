# Changelog

Notable changes to Spec HTML are recorded here. The project follows [Semantic Versioning](https://semver.org/).

## Unreleased

### Added

- Markdown linting for a single non-empty H1, local references, unsafe URLs, and Mermaid syntax, with Markdown file counts in project summaries
- Repeatable 50, 500, and 5,000 document benchmarks for startup, cold and warm navigation, and live reload, with CI budgets for the smaller scales
- A security policy, private vulnerability reporting guidance, and structured GitHub issue templates

### Changed

- CLI help, usage errors, and lint diagnostics now use English by default, with the supported options and exit codes documented in both READMEs
- Viewer startup is split into focused controllers with jsdom coverage, and the Markdown compiler is loaded only when a Markdown document is opened
- Navigation titles and document discovery results are cached for repeated reads, while check reuses a shared discovery snapshot
- Runtime paths, mutation locking, migration ownership checks, and duplicated utilities now follow shared lower-level modules instead of crossing architectural layers
- Windows CI follows the current Node.js 24 release line, with live reload canonicalizing Windows short paths before creating a recursive watcher

### Fixed

- Migration content parity now collects headings, mixed ordered/unordered lists, and inline marks in document order instead of selector-group order
- Table, heading, and link text parity no longer invents spaces at inline element boundaries while preserving explicit line breaks
- Formatting preserves inline code contents verbatim and protects only the outermost range when protected elements are nested

### Security

- Non-loopback servers now require a matching Origin header for document state changes while retaining loopback CLI compatibility
- Static-file reads verify the opened file identity against the validated path to close the path-resolution race window
- Mermaid uses strict security mode for both HTML and Markdown documents, and the `open` runtime dependency is pinned exactly

## 0.1.2 - 2026-08-19

### Added

- `spec-html migrate` now provides side-effect-free batch checks, journaled Markdown-to-HTML writes, project link rewriting, content-parity validation, whole-migration rollback, and explicit finalization
- Viewer Archive state now identifies migration-managed Markdown and directs users to whole-migration rollback instead of individual Restore
- Batch migration now supports explicit per-document language maps and reports storage/path-size preflight data

### Fixed

- Packed consumer validation now skips redundant npm lifecycle scripts after the explicit build, avoiding duplicate Vitest worker startup on Windows
- Markdown conversion now keeps numeric GitHub-compatible heading IDs without treating valid HTML5 IDs as lint errors and gives punctuation-only headings deterministic fallback IDs
- GFM table alignment now uses viewer CSS classes instead of deprecated HTML `align` attributes
- GFM tables now receive real captions copied from their nearest preceding Markdown heading
- File conversion now states that the retained Markdown source is not synchronized with the generated HTML
- Live reload now ignores internal `.spec-html` journal and lock changes
- Migration now canonicalizes case and Unicode path variants, validates the virtual post-retirement filesystem, and performs a final full document/link rescan before commit
- Content parity now covers linked-image labels, link/image titles, code languages, paragraphs, blockquotes, ordered-list starts and nesting, inline semantics, rules, and hard breaks
- Table captions are block-scoped, Markdown Mermaid diagrams receive semantic figure captions, and unsupported Markdown extensions receive explicit diagnostics
- Existing HTML migration scans form actions, downloads, media attributes, `srcset`, meta refresh, CSS, scripts, `srcdoc`, event handlers, SVG links, and `data-*` references instead of silently leaving Markdown dependencies
- Final verification now compares all project diagnostics with multiplicity, and Markdown extension scanning ignores examples inside code while parity includes GFM table-cell semantics

### Security

- Batch migration rejects existing targets, canonical archive-name collisions, unsafe or symlinked `.archived` directories, symbolic links, invalid portable names, and inconsistent journals; uses no-overwrite archive moves; probes atomic-create support; shares a cross-process content-mutation lock with Viewer Archive actions; verifies digests before rollback; cleans failed preparation storage; and refuses individual Restore for committed, finalized, or recoverable incomplete migration sources
- Lossy Markdown transformations block migration by default and require an explicit `--allow-lossy` acknowledgement

## 0.1.1 - 2026-08-19

### Added

- Direct `.md` and `.markdown` preview with shared GFM rendering, stable heading IDs, source display, cross-format links, and visible navigation badges
- `spec-html convert` for create-only Markdown-to-HTML conversion with deterministic formatting and semantic lint diagnostics

### Security

- Literal rendering of Markdown raw HTML and removal of unsafe Markdown link and image schemes
- Strict Mermaid rendering for Markdown fences, preventing callback directives while preserving trusted HTML behavior
- Snapshot-checked, race-safe Markdown conversion that never overwrites existing files or symbolic links

### Fixed

- Cross-platform release tests now compare native paths and preserve each platform's original file mode
- Packed consumer validation now avoids direct Windows command-shim spawning and drains HTTP responses before shutdown
- Release validation now rejects inconsistent, dirty, or previously published package versions

## 0.1.0 - 2026-08-19

### Added

- Local viewer CLI that renders HTML fragments and builds navigation from a content directory
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

### Fixed

- Fixer writes now reject invalid UTF-8 and concurrent file changes and use the same snapshot-checked atomic replacement as the formatter
- HTTP Host and Origin validation now works on Bun without weakening duplicate-header rejection

### License

- MIT License
