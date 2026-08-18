import { getRule } from "./rules.js";

export type DiagnosticSeverity = "error" | "warning";

export type RuleId =
  | "HTML001" | "HTML002" | "HTML003" | "HTML004"
  | "DOC001" | "DOC002" | "DOC003" | "DOC004" | "DOC101"
  | "REF001" | "REF002" | "REF003"
  | "A11Y001" | "A11Y002"
  | "FIG001" | "FIG101"
  | "TBL001" | "TBL002"
  | "DET001"
  | "INT001" | "INT002" | "INT101"
  | "SEM101";

export interface LintDiagnostic {
  file: string;
  line: number;
  column: number;
  severity: DiagnosticSeverity;
  rule: RuleId;
  name: string;
  message: string;
  detail?: string;
}

export interface LintSummary {
  files: number;
  errors: number;
  warnings: number;
  displayed: number;
  omitted: number;
}

export interface LintResult {
  diagnostics: LintDiagnostic[];
  summary: Omit<LintSummary, "displayed" | "omitted">;
}

export function createDiagnostic(
  file: string,
  line: number,
  column: number,
  rule: RuleId,
  detail?: string,
): LintDiagnostic {
  const definition = getRule(rule);
  return {
    file,
    line,
    column,
    severity: definition.severity,
    rule,
    name: definition.name,
    message: definition.message,
    ...(detail === undefined ? {} : { detail: normalizeDetail(detail) }),
  };
}

export function normalizeDetail(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return [...compact].slice(0, 60).join("");
}

export function sortAndDedupe(
  diagnostics: readonly LintDiagnostic[],
): LintDiagnostic[] {
  const sorted = [...diagnostics].sort(compareDiagnostics);
  const keys = new Set<string>();
  return sorted.filter((diagnostic) => {
    const key = `${diagnostic.file}\u0000${diagnostic.line}\u0000${diagnostic.column}\u0000${diagnostic.rule}`;
    if (keys.has(key)) {
      return false;
    }
    keys.add(key);
    return true;
  });
}

export function compareDiagnostics(
  left: LintDiagnostic,
  right: LintDiagnostic,
): number {
  return (
    left.file.localeCompare(right.file, "en") ||
    left.line - right.line ||
    left.column - right.column ||
    left.rule.localeCompare(right.rule, "en")
  );
}

export function formatCompact(result: LintResult, maxIssues: number): string {
  const { diagnostics, summary } = display(result, maxIssues);
  if (diagnostics.length === 0) {
    return `${formatSummary(summary)}\n`;
  }

  const lines: string[] = [];
  let currentFile: string | undefined;
  for (const diagnostic of diagnostics) {
    if (diagnostic.file !== currentFile) {
      if (currentFile !== undefined) {
        lines.push("");
      }
      currentFile = diagnostic.file;
      lines.push(diagnostic.file);
    }
    const severity = diagnostic.severity === "error" ? "E" : "W";
    const detail = diagnostic.detail ? `; ${diagnostic.detail}` : "";
    lines.push(
      `  ${diagnostic.line}:${diagnostic.column} ${severity} ${diagnostic.rule} ${diagnostic.name} — ${diagnostic.message}${detail}`,
    );
  }
  lines.push(formatSummary(summary));
  return `${lines.join("\n")}\n`;
}

export function formatJson(result: LintResult, maxIssues: number): string {
  const { diagnostics, summary } = display(result, maxIssues);
  return `${JSON.stringify({ version: 1, summary, diagnostics }, null, 2)}\n`;
}

function display(
  result: LintResult,
  maxIssues: number,
): { diagnostics: LintDiagnostic[]; summary: LintSummary } {
  const limit = maxIssues === 0 ? result.diagnostics.length : maxIssues;
  const diagnostics = result.diagnostics.slice(0, limit);
  return {
    diagnostics,
    summary: {
      ...result.summary,
      displayed: diagnostics.length,
      omitted: result.diagnostics.length - diagnostics.length,
    },
  };
}

function formatSummary(summary: LintSummary): string {
  const omitted = summary.omitted > 0
    ? ` displayed=${summary.displayed} omitted=${summary.omitted}`
    : "";
  return `summary files=${summary.files} errors=${summary.errors} warnings=${summary.warnings}${omitted}`;
}
