import { lintDocument } from "../lint/document.js";
import { messageOf } from "../shared/error-message.js";
import {
  createFormatProblem,
  sortAndDedupeFormatProblems,
  type FormatChange,
  type FormatDocumentResult,
  type FormatInputKind,
} from "./diagnostics.js";
import { normalizeEnvelope } from "./envelope.js";
import { formatHtml } from "./printer.js";

export async function formatDocument(
  source: string,
  absolutePath: string,
  relativePath: string,
): Promise<FormatDocumentResult> {
  const envelope = await normalizeEnvelope(source, absolutePath, relativePath);
  if (envelope.problems.some((problem) => problem.code === "FMT001")) {
    return blocked(relativePath, envelope.kind, envelope.problems);
  }

  const sourceLint = await lintDocument(source, absolutePath, relativePath);
  const syntaxProblems = sourceLint.diagnostics
    .filter((diagnostic) => diagnostic.rule === "HTML001")
    .map((diagnostic) =>
      createFormatProblem(
        relativePath,
        diagnostic.line,
        diagnostic.column,
        "FMT001",
        diagnostic.detail,
      )
    );
  if (syntaxProblems.length > 0) {
    return blocked(relativePath, envelope.kind, syntaxProblems);
  }
  if (envelope.problems.length > 0) {
    return blocked(relativePath, envelope.kind, envelope.problems);
  }

  let printed;
  try {
    printed = await formatHtml(envelope.source, absolutePath, relativePath);
  } catch (error: unknown) {
    const location = prettierLocation(error);
    return blocked(relativePath, envelope.kind, [
      createFormatProblem(
        relativePath,
        location.line,
        location.column,
        "FMT001",
        messageOf(error),
      ),
    ]);
  }

  const changes: FormatChange[] = [...envelope.changes];
  if (source.startsWith("\uFEFF") || printed.bomRemoved) {
    changes.push({ kind: "bom-removed" });
  }
  if (printed.output !== envelope.source) {
    changes.push({ kind: "layout-formatted" });
  }
  const lint = await lintDocument(printed.output, absolutePath, relativePath);
  return {
    file: relativePath,
    status: "ready",
    inputKind: envelope.kind,
    output: printed.output,
    changed: printed.output !== source,
    changes,
    problems: [],
    diagnostics: lint.diagnostics,
  };
}

function blocked(
  file: string,
  inputKind: FormatInputKind,
  problems: FormatDocumentResult["problems"],
): FormatDocumentResult {
  return {
    file,
    status: "blocked",
    inputKind,
    output: null,
    changed: false,
    changes: [],
    problems: sortAndDedupeFormatProblems(problems),
    diagnostics: [],
  };
}

function prettierLocation(error: unknown): { line: number; column: number } {
  if (
    typeof error === "object" && error !== null &&
    "loc" in error && typeof error.loc === "object" && error.loc !== null &&
    "start" in error.loc && typeof error.loc.start === "object" && error.loc.start !== null
  ) {
    const start = error.loc.start;
    if (
      "line" in start && typeof start.line === "number" &&
      "column" in start && typeof start.column === "number"
    ) {
      return { line: start.line, column: start.column + 1 };
    }
  }
  return { line: 1, column: 1 };
}
