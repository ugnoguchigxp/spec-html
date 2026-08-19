import type { ConvertMarkdownResult } from "./document.js";

export function formatConversionDiagnostics(
  result: ConvertMarkdownResult,
): string {
  const lines: string[] = [];
  for (const notice of result.notices) {
    lines.push(
      `${result.inputPath}: W ${notice.code} ${notice.message} (${compact(notice.value)})`,
    );
  }
  for (const diagnostic of result.diagnostics) {
    const severity = diagnostic.severity === "error" ? "E" : "W";
    const detail =
      diagnostic.detail === undefined ? "" : `; ${diagnostic.detail}`;
    lines.push(
      `${diagnostic.file}:${diagnostic.line}:${diagnostic.column} ${severity} ${diagnostic.rule} ${diagnostic.message}${detail}`,
    );
  }
  return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
}

export function formatConversionSummary(result: ConvertMarkdownResult): string {
  const errors = result.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  ).length;
  const warnings = result.diagnostics.length - errors;
  return `summary lint-errors=${errors} lint-warnings=${warnings} markdown-notices=${result.notices.length}`;
}

export function conversionHasErrors(result: ConvertMarkdownResult): boolean {
  return result.diagnostics.some(
    (diagnostic) => diagnostic.severity === "error",
  );
}

function compact(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 60 ? `${normalized.slice(0, 57)}...` : normalized;
}
