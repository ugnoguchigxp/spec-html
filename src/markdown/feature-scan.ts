export interface UnsupportedMarkdownFeature {
  readonly kind:
    | "front-matter"
    | "footnote"
    | "custom-heading-id"
    | "wiki-link"
    | "github-alert"
    | "math"
    | "mdx"
    | "directive";
  readonly line: number;
  readonly column: number;
  readonly message: string;
}

/** Find extension syntax that Marked would otherwise reinterpret or literalize. */
export function scanUnsupportedMarkdown(
  source: string,
): readonly UnsupportedMarkdownFeature[] {
  const normalized = source.startsWith("\ufeff") ? source.slice(1) : source;
  const lines = normalized.split(/\r?\n/);
  const findings: UnsupportedMarkdownFeature[] = [];
  const opening = lines[0];
  const closingIndex = opening === "---" || opening === "+++"
    ? lines.slice(1).findIndex((line) =>
        line === opening || (opening === "---" && line === "...")
      ) + 1
    : -1;
  const frontMatterBody = closingIndex > 0
    ? lines.slice(1, closingIndex)
    : [];
  if (
    closingIndex > 0 &&
    frontMatterBody.some((line) =>
      opening === "---"
        ? /^\s*[^\s:#][^:\r\n]*\s*:/.test(line)
        : /^\s*[^\s#=][^=\r\n]*\s*=/.test(line)
    )
  ) {
    findings.push({
      kind: "front-matter",
      line: 1,
      column: 1,
      message: "front matterは一括変換で意味を保持できません",
    });
  }
  const frontMatterEnd = findings.some((finding) => finding.kind === "front-matter")
    ? closingIndex
    : -1;
  let fence: { character: "`" | "~"; length: number } | null = null;
  for (const [index, line] of lines.entries()) {
    if (index <= frontMatterEnd) continue;
    const quoted = stripContainerPrefixes(line);
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(quoted.content);
    if (fence !== null) {
      if (
        fenceMatch !== null &&
        fenceMatch[1]?.[0] === fence.character &&
        fenceMatch[1].length >= fence.length &&
        /^\s*$/.test(fenceMatch[2] ?? "")
      ) {
        fence = null;
      }
      continue;
    }
    if (
      fenceMatch !== null &&
      !(fenceMatch[1]?.startsWith("`") === true &&
        (fenceMatch[2] ?? "").includes("`"))
    ) {
      const marker = fenceMatch[1] ?? "";
      const info = (fenceMatch[2] ?? "").trimStart();
      if (/^(?:math|latex|tex)\b/i.test(info)) {
        addFinding(findings, index, quoted.offset + (fenceMatch.index ?? 0), {
          kind: "math",
          message: "数式fenceは一括変換の対応範囲外です",
        });
      }
      fence = {
        character: marker[0] as "`" | "~",
        length: marker.length,
      };
      continue;
    }
    if (/^(?: {4}|\t)/.test(quoted.content)) continue;
    const scannable = maskInlineCode(quoted.content);
    addMatch(findings, scannable, index, quoted.offset, /^\s*\[\^[^\]]+\]:|\[\^[^\]]+\]/, {
      kind: "footnote",
      message: "footnote拡張は一括変換の対応範囲外です",
    });
    addMatch(findings, scannable, index, quoted.offset, /(?:^|\s)#{1,6}\s+.*\s+\{#[\w:.-]+\}\s*$/, {
      kind: "custom-heading-id",
      message: "custom heading ID拡張は一括変換の対応範囲外です",
    });
    addMatch(findings, scannable, index, quoted.offset, /!?\[\[[^\]]+\]\]/, {
      kind: "wiki-link",
      message: "wiki link／embed拡張は一括変換の対応範囲外です",
    });
    addMatch(findings, scannable, index, quoted.offset, /^\s*\[![A-Za-z][\w-]*\]/, {
      kind: "github-alert",
      message: "GitHub alert拡張は一括変換の対応範囲外です",
    });
    addMatch(findings, scannable, index, quoted.offset, /^\s*\$\$\s*$|\\\([^)]*\\\)|\\\[[^\]]*\\\]/, {
      kind: "math",
      message: "数式拡張は一括変換の対応範囲外です",
    });
    addMatch(findings, scannable, index, quoted.offset, /^\s*(?:import\s+.+\s+from\s+["'][^"']+["']|import\s+["'][^"']+["']|export(?:\s+default|\s+(?:const|let|var|function|class|\*))?\s+.+)(?:\s*;)?\s*$/, {
      kind: "mdx",
      message: "MDX module構文は一括変換の対応範囲外です",
    });
    addMatch(findings, scannable, index, quoted.offset, /^\s*(?:<\/?[A-Z][\w.:-]*(?:\s|\/?>)|\{[^{}\r\n]+\}\s*$)/, {
      kind: "mdx",
      message: "MDX JSX／expression構文は一括変換の対応範囲外です",
    });
    addMatch(findings, scannable, index, quoted.offset, /^\s*:::{1,}\s*[A-Za-z][\w-]*/, {
      kind: "directive",
      message: "Markdown directive拡張は一括変換の対応範囲外です",
    });
  }
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.kind}\0${finding.line}\0${finding.column}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function addMatch(
  findings: UnsupportedMarkdownFeature[],
  line: string,
  lineIndex: number,
  columnOffset: number,
  pattern: RegExp,
  detail: Pick<UnsupportedMarkdownFeature, "kind" | "message">,
): void {
  const match = pattern.exec(line);
  if (match === null) return;
  addFinding(findings, lineIndex, columnOffset + match.index, detail);
}

function addFinding(
  findings: UnsupportedMarkdownFeature[],
  lineIndex: number,
  columnIndex: number,
  detail: Pick<UnsupportedMarkdownFeature, "kind" | "message">,
): void {
  findings.push({
    ...detail,
    line: lineIndex + 1,
    column: columnIndex + 1,
  });
}

function stripContainerPrefixes(line: string): { content: string; offset: number } {
  let content = line;
  let offset = 0;
  while (true) {
    const prefix = /^(?: {0,3}>[ \t]?)+/.exec(content)?.[0] ??
      /^ {0,3}(?:[*+-]|\d{1,9}[.)])[ \t]+/.exec(content)?.[0] ?? "";
    if (prefix.length === 0) break;
    content = content.slice(prefix.length);
    offset += prefix.length;
  }
  return { content, offset };
}

function maskInlineCode(line: string): string {
  return line.replace(/(`+)(.*?)\1/g, (match) => " ".repeat(match.length));
}
