import GithubSlugger, { slug as githubSlug } from "github-slugger";
import {
  HtmlElement,
  NodeType,
  Parser,
  StaticConfigLoader,
  type DOMNode,
  type Source,
} from "html-validate";
import { Lexer, type Token, type Tokens } from "marked";
import { decodeHtmlCharacterReferences } from "../content/html-character-references.js";
import { sanitizeMarkdownUrl } from "../markdown/url-policy.js";

export interface ContentParityResult {
  readonly matched: boolean;
  readonly mismatches: readonly string[];
}

interface HeadingFact {
  depth: number;
  id: string;
  text: string;
}

interface ImageFact {
  src: string;
  alt: string;
  title: string | null;
}

interface LinkFact {
  href: string;
  label: string;
  title: string | null;
}

interface CodeBlockFact {
  text: string;
  language: string | null;
}

interface ListFact {
  ordered: boolean;
  start: number | null;
  depth: number;
  items: number;
}

interface TableFact {
  cells: string[][];
  align: Array<"left" | "center" | "right" | null>;
}

interface ContentFacts {
  visibleText: string;
  headings: HeadingFact[];
  codeBlocks: CodeBlockFact[];
  inlineCode: string[];
  mermaid: string[];
  tasks: Array<boolean | null>;
  images: ImageFact[];
  links: LinkFact[];
  tables: TableFact[];
  paragraphs: number;
  blockquotes: number[];
  lists: ListFact[];
  marks: string[];
  horizontalRules: number;
  lineBreaks: number;
}

const loader = new StaticConfigLoader({
  root: true,
  extends: [],
  elements: ["html5"],
  rules: {},
});
const config = Promise.resolve(loader.getConfigFor("spec-html-parity.html"));

export async function compareMarkdownWithHtml(
  markdown: string,
  html: string,
  absolutePath: string,
  linkResolver?: (url: string) => string,
): Promise<ContentParityResult> {
  const expected = collectMarkdownFacts(markdown, linkResolver);
  const actual = await collectHtmlFacts(html, absolutePath);
  const mismatches: string[] = [];
  compareFact("visible-text", expected.visibleText, actual.visibleText, mismatches);
  compareFact("headings", expected.headings, actual.headings, mismatches);
  compareFact("code-blocks", expected.codeBlocks, actual.codeBlocks, mismatches);
  compareFact("inline-code", expected.inlineCode, actual.inlineCode, mismatches);
  compareFact("mermaid", expected.mermaid, actual.mermaid, mismatches);
  compareFact("tasks", expected.tasks, actual.tasks, mismatches);
  compareFact("images", expected.images, actual.images, mismatches);
  compareFact("links", expected.links, actual.links, mismatches);
  compareFact("tables", expected.tables, actual.tables, mismatches);
  compareFact("paragraphs", expected.paragraphs, actual.paragraphs, mismatches);
  compareFact("blockquotes", expected.blockquotes, actual.blockquotes, mismatches);
  compareFact("lists", expected.lists, actual.lists, mismatches);
  compareFact("inline-marks", expected.marks, actual.marks, mismatches);
  compareFact("horizontal-rules", expected.horizontalRules, actual.horizontalRules, mismatches);
  compareFact("line-breaks", expected.lineBreaks, actual.lineBreaks, mismatches);
  return { matched: mismatches.length === 0, mismatches };
}

function collectMarkdownFacts(
  source: string,
  linkResolver: ((url: string) => string) | undefined,
): ContentFacts {
  const tokens = Lexer.lex(source.startsWith("\ufeff") ? source.slice(1) : source, {
    gfm: true,
    breaks: false,
  });
  const facts: ContentFacts = emptyFacts();
  const visible: string[] = [];
  const slugger = new GithubSlugger();
  collectMarkdownStructure(tokens, facts);

  const visit = (token: Token): void => {
    switch (token.type) {
      case "space":
      case "hr":
      case "def":
      case "checkbox":
        return;
      case "br":
        visible.push(" ");
        return;
      case "code": {
        const code = token as Tokens.Code;
        visible.push(code.text);
        const language = code.lang?.trim().split(/\s+/, 1)[0]?.toLowerCase();
        if (language === "mermaid") {
          facts.mermaid.push(normalizeCode(code.text));
        } else {
          facts.codeBlocks.push({
            text: normalizeCode(code.text),
            language: language ?? null,
          });
        }
        return;
      }
      case "codespan": {
        const code = token as Tokens.Codespan;
        visible.push(code.text);
        facts.inlineCode.push(code.text);
        return;
      }
      case "html": {
        const html = token as Tokens.HTML;
        visible.push(html.text);
        return;
      }
      case "image": {
        const image = token as Tokens.Image;
        const safe = sanitizeMarkdownUrl(image.href, "image");
        const alt = inlineText(image.tokens);
        if (safe !== null) {
          facts.images.push({ src: safe, alt, title: image.title ?? null });
        } else {
          visible.push(alt);
        }
        return;
      }
      case "link": {
        const link = token as Tokens.Link;
        const safe = sanitizeMarkdownUrl(link.href, "link");
        if (safe !== null) {
          facts.links.push({
            href: linkResolver?.(safe) ?? safe,
            label: inlineText(link.tokens),
            title: link.title ?? null,
          });
        }
        visitTokens(link.tokens, visit);
        return;
      }
      case "heading": {
        const heading = token as Tokens.Heading;
        const text = inlineText(heading.tokens).trim();
        const slugSource = githubSlug(text).length === 0 ? "section" : text;
        facts.headings.push({
          depth: heading.depth,
          id: slugger.slug(slugSource),
          text,
        });
        visitTokens(heading.tokens, visit);
        return;
      }
      case "list": {
        const list = token as Tokens.List;
        for (const item of list.items) {
          facts.tasks.push(item.task ? item.checked ?? false : null);
          visitTokens(item.tokens, visit);
        }
        return;
      }
      case "list_item": {
        const item = token as Tokens.ListItem;
        facts.tasks.push(item.task ? item.checked ?? false : null);
        visitTokens(item.tokens, visit);
        return;
      }
      case "table": {
        const table = token as Tokens.Table;
        const rows = [table.header, ...table.rows];
        facts.tables.push({
          cells: rows.map((row) => row.map((cell) => inlineText(cell.tokens))),
          align: [...table.align],
        });
        for (const row of rows) {
          for (const cell of row) {
            visitTokens(cell.tokens, visit);
          }
        }
        return;
      }
      default: {
        const children = tokensOf(token);
        if (children !== null) {
          visitTokens(children, visit);
          return;
        }
        const text = textOf(token);
        if (text !== null) {
          visible.push(text);
        }
      }
    }
  };
  visitTokens(tokens, visit);
  facts.visibleText = normalizeVisibleText(visible.join(" "));
  return facts;
}

async function collectHtmlFacts(
  source: string,
  absolutePath: string,
): Promise<ContentFacts> {
  const parser = new Parser(await config);
  const input: Source = {
    data: source,
    filename: absolutePath,
    line: 1,
    column: 1,
    offset: 0,
  };
  const root = parser.parseHtml(input);
  const article = root.querySelector("article") ?? root;
  const facts = emptyFacts();
  const orderedElements = descendantElementsInDocumentOrder(article);
  facts.visibleText = normalizeVisibleText(visibleHtmlText(article));
  facts.headings = orderedElements
    .filter(isHeading)
    .map((heading) => ({
      depth: Number(heading.tagName.slice(1)),
      id: heading.id ?? "",
      text: normalizeVisibleText(accessibleHtmlText(heading)),
    }));
  for (const code of article.querySelectorAll("code")) {
    if (code.parent?.is("pre") === true) {
      const className = code.getAttributeValue("class") ?? "";
      const language = /(?:^|\s)language-([^\s]+)/.exec(className)?.[1]
        ?.toLowerCase() ?? null;
      facts.codeBlocks.push({
        text: normalizeCode(decodeHtmlCharacterReferences(code.textContent)),
        language,
      });
    } else {
      facts.inlineCode.push(decodeHtmlCharacterReferences(code.textContent));
    }
  }
  facts.mermaid = article
    .querySelectorAll("pre.mermaid")
    .map((element) =>
      normalizeCode(decodeHtmlCharacterReferences(element.textContent))
    );
  facts.tasks = article.querySelectorAll("li").map((item) => {
    const checkbox = item.querySelector('input[type="checkbox"]');
    return checkbox === null ? null : checkbox.hasAttribute("checked");
  });
  facts.images = article.querySelectorAll("img").map((image) => ({
    src: decodeHtmlCharacterReferences(image.getAttributeValue("src") ?? ""),
    alt: decodeHtmlCharacterReferences(image.getAttributeValue("alt") ?? ""),
    title: nullableAttribute(image, "title"),
  }));
  facts.links = article.querySelectorAll("a").map((link) => ({
    href: decodeHtmlCharacterReferences(link.getAttributeValue("href") ?? ""),
    label: normalizeVisibleText(accessibleHtmlText(link)),
    title: nullableAttribute(link, "title"),
  }));
  facts.tables = article.querySelectorAll("table").map((table) => {
    const rows = table.querySelectorAll("tr").map((row) =>
      row.childElements
        .filter((cell) => cell.is("th") || cell.is("td"))
        .map((cell) => normalizeVisibleText(accessibleHtmlText(cell)))
    );
    const firstRow = table.querySelector("tr");
    const align = (firstRow?.childElements ?? [])
      .filter((cell) => cell.is("th") || cell.is("td"))
      .map(alignmentOf);
    return { cells: rows, align };
  });
  facts.paragraphs = article.querySelectorAll("p").length;
  facts.blockquotes = article.querySelectorAll("blockquote").map((quote) =>
    ancestorDepth(quote, "blockquote") + 1
  );
  facts.lists = orderedElements
    .filter((element) => element.is("ol") || element.is("ul"))
    .map((list) => ({
      ordered: list.is("ol"),
      start: list.is("ol")
        ? Number(list.getAttributeValue("start") ?? "1")
        : null,
      depth: ancestorListDepth(list) + 1,
      items: list.childElements.filter((child) => child.is("li")).length,
    }));
  facts.marks = orderedElements
    .filter((element) =>
      element.is("strong") || element.is("em") || element.is("del")
    )
    .map((element) => element.tagName.toLowerCase());
  facts.horizontalRules = article.querySelectorAll("hr").length;
  facts.lineBreaks = article.querySelectorAll("br").length;
  return facts;
}

function emptyFacts(): ContentFacts {
  return {
    visibleText: "",
    headings: [],
    codeBlocks: [],
    inlineCode: [],
    mermaid: [],
    tasks: [],
    images: [],
    links: [],
    tables: [],
    paragraphs: 0,
    blockquotes: [],
    lists: [],
    marks: [],
    horizontalRules: 0,
    lineBreaks: 0,
  };
}

function collectMarkdownStructure(tokens: readonly Token[], facts: ContentFacts): void {
  const visit = (
    items: readonly Token[],
    quoteDepth: number,
    listDepth: number,
  ): void => {
    for (const token of items) {
      switch (token.type) {
        case "paragraph":
          facts.paragraphs += 1;
          visit((token as Tokens.Paragraph).tokens, quoteDepth, listDepth);
          break;
        case "blockquote": {
          const nextDepth = quoteDepth + 1;
          facts.blockquotes.push(nextDepth);
          visit((token as Tokens.Blockquote).tokens, nextDepth, listDepth);
          break;
        }
        case "list": {
          const list = token as Tokens.List;
          const nextDepth = listDepth + 1;
          facts.lists.push({
            ordered: list.ordered,
            start: list.ordered ? Number(list.start ?? 1) : null,
            depth: nextDepth,
            items: list.items.length,
          });
          for (const item of list.items) visit(item.tokens, quoteDepth, nextDepth);
          break;
        }
        case "strong":
        case "em":
        case "del":
          facts.marks.push(token.type);
          visit((token as Tokens.Strong | Tokens.Em | Tokens.Del).tokens, quoteDepth, listDepth);
          break;
        case "hr":
          facts.horizontalRules += 1;
          break;
        case "br":
          facts.lineBreaks += 1;
          break;
        case "table": {
          const table = token as Tokens.Table;
          for (const cell of table.header) {
            visit(cell.tokens, quoteDepth, listDepth);
          }
          for (const row of table.rows) {
            for (const cell of row) {
              visit(cell.tokens, quoteDepth, listDepth);
            }
          }
          break;
        }
        default: {
          const children = tokensOf(token);
          if (children !== null) visit(children, quoteDepth, listDepth);
        }
      }
    }
  };
  visit(tokens, 0, 0);
}

function nullableAttribute(element: HtmlElement, name: string): string | null {
  const value = element.getAttributeValue(name);
  return value === null
    ? null
    : decodeHtmlCharacterReferences(value ?? "");
}

function ancestorDepth(element: HtmlElement, tagName: string): number {
  let depth = 0;
  let parent = element.parent;
  while (parent !== null) {
    if (parent instanceof HtmlElement && parent.is(tagName)) depth += 1;
    parent = parent.parent;
  }
  return depth;
}

function ancestorListDepth(element: HtmlElement): number {
  let depth = 0;
  let parent = element.parent;
  while (parent !== null) {
    if (parent instanceof HtmlElement && (parent.is("ol") || parent.is("ul"))) {
      depth += 1;
    }
    parent = parent.parent;
  }
  return depth;
}

function descendantElementsInDocumentOrder(root: HtmlElement): HtmlElement[] {
  const elements: HtmlElement[] = [];
  const visit = (parent: HtmlElement): void => {
    for (const child of parent.childElements) {
      elements.push(child);
      visit(child);
    }
  };
  visit(root);
  return elements;
}

function isHeading(element: HtmlElement): boolean {
  return /^h[1-6]$/.test(element.tagName.toLowerCase());
}

function visitTokens(tokens: readonly Token[], visit: (token: Token) => void): void {
  for (const token of tokens) {
    visit(token);
  }
}

function tokensOf(token: Token): readonly Token[] | null {
  if (!("tokens" in token) || !Array.isArray(token.tokens)) {
    return null;
  }
  return token.tokens;
}

function textOf(token: Token): string | null {
  if (!("text" in token) || typeof token.text !== "string") {
    return null;
  }
  return token.type === "text"
    ? decodeHtmlCharacterReferences(token.text)
    : token.text;
}

function inlineText(tokens: readonly Token[]): string {
  return tokens.map((token) => {
    if (token.type === "br") {
      return " ";
    }
    if (token.type === "image") {
      return (token as Tokens.Image).text;
    }
    const children = tokensOf(token);
    return children === null ? textOf(token) ?? "" : inlineText(children);
  }).join("");
}

function visibleHtmlText(element: HtmlElement): string {
  const values: string[] = [];
  const visit = (node: DOMNode): void => {
    if (node.nodeType === NodeType.TEXT_NODE) {
      values.push(node.textContent);
      return;
    }
    if (
      !(node instanceof HtmlElement) ||
      node.is("caption") ||
      node.is("figcaption") ||
      node.is("img")
    ) {
      return;
    }
    for (const child of node.childNodes) {
      visit(child);
    }
  };
  visit(element);
  return values.join(" ");
}

function accessibleHtmlText(element: HtmlElement): string {
  const values: string[] = [];
  const visit = (node: DOMNode): void => {
    if (node.nodeType === NodeType.TEXT_NODE) {
      values.push(node.textContent);
      return;
    }
    if (!(node instanceof HtmlElement)) return;
    if (node.is("br")) {
      values.push(" ");
      return;
    }
    if (node.is("img")) {
      values.push(node.getAttributeValue("alt") ?? "");
      return;
    }
    for (const child of node.childNodes) visit(child);
  };
  visit(element);
  return values.join("");
}

function alignmentOf(
  cell: HtmlElement,
): "left" | "center" | "right" | null {
  for (const alignment of ["left", "center", "right"] as const) {
    if (cell.classList.contains(`markdown-align-${alignment}`)) {
      return alignment;
    }
  }
  return null;
}

function normalizeVisibleText(value: string): string {
  return decodeHtmlCharacterReferences(value).replace(/\s+/g, " ").trim();
}

function normalizeCode(value: string): string {
  return value.replace(/\r\n?|\n/g, "\n").replace(/\n$/, "");
}

function compareFact(
  name: string,
  expected: unknown,
  actual: unknown,
  mismatches: string[],
): void {
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    mismatches.push(name);
  }
}
