import {
  HtmlValidate,
  NodeType,
  Rule,
  StaticConfigLoader,
  type DOMReadyEvent,
  type HtmlElement,
  type Location,
  type Message,
} from "html-validate";
import {
  createDiagnostic,
  type LintDiagnostic,
  type RuleId,
} from "./diagnostics.js";
import { BUILTIN_RULES, ruleForBuiltin } from "./rules.js";

export interface LocalReference {
  value: string;
  element: string;
  attribute: string;
  line: number;
  column: number;
}

export interface DocumentFacts {
  file: string;
  ids: ReadonlySet<string>;
  references: readonly LocalReference[];
}

export interface DocumentLintResult {
  diagnostics: readonly LintDiagnostic[];
  facts: DocumentFacts | null;
}

interface SpecRuleContext {
  rule: RuleId;
  detail?: string;
}

const DIRECTIVE =
  /<!--[\s\S]*?html-validate-(?:enable|disable(?:-next|-block)?)[\s\S]*?-->/gi;
const URL_ATTRIBUTES: ReadonlyMap<string, readonly string[]> = new Map([
  ["a", ["href"]],
  ["link", ["href"]],
  ["img", ["src"]],
  ["script", ["src"]],
  ["video", ["src", "poster"]],
  ["audio", ["src"]],
  ["source", ["src"]],
  ["track", ["src"]],
  ["iframe", ["src"]],
  ["object", ["data"]],
  ["image", ["href"]],
  ["use", ["href"]],
]);

/** Lint one fragment without writing to stdout or stderr. */
export async function lintDocument(
  source: string,
  absolutePath: string,
  relativePath: string,
): Promise<DocumentLintResult> {
  const directives = findDirectives(source, relativePath);
  if (directives.length > 0) {
    return { diagnostics: directives, facts: null };
  }

  let facts: DocumentFacts | null = null;
  const validator = createValidator((document) => {
    facts = collectFacts(document, relativePath);
  });
  const report = await validator.validateString(source, absolutePath);
  const messages = report.results.flatMap((result) => result.messages);
  const parserMessages = messages.filter(
    (message) => message.ruleId === "parser-error",
  );

  if (parserMessages.length > 0) {
    return {
      diagnostics: parserMessages.map((message) =>
        createDiagnostic(
          relativePath,
          message.line ?? 1,
          message.column ?? 1,
          "HTML001",
          message.message,
        ),
      ),
      facts: null,
    };
  }

  const diagnostics = messages.flatMap((message) => {
    const diagnostic = convertMessage(message, relativePath);
    return diagnostic === null ? [] : [diagnostic];
  });
  return { diagnostics, facts };
}

function createValidator(
  saveFacts: (document: DOMReadyEvent["document"]) => void,
): HtmlValidate {
  class DocumentErrorsRule extends Rule<SpecRuleContext> {
    setup(): void {
      this.on("dom:ready", (event) => {
        reportDocumentErrors(this, event);
      });
    }
  }

  class DocumentWarningsRule extends Rule<SpecRuleContext> {
    setup(): void {
      this.on("dom:ready", (event) => {
        reportDocumentWarnings(this, event);
      });
    }
  }

  class CollectFactsRule extends Rule {
    setup(): void {
      this.on("dom:ready", (event) => {
        saveFacts(event.document);
      });
    }
  }

  return new HtmlValidate(
    new StaticConfigLoader({
      root: true,
      extends: [],
      elements: ["html5"],
      plugins: [
        {
          name: "spec-html",
          rules: {
            "spec-html/document-errors": DocumentErrorsRule,
            "spec-html/document-warnings": DocumentWarningsRule,
            "spec-html/collect-facts": CollectFactsRule,
          },
        },
      ],
      rules: {
        ...BUILTIN_RULES,
        "wcag/h63": ["error", { strict: true }],
        "spec-html/document-errors": "error",
        "spec-html/document-warnings": "warn",
        "spec-html/collect-facts": "error",
      },
    }),
  );
}

function reportDocumentErrors(
  rule: Rule<SpecRuleContext>,
  event: DOMReadyEvent,
): void {
  const { document } = event;
  const rootArticle = getRootArticle(document);
  if (rootArticle === null) {
    const target = document.root.childElements[0] ?? document.root;
    report(rule, target, "DOC001");
  } else {
    if (!hasTextAttribute(rootArticle, "lang")) {
      report(rule, rootArticle, "DOC002");
    }

    const headings = document.querySelectorAll("h1");
    if (headings.length !== 1) {
      report(rule, rootArticle, "DOC003", String(headings.length));
    } else {
      const [heading] = headings;
      if (heading !== undefined && !hasText(heading)) {
        report(rule, heading, "DOC003");
      }
    }
  }

  for (const figure of document.querySelectorAll("figure")) {
    const caption = figure.childElements.find((child) =>
      child.is("figcaption"),
    );
    if (caption === undefined || !hasText(caption)) {
      report(rule, figure, "FIG001");
    }
  }

  for (const table of document.querySelectorAll("table")) {
    const caption = table.childElements.find((child) => child.is("caption"));
    if (caption === undefined || !hasText(caption)) {
      report(rule, table, "TBL001");
    }
    const headers = table.querySelectorAll("th");
    if (table.querySelectorAll("td").length > 0 && headers.length === 0) {
      report(rule, table, "TBL002");
    }
    for (const header of headers) {
      const scope = header.getAttributeValue("scope");
      if (scope !== "col" && scope !== "row") {
        report(rule, header, "TBL002");
      }
    }
  }

  for (const details of document.querySelectorAll("details")) {
    const summary = details.firstElementChild;
    if (summary === null || !summary.is("summary") || !hasText(summary)) {
      report(rule, details, "DET001");
    }
  }

  const ids = new Map<string, HtmlElement>();
  for (const element of elementsInDocument(document)) {
    if (element.id !== null) {
      ids.set(element.id, element);
    }
  }

  for (const canvas of document.querySelectorAll("canvas")) {
    if (!hasCanvasName(canvas, ids)) {
      report(rule, canvas, "INT001");
    }
  }

  for (const mermaid of mermaidElements(document.querySelectorAll("pre"))) {
    if (!hasText(mermaid)) {
      report(rule, mermaid, "INT002");
    }
  }
}

function reportDocumentWarnings(
  rule: Rule<SpecRuleContext>,
  event: DOMReadyEvent,
): void {
  const { document } = event;
  const rootArticle = getRootArticle(document);

  for (const section of document.querySelectorAll("section")) {
    if (!hasTextAttribute(section, "id") && hasSectionHeading(section)) {
      report(rule, section, "DOC101");
    }
  }

  if (rootArticle !== null) {
    for (const child of rootArticle.childElements) {
      if (child.is("div") && hasDirectHeading(child)) {
        report(rule, child, "SEM101");
      }
    }
  }

  const visualElements = [
    ...document.querySelectorAll("canvas"),
    ...mermaidElements(document.querySelectorAll("pre")),
  ];
  for (const element of visualElements) {
    if (element.closest("figure") === null) {
      report(rule, element, "FIG101");
    }
  }

  for (const canvas of document.querySelectorAll("canvas")) {
    const scope = canvas.closest("section") ?? rootArticle;
    if (scope !== null && scope.querySelector("table") === null) {
      report(rule, canvas, "INT101");
    }
  }
}

function report(
  rule: Rule<SpecRuleContext>,
  element: HtmlElement,
  ruleId: RuleId,
  detail?: string,
): void {
  rule.report(element, ruleId, element.location, {
    rule: ruleId,
    ...(detail === undefined ? {} : { detail }),
  });
}

function hasText(element: HtmlElement | undefined): boolean {
  return element !== undefined && element.textContent.trim().length > 0;
}

function hasTextAttribute(element: HtmlElement, attribute: string): boolean {
  return (element.getAttributeValue(attribute) ?? "").trim().length > 0;
}

function hasCanvasName(
  canvas: HtmlElement,
  ids: ReadonlyMap<string, HtmlElement>,
): boolean {
  if (hasTextAttribute(canvas, "aria-label")) {
    return true;
  }
  const labelledBy = canvas.getAttributeValue("aria-labelledby")?.trim();
  if (labelledBy === undefined || labelledBy.length === 0) {
    return false;
  }
  const references = labelledBy.split(/\s+/);
  return (
    references.length > 0 && references.every((id) => hasText(ids.get(id)))
  );
}

function hasSectionHeading(section: HtmlElement): boolean {
  return section.childElements.some(
    (child) => child.is("h2") || (child.is("header") && hasDirectH2(child)),
  );
}

function hasDirectH2(element: HtmlElement): boolean {
  return element.childElements.some((child) => child.is("h2"));
}

function hasDirectHeading(element: HtmlElement): boolean {
  return element.childElements.some(
    (child) =>
      /^h[1-6]$/.test(child.tagName) ||
      (child.is("header") &&
        child.childElements.some((headerChild) =>
          /^h[1-6]$/.test(headerChild.tagName),
        )),
  );
}

function mermaidElements(elements: readonly HtmlElement[]): HtmlElement[] {
  return elements.filter((element) => element.classList.contains("mermaid"));
}

function getRootArticle(
  document: DOMReadyEvent["document"],
): HtmlElement | null {
  const roots = document.root.childElements;
  const hasRootText = document.root.childNodes.some(
    (node) =>
      node.nodeType === NodeType.TEXT_NODE &&
      node.textContent.trim().length > 0,
  );
  return !hasRootText && roots.length === 1 && roots[0]?.is("article")
    ? roots[0]
    : null;
}

function elementsInDocument(
  document: DOMReadyEvent["document"],
): HtmlElement[] {
  return document.root.childElements.flatMap((element) => [
    element,
    ...element.querySelectorAll("*"),
  ]);
}

function collectFacts(
  document: DOMReadyEvent["document"],
  file: string,
): DocumentFacts {
  const ids = new Set<string>();
  const references: LocalReference[] = [];
  for (const element of elementsInDocument(document)) {
    if (element.id !== null) {
      ids.add(element.id);
    }
    const attributes = URL_ATTRIBUTES.get(element.tagName);
    if (attributes === undefined) {
      continue;
    }
    for (const attributeName of attributes) {
      const attribute = element.getAttribute(attributeName);
      if (attribute === null || typeof attribute.value !== "string") {
        continue;
      }
      const location = attribute.valueLocation ?? attribute.keyLocation;
      references.push({
        value: attribute.value,
        element: element.tagName,
        attribute: attributeName,
        line: location.line,
        column: location.column,
      });
    }
  }
  return { file, ids, references };
}

function convertMessage(message: Message, file: string): LintDiagnostic | null {
  if (message.ruleId.startsWith("spec-html/")) {
    const context = message.context;
    if (!isSpecRuleContext(context)) {
      throw new Error(
        `Internal lint rule did not provide context: ${message.ruleId}`,
      );
    }
    return createDiagnostic(
      file,
      message.line ?? 1,
      message.column ?? 1,
      context.rule,
      context.detail,
    );
  }
  if (isMetadataGap(message)) {
    return null;
  }
  const rule = ruleForBuiltin(message.ruleId);
  if (rule === undefined) {
    throw new Error(`Unknown html-validate rule: ${message.ruleId}`);
  }
  return createDiagnostic(
    file,
    message.line ?? 1,
    message.column ?? 1,
    rule,
    message.message,
  );
}

/**
 * html-validate's html5 metadata omits these standard attributes even
 * though its own accessibility rules require them. Keep unknown-attribute
 * checking enabled while avoiding diagnostics for those upstream gaps.
 */
function isMetadataGap(message: Message): boolean {
  if (message.ruleId !== "no-unknown-attributes") {
    return false;
  }
  const context = message.context;
  if (!isAttributeContext(context)) {
    return false;
  }
  const tagName = context.tagName.toLowerCase();
  const attribute = context.attr.toLowerCase();
  return (
    (tagName === "img" && attribute === "alt") ||
    (tagName === "canvas" &&
      (attribute === "width" || attribute === "height")) ||
    tagName === "svg"
  );
}

function isAttributeContext(
  value: unknown,
): value is { tagName: string; attr: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "tagName" in value &&
    typeof value.tagName === "string" &&
    "attr" in value &&
    typeof value.attr === "string"
  );
}

function isSpecRuleContext(value: unknown): value is SpecRuleContext {
  return (
    typeof value === "object" &&
    value !== null &&
    "rule" in value &&
    typeof value.rule === "string"
  );
}

function findDirectives(source: string, file: string): LintDiagnostic[] {
  const diagnostics: LintDiagnostic[] = [];
  for (const match of source.matchAll(DIRECTIVE)) {
    const offset = match.index ?? 0;
    const location = locationAt(source, offset);
    diagnostics.push(
      createDiagnostic(file, location.line, location.column, "HTML004"),
    );
  }
  return diagnostics;
}

function locationAt(
  source: string,
  offset: number,
): Pick<Location, "line" | "column"> {
  const preceding = source.slice(0, offset);
  const lines = preceding.split(/\r\n|\r|\n/);
  return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
}
