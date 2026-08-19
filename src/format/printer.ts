import prettier from "prettier";
import { parseHtmlSource, type ElementSourceRecord } from "./envelope.js";

const FORMAT_OPTIONS = {
  parser: "html",
  tabWidth: 2,
  useTabs: false,
  printWidth: 100,
  htmlWhitespaceSensitivity: "css",
  embeddedLanguageFormatting: "off",
  endOfLine: "lf",
  singleAttributePerLine: false,
} as const satisfies prettier.Options;

const RAW_ELEMENTS = new Set(["pre", "textarea", "script", "style"]);
const MARKER_PREFIX = "SPEC_HTML_FORMAT_RAW_";

interface ProtectedContent {
  marker: string;
  content: string;
}

export interface PrintedHtml {
  output: string;
  bomRemoved: boolean;
}

export async function formatHtml(
  source: string,
  absolutePath: string,
  relativePath: string,
): Promise<PrintedHtml> {
  const bomRemoved = source.startsWith("\uFEFF");
  const normalized = source
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n");
  const { masked, protectedContents } = await protectRawContent(
    normalized,
    absolutePath,
    relativePath,
  );
  let output = await prettier.format(masked, FORMAT_OPTIONS);
  for (const protectedContent of protectedContents) {
    output = restoreRawContent(output, protectedContent);
  }
  return { output: ensureFinalNewline(output), bomRemoved };
}

async function protectRawContent(
  source: string,
  absolutePath: string,
  relativePath: string,
): Promise<{ masked: string; protectedContents: readonly ProtectedContent[] }> {
  const parsed = await parseHtmlSource(source, absolutePath, relativePath);
  const records = [...parsed.elements.values()]
    .filter(isRawElementWithContent)
    .sort((left, right) => right.content!.start - left.content!.start);
  let masked = source;
  const protectedContents: ProtectedContent[] = [];
  for (const [index, record] of records.entries()) {
    const content = record.content;
    if (content === null) {
      continue;
    }
    const marker = uniqueMarker(source, index);
    protectedContents.push({ marker, content: source.slice(content.start, content.end) });
    masked = `${masked.slice(0, content.start)}${marker}${masked.slice(content.end)}`;
  }
  return { masked, protectedContents };
}

function isRawElementWithContent(
  record: ElementSourceRecord,
): boolean {
  return RAW_ELEMENTS.has(record.element.tagName) && record.content !== null;
}

function uniqueMarker(source: string, index: number): string {
  let suffix = 0;
  while (true) {
    const marker = `${MARKER_PREFIX}${index}_${suffix}`;
    if (!source.includes(marker)) {
      return marker;
    }
    suffix += 1;
  }
}

function restoreRawContent(
  output: string,
  protectedContent: ProtectedContent,
): string {
  const markerIndex = output.indexOf(protectedContent.marker);
  if (markerIndex === -1 || output.indexOf(protectedContent.marker, markerIndex + 1) !== -1) {
    throw new Error("Formatter raw content marker could not be restored");
  }
  const contentStart = output.lastIndexOf(">", markerIndex) + 1;
  const contentEnd = output.indexOf("<", markerIndex + protectedContent.marker.length);
  if (
    contentStart === 0 ||
    contentEnd === -1 ||
    output.slice(contentStart, markerIndex).trim().length > 0 ||
    output.slice(markerIndex + protectedContent.marker.length, contentEnd).trim().length > 0
  ) {
    throw new Error("Formatter changed a raw content marker unexpectedly");
  }
  return `${output.slice(0, contentStart)}${protectedContent.content}${output.slice(contentEnd)}`;
}

function ensureFinalNewline(value: string): string {
  return `${value.replace(/\n*$/, "")}\n`;
}
