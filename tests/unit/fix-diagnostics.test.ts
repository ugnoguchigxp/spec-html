import { describe, expect, it } from "vitest";
import {
  createFixProblem,
  createFixProjectResult,
  formatFixCompact,
  formatFixJson,
  type FixDocumentResult,
} from "../../src/fix/diagnostics.js";

function ready(file: string, changed: boolean): FixDocumentResult {
  return {
    file,
    status: "ready",
    output: "<article></article>",
    changed,
    fixes: changed
      ? [{
        kind: "tag-name",
        line: 2,
        column: 3,
        before: "sectoin",
        after: "section",
      }]
      : [],
    problems: [],
    diagnostics: [],
  };
}

describe("fix diagnostics", () => {
  it("sorts documents and formats a compact report", () => {
    const blocked: FixDocumentResult = {
      file: "z.html",
      status: "blocked",
      output: null,
      changed: false,
      fixes: [],
      problems: [createFixProblem("z.html", 4, 5, "FIX001", "broken quote")],
      diagnostics: [],
    };
    const result = createFixProjectResult([blocked, ready("a.html", true)]);

    expect(formatFixCompact(result)).toBe(`a.html
  2:3 F tag-name "sectoin" -> "section"
z.html
  4:5 E FIX001 ambiguous-syntax — 安全で一意な修正を決められないHTML構文がある; broken quote
summary files=2 changed=1 unchanged=0 blocked=1 fixes=1 lint-errors=0 lint-warnings=0
`);
  });

  it("emits versioned JSON and a one-line clean summary", () => {
    const clean = createFixProjectResult([ready("clean.html", false)]);
    const json = JSON.parse(formatFixJson(clean, "check")) as {
      version: number;
      mode: string;
      summary: { unchanged: number };
    };

    expect(formatFixCompact(clean)).toBe(
      "summary files=1 changed=0 unchanged=1 blocked=0 fixes=0 lint-errors=0 lint-warnings=0\n",
    );
    expect(json).toMatchObject({
      version: 1,
      mode: "check",
      summary: { unchanged: 1 },
    });
  });
});
