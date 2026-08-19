import type { DiagnosticSeverity, RuleId } from "./diagnostics.js";

export interface RuleDefinition {
  id: RuleId;
  name: string;
  severity: DiagnosticSeverity;
  message: string;
  reason: string;
  bad: string;
  good: string;
}

function rule(
  id: RuleId,
  name: string,
  severity: DiagnosticSeverity,
  message: string,
  reason: string,
  bad: string,
  good: string,
): RuleDefinition {
  return { id, name, severity, message, reason, bad, good };
}

export const RULES = [
  rule("HTML001", "valid-syntax", "error", "Fix the syntax at the reported location", "Syntax errors make later structural checks unreliable.", "<p></div>", "<p></p>"),
  rule("HTML002", "known-element", "error", "Replace the element with a suitable standard HTML element", "The viewer cannot guarantee semantics or behavior for custom elements.", "<card>Text</card>", "<article>Text</article>"),
  rule("HTML003", "conforming-markup", "error", "Use the standard structure reported by the validator", "Elements, attributes, and parent-child relationships must conform to HTML.", "<p><div>Text</div></p>", "<div><p>Text</p></div>"),
  rule("HTML004", "fixed-rules", "error", "Remove the inline suppression and satisfy the fixed rule set", "Inline suppressions make validation results inconsistent.", "<!-- html-validate-disable -->", "<!-- fix the markup without suppression -->"),
  rule("DOC001", "root-article", "error", "Use exactly one top-level article[lang]", "A single root article defines the document fragment boundary for the viewer.", "<h1>Title</h1>", '<article lang="en"><h1>Title</h1></article>'),
  rule("DOC002", "document-language", "error", "Declare the document's primary language", "Language metadata supports screen readers and translation tools.", "<article><h1>Title</h1></article>", '<article lang="en"><h1>Title</h1></article>'),
  rule("DOC003", "single-h1", "error", "Use exactly one non-empty h1 for the document title", "A unique title keeps the heading structure and navigation unambiguous.", '<article lang="en"></article>', '<article lang="en"><h1>Title</h1></article>'),
  rule("DOC004", "heading-order", "error", "Increase heading depth one level at a time", "Skipped heading levels make the document structure difficult to follow.", "<h1>Title</h1><h3>Details</h3>", "<h1>Title</h1><h2>Details</h2>"),
  rule("DOC101", "section-anchor", "warning", "Add a stable deep-link id to the section", "A section with an h2 is easier to use when it can be linked directly.", "<section><h2>Overview</h2></section>", '<section id="overview"><h2>Overview</h2></section>'),
  rule("REF001", "unique-id", "error", "Make every id unique", "Duplicate IDs make fragment targets ambiguous.", '<p id="a"></p><p id="a"></p>', '<p id="a"></p><p id="b"></p>'),
  rule("REF002", "resolved-fragment", "error", "Fix the fragment reference or target id", "A missing fragment target prevents navigation to the referenced content.", '<a href="#missing">Details</a>', '<section id="details"></section><a href="#details">Details</a>'),
  rule("REF003", "resolved-local-file", "error", "Use an existing relative path inside the content root", "The viewer cannot open an unresolved or unsafe local reference.", '<img src="missing.svg">', '<img src="assets/chart.svg">'),
  rule("A11Y001", "image-alt", "error", "Add descriptive alt text, or empty alt text for a decorative image", "Image meaning must remain available when the image cannot be seen.", '<img src="chart.svg">', '<img src="chart.svg" alt="Monthly trend">'),
  rule("A11Y002", "aria-reference", "error", "Reference an existing unique id", "A missing ARIA target prevents an accessible name or description from being resolved.", '<p aria-labelledby="missing"></p>', '<h2 id="title">Title</h2><p aria-labelledby="title"></p>'),
  rule("FIG001", "figure-caption", "error", "Add a short caption that explains the figure", "A caption makes the purpose of a figure understandable from the document text.", '<figure><img alt="Chart"></figure>', '<figure><img alt="Chart"><figcaption>Results</figcaption></figure>'),
  rule("FIG101", "visual-figure", "warning", "Group the visual and its caption in a figure", "A figure connects a visualization to its explanation and reading order.", '<canvas aria-label="Trend"></canvas>', '<figure><canvas aria-label="Trend"></canvas><figcaption>Trend</figcaption></figure>'),
  rule("TBL001", "table-caption", "error", "Add a caption that states the table's purpose", "A caption makes the table understandable independently of surrounding text.", "<table><tr><td>Value</td></tr></table>", "<table><caption>Values</caption><tr><td>Value</td></tr></table>"),
  rule("TBL002", "table-headers", "error", 'Use th with scope="col" or scope="row"', "Explicit headers preserve the relationship between labels and table cells.", "<table><tr><td>Item</td></tr></table>", '<table><tr><th scope="col">Item</th></tr></table>'),
  rule("DET001", "details-summary", "error", "Add a summary that names the collapsible content", "A named summary gives the disclosure control an accessible label.", "<details><p>Content</p></details>", "<details><summary>Details</summary><p>Content</p></details>"),
  rule("INT001", "canvas-name", "error", "Name the canvas with aria-label or aria-labelledby", "Assistive technology needs a name to identify canvas content.", '<canvas aria-describedby="caption"></canvas>', '<canvas aria-label="Latency chart"></canvas>'),
  rule("INT002", "mermaid-source", "error", "Keep the diagram source in the document text", "Mermaid source must remain available when JavaScript is unavailable.", '<pre class="mermaid"></pre>', '<pre class="mermaid">flowchart LR; A-->B</pre>'),
  rule("INT101", "chart-fallback", "warning", "Repeat important chart values in an HTML table", "Canvas-only values are unavailable in environments that cannot read the canvas.", '<section><canvas aria-label="Trend"></canvas></section>', '<section><canvas aria-label="Trend"></canvas><table><caption>Trend</caption></table></section>'),
  rule("MD001", "markdown-single-h1", "error", "Use exactly one non-empty level-one heading", "A Markdown document needs one stable title for navigation and accessibility.", "Body without a title", "# Document title"),
  rule("MD002", "markdown-safe-url", "error", "Replace the unsafe Markdown URL", "Unsafe URL schemes cannot be served without creating a script or data-exposure risk.", "[Run](javascript:alert(1))", "[Read more](./details.md)"),
  rule("MD003", "markdown-mermaid-syntax", "error", "Fix the Mermaid diagram syntax", "Invalid Mermaid source fails only after the document is opened unless lint validates it.", "```mermaid\nflowchart LR\nA-->\n```", "```mermaid\nflowchart LR\nA-->B\n```"),
  rule("SEM101", "semantic-section", "warning", "Use section, aside, nav, or another meaningful element", "A heading and its content should be grouped with semantic structure.", "<article><div><h2>Overview</h2></div></article>", "<article><section><h2>Overview</h2></section></article>"),
] as const satisfies readonly RuleDefinition[];

export const RULE_BY_ID: ReadonlyMap<RuleId, RuleDefinition> = new Map(
  RULES.map((definition) => [definition.id, definition]),
);

const BUILTIN_RULE_IDS: Readonly<Record<string, RuleId>> = {
  "close-order": "HTML001",
  "no-dup-attr": "HTML001",
  "script-element": "HTML001",
  "void-content": "HTML001",
  "no-unknown-elements": "HTML002",
  "attribute-allowed-values": "HTML003",
  "attribute-misuse": "HTML003",
  deprecated: "HTML003",
  "element-name": "HTML003",
  "element-permitted-content": "HTML003",
  "element-permitted-occurrences": "HTML003",
  "element-permitted-order": "HTML003",
  "element-permitted-parent": "HTML003",
  "element-required-ancestor": "HTML003",
  "element-required-attributes": "HTML003",
  "element-required-content": "HTML003",
  "no-deprecated-attr": "HTML003",
  "no-unknown-attributes": "HTML003",
  "valid-id": "HTML003",
  "heading-level": "DOC004",
  "no-dup-id": "REF001",
  "wcag/h37": "A11Y001",
  "no-missing-references": "A11Y002",
  "wcag/h63": "TBL002",
};

export function ruleForBuiltin(ruleId: string): RuleId | undefined {
  return BUILTIN_RULE_IDS[ruleId];
}

export const BUILTIN_RULES: Readonly<Record<string, "error">> = {
  "close-order": "error",
  "no-dup-attr": "error",
  "script-element": "error",
  "void-content": "error",
  ...Object.fromEntries(
    Object.keys(BUILTIN_RULE_IDS).map((ruleId) => [ruleId, "error"]),
  ),
};

export function getRule(id: RuleId): RuleDefinition {
  const definition = RULE_BY_ID.get(id);
  if (definition === undefined) {
    throw new Error(`Unknown lint rule: ${id}`);
  }
  return definition;
}
