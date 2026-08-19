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
