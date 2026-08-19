import {
  Parser,
  StaticConfigLoader,
  type HtmlElement,
  type AttributeEvent,
  type Location,
  type Source,
} from "html-validate";
import { decodeHtmlCharacterReferences } from "../content/html-character-references.js";
import {
  canonicalMigrationPathKey,
  createMigrationLinkIndex,
  rewriteMigrationLink,
} from "./links.js";

export interface HtmlLinkRewrite {
  readonly line: number;
  readonly column: number;
  readonly before: string;
  readonly after: string;
}

export interface HtmlLinkBlocker {
  readonly line: number;
  readonly column: number;
  readonly element: string;
  readonly attribute: string;
  readonly value: string;
}

export interface HtmlLinkRewriteResult {
  readonly output: string;
  readonly rewrites: readonly HtmlLinkRewrite[];
  readonly blockers: readonly HtmlLinkBlocker[];
}

interface UrlAttribute {
  element: string;
  attribute: string;
  value: string;
  valueLocation: Location;
  target: HtmlElement;
}

const URL_ATTRIBUTES: ReadonlyMap<string, readonly string[]> = new Map([
  ["a", ["href", "ping"]],
  ["area", ["href"]],
  ["form", ["action"]],
  ["button", ["formaction"]],
  ["input", ["src", "formaction"]],
  ["blockquote", ["cite"]],
  ["q", ["cite"]],
  ["del", ["cite"]],
  ["ins", ["cite"]],
  ["link", ["href", "imagesrcset"]],
  ["base", ["href"]],
  ["meta", ["content"]],
  ["img", ["src", "srcset"]],
  ["script", ["src"]],
  ["video", ["src", "poster"]],
  ["audio", ["src"]],
  ["source", ["src", "srcset"]],
  ["track", ["src"]],
  ["iframe", ["src", "srcdoc"]],
  ["embed", ["src"]],
  ["object", ["data"]],
  ["image", ["href", "xlink:href"]],
  ["use", ["href", "xlink:href"]],
]);
const URL_ATTRIBUTE_NAMES = new Set(
  [...URL_ATTRIBUTES.values()].flat(),
);

const loader = new StaticConfigLoader({
  root: true,
  extends: [],
  elements: ["html5"],
  rules: {},
});
const config = Promise.resolve(
  loader.getConfigFor("spec-html-migrate-links.html"),
);

export async function rewriteHtmlMigrationLinks(
  source: string,
  absolutePath: string,
  relativePath: string,
  mapping: ReadonlyMap<string, string>,
): Promise<HtmlLinkRewriteResult> {
  const attributes = await collectUrlAttributes(source, absolutePath);
  const canonicalMapping = createMigrationLinkIndex(mapping);
  const edits: Array<{ start: number; end: number; value: string }> = [];
  const rewrites: HtmlLinkRewrite[] = [];
  const blockers: HtmlLinkBlocker[] = [];

  for (const attribute of attributes) {
    for (const candidate of attributeCandidates(attribute)) {
      const result = rewriteMigrationLink(
        candidate.value,
        relativePath,
        mapping,
        canonicalMapping,
      );
      if (result.kind !== "rewritten") {
        if (
          invalidResultTargetsMigration(result, canonicalMapping)
        ) {
          blockers.push({
            line: attribute.valueLocation.line,
            column: attribute.valueLocation.column + candidate.offset,
            element: attribute.element,
            attribute: attribute.attribute,
            value: candidate.value,
          });
          continue;
        }
        const decodedValue = decodeHtmlCharacterReferences(candidate.value);
        const decodedResult = decodedValue === candidate.value
          ? result
          : rewriteMigrationLink(
              decodedValue,
              relativePath,
              mapping,
              canonicalMapping,
            );
        if (
          decodedResult.kind === "rewritten" ||
          invalidResultTargetsMigration(decodedResult, canonicalMapping)
        ) {
          blockers.push({
            line: attribute.valueLocation.line,
            column: attribute.valueLocation.column + candidate.offset,
            element: attribute.element,
            attribute: attribute.attribute,
            value: candidate.value,
          });
        }
        continue;
      }
      const hasDownloadSemantics = attribute.target.hasAttribute("download") ||
        /markdown/i.test(attribute.target.getAttributeValue("type") ?? "");
      const isNavigation =
        (attribute.element === "a" || attribute.element === "area") &&
        attribute.attribute === "href" &&
        !hasDownloadSemantics &&
        candidate.value === attribute.value;
      if (!isNavigation) {
        blockers.push({
          line: attribute.valueLocation.line,
          column: attribute.valueLocation.column + candidate.offset,
          element: attribute.element,
          attribute: attribute.attribute,
          value: candidate.value,
        });
        continue;
      }
      edits.push({
        start: attribute.valueLocation.offset,
        end: attribute.valueLocation.offset + attribute.value.length,
        value: result.value,
      });
      rewrites.push({
        line: attribute.valueLocation.line,
        column: attribute.valueLocation.column,
        before: attribute.value,
        after: result.value,
      });
    }
  }

  blockers.push(
    ...collectEmbeddedBlockers(source, relativePath, mapping, canonicalMapping),
    ...collectRawSvgBlockers(source, relativePath, mapping, canonicalMapping),
  );

  let output = source;
  for (const edit of edits.sort((left, right) => right.start - left.start)) {
    output = `${output.slice(0, edit.start)}${edit.value}${output.slice(edit.end)}`;
  }
  return { output, rewrites, blockers: dedupeBlockers(blockers) };
}

function invalidResultTargetsMigration(
  result: ReturnType<typeof rewriteMigrationLink>,
  canonicalMapping: ReadonlyMap<string, string>,
): boolean {
  return result.kind === "invalid" &&
    result.targetPath !== null &&
    canonicalMapping.has(canonicalMigrationPathKey(result.targetPath));
}

async function collectUrlAttributes(
  source: string,
  absolutePath: string,
): Promise<UrlAttribute[]> {
  const parser = new Parser(await config);
  const attributes: UrlAttribute[] = [];
  parser.on("attr", (_event: string, data: AttributeEvent) => {
    const element = data.target.tagName.toLowerCase();
    const attribute = data.key.toLowerCase();
    if (
      typeof data.value !== "string" ||
      data.valueLocation === null ||
      (
        URL_ATTRIBUTES.get(element)?.includes(attribute) !== true &&
        !URL_ATTRIBUTE_NAMES.has(attribute) &&
        !attribute.startsWith("data-") &&
        attribute !== "style" &&
        !attribute.startsWith("on")
      )
    ) {
      return;
    }
    attributes.push({
      element,
      attribute,
      value: data.value,
      valueLocation: data.valueLocation,
      target: data.target,
    });
  });
  const input: Source = {
    data: source,
    filename: absolutePath,
    line: 1,
    column: 1,
    offset: 0,
  };
  parser.parseHtml(input);
  return attributes;
}

function attributeCandidates(
  attribute: UrlAttribute,
): Array<{ value: string; offset: number }> {
  if (attribute.element === "meta" && attribute.attribute === "content") {
    if (!/^refresh$/i.test(attribute.target.getAttributeValue("http-equiv") ?? "")) {
      return [];
    }
    const match = /^\s*\d+\s*;\s*url\s*=\s*(['"]?)(.*?)\1\s*$/i.exec(
      attribute.value,
    );
    const value = match?.[2];
    return value === undefined
      ? []
      : [{ value, offset: attribute.value.indexOf(value) }];
  }
  if (attribute.attribute === "ping") {
    return [...attribute.value.matchAll(/\S+/g)].map((match) => ({
      value: match[0],
      offset: match.index ?? 0,
    }));
  }
  if (attribute.attribute.endsWith("srcset")) {
    const candidates: Array<{ value: string; offset: number }> = [];
    for (const match of attribute.value.matchAll(/(?:^|,)\s*([^\s,]+)/g)) {
      const value = match[1];
      if (value !== undefined) {
        candidates.push({ value, offset: (match.index ?? 0) + match[0].indexOf(value) });
      }
    }
    return candidates;
  }
  if (attribute.attribute === "style") {
    const candidates: Array<{ value: string; offset: number }> = [];
    for (const match of attribute.value.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) {
      const value = match[2];
      if (value !== undefined) {
        candidates.push({ value, offset: (match.index ?? 0) + match[0].indexOf(value) });
      }
    }
    return dedupeCandidates([
      ...candidates,
      ...embeddedReferenceCandidates(attribute.value),
    ]);
  }
  if (
    attribute.attribute === "srcdoc" ||
    attribute.attribute.startsWith("on") ||
    attribute.attribute.startsWith("data-")
  ) {
    const decoded = decodeHtmlCharacterReferences(attribute.value);
    return dedupeCandidates([
      { value: attribute.value, offset: 0 },
      ...(decoded === attribute.value
        ? embeddedReferenceCandidates(attribute.value)
        : embeddedReferenceCandidates(decoded).map((candidate) => ({
            value: candidate.value,
            offset: 0,
          }))),
    ]);
  }
  return [{ value: attribute.value, offset: 0 }];
}

function collectEmbeddedBlockers(
  source: string,
  relativePath: string,
  mapping: ReadonlyMap<string, string>,
  canonicalMapping: ReadonlyMap<string, string>,
): HtmlLinkBlocker[] {
  const blockers: HtmlLinkBlocker[] = [];
  for (const block of source.matchAll(/<(script|style)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)) {
    const body = block[2] ?? "";
    const bodyOffset = (block.index ?? 0) + block[0].indexOf(body);
    for (const reference of embeddedReferenceCandidates(body)) {
      const { value } = reference;
      const result = rewriteMigrationLink(
        value,
        relativePath,
        mapping,
        canonicalMapping,
      );
      if (
        result.kind !== "rewritten" &&
        !invalidResultTargetsMigration(result, canonicalMapping)
      ) continue;
      const location = sourceLocation(source, bodyOffset + reference.offset);
      blockers.push({
        ...location,
        element: (block[1] ?? "script").toLowerCase(),
        attribute: "text",
        value,
      });
    }
  }
  return blockers;
}

function embeddedReferenceCandidates(
  source: string,
): Array<{ value: string; offset: number }> {
  const tokenPattern = /(?:\.{0,2}\/)?[^\s"'`()<>;&=]+\.(?:md|markdown)(?![\w-])(?:[?#][^\s"'`()<>;&]*)?/gi;
  const quotedStrings = [
    ...source.matchAll(/(["'])([^"'\r\n<>]*)\1/g),
  ];
  const quotedRanges = quotedStrings.map((reference) => ({
    start: reference.index ?? 0,
    end: (reference.index ?? 0) + reference[0].length,
  }));
  const candidates: Array<{ value: string; offset: number }> = [];
  for (const quoted of quotedStrings) {
    const value = quoted[2] ?? "";
    const valueOffset = (quoted.index ?? 0) + quoted[0].indexOf(value);
    if (/\.(?:md|markdown)(?![\w-])(?:[?#].*)?$/i.test(value)) {
      candidates.push({ value, offset: valueOffset });
    }
    for (const token of value.matchAll(tokenPattern)) {
      const tokenValue = token[0];
      const tokenOffset = token.index ?? 0;
      if (
        tokenOffset === 0 ||
        tokenValue.startsWith("./") ||
        tokenValue.startsWith("../")
      ) {
        candidates.push({ value: tokenValue, offset: valueOffset + tokenOffset });
      }
    }
  }
  const unquoted = [...source.matchAll(tokenPattern)].filter((reference) => {
    const offset = reference.index ?? 0;
    return !quotedRanges.some((range) =>
      offset >= range.start && offset < range.end
    );
  });
  candidates.push(...unquoted.map((reference) => ({
    value: reference[0],
    offset: reference.index ?? 0,
  })));
  return dedupeCandidates(candidates);
}

function collectRawSvgBlockers(
  source: string,
  relativePath: string,
  mapping: ReadonlyMap<string, string>,
  canonicalMapping: ReadonlyMap<string, string>,
): HtmlLinkBlocker[] {
  const blockers: HtmlLinkBlocker[] = [];
  for (const match of source.matchAll(
    /<([A-Za-z][\w:-]*)\b[^>]*?\b(xlink:href)\s*=\s*(["'])(.*?)\3/gi,
  )) {
    const value = match[4] ?? "";
    const decoded = decodeHtmlCharacterReferences(value);
    const result = rewriteMigrationLink(
      decoded,
      relativePath,
      mapping,
      canonicalMapping,
    );
    if (
      result.kind !== "rewritten" &&
      !invalidResultTargetsMigration(result, canonicalMapping)
    ) continue;
    const offset = (match.index ?? 0) + match[0].lastIndexOf(value);
    blockers.push({
      ...sourceLocation(source, offset),
      element: (match[1] ?? "svg").toLowerCase(),
      attribute: (match[2] ?? "xlink:href").toLowerCase(),
      value,
    });
  }
  return blockers;
}

function dedupeCandidates(
  candidates: Array<{ value: string; offset: number }>,
): Array<{ value: string; offset: number }> {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.offset}\0${candidate.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeBlockers(blockers: HtmlLinkBlocker[]): HtmlLinkBlocker[] {
  const seen = new Set<string>();
  return blockers.filter((blocker) => {
    const key = `${blocker.line}\0${blocker.column}\0${blocker.element}\0${blocker.attribute}\0${blocker.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sourceLocation(source: string, offset: number): { line: number; column: number } {
  const before = source.slice(0, offset);
  const lines = before.split("\n");
  return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
}
