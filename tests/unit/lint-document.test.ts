import { describe, expect, it } from "vitest";
import { lintDocument } from "../../src/lint/document.js";
import type { RuleId } from "../../src/lint/diagnostics.js";

const VALID = `<article lang="en">
  <h1>Service metrics</h1>
  <section id="latency">
    <h2>Latency</h2>
    <figure>
      <canvas aria-label="Latency chart">Latency chart.</canvas>
      <figcaption>Latency by release.</figcaption>
    </figure>
    <table>
      <caption>Latency by release</caption>
      <thead><tr><th scope="col">Release</th></tr></thead>
      <tbody><tr><th scope="row">1.0</th></tr></tbody>
    </table>
    <details><summary>Notes</summary><p>Stable.</p></details>
    <figure><pre class="mermaid">flowchart LR; A--&gt;B</pre><figcaption>Request flow.</figcaption></figure>
  </section>
</article>`;

async function rules(source: string): Promise<RuleId[]> {
  const result = await lintDocument(source, "/tmp/document.html", "document.html");
  return result.diagnostics.map((diagnostic) => diagnostic.rule);
}

describe("lintDocument", () => {
  it("accepts the complete valid fragment and collects facts", async () => {
    const result = await lintDocument(VALID, "/tmp/document.html", "document.html");
    expect(result.diagnostics).toEqual([]);
    expect(result.facts?.ids).toEqual(new Set(["latency"]));
  });

  it.each([
    ["DOC001", "before<article lang=\"en\"><h1>Title</h1></article>"],
    ["DOC002", '<article><h1>Title</h1></article>'],
    ["DOC003", '<article lang="en"><h1>One</h1><h1>Two</h1></article>'],
    ["DOC004", '<article lang="en"><h1>One</h1><h3>Three</h3></article>'],
    ["FIG001", '<article lang="en"><h1>One</h1><figure><p>Graph</p></figure></article>'],
    ["TBL001", '<article lang="en"><h1>One</h1><table><tr><td>Value</td></tr></table></article>'],
    ["DET001", '<article lang="en"><h1>One</h1><details><p>Value</p></details></article>'],
    ["INT001", '<article lang="en"><h1>One</h1><canvas aria-describedby="x"></canvas></article>'],
    ["INT002", '<article lang="en"><h1>One</h1><figure><pre class="mermaid"></pre><figcaption>Flow</figcaption></figure></article>'],
    ["DOC101", '<article lang="en"><h1>One</h1><section><h2>Two</h2></section></article>'],
    ["SEM101", '<article lang="en"><h1>One</h1><div><h2>Two</h2></div></article>'],
    ["FIG101", '<article lang="en"><h1>One</h1><canvas aria-label="Chart"></canvas></article>'],
    ["INT101", '<article lang="en"><h1>One</h1><section id="chart"><canvas aria-label="Chart"></canvas></section></article>'],
  ] as const)("reports %s for its project-specific violation", async (rule, source) => {
    await expect(rules(source)).resolves.toContain(rule);
  });

  it("converts builtin diagnostics and preserves valid boundaries", async () => {
    await expect(rules('<article lang="en"><h1>One</h1><unknown-element></unknown-element></article>')).resolves.toContain("HTML002");
    await expect(rules('<article lang="en"><h1>One</h1><img src="asset.svg"></article>')).resolves.toContain("A11Y001");
    await expect(rules('<article lang="en" unexpected="value"><h1>One</h1></article>')).resolves.toContain("HTML003");
    await expect(rules('<article lang="en"><h1>One</h1><p id="x"></p><p id="x"></p></article>')).resolves.toContain("REF001");
    await expect(rules('<article lang="en"><h1>One</h1><table><caption>Table</caption><tr><td>Value</td></tr></table></article>')).resolves.toContain("TBL002");
    await expect(rules('<article lang="en"><h1>One</h1><table><caption>Table</caption><tr><th>Value</th></tr></table></article>')).resolves.toContain("TBL002");
    await expect(rules('<article lang="en"><h1>One</h1><table><caption>Table</caption><tr><th scope="colgroup">Value</th></tr></table></article>')).resolves.toContain("TBL002");
    await expect(rules('<article lang="en"><h1>One</h1><table><caption>Table</caption><tr><th scope="col">Value</th></tr></table></article>')).resolves.not.toContain("TBL002");
  });

  it("reports directives alone and suppresses parser-derived diagnostics", async () => {
    const directive = await lintDocument(
      '<!-- html-validate-disable --><article lang="en"><h1>One</h1></article>',
      "/tmp/document.html",
      "document.html",
    );
    expect(directive.diagnostics.map((diagnostic) => diagnostic.rule)).toEqual(["HTML004"]);
    expect(directive.facts).toBeNull();

    const malformed = await lintDocument(
      '<article lang="en',
      "/tmp/document.html",
      "document.html",
    );
    expect(malformed.diagnostics).not.toEqual([]);
    expect(new Set(malformed.diagnostics.map((diagnostic) => diagnostic.rule))).toEqual(new Set(["HTML001"]));
    expect(malformed.facts).toBeNull();
  });

  it("continues independent checks when the root contract is invalid", async () => {
    await expect(
      rules('<div><figure><p>Graph</p></figure><canvas></canvas></div>'),
    ).resolves.toEqual(expect.arrayContaining(["DOC001", "FIG001", "INT001"]));
  });

  it("uses an article ID as a valid canvas label target", async () => {
    const source = '<article id="title" lang="en"><h1>Title</h1><canvas aria-labelledby="title"></canvas></article>';
    await expect(rules(source)).resolves.not.toContain("INT001");
  });
});
