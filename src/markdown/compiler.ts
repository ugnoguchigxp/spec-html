import GithubSlugger from "github-slugger";
import { Marked, Renderer, type Token, type Tokens } from "marked";

import { decodeHtmlCharacterReferences } from "../content/html-character-references.js";
import { canonicalizeLanguageTag } from "./language.js";
import {
  sanitizeMarkdownUrl,
  type MarkdownUrlKind,
} from "./url-policy.js";

export interface MarkdownCompileOptions {
  language: string;
}

export interface MarkdownHeading {
  depth: number;
  id: string;
  text: string;
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
  notices: readonly MarkdownNotice[];
}

interface CompileState {
  headings: MarkdownHeading[];
  notices: MarkdownNotice[];
  noticeKeys: Set<string>;
  slugger: GithubSlugger;
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
  const state: CompileState = {
    headings: [],
    notices: [],
    noticeKeys: new Set(),
    slugger: new GithubSlugger(),
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
    notices: state.notices,
  };
}

class MarkdownRenderer extends Renderer {
  constructor(private readonly state: CompileState) {
    super();
  }

  override heading({ tokens, depth }: Tokens.Heading): string {
    const text = plainText(tokens).trim();
    const id = this.state.slugger.slug(text || "section");
    this.state.headings.push({ depth, id, text });
    return `<h${depth} id="${escapeHtml(id)}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
  }

  override html({ text }: Tokens.HTML | Tokens.Tag): string {
    this.notice("raw-html", "Raw HTML was rendered as literal text.", text);
    return escapeHtml(text);
  }

  override code(token: Tokens.Code): string {
    const language = token.lang?.trim().split(/\s+/, 1)[0]?.toLowerCase();
    if (language === "mermaid") {
      return `<pre class="mermaid" data-spec-html-source="markdown">${escapeHtml(token.text)}\n</pre>\n`;
    }
    return super.code(token);
  }

  override tablecell(token: Tokens.TableCell): string {
    const rendered = super.tablecell(token);
    return token.header
      ? rendered.replace(/^<th(?=[ >])/, '<th scope="col"')
      : rendered;
  }

  override link({ href, title, tokens }: Tokens.Link): string {
    const label = this.parser.parseInline(tokens);
    const safeHref = sanitizeMarkdownUrl(href, "link");
    if (safeHref === null) {
      this.unsafeUrlNotice("link", href);
      return label;
    }
    return `<a href="${escapeHtml(safeHref)}"${titleAttribute(title)}>${label}</a>`;
  }

  override image({ href, title, tokens }: Tokens.Image): string {
    const alt = plainText(tokens);
    const safeHref = sanitizeMarkdownUrl(href, "image");
    if (safeHref === null) {
      this.unsafeUrlNotice("image", href);
      return escapeHtml(alt);
    }
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
