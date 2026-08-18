import type { DiagnosticSeverity, RuleId } from "./diagnostics.js";

export interface RuleDefinition {
  id: RuleId;
  name: string;
  severity: DiagnosticSeverity;
  message: string;
  reason: string;
  bad: string;
  good: string;
}

function rule(
  id: RuleId,
  name: string,
  severity: DiagnosticSeverity,
  message: string,
  reason: string,
  bad: string,
  good: string,
): RuleDefinition {
  return { id, name, severity, message, reason, bad, good };
}

export const RULES = [
  rule("HTML001", "valid-syntax", "error", "位置に対応する構文を標準HTMLへ直す", "構文エラーがあると後続の構造検査は信頼できない。", "<p></div>", "<p></p>"),
  rule("HTML002", "known-element", "error", "内容に合う標準要素へ置き換える", "独自要素はViewerで意味や動作を保証できない。", "<card>Text</card>", "<article>Text</article>"),
  rule("HTML003", "conforming-markup", "error", "validatorが示す標準構造へ直す", "標準HTMLの要素、属性、親子関係に合わせる。", "<p><div>Text</div></p>", "<div><p>Text</p></div>"),
  rule("HTML004", "fixed-rules", "error", "suppressionを削除し、固定ruleへ適合させる", "inline suppressionは検査結果を不安定にする。", "<!-- html-validate-disable -->", "<!-- suppressionなしで修正 -->"),
  rule("DOC001", "root-article", "error", "最上位を article[lang] 1個にする", "Viewerへ渡す本文fragmentの文書境界を一意にする。", "<h1>Title</h1>", '<article lang="ja"><h1>Title</h1></article>'),
  rule("DOC002", "document-language", "error", "本文の主言語を指定する", "言語情報は読み上げと翻訳の基礎になる。", "<article><h1>題名</h1></article>", '<article lang="ja"><h1>題名</h1></article>'),
  rule("DOC003", "single-h1", "error", "文書題名を示す h1 を1個だけ置く", "文書の題名を一意にして見出し構造を明確にする。", '<article lang="ja"></article>', '<article lang="ja"><h1>題名</h1></article>'),
  rule("DOC004", "heading-order", "error", "直前の見出しから1段ずつ深くする", "見出し階層を飛ばすと構造を追いにくくなる。", "<h1>題名</h1><h3>詳細</h3>", "<h1>題名</h1><h2>詳細</h2>"),
  rule("DOC101", "section-anchor", "warning", "安定したdeep link用の id をsectionへ付ける", "h2を持つsectionは直接参照できると利用しやすい。", "<section><h2>概要</h2></section>", '<section id="overview"><h2>概要</h2></section>'),
  rule("REF001", "unique-id", "error", "各 id を一意にする", "同じ文書内のIDはfragment参照先を曖昧にする。", '<p id="a"></p><p id="a"></p>', '<p id="a"></p><p id="b"></p>'),
  rule("REF002", "resolved-fragment", "error", "参照値か対象 id を直す", "fragment参照先がないとリンク先へ移動できない。", '<a href="#missing">詳細</a>', '<section id="details"></section><a href="#details">詳細</a>'),
  rule("REF003", "resolved-local-file", "error", "content root内の実在する相対pathへ直す", "Viewerから解決できないlocal参照は利用できない。", '<img src="missing.svg">', '<img src="assets/chart.svg">'),
  rule("A11Y001", "image-alt", "error", "内容を表す alt、または装飾画像なら空の alt を指定する", "画像の意味を画像なしでも取得できるようにする。", '<img src="chart.svg">', '<img src="chart.svg" alt="月別の推移">'),
  rule("A11Y002", "aria-reference", "error", "実在する一意な id を参照する", "ARIA参照先がないと名称や説明を取得できない。", '<p aria-labelledby="missing"></p>', '<h2 id="title">題名</h2><p aria-labelledby="title"></p>'),
  rule("FIG001", "figure-caption", "error", "図表の意味を短く示す caption を置く", "図表の用途を本文から把握できるようにする。", "<figure><img alt=\"図\"></figure>", "<figure><img alt=\"図\"><figcaption>結果</figcaption></figure>"),
  rule("FIG101", "visual-figure", "warning", "図とcaptionを figure でまとめる", "可視化と説明を関連付けて読む順序を明確にする。", '<canvas aria-label="推移"></canvas>', '<figure><canvas aria-label="推移"></canvas><figcaption>推移</figcaption></figure>'),
  rule("TBL001", "table-caption", "error", "表の目的を示す caption を置く", "表の目的を表だけ読んでも分かるようにする。", "<table><tr><td>値</td></tr></table>", "<table><caption>値</caption><tr><td>値</td></tr></table>"),
  rule("TBL002", "table-headers", "error", 'th scope="col|row" を使う', "表の見出しとデータの対応を明示する。", "<table><tr><td>項目</td></tr></table>", '<table><tr><th scope="col">項目</th></tr></table>'),
  rule("DET001", "details-summary", "error", "開閉内容の題名を summary にする", "detailsの開閉操作に名前を付ける。", "<details><p>内容</p></details>", "<details><summary>詳細</summary><p>内容</p></details>"),
  rule("INT001", "canvas-name", "error", "aria-labelかaria-labelledbyで名前を付ける", "canvasの内容を支援技術へ識別可能にする。", '<canvas aria-describedby="caption"></canvas>', '<canvas aria-label="遅延グラフ"></canvas>'),
  rule("INT002", "mermaid-source", "error", "JavaScriptなしでも取得できるdiagram sourceを本文へ置く", "Mermaid sourceはJSが使えない環境でも必要になる。", '<pre class="mermaid"></pre>', '<pre class="mermaid">flowchart LR; A-->B</pre>'),
  rule("INT101", "chart-fallback", "warning", "重要な値をHTMLの table にも置く", "canvasだけでは数値を取得できない環境がある。", '<section><canvas aria-label="推移"></canvas></section>', '<section><canvas aria-label="推移"></canvas><table><caption>推移</caption></table></section>'),
  rule("SEM101", "semantic-section", "warning", "意味に応じて section、aside、nav などを使う", "見出しと本文のまとまりには意味のある要素を使う。", "<article><div><h2>概要</h2></div></article>", "<article><section><h2>概要</h2></section></article>"),
] as const satisfies readonly RuleDefinition[];

export const RULE_BY_ID: ReadonlyMap<RuleId, RuleDefinition> = new Map(
  RULES.map((definition) => [definition.id, definition]),
);

const BUILTIN_RULE_IDS: Readonly<Record<string, RuleId>> = {
  "close-order": "HTML001",
  "no-dup-attr": "HTML001",
  "script-element": "HTML001",
  "void-content": "HTML001",
  "no-unknown-elements": "HTML002",
  "attribute-allowed-values": "HTML003",
  "attribute-misuse": "HTML003",
  deprecated: "HTML003",
  "element-name": "HTML003",
  "element-permitted-content": "HTML003",
  "element-permitted-occurrences": "HTML003",
  "element-permitted-order": "HTML003",
  "element-permitted-parent": "HTML003",
  "element-required-ancestor": "HTML003",
  "element-required-attributes": "HTML003",
  "element-required-content": "HTML003",
  "no-deprecated-attr": "HTML003",
  "no-unknown-attributes": "HTML003",
  "valid-id": "HTML003",
  "heading-level": "DOC004",
  "no-dup-id": "REF001",
  "wcag/h37": "A11Y001",
  "no-missing-references": "A11Y002",
  "wcag/h63": "TBL002",
};

export function ruleForBuiltin(ruleId: string): RuleId | undefined {
  return BUILTIN_RULE_IDS[ruleId];
}

export const BUILTIN_RULES: Readonly<Record<string, "error">> = {
  "close-order": "error",
  "no-dup-attr": "error",
  "script-element": "error",
  "void-content": "error",
  ...Object.fromEntries(
    Object.keys(BUILTIN_RULE_IDS).map((ruleId) => [ruleId, "error"]),
  ),
};

export function getRule(id: RuleId): RuleDefinition {
  const definition = RULE_BY_ID.get(id);
  if (definition === undefined) {
    throw new Error(`Unknown lint rule: ${id}`);
  }
  return definition;
}
