import { normalizeDetail, type LintDiagnostic } from "../lint/diagnostics.js";

export type FormatInputKind = "fragment" | "document";
export type FormatStatus = "ready" | "blocked";
export type FormatMode = "check" | "write";
export type FormatReporter = "compact" | "json";

export type FormatProblemCode =
  | "FMT001"
  | "FMT002"
  | "FMT003"
  | "FMT004";

export type FormatChangeKind =
  | "layout-formatted"
  | "document-envelope-removed"
  | "head-metadata-removed"
  | "envelope-attribute-copied"
  | "bom-removed";

export interface FormatProblem {
  file: string;
  line: number;
  column: number;
  code: FormatProblemCode;
  message: string;
  detail?: string;
}

export interface FormatChange {
  kind: FormatChangeKind;
  detail?: string;
}

export interface FormatDocumentResult {
  file: string;
  status: FormatStatus;
  inputKind: FormatInputKind;
  output: string | null;
  changed: boolean;
  changes: readonly FormatChange[];
  problems: readonly FormatProblem[];
  diagnostics: readonly LintDiagnostic[];
}

export interface FormatProjectSummary {
  files: number;
  changed: number;
  unchanged: number;
  blocked: number;
  lintErrors: number;
  lintWarnings: number;
}

export interface FormatProjectResult {
  documents: readonly FormatDocumentResult[];
  summary: FormatProjectSummary;
}

interface ProblemDefinition {
  name: string;
  message: string;
}

const PROBLEMS: Readonly<Record<FormatProblemCode, ProblemDefinition>> = {
  FMT001: {
    name: "parse-error",
    message: "HTML構文を直してから再実行する",
  },
  FMT002: {
    name: "unsupported-head-content",
    message: "headの内容を本文へ移すか削除してから再実行する",
  },
  FMT003: {
    name: "unsafe-envelope-attributes",
    message: "document wrapperの属性を本文へ移してから再実行する",
  },
  FMT004: {
    name: "unsupported-envelope",
    message: "full HTML documentのwrapperを明示的な構造へ直す",
  },
};

export function createFormatProblem(
  file: string,
  line: number,
  column: number,
  code: FormatProblemCode,
  detail?: string,
): FormatProblem {
  return {
    file,
    line,
    column,
    code,
    message: PROBLEMS[code].message,
    ...(detail === undefined ? {} : { detail: normalizeDetail(detail) }),
  };
}

export function sortAndDedupeFormatProblems(
  problems: readonly FormatProblem[],
): FormatProblem[] {
  const sorted = [...problems].sort((left, right) =>
    left.file.localeCompare(right.file, "en") ||
    left.line - right.line ||
    left.column - right.column ||
    left.code.localeCompare(right.code, "en")
  );
  const keys = new Set<string>();
  return sorted.filter((problem) => {
    const key = `${problem.file}\u0000${problem.line}\u0000${problem.column}\u0000${problem.code}`;
    if (keys.has(key)) {
      return false;
    }
    keys.add(key);
    return true;
  });
}

export function createFormatProjectResult(
  documents: readonly FormatDocumentResult[],
): FormatProjectResult {
  const sorted = [...documents].sort((left, right) =>
    left.file.localeCompare(right.file, "en")
  );
  return {
    documents: sorted,
    summary: {
      files: sorted.length,
      changed: sorted.filter((document) =>
        document.status === "ready" && document.changed
      ).length,
      unchanged: sorted.filter((document) =>
        document.status === "ready" && !document.changed
      ).length,
      blocked: sorted.filter((document) => document.status === "blocked").length,
      lintErrors: sorted.flatMap((document) => document.diagnostics)
        .filter((diagnostic) => diagnostic.severity === "error").length,
      lintWarnings: sorted.flatMap((document) => document.diagnostics)
        .filter((diagnostic) => diagnostic.severity === "warning").length,
    },
  };
}

export function formatFormatCompact(result: FormatProjectResult): string {
  const lines: string[] = [];
  for (const document of result.documents) {
    if (document.status === "ready" && !document.changed) {
      continue;
    }
    lines.push(document.file);
    for (const change of document.changes) {
      const marker = change.kind === "layout-formatted" ? "F" : "C";
      const detail = change.detail === undefined ? "" : `; ${change.detail}`;
      lines.push(`  ${marker} ${change.kind}${detail}`);
    }
    for (const problem of document.problems) {
      const definition = PROBLEMS[problem.code];
      const detail = problem.detail === undefined ? "" : `; ${problem.detail}`;
      lines.push(
        `  ${problem.line}:${problem.column} E ${problem.code} ${definition.name} — ${problem.message}${detail}`,
      );
    }
  }
  lines.push(formatSummary(result.summary));
  return `${lines.join("\n")}\n`;
}

export function formatFormatJson(
  result: FormatProjectResult,
  mode: FormatMode,
): string {
  const documents = result.documents.map((document) => ({
    file: document.file,
    status: document.status,
    inputKind: document.inputKind,
    changed: document.changed,
    changes: document.changes,
    problems: document.problems,
    lint: {
      errors: document.diagnostics.filter((diagnostic) =>
        diagnostic.severity === "error"
      ).length,
      warnings: document.diagnostics.filter((diagnostic) =>
        diagnostic.severity === "warning"
      ).length,
    },
  }));
  return `${JSON.stringify({ version: 1, mode, summary: result.summary, documents }, null, 2)}\n`;
}

function formatSummary(summary: FormatProjectSummary): string {
  return `summary files=${summary.files} changed=${summary.changed} unchanged=${summary.unchanged} blocked=${summary.blocked} lint-errors=${summary.lintErrors} lint-warnings=${summary.lintWarnings}`;
}
