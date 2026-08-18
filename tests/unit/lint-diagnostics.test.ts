import { describe, expect, it } from "vitest";
import {
  createDiagnostic,
  formatCompact,
  formatJson,
  sortAndDedupe,
  type LintResult,
} from "../../src/lint/diagnostics.js";
import { RULES } from "../../src/lint/rules.js";

function result(diagnostics: LintResult["diagnostics"]): LintResult {
  return {
    diagnostics,
    summary: {
      files: 2,
      errors: diagnostics.filter((item) => item.severity === "error").length,
      warnings: diagnostics.filter((item) => item.severity === "warning").length,
    },
  };
}

describe("lint diagnostics", () => {
  it("sorts by path, location, and rule while removing duplicate keys", () => {
    const diagnostics = sortAndDedupe([
      createDiagnostic("b.html", 1, 1, "DOC001"),
      createDiagnostic("a.html", 2, 1, "DOC001"),
      createDiagnostic("a.html", 1, 2, "DOC002"),
      createDiagnostic("a.html", 1, 2, "DOC002", "later detail"),
    ]);
    expect(diagnostics.map((item) => [item.file, item.line, item.column, item.rule])).toEqual([
      ["a.html", 1, 2, "DOC002"],
      ["a.html", 2, 1, "DOC001"],
      ["b.html", 1, 1, "DOC001"],
    ]);
  });

  it("formats compact diagnostics by file and limits after sorting", () => {
    const output = formatCompact(result(sortAndDedupe([
      createDiagnostic("b.html", 1, 1, "DOC001"),
      createDiagnostic("a.html", 2, 1, "DOC101"),
      createDiagnostic("a.html", 1, 1, "DOC002"),
    ])), 2);
    expect(output).toBe(`a.html
  1:1 E DOC002 document-language — 本文の主言語を指定する
  2:1 W DOC101 section-anchor — 安定したdeep link用の id をsectionへ付ける
summary files=2 errors=2 warnings=1 displayed=2 omitted=1
`);
  });

  it("formats a successful result as one compact summary line", () => {
    expect(formatCompact(result([]), 50)).toBe(
      "summary files=2 errors=0 warnings=0\n",
    );
  });

  it("formats parseable JSON without parsing message strings", () => {
    const output = formatJson(result([
      createDiagnostic("a.html", 1, 1, "DOC001", "first\n second"),
    ]), 50);
    const parsed = JSON.parse(output) as { version: number; diagnostics: Array<{ detail?: string }> };
    expect(parsed.version).toBe(1);
    expect(parsed.diagnostics[0]?.detail).toBe("first second");
  });

  it("keeps registry messages and compact lines within the output budgets", () => {
    expect(RULES.every((rule) => [...rule.message].length <= 80)).toBe(true);

    const detail = "あ".repeat(61);
    const output = formatCompact(result([
      createDiagnostic("document.html", 1, 1, "A11Y001", detail),
    ]), 0);
    const diagnosticLine = output.split("\n")[1];
    expect(diagnosticLine).toBeDefined();
    expect([...diagnosticLine!].length).toBeLessThanOrEqual(180);
    expect(output).toContain("あ".repeat(60));
    expect(output).not.toContain("あ".repeat(61));
  });
});
