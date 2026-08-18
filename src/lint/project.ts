import { access, readFile, realpath, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { findContentDocuments } from "../content/documents.js";
import {
  createDiagnostic,
  sortAndDedupe,
  type LintDiagnostic,
  type LintResult,
} from "./diagnostics.js";
import {
  lintDocument,
  type DocumentFacts,
  type LocalReference,
} from "./document.js";

interface DocumentRecord {
  facts: DocumentFacts | null;
}

/** Lint every viewer document in a content root. */
export async function lintProject(contentRoot: string): Promise<LintResult> {
  const root = await resolveContentRoot(contentRoot);
  const documents = await findContentDocuments(root);
  const diagnostics: LintDiagnostic[] = [];
  const records = new Map<string, DocumentRecord>();

  for (const document of documents) {
    const source = await readFile(document.absolutePath, "utf8");
    const result = await lintDocument(source, document.absolutePath, document.path);
    diagnostics.push(...result.diagnostics);
    records.set(document.path, { facts: result.facts });
  }

  for (const record of records.values()) {
    if (record.facts !== null) {
      diagnostics.push(...(await resolveReferences(root, records, record.facts)));
    }
  }

  const sorted = sortAndDedupe(diagnostics);
  return {
    diagnostics: sorted,
    summary: {
      files: documents.length,
      errors: sorted.filter((diagnostic) => diagnostic.severity === "error").length,
      warnings: sorted.filter((diagnostic) => diagnostic.severity === "warning").length,
    },
  };
}

async function resolveContentRoot(contentRoot: string): Promise<string> {
  let stats;
  try {
    stats = await stat(contentRoot);
  } catch {
    throw new Error(`対象ディレクトリが見つかりません: ${contentRoot}`);
  }
  if (!stats.isDirectory()) {
    throw new Error("対象パスはディレクトリではありません");
  }
  return realpath(contentRoot);
}

async function resolveReferences(
  root: string,
  records: ReadonlyMap<string, DocumentRecord>,
  facts: DocumentFacts,
): Promise<LintDiagnostic[]> {
  const diagnostics: LintDiagnostic[] = [];
  for (const reference of facts.references) {
    const resolved = await resolveReference(root, facts.file, reference);
    if (resolved.kind === "ignore") {
      continue;
    }
    if (resolved.kind === "invalid") {
      diagnostics.push(referenceDiagnostic(facts.file, reference, "REF003"));
      continue;
    }

    if (resolved.fragment === null || resolved.fragment.length === 0) {
      continue;
    }
    const target = records.get(resolved.path);
    if (target?.facts === null || target === undefined) {
      continue;
    }
    if (!target.facts.ids.has(resolved.fragment)) {
      diagnostics.push(referenceDiagnostic(facts.file, reference, "REF002"));
    }
  }
  return diagnostics;
}

type ResolvedReference =
  | { kind: "ignore" }
  | { kind: "invalid" }
  | { kind: "local"; path: string; fragment: string | null };

async function resolveReference(
  root: string,
  sourceFile: string,
  reference: LocalReference,
): Promise<ResolvedReference> {
  const value = reference.value.trim();
  const isHref = reference.attribute === "href";
  if (value.length === 0) {
    return isHref ? { kind: "ignore" } : { kind: "invalid" };
  }
  if (value.startsWith("//")) {
    return isValidExternalUrl(value) ? { kind: "ignore" } : { kind: "invalid" };
  }
  const scheme = /^([a-z][a-z\d+.-]*):/i.exec(value)?.[1]?.toLowerCase();
  if (scheme !== undefined) {
    const isExternal = ["http", "https", "mailto", "tel", "data", "blob"]
      .includes(scheme);
    return isExternal && isValidExternalUrl(value)
      ? { kind: "ignore" }
      : { kind: "invalid" };
  }
  if (value.includes("\0")) {
    return { kind: "invalid" };
  }

  const hashIndex = value.indexOf("#");
  const rawBeforeFragment = hashIndex === -1 ? value : value.slice(0, hashIndex);
  const rawFragment = hashIndex === -1 ? null : value.slice(hashIndex + 1);
  const queryIndex = rawBeforeFragment.indexOf("?");
  const rawPath = queryIndex === -1
    ? rawBeforeFragment
    : rawBeforeFragment.slice(0, queryIndex);
  const rawQuery = queryIndex === -1 ? null : rawBeforeFragment.slice(queryIndex + 1);
  if (isHref && rawPath.length === 0 && rawFragment === null) {
    return rawQuery !== null && hasMalformedPercentEncoding(rawQuery)
      ? { kind: "invalid" }
      : { kind: "ignore" };
  }
  if (rawPath.startsWith("/")) {
    return { kind: "invalid" };
  }

  let pathPart: string;
  let fragment: string | null;
  try {
    pathPart = decodeURIComponent(rawPath);
    fragment = rawFragment === null ? null : decodeURIComponent(rawFragment);
    if (rawQuery !== null && hasMalformedPercentEncoding(rawQuery)) {
      return { kind: "invalid" };
    }
  } catch {
    return { kind: "invalid" };
  }

  const candidate = isHref && pathPart.length === 0
    ? resolve(root, sourceFile)
    : resolve(root, dirname(sourceFile), pathPart || ".");
  if (!isWithin(root, candidate)) {
    return { kind: "invalid" };
  }

  let targetPath: string;
  let targetStats;
  try {
    targetPath = await realpath(candidate);
    targetStats = await stat(targetPath);
    await access(targetPath, constants.R_OK);
  } catch {
    return { kind: "invalid" };
  }
  if (!targetStats.isFile() || !isWithin(root, targetPath)) {
    return { kind: "invalid" };
  }

  return {
    kind: "local",
    path: toContentPath(root, targetPath),
    fragment,
  };
}

function hasMalformedPercentEncoding(value: string): boolean {
  return /%(?![\da-f]{2})/i.test(value);
}

function isValidExternalUrl(value: string): boolean {
  try {
    new URL(value, "http://spec-html.invalid");
    return true;
  } catch {
    return false;
  }
}

function isWithin(root: string, target: string): boolean {
  const path = relative(root, target);
  return path.length === 0 || (
    !isAbsolute(path) &&
    !path.startsWith(`..${sep}`) &&
    path !== ".."
  );
}

function toContentPath(root: string, path: string): string {
  return relative(root, path).split(sep).join("/");
}

function referenceDiagnostic(
  file: string,
  reference: LocalReference,
  rule: "REF002" | "REF003",
): LintDiagnostic {
  return createDiagnostic(file, reference.line, reference.column, rule, reference.value);
}
