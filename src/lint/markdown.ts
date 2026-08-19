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

async function loadMermaidParser(): Promise<{
  parse(source: string): Promise<unknown>;
}> {
  const moduleName = "mermaid";
  const imported: unknown = await import(moduleName);
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
  return imported.default as { parse(source: string): Promise<unknown> };
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
