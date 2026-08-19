# Spec HTML

[![npm version](https://img.shields.io/npm/v/spec-html.svg)](https://www.npmjs.com/package/spec-html)

English | [日本語](./README.ja.md)

Spec HTML is a local viewer for design documents and specifications written as structured HTML or Markdown. Existing Markdown assets can be viewed directly or converted into editable Spec HTML, while new HTML documents retain richer semantic building blocks. The shared viewer provides navigation, cross-document links, images, Chart.js, and Mermaid.

![A specification with a Mermaid diagram in Spec HTML's light theme](./assets/LightMode.webp)

## Purpose and scope

Spec HTML is not a framework for asking an LLM to build an entire web application. It is a document viewer for HTML fragments generated directly by an LLM. Headings, tables, code, callouts, details, images, and diagrams can express information that is awkward to represent in Markdown, without requiring each document to define its own CSS or navigation.

The viewer and its documents are intended for trusted local environments. The npm package distributes the CLI; it does not turn Spec HTML into a hosted service or make untrusted HTML safe to run.

## Features

- Builds navigation automatically from HTML fragments in a content directory
- Previews `.md` and `.markdown` files directly, with visible `MD` badges
- Converts one Markdown file to a formatted, editable Spec HTML fragment without overwriting files
- Migrates every active Markdown document to HTML with link rewriting, validation, Archive handoff, and rollback
- Reloads the browser when content in that directory changes
- Supports relative links, images, and browser history
- Provides mobile navigation and keyboard controls
- Follows the OS light/dark preference and supports document printing
- Rejects path traversal and symbolic-link escapes outside the content directory
- Keeps dot-prefixed files and directories private and validates every HTTP Host
- Treats Chart.js and Mermaid as optional peer dependencies
- Loads Mermaid's official ES modules at runtime, so diagrams stay as source
- Formats HTML fragments and safe full HTML documents deterministically
- Lints document structure, references, and accessibility before viewing
- Fixes unambiguous HTML tag, attribute, quote, closing-tag, and local-reference typos

## Requirements

- Node.js 20.19+, 22.16+, or 24+
- Bun 1.3+ is also supported when the CLI is run with `--bun`
- Trusted local HTML and Markdown

## Installation

Install Spec HTML in the project that contains your specifications:

```bash
npm install --save-dev spec-html
```

Install either or both optional integrations when your documents use them:

```bash
npm install --save-dev chart.js mermaid
```

An integration that is not installed does not affect ordinary HTML, CSS, images, or navigation.

## Quick start

Create a content directory:

```text
specs/
├─ overview.html
├─ architecture.md
└─ assets/
   └─ diagram.svg
```

New HTML specifications should be fragments rather than complete HTML documents. Existing Markdown documents can remain unchanged:

```html
<article lang="en">
  <h1>Authentication</h1>
  <p>Authentication is based on OpenID Connect.</p>
  <img src="./assets/login-flow.svg" alt="Authentication flow" />
</article>
```

Spec HTML scans `.html`, `.md`, and `.markdown` files recursively and uses the first `h1` as the navigation label. Markdown documents have an `MD` badge; files such as `design.html` and `design.md` remain separate navigation entries. While the viewer is running, adding, changing, or removing a document or asset reloads the browser automatically.

Start the locally installed viewer:

```bash
npx spec-html ./specs
```

With Bun, install the same package and force its Node-compatible CLI to run on
the Bun runtime:

```bash
bun add --dev spec-html
bunx --bun spec-html ./specs
```

Lint document structure, references, and accessibility before opening the viewer:

```bash
npx spec-html lint ./specs
npx spec-html lint ./specs --warnings-as-errors
npx spec-html lint --explain DOC001
```

Use the fixer to repair unambiguous HTML surface typos. `--check` reports files without changing them; `--write` applies only fixes with a single valid candidate. It can repair names such as `scritp`, `onclik`, `scr`, and `herf`, but never rewrites JavaScript inside a `script` element or event-handler value.

```bash
npx spec-html fix ./specs --check
npx spec-html fix ./specs --write
```

Use the formatter to normalize indentation and line breaks. `--check` reports files without changing them; `--write` updates only files that need formatting.

```bash
npx spec-html format ./specs --check
npx spec-html format ./specs --write
```

The formatter can also accept a full HTML document and reduce a safe `doctype`/`html`/`head`/`body` envelope to a fragment. It refuses the conversion when the head contains `style`, `script`, `link`, or `base` content that cannot be discarded safely.

Run the fixer, formatter, and linter together with `check`. Without stage options it checks all three without writing. `--fix` applies fixer and formatter changes before linting the resulting files. Selectors limit the run when only a combination is needed.

```bash
npx spec-html check ./specs
npx spec-html check ./specs --fix
npx spec-html check ./specs --fixer --lint
npx spec-html check ./specs --fixer --format --fix
```

## Markdown compatibility

Markdown preview supports headings with stable IDs, paragraphs, emphasis, strikethrough, lists and task lists, blockquotes, code, GFM tables, links, images, and `mermaid` fences. Raw HTML is shown as literal text rather than executed. Unsafe link and image schemes such as `javascript:`, `data:`, and `file:` are omitted. Mermaid generated from Markdown uses Mermaid's `strict` security level, which disables callback directives; trusted HTML documents retain the existing Mermaid behavior. Relative links and assets resolve from the original Markdown file, including links between Markdown and HTML documents.

The viewer uses `en` for generated Markdown articles by default. Set one root-wide language when needed:

```bash
npx spec-html ./specs --markdown-lang ja
```

Convert a Markdown source to stdout, or explicitly create a new HTML file in the same directory:

```bash
npx spec-html convert ./specs/design.md --lang en
npx spec-html convert ./specs/design.md --lang en --output ./specs/design.html
```

Without `--output`, stdout contains HTML only and the filesystem is unchanged. With `--output`, the target must not already exist; files and symbolic links are never overwritten. The command explicitly reports that the Markdown source was retained. It is not deleted, renamed, archived, or kept in sync, and the viewer lists the source and generated HTML as separate documents. Treat the generated HTML as an independent editable document rather than maintaining both files as sources of truth.

Conversion preserves GitHub-compatible heading IDs, including IDs that begin with a number, renders GFM cell alignment through viewer CSS instead of deprecated HTML attributes, and copies the nearest preceding heading text into a real table caption. A table before any heading remains a semantic lint error and returns exit code `1` after creating the requested draft.

Use `migrate` when the whole content root must switch from Markdown to HTML as one operation:

```bash
npx spec-html migrate ./specs --lang en --check
npx spec-html migrate ./specs --lang en --write
npx spec-html migrate ./specs --lang en --language-map ./specs.languages.json --check
npx spec-html migrate ./specs --rollback <migration-id>
npx spec-html migrate ./specs --finalize <migration-id>
```

`--check` builds the complete plan without changing the content root. `--write` repeats that preflight, creates one same-directory HTML file per active Markdown source, rewrites mapped document links in generated and existing HTML, verifies structural content parity, then moves the Markdown sources into their sibling `.archived` directories. Case and Unicode-normalization variants are resolved to one canonical output on every OS. Existing targets, archive copies, unsafe `.archived` directories, and symbolic links are never overwritten. The report includes the migration ID, byte estimates, available capacity, and maximum portable path length. To keep the in-memory plan bounded, one input document is limited to 64 MiB and the discovered document set to 256 MiB.

Raw HTML and omitted unsafe URLs are lossy operations and block migration by default; use `--allow-lossy` only after reviewing their diagnostics. Front matter, footnotes, custom heading IDs, wiki links/embeds, GitHub alerts, math, MDX, and directive extensions are reported as unsupported blockers instead of being silently reinterpreted. Extension-like text inside fenced, inline, or indented code remains ordinary code. Existing baseline warnings are reported by the normal lint workflow and do not become migration-only blockers. Tables and Mermaid diagrams obtain captions only from a preceding heading in the same block scope; an uncaptioned table or diagram blocks migration.

`--lang` is the fallback language for every generated article. Mixed-language roots can override exact Markdown paths with `--language-map <json>`:

```json
{
  "guide.md": "en",
  "ja/overview.md": "ja-JP"
}
```

Existing HTML navigation links are rewritten automatically. References with different semantics—such as downloads, forms, media/source attributes, `srcset`, meta refresh, CSS, scripts, `srcdoc`, event handlers, SVG links, and `data-*` attributes—block the plan and identify the element and attribute for manual review. Entity-encoded, root-relative, and malformed local URLs that still target migrated Markdown are also blocked rather than guessed. Immediately before commit, migration rescans the complete document set, requires zero active Markdown files, reruns the full project lint, and rolls the operation back if either condition changed.

Archived sources managed by a committed or recoverable incomplete migration remain viewable but cannot be restored individually, which prevents Markdown and HTML from becoming active sources of truth at the same time. Use `--rollback` to restore the whole unchanged migration. After accepting the HTML—even after editing it—use `--finalize` to keep the current HTML and delete rollback backups; finalized migrations cannot be rolled back.

`lint`, `fix`, `format`, and `check` continue to process HTML only. They do not imply that Markdown source has been linted; use `convert` to produce an HTML draft and then run `check` on it.

For regular use, add scripts to the consuming project's `package.json`:

```json
{
  "scripts": {
    "docs": "spec-html ./specs",
    "docs:fix": "spec-html fix ./specs --write",
    "docs:format": "spec-html format ./specs --write",
    "docs:check": "spec-html check ./specs",
    "docs:check:fix": "spec-html check ./specs --fix"
  }
}
```

See the [authoring guide](./docs/authoring.html) for writing rules, link resolution, and integrations. A [Japanese version](./docs/authoring.ja.html) is also available.

## AI agent instructions

Copy the following instructions into the consuming project's `AGENTS.md`. Replace `specs/` when the project uses a different content directory.

```md
## Spec HTML documents

When design decisions, specifications, implementation plans, or research results are worth preserving, create or update a Spec HTML document under `specs/` without waiting for a separate documentation request. Choose the structure and presentation that best fit the content, and follow these rules.

- Make each file an HTML fragment with one root `article` whose `lang` identifies the document's primary language. Do not add `html`, `head`, `body`, document-specific CSS, or navigation.
- Add exactly one `h1` and use standard semantic HTML. Use tables, `aside`, `details`, and `figure` when they improve understanding.
- Keep requirements, conclusions, and values understandable from the HTML text. Use scripts, canvases, and diagrams only as supporting material. Keep links and assets inside `specs/` and reference them with relative URLs.

### Mermaid

When Mermaid is installed and a flow, sequence, relationship, or structure is clearer as a diagram, use it without waiting for an explicit request. Use `<figure><pre class="mermaid">…</pre><figcaption>…</figcaption></figure>` with multiline Mermaid source; do not add an initialization script or generated SVG.

### Chart.js

When Chart.js is installed and a comparison, trend, or composition is clearer as a chart, use it without waiting for an explicit request. Use `<figure><canvas id="…" aria-label="…"></canvas><figcaption>…</figcaption></figure>` and an inline script with the global `Chart`; keep exact values in the text or a table.

### Check

- After creating or editing documents, run `npx spec-html check ./specs --fix --warnings-as-errors` and resolve any remaining diagnostics.
```

## Appearance

The sidebar's **Name** and **Date** controls sort documents within each directory. Selecting the active control again reverses the order. **Light** and **Dark** select a theme and save the preference in the browser; the first visit follows the operating system setting. The shell, document, Chart.js charts, and Mermaid diagrams switch together.

![An implementation plan in Spec HTML's dark theme](./assets/darkMode.webp)

Standard semantic elements such as headings, lists, tables, code, blockquotes, details, and figures receive default styles. An `aside` is displayed as a note and accepts `warning`, `danger`, or `success` in `data-type`.

```html
<aside data-type="warning" aria-labelledby="migration-warning">
  <strong id="migration-warning">Caution</strong>
  <p>This change requires a database migration.</p>
</aside>
```

The source button in the lower-right corner opens the current document's original HTML or Markdown in a dialog, making it easy to compare the rendered result with its source.

![The current document's source HTML displayed in a dialog](./assets/source.webp)

Printing hides the sidebar and mobile menu button and prints the current document with the light color scheme.

## Chart.js

When `chart.js` is installed, an inline script can use the ordinary global `Chart` API:

```html
<canvas
  id="latency-chart"
  width="320"
  height="180"
  aria-label="P95 latency chart"
></canvas>
<script>
  const canvas = document.getElementById("latency-chart");
  new Chart(canvas, {
    type: "line",
    data: {
      labels: ["2.1", "2.2", "2.3"],
      datasets: [{ label: "P95", data: [180, 220, 230] }],
    },
  });
</script>
```

## Mermaid

When `mermaid` is installed, Spec HTML renders `.mermaid` elements automatically. No initialization script or generated SVG needs to be committed.

```html
<pre class="mermaid">
sequenceDiagram
  Browser->>API: Login
  API-->>Browser: Session
</pre>
```

## CLI

```text
spec-html [directory] [options]

--host <host>                  host to listen on (default: 127.0.0.1)
--allowed-host <hostname>      allowed Host for non-loopback binds (repeatable; required for wildcard)
--port <port>                  port to listen on (default: 4173; 0 selects a free port)
--markdown-lang <language-tag> language for generated Markdown articles (default: en)
--open                         open the browser after startup (default)
--no-open                      do not open the browser
--help                         show help
--version                      show the version

spec-html lint [directory] [options]
spec-html format [path] --check|--write [options]
spec-html fix [path] --check|--write [options]
spec-html check [directory] [--fix] [options]
spec-html convert <input.md> --lang <language-tag> [--output <output.html>]
spec-html migrate [directory] --lang <language-tag> --check|--write
spec-html migrate [directory] --rollback <migration-id>
spec-html migrate [directory] --finalize <migration-id>
```

## Security model

Spec HTML is designed for trusted local HTML. Inline scripts in an HTML specification are executed, so do not open HTML from an untrusted source without reviewing it first. Markdown raw HTML is escaped, unsafe URL schemes are removed, and Markdown Mermaid callback directives are disabled during rendering and conversion; remote HTTP(S) links and images are still allowed.

Review fixer changes with `--check` before writing unfamiliar documents. Correcting a typo such as `scritp` or `onclik` intentionally activates the corresponding HTML behavior, while leaving the JavaScript source itself unchanged.

The server listens only on `127.0.0.1` by default and accepts only the loopback names `127.0.0.1`, `localhost`, and `::1` for loopback binds. A concrete non-loopback bind can add repeatable `--allowed-host <hostname>` values. A wildcard bind such as `--host 0.0.0.0` requires at least one; it still must not be used on an untrusted network. Cross-origin document-state updates are rejected.

Requests that traverse outside the content directory, including symbolic-link escapes, are rejected. Files and directories whose names start with `.` are never served from the content route, even when the segment is percent-encoded.

## v0.1 limitations

- Search and front matter interpretation are not included; migration diagnoses front matter as unsupported.
- The Viewer does not infer per-document Markdown language metadata; batch migration accepts an explicit language map.
- HTML lint/fix/format/check commands do not inspect Markdown source directly.
- The formatter does not invent semantic choices such as alt text, captions, or headings.
- The fixer does not correct prose or JavaScript and does not guess when multiple HTML repairs are possible.
- Browser automation runs the complete suite in Chromium and critical smoke paths in Firefox and WebKit.

## Development

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the development environment and checks, [RELEASING.md](./RELEASING.md) for the release process, and [CHANGELOG.md](./CHANGELOG.md) for notable changes. Bilingual documents link to their Japanese counterparts.

## License

[MIT License](./LICENSE) © 2026 Spec HTML contributors
