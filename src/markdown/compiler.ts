import GithubSlugger, { slug as githubSlug } from "github-slugger";
import { Lexer, Marked, Renderer, type Token, type Tokens } from "marked";

import { decodeHtmlCharacterReferences } from "../content/html-character-references.js";
import { canonicalizeLanguageTag } from "./language.js";
import {
  sanitizeMarkdownUrl,
  type MarkdownUrlKind,
} from "./url-policy.js";

export interface MarkdownCompileOptions {
  language: string;
  linkResolver?: (url: string) => string;
}

export interface MarkdownHeading {
  depth: number;
  id: string;
  text: string;
}

export interface MarkdownTableCaption {
  index: number;
  caption: string | null;
  headingId: string | null;
}

export interface MarkdownMermaidCaption {
  index: number;
  caption: string | null;
  headingId: string | null;
}

export interface MarkdownReference {
  kind: MarkdownUrlKind;
  value: string;
}

export interface MarkdownMermaidDiagram {
  source: string;
}

export type MarkdownNoticeCode =
  "raw-html" | "unsafe-link-url" | "unsafe-image-url";

export interface MarkdownNotice {
  code: MarkdownNoticeCode;
  message: string;
  value: string;
}

export interface MarkdownCompileResult {
  fragment: string;
  title: string | null;
  headings: readonly MarkdownHeading[];
  tableCaptions: readonly MarkdownTableCaption[];
  mermaidCaptions: readonly MarkdownMermaidCaption[];
  mermaidDiagrams: readonly MarkdownMermaidDiagram[];
  references: readonly MarkdownReference[];
  notices: readonly MarkdownNotice[];
}

interface CompileState {
  headings: MarkdownHeading[];
  notices: MarkdownNotice[];
  noticeKeys: Set<string>;
  slugger: GithubSlugger;
  tableCaptions: MarkdownTableCaption[];
  tableCaptionCandidates: Array<MarkdownHeading | null>;
  mermaidCaptions: MarkdownMermaidCaption[];
  mermaidDiagrams: MarkdownMermaidDiagram[];
  mermaidCaptionCandidates: Array<MarkdownHeading | null>;
  linkResolver: ((url: string) => string) | undefined;
  references: MarkdownReference[];
}

const markdownParser = new Marked({ async: false, breaks: false, gfm: true });

export function compileMarkdown(
  source: string,
  options: MarkdownCompileOptions,
): MarkdownCompileResult {
  const language = canonicalizeLanguageTag(options.language);
  const normalizedSource = source.startsWith("\ufeff")
    ? source.slice(1)
    : source;
  const candidates = collectCaptionCandidates(normalizedSource);
  const state: CompileState = {
    headings: [],
    notices: [],
    noticeKeys: new Set(),
    slugger: new GithubSlugger(),
    tableCaptions: [],
    tableCaptionCandidates: [...candidates.tables],
    mermaidCaptions: [],
    mermaidDiagrams: [],
    mermaidCaptionCandidates: [...candidates.mermaid],
    linkResolver: options.linkResolver,
    references: [],
  };
  const renderer = new MarkdownRenderer(state);
  const body = markdownParser.parse(normalizedSource, {
    async: false,
    breaks: false,
    gfm: true,
    renderer,
  });
  const fragment = `<article lang="${escapeHtml(language)}">\n${body}</article>\n`;

  const firstHeading = state.headings.find((heading) => heading.depth === 1);
  return {
    fragment,
    title:
      firstHeading === undefined || firstHeading.text.length === 0
        ? null
        : firstHeading.text,
    headings: state.headings,
    tableCaptions: state.tableCaptions,
    mermaidCaptions: state.mermaidCaptions,
    mermaidDiagrams: state.mermaidDiagrams,
    references: state.references,
    notices: state.notices,
  };
}

class MarkdownRenderer extends Renderer {
  constructor(private readonly state: CompileState) {
    super();
  }

  override heading({ tokens, depth }: Tokens.Heading): string {
    const text = plainText(tokens).trim();
    const slugSource = githubSlug(text).length === 0 ? "section" : text;
    const id = this.state.slugger.slug(slugSource);
    const heading = { depth, id, text };
    this.state.headings.push(heading);
    return `<h${depth} id="${escapeHtml(id)}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
  }

  override table(token: Tokens.Table): string {
    const output = super.table(token);
    const heading = this.state.tableCaptionCandidates.shift() ?? null;
    this.state.tableCaptions.push({
      index: this.state.tableCaptions.length,
      caption: heading?.text ?? null,
      headingId: heading?.id ?? null,
    });
    if (heading === null || heading.text.length === 0) {
      return output;
    }
    return output.replace(
      /^<table>\n/,
      `<table>\n<caption>${escapeHtml(heading.text)}</caption>\n`,
    );
  }

  override html({ text }: Tokens.HTML | Tokens.Tag): string {
    this.notice("raw-html", "Raw HTML was rendered as literal text.", text);
    return escapeHtml(text);
  }

  override code(token: Tokens.Code): string {
    const language = token.lang?.trim().split(/\s+/, 1)[0]?.toLowerCase();
    if (language === "mermaid") {
      this.state.mermaidDiagrams.push({ source: token.text });
      const heading = this.state.mermaidCaptionCandidates.shift() ?? null;
      this.state.mermaidCaptions.push({
        index: this.state.mermaidCaptions.length,
        caption: heading?.text ?? null,
        headingId: heading?.id ?? null,
      });
      const diagram = `<pre class="mermaid" data-spec-html-source="markdown">${escapeHtml(token.text)}\n</pre>`;
      return heading === null || heading.text.length === 0
        ? `${diagram}\n`
        : `<figure>${diagram}<figcaption>${escapeHtml(heading.text)}</figcaption></figure>\n`;
    }
    return super.code(token);
  }

  override tablecell(token: Tokens.TableCell): string {
    const element = token.header ? "th" : "td";
    const scope = token.header ? ' scope="col"' : "";
    const alignment =
      token.align === null ? "" : ` class="markdown-align-${token.align}"`;
    return `<${element}${scope}${alignment}>${this.parser.parseInline(token.tokens)}</${element}>\n`;
  }

  override link({ href, title, tokens }: Tokens.Link): string {
    const label = this.parser.parseInline(tokens);
    const safeHref = sanitizeMarkdownUrl(href, "link");
    if (safeHref === null) {
      this.unsafeUrlNotice("link", href);
      return label;
    }
    const resolvedHref = this.state.linkResolver?.(safeHref) ?? safeHref;
    this.state.references.push({ kind: "link", value: safeHref });
    return `<a href="${escapeHtml(resolvedHref)}"${titleAttribute(title)}>${label}</a>`;
  }

  override image({ href, title, tokens }: Tokens.Image): string {
    const alt = plainText(tokens);
    const safeHref = sanitizeMarkdownUrl(href, "image");
    if (safeHref === null) {
      this.unsafeUrlNotice("image", href);
      return escapeHtml(alt);
    }
    this.state.references.push({ kind: "image", value: safeHref });
    return `<img src="${escapeHtml(safeHref)}" alt="${escapeHtml(alt)}"${titleAttribute(title)}>`;
  }

  private unsafeUrlNotice(kind: MarkdownUrlKind, value: string): void {
    this.notice(
      kind === "link" ? "unsafe-link-url" : "unsafe-image-url",
      `Unsafe ${kind} URL was omitted.`,
      value,
    );
  }

  private notice(
    code: MarkdownNoticeCode,
    message: string,
    value: string,
  ): void {
    const key = `${code}\u0000${value}`;
    if (this.state.noticeKeys.has(key)) {
      return;
    }
    this.state.noticeKeys.add(key);
    this.state.notices.push({ code, message, value });
  }
}

function collectCaptionCandidates(source: string): {
  tables: Array<MarkdownHeading | null>;
  mermaid: Array<MarkdownHeading | null>;
} {
  const tables: Array<MarkdownHeading | null> = [];
  const mermaid: Array<MarkdownHeading | null> = [];
  const slugger = new GithubSlugger();
  const visitScope = (tokens: readonly Token[]): void => {
    let heading: MarkdownHeading | null = null;
    for (const token of tokens) {
      if (token.type === "heading") {
        const value = token as Tokens.Heading;
        const text = plainText(value.tokens).trim();
        const slugSource = githubSlug(text).length === 0 ? "section" : text;
        heading = { depth: value.depth, id: slugger.slug(slugSource), text };
        continue;
      }
      if (token.type === "table") {
        tables.push(heading);
        continue;
      }
      if (token.type === "code") {
        const language = (token as Tokens.Code).lang
          ?.trim().split(/\s+/, 1)[0]?.toLowerCase();
        if (language === "mermaid") mermaid.push(heading);
        continue;
      }
      if (token.type === "blockquote") {
        visitScope((token as Tokens.Blockquote).tokens);
        continue;
      }
      if (token.type === "list") {
        for (const item of (token as Tokens.List).items) {
          visitScope(item.tokens);
        }
      }
    }
  };
  visitScope(Lexer.lex(source, { gfm: true, breaks: false }));
  return { tables, mermaid };
}

function plainText(tokens: readonly Token[]): string {
  return tokens
    .map((token) => {
      switch (token.type) {
        case "br":
          return " ";
        case "checkbox":
          return "";
        case "codespan":
        case "escape":
        case "html": {
          const text: unknown = token.text;
          return typeof text === "string" ? text : "";
        }
        case "text": {
          const text: unknown = token.text;
          return typeof text === "string"
            ? decodeHtmlCharacterReferences(text)
            : "";
        }
        default:
          return "tokens" in token && token.tokens !== undefined
            ? plainText(token.tokens)
            : "";
      }
    })
    .join("");
}

function titleAttribute(title: string | null | undefined): string {
  return title === null || title === undefined
    ? ""
    : ` title="${escapeHtml(decodeHtmlCharacterReferences(title))}"`;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}
