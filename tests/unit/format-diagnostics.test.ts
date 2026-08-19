import { describe, expect, it } from "vitest";
import {
  createFormatProblem,
  createFormatProjectResult,
  formatFormatCompact,
  formatFormatJson,
  sortAndDedupeFormatProblems,
  type FormatDocumentResult,
} from "../../src/format/diagnostics.js";

function ready(file: string, changed: boolean): FormatDocumentResult {
  return {
    file,
    status: "ready",
    inputKind: "fragment",
    output: `<article lang="en"><h1>${file}</h1></article>\n`,
    changed,
    changes: changed ? [{ kind: "layout-formatted" }] : [],
    problems: [],
    diagnostics: [],
  };
}

describe("format diagnostics", () => {
  it("sorts and deduplicates formatter problems by stable location key", () => {
    const later = createFormatProblem("b.html", 2, 1, "FMT004", "later");
    const first = createFormatProblem("a.html", 1, 2, "FMT001", "first");
    expect(sortAndDedupeFormatProblems([later, first, { ...first, detail: "duplicate" }]))
      .toEqual([first, later]);
  });

  it("sorts documents and creates a complete summary", () => {
    const blocked: FormatDocumentResult = {
      file: "b.html",
      status: "blocked",
      inputKind: "document",
      output: null,
      changed: false,
      changes: [],
      problems: [createFormatProblem("b.html", 2, 3, "FMT002", "<style>")],
      diagnostics: [],
    };
    const result = createFormatProjectResult([
      ready("c.html", false),
      blocked,
      ready("a.html", true),
    ]);

    expect(result.documents.map((document) => document.file)).toEqual([
      "a.html",
      "b.html",
      "c.html",
    ]);
    expect(result.summary).toEqual({
      files: 3,
      changed: 1,
      unchanged: 1,
      blocked: 1,
      lintErrors: 0,
      lintWarnings: 0,
    });
  });

  it("omits unchanged files from compact output", () => {
    const blocked: FormatDocumentResult = {
      file: "b.html",
      status: "blocked",
      inputKind: "document",
      output: null,
      changed: false,
      changes: [],
      problems: [createFormatProblem("b.html", 2, 3, "FMT002", "<style>")],
      diagnostics: [],
    };
    const result = createFormatProjectResult([
      ready("c.html", false),
      blocked,
      ready("a.html", true),
    ]);

    expect(formatFormatCompact(result)).toBe(`a.html
  F layout-formatted
b.html
  2:3 E FMT002 unsupported-head-content — headの内容を本文へ移すか削除してから再実行する; <style>
summary files=3 changed=1 unchanged=1 blocked=1 lint-errors=0 lint-warnings=0
`);
  });

  it("emits structured JSON without formatted HTML", () => {
    const result = createFormatProjectResult([ready("a.html", true)]);
    const json: unknown = JSON.parse(formatFormatJson(result, "check"));
    expect(json).toMatchObject({
      version: 1,
      mode: "check",
      summary: { files: 1, changed: 1 },
      documents: [{ file: "a.html", status: "ready", lint: { errors: 0, warnings: 0 } }],
    });
    expect(formatFormatJson(result, "check")).not.toContain("<article");
  });
});
