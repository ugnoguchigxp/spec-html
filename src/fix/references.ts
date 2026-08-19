import { access, readdir, realpath, stat } from "node:fs/promises";
import { constants } from "node:fs";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";
import {
  Parser,
  StaticConfigLoader,
  type AttributeEvent,
  type Location,
  type Source,
} from "html-validate";
import { isSingleEditTypo } from "./document.js";
import type { AppliedFix } from "./diagnostics.js";

interface ReferenceAttribute {
  key: string;
  value: string;
  valueLocation: Location;
}

export interface ReferenceFixResult {
  output: string;
  fixes: readonly AppliedFix[];
  exhausted: boolean;
}

const MAX_REFERENCE_FIXES = 100;

const URL_ATTRIBUTES: ReadonlyMap<string, readonly string[]> = new Map([
  ["a", ["href"]],
  ["link", ["href"]],
  ["img", ["src"]],
  ["script", ["src"]],
  ["video", ["src", "poster"]],
  ["audio", ["src"]],
  ["source", ["src"]],
  ["track", ["src"]],
  ["iframe", ["src"]],
  ["object", ["data"]],
  ["image", ["href"]],
  ["use", ["href"]],
]);

const ID_REFERENCE_ATTRIBUTES = new Set([
  "aria-activedescendant",
  "aria-controls",
  "aria-describedby",
  "aria-details",
  "aria-errormessage",
  "aria-flowto",
  "aria-labelledby",
  "aria-owns",
  "headers",
]);

const loader = new StaticConfigLoader({
  root: true,
  extends: [],
  elements: ["html5"],
  rules: {},
});
const config = Promise.resolve(
  loader.getConfigFor("spec-html-fixer-references.html"),
);

export async function collectDocumentIds(
  source: string,
  absolutePath: string,
): Promise<ReadonlySet<string>> {
  const attributes = await collectReferenceAttributes(source, absolutePath);
  return new Set(
    attributes
      .filter((attribute) => attribute.key === "id")
      .map((attribute) => attribute.value),
  );
}

export async function fixDocumentReferences(
  source: string,
  absolutePath: string,
  relativePath: string,
  contentRoot: string,
  idsByFile: ReadonlyMap<string, ReadonlySet<string>>,
): Promise<ReferenceFixResult> {
  let output = source;
  const fixes: AppliedFix[] = [];
  for (let iteration = 0; iteration < MAX_REFERENCE_FIXES; iteration += 1) {
    const candidate = await findReferenceFix(
      output,
      absolutePath,
      relativePath,
      contentRoot,
      idsByFile,
    );
    if (candidate === null) {
      return { output, fixes, exhausted: false };
    }
    output = applyReferenceFix(output, candidate);
    fixes.push(candidate.fix);
  }
  const remaining = await findReferenceFix(
    output,
    absolutePath,
    relativePath,
    contentRoot,
    idsByFile,
  );
  return { output, fixes, exhausted: remaining !== null };
}

interface ReferenceCandidate {
  start: number;
  end: number;
  replacement: string;
  fix: AppliedFix;
}

async function findReferenceFix(
  source: string,
  absolutePath: string,
  relativePath: string,
  contentRoot: string,
  idsByFile: ReadonlyMap<string, ReadonlySet<string>>,
): Promise<ReferenceCandidate | null> {
  const attributes = await collectReferenceAttributes(source, absolutePath);
  return (
    findIdReferenceFix(
      source,
      attributes,
      idsByFile.get(relativePath) ?? new Set(),
    ) ??
    (await findUrlReferenceFix(
      source,
      attributes,
      absolutePath,
      relativePath,
      contentRoot,
      idsByFile,
    ))
  );
}

function findIdReferenceFix(
  source: string,
  attributes: readonly ReferenceAttribute[],
  ids: ReadonlySet<string>,
): ReferenceCandidate | null {
  for (const attribute of attributes) {
    if (!ID_REFERENCE_ATTRIBUTES.has(attribute.key)) {
      continue;
    }
    for (const token of attribute.value.matchAll(/\S+/g)) {
      const value = token[0];
      if (ids.has(value) || token.index === undefined) {
        continue;
      }
      const replacement = closestUnique(value, [...ids]);
      if (replacement === null) {
        continue;
      }
      const start = attribute.valueLocation.offset + token.index;
      return referenceCandidate(
        source,
        start,
        start + value.length,
        value,
        replacement,
      );
    }
  }
  return null;
}

async function findUrlReferenceFix(
  source: string,
  attributes: readonly ReferenceAttribute[],
  absolutePath: string,
  relativePath: string,
  contentRoot: string,
  idsByFile: ReadonlyMap<string, ReadonlySet<string>>,
): Promise<ReferenceCandidate | null> {
  for (const attribute of attributes) {
    if (!isUrlAttribute(attribute)) {
      continue;
    }
    const parts = splitLocalReference(attribute.value);
    if (parts === null) {
      continue;
    }
    const decodedPath = decode(parts.path);
    const rawFragment = parts.fragment;
    const decodedFragment = rawFragment === null ? null : decode(rawFragment);
    if (
      decodedPath === null ||
      hasUnsupportedPathSeparator(parts.path, decodedPath) ||
      (decodedFragment === null && rawFragment !== null)
    ) {
      continue;
    }

    if (decodedPath.length > 0) {
      const pathFix = await findPathFix(
        source,
        attribute,
        decodedPath,
        parts,
        absolutePath,
        contentRoot,
      );
      if (pathFix !== null) {
        return pathFix;
      }
    }

    if (
      decodedFragment === null ||
      decodedFragment.length === 0 ||
      rawFragment === null
    ) {
      continue;
    }
    const targetFile = await resolveReferenceFile(
      decodedPath,
      absolutePath,
      relativePath,
      contentRoot,
    );
    if (targetFile === null) {
      continue;
    }
    const ids = idsByFile.get(targetFile);
    if (ids === undefined || ids.has(decodedFragment)) {
      continue;
    }
    const replacement = closestUnique(decodedFragment, [...ids]);
    if (replacement === null) {
      continue;
    }
    const hashOffset = attribute.value.indexOf("#");
    if (hashOffset < 0) {
      continue;
    }
    const start = attribute.valueLocation.offset + hashOffset + 1;
    return referenceCandidate(
      source,
      start,
      start + rawFragment.length,
      rawFragment,
      replacement,
    );
  }
  return null;
}

async function findPathFix(
  source: string,
  attribute: ReferenceAttribute,
  decodedPath: string,
  parts: LocalReferenceParts,
  absolutePath: string,
  contentRoot: string,
): Promise<ReferenceCandidate | null> {
  const current = resolve(dirname(absolutePath), decodedPath);
  if (await isReadableFileWithin(contentRoot, current)) {
    return null;
  }

  const directoryPart = dirname(decodedPath);
  const file = basename(decodedPath);
  const candidateDirectory = resolve(dirname(absolutePath), directoryPart);
  if (!isWithin(contentRoot, candidateDirectory)) {
    return null;
  }
  let actualDirectory: string;
  try {
    actualDirectory = await realpath(candidateDirectory);
  } catch {
    return null;
  }
  if (!isWithin(contentRoot, actualDirectory)) {
    return null;
  }
  const entries = await readdir(actualDirectory, { withFileTypes: true });
  const sameExtension = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        extname(entry.name).toLowerCase() === extname(file).toLowerCase(),
    )
    .map((entry) => entry.name);
  const replacementName = closestUnique(file, sameExtension);
  if (replacementName === null) {
    return null;
  }
  const slash = parts.path.lastIndexOf("/");
  const prefix = slash < 0 ? "" : parts.path.slice(0, slash + 1);
  const replacementPath = `${prefix}${encodeURIComponent(replacementName)}`;
  const replacement = `${parts.leadingWhitespace}${replacementPath}${parts.query}${parts.fragment === null ? "" : `#${parts.fragment}`}${parts.trailingWhitespace}`;
  return referenceCandidate(
    source,
    attribute.valueLocation.offset,
    attribute.valueLocation.offset + attribute.value.length,
    attribute.value,
    replacement,
  );
}

async function resolveReferenceFile(
  path: string,
  absolutePath: string,
  relativePath: string,
  contentRoot: string,
): Promise<string | null> {
  if (path.length === 0) {
    return relativePath;
  }
  const candidate = resolve(dirname(absolutePath), path);
  if (!(await isReadableFileWithin(contentRoot, candidate))) {
    return null;
  }
  const actual = await realpath(candidate);
  return relative(contentRoot, actual).split(sep).join("/");
}

async function isReadableFileWithin(
  root: string,
  candidate: string,
): Promise<boolean> {
  if (!isWithin(root, candidate)) {
    return false;
  }
  try {
    const actual = await realpath(candidate);
    const stats = await stat(actual);
    await access(actual, constants.R_OK);
    return stats.isFile() && isWithin(root, actual);
  } catch {
    return false;
  }
}

interface LocalReferenceParts {
  leadingWhitespace: string;
  path: string;
  query: string;
  fragment: string | null;
  trailingWhitespace: string;
}

function splitLocalReference(value: string): LocalReferenceParts | null {
  const trimmed = value.trim();
  if (
    trimmed.length === 0 ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("/") ||
    /^[a-z][a-z\d+.-]*:/i.test(trimmed) ||
    trimmed.includes("\0")
  ) {
    return null;
  }
  const leadingLength = value.length - value.trimStart().length;
  const trailingLength = value.length - value.trimEnd().length;
  const hash = trimmed.indexOf("#");
  const beforeHash = hash < 0 ? trimmed : trimmed.slice(0, hash);
  const query = beforeHash.indexOf("?");
  return {
    leadingWhitespace: value.slice(0, leadingLength),
    path: query < 0 ? beforeHash : beforeHash.slice(0, query),
    query: query < 0 ? "" : beforeHash.slice(query),
    fragment: hash < 0 ? null : trimmed.slice(hash + 1),
    trailingWhitespace:
      trailingLength === 0 ? "" : value.slice(value.length - trailingLength),
  };
}

function hasUnsupportedPathSeparator(
  rawPath: string,
  decodedPath: string,
): boolean {
  return /%(?:2f|5c)/i.test(rawPath) || decodedPath.includes("\\");
}

async function collectReferenceAttributes(
  source: string,
  absolutePath: string,
): Promise<ReferenceAttribute[]> {
  const parser = new Parser(await config);
  const attributes: ReferenceAttribute[] = [];
  parser.on("attr", (_event: string, data: AttributeEvent) => {
    if (typeof data.value !== "string" || data.valueLocation === null) {
      return;
    }
    attributes.push({
      key: data.key.toLowerCase(),
      value: data.value,
      valueLocation: data.valueLocation,
    });
    const urlAttributes = URL_ATTRIBUTES.get(data.target.tagName);
    if (urlAttributes?.includes(data.key.toLowerCase()) === true) {
      attributes.push({
        key: `${data.target.tagName}:${data.key.toLowerCase()}`,
        value: data.value,
        valueLocation: data.valueLocation,
      });
    }
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

function isUrlAttribute(attribute: ReferenceAttribute): boolean {
  return attribute.key.includes(":");
}

function referenceCandidate(
  source: string,
  start: number,
  end: number,
  before: string,
  after: string,
): ReferenceCandidate {
  const location = locationAt(source, start);
  return {
    start,
    end,
    replacement: after,
    fix: {
      kind: "local-reference",
      line: location.line,
      column: location.column,
      before,
      after,
    },
  };
}

function applyReferenceFix(
  source: string,
  candidate: ReferenceCandidate,
): string {
  return `${source.slice(0, candidate.start)}${candidate.replacement}${source.slice(candidate.end)}`;
}

function closestUnique(
  value: string,
  candidates: readonly string[],
): string | null {
  const matches = candidates.filter((candidate) =>
    isSingleEditTypo(value.toLowerCase(), candidate.toLowerCase()),
  );
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

function decode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function isWithin(root: string, target: string): boolean {
  const path = relative(root, target);
  return (
    path.length === 0 ||
    (!isAbsolute(path) && !path.startsWith(`..${sep}`) && path !== "..")
  );
}

function locationAt(
  source: string,
  offset: number,
): { line: number; column: number } {
  const lines = source.slice(0, offset).split(/\r\n|\r|\n/);
  return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
}
