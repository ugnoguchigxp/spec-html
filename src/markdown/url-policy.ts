import { decodeHtmlCharacterReferences } from "../content/html-character-references.js";

export type MarkdownUrlKind = "link" | "image";

const ALLOWED_SCHEMES: Readonly<Record<MarkdownUrlKind, ReadonlySet<string>>> =
  {
    link: new Set(["http", "https", "mailto", "tel"]),
    image: new Set(["http", "https"]),
  };

const SCHEME = /^([a-z][a-z\d+.-]*):/i;

export function isAllowedMarkdownUrl(
  value: string,
  kind: MarkdownUrlKind,
): boolean {
  return sanitizeMarkdownUrl(value, kind) !== null;
}

export function sanitizeMarkdownUrl(
  value: string,
  kind: MarkdownUrlKind,
): string | null {
  const inspected = decodeHtmlCharacterReferences(value, "\u0000");
  if (
    inspected.length === 0 ||
    inspected.trim() !== inspected ||
    hasControlCharacter(inspected)
  ) {
    return null;
  }

  const match = SCHEME.exec(inspected);
  if (
    match !== null &&
    !ALLOWED_SCHEMES[kind].has(match[1]!.toLowerCase())
  ) {
    return null;
  }

  try {
    decodeURI(inspected);
    const parsed = new URL(
      inspected,
      "https://spec-html.invalid/document.md",
    );
    if (match === null && parsed.protocol !== "https:") {
      return null;
    }
    return kind === "link" || !inspected.startsWith("#") ? inspected : null;
  } catch {
    return null;
  }
}

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}
