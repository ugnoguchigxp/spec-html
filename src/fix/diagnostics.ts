import { normalizeDetail, type LintDiagnostic } from "../lint/diagnostics.js";

export type FixMode = "check" | "write";
export type FixReporter = "compact" | "json";
export type FixStatus = "ready" | "blocked";

export type FixKind =
  | "tag-name"
  | "attribute-name"
  | "closing-tag-name"
  | "missing-closing-tag"
  | "attribute-quote"
  | "attribute-value"
  | "local-reference";

export type FixProblemCode = "FIX001" | "FIX002";

export interface AppliedFix {
  kind: FixKind;
  line: number;
  column: number;
  before: string;
  after: string;
}

export interface FixProblem {
  file: string;
  line: number;
  column: number;
  code: FixProblemCode;
  message: string;
  detail?: string;
}

export interface FixDocumentResult {
  file: string;
  status: FixStatus;
  output: string | null;
  changed: boolean;
  fixes: readonly AppliedFix[];
  problems: readonly FixProblem[];
  diagnostics: readonly LintDiagnostic[];
}

export interface FixProjectSummary {
  files: number;
  changed: number;
  unchanged: number;
  blocked: number;
  fixes: number;
  lintErrors: number;
  lintWarnings: number;
}

export interface FixProjectResult {
  documents: readonly FixDocumentResult[];
  summary: FixProjectSummary;
}

interface ProblemDefinition {
  name: string;
  message: string;
}

const PROBLEMS: Readonly<Record<FixProblemCode, ProblemDefinition>> = {
  FIX001: {
    name: "ambiguous-syntax",
    message: "安全で一意な修正を決められないHTML構文がある",
  },
  FIX002: {
    name: "fix-limit",
    message: "修正回数が上限に達したため処理を停止した",
  },
};

export function createFixProblem(
  file: string,
  line: number,
  column: number,
  code: FixProblemCode,
  detail?: string,
): FixProblem {
  return {
    file,
    line,
    column,
    code,
    message: PROBLEMS[code].message,
    ...(detail === undefined ? {} : { detail: normalizeDetail(detail) }),
  };
}

export function createFixProjectResult(
  documents: readonly FixDocumentResult[],
): FixProjectResult {
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
      fixes: sorted.flatMap((document) => document.fixes).length,
      lintErrors: sorted.flatMap((document) => document.diagnostics)
        .filter((diagnostic) => diagnostic.severity === "error").length,
      lintWarnings: sorted.flatMap((document) => document.diagnostics)
        .filter((diagnostic) => diagnostic.severity === "warning").length,
    },
  };
}

export function formatFixCompact(result: FixProjectResult): string {
  const lines: string[] = [];
  for (const document of result.documents) {
    if (document.fixes.length === 0 && document.problems.length === 0) {
      continue;
    }
    lines.push(document.file);
    for (const fix of document.fixes) {
      lines.push(
        `  ${fix.line}:${fix.column} F ${fix.kind} ${compactValue(fix.before)} -> ${compactValue(fix.after)}`,
      );
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

export function formatFixJson(
  result: FixProjectResult,
  mode: FixMode,
): string {
  const documents = result.documents.map((document) => ({
    file: document.file,
    status: document.status,
    changed: document.changed,
    fixes: document.fixes,
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

function compactValue(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return JSON.stringify([...compact].slice(0, 40).join(""));
}

function formatSummary(summary: FixProjectSummary): string {
  return `summary files=${summary.files} changed=${summary.changed} unchanged=${summary.unchanged} blocked=${summary.blocked} fixes=${summary.fixes} lint-errors=${summary.lintErrors} lint-warnings=${summary.lintWarnings}`;
}
