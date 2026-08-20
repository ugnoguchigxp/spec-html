import type { LocalReference } from "./document.js";
import {
  createDiagnostic,
  type LintDiagnostic,
} from "./diagnostics.js";
import { compileMarkdown } from "../markdown/compiler.js";
import { messageOf } from "../shared/error-message.js";

export interface MarkdownFacts {
  file: string;
  ids: ReadonlySet<string>;
  references: readonly LocalReference[];
}

export interface MarkdownLintResult {
  diagnostics: readonly LintDiagnostic[];
  facts: MarkdownFacts;
}

/** Lint the Markdown features that the viewer renders directly. */
export async function lintMarkdownDocument(
  source: string,
  relativePath: string,
): Promise<MarkdownLintResult> {
  const compiled = compileMarkdown(source, { language: "en" });
  const diagnostics: LintDiagnostic[] = [];
  const h1 = compiled.headings.filter((heading) => heading.depth === 1);
  if (h1.length !== 1 || h1[0]?.text.trim().length === 0) {
    diagnostics.push(
      createDiagnostic(relativePath, 1, 1, "MD001", String(h1.length)),
    );
  }

  for (const notice of compiled.notices) {
    if (notice.code === "raw-html") {
      continue;
    }
    const location = sourceLocation(source, notice.value);
    diagnostics.push(
      createDiagnostic(
        relativePath,
        location.line,
        location.column,
        "MD002",
        notice.value,
      ),
    );
  }

  if (compiled.mermaidDiagrams.length > 0) {
    const mermaid = await loadMermaidParser();
    for (const diagram of compiled.mermaidDiagrams) {
      try {
        await mermaid.parse(diagram.source);
      } catch (error: unknown) {
        const location = sourceLocation(source, diagram.source);
        diagnostics.push(
          createDiagnostic(
            relativePath,
            location.line,
            location.column,
            "MD003",
            messageOf(error),
          ),
        );
      }
    }
  }

  return {
    diagnostics,
    facts: {
      file: relativePath,
      ids: new Set(compiled.headings.map((heading) => heading.id)),
      references: compiled.references.map((reference) => {
        const location = sourceLocation(source, reference.value);
        return {
          value: reference.value,
          element: reference.kind === "link" ? "a" : "img",
          attribute: reference.kind === "link" ? "href" : "src",
          line: location.line,
          column: location.column,
        };
      }),
    },
  };
}

interface MermaidParser {
  parse(source: string): Promise<unknown>;
}

let mermaidParser: Promise<MermaidParser> | undefined;

function loadMermaidParser(): Promise<MermaidParser> {
  mermaidParser ??= importMermaidParser();
  return mermaidParser;
}

async function importMermaidParser(): Promise<MermaidParser> {
  const dom = await createMermaidDom();
  const windowDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "window",
  );
  const documentDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "document",
  );
  let imported: unknown;
  try {
    defineGlobal("window", dom.window);
    defineGlobal("document", dom.window.document);
    const moduleName = "mermaid";
    imported = await import(moduleName);
  } catch (error: unknown) {
    if (isMissingMermaidPackage(error)) {
      throw new Error(
        "Mermaid syntax validation requires the optional mermaid package. Install mermaid in this project.",
        { cause: error },
      );
    }
    throw error;
  } finally {
    restoreGlobal("document", documentDescriptor);
    restoreGlobal("window", windowDescriptor);
    dom.window.close();
  }
  if (
    typeof imported !== "object" ||
    imported === null ||
    !("default" in imported) ||
    typeof imported.default !== "object" ||
    imported.default === null ||
    !("parse" in imported.default) ||
    typeof imported.default.parse !== "function"
  ) {
    throw new Error("Mermaid parser is unavailable");
  }
  return imported.default as MermaidParser;
}

interface MermaidDom {
  window: {
    document: Document;
    close(): void;
  };
}

async function createMermaidDom(): Promise<MermaidDom> {
  const moduleName = "jsdom";
  const imported: unknown = await import(moduleName);
  if (
    typeof imported !== "object" ||
    imported === null ||
    !("JSDOM" in imported) ||
    typeof imported.JSDOM !== "function"
  ) {
    throw new Error("DOM support for Mermaid syntax validation is unavailable");
  }
  const JSDOM = imported.JSDOM as new (html?: string) => MermaidDom;
  return new JSDOM("");
}

function defineGlobal(name: "window" | "document", value: unknown): void {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    enumerable: false,
    value,
    writable: true,
  });
}

function restoreGlobal(
  name: "window" | "document",
  descriptor: PropertyDescriptor | undefined,
): void {
  if (descriptor === undefined) {
    Reflect.deleteProperty(globalThis, name);
    return;
  }
  Object.defineProperty(globalThis, name, descriptor);
}

function isMissingMermaidPackage(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "ERR_MODULE_NOT_FOUND" ||
      error.code === "MODULE_NOT_FOUND") &&
    "message" in error &&
    typeof error.message === "string" &&
    /(?:package|module) ['"]?mermaid['"]?/iu.test(error.message)
  );
}

function sourceLocation(
  source: string,
  value: string,
): { line: number; column: number } {
  const index = source.indexOf(value);
  if (index < 0) {
    return { line: 1, column: 1 };
  }
  const before = source.slice(0, index);
  const lines = before.split(/\r?\n/u);
  return {
    line: lines.length,
    column: (lines.at(-1)?.length ?? 0) + 1,
  };
}
