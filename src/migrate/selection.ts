import { posix } from "node:path";

const PROTECTED_MARKDOWN_BASENAMES = [
  "README",
  "CONTRIBUTING",
  "CHANGELOG",
  "SECURITY",
  "AGENTS",
] as const;

/** OSS convention files stay active Markdown regardless of migration targets. */
export function isProtectedMigrationMarkdown(documentPath: string): boolean {
  const filename = posix.basename(documentPath);
  const match = /^(.*)\.(?:md|markdown)$/iu.exec(filename);
  const stem = match?.[1]?.toLocaleUpperCase("en-US");
  return stem !== undefined && PROTECTED_MARKDOWN_BASENAMES.some(
    (basename) => stem === basename || stem.startsWith(`${basename}.`),
  );
}

/** Normalize a content-root-relative directory accepted by --target. */
export function normalizeMigrationTargetDirectory(value: string): string | null {
  if (
    value.length === 0 ||
    value.includes("\0") ||
    value.includes("\\") ||
    value.startsWith("/") ||
    /^[a-z]:/iu.test(value)
  ) {
    return null;
  }
  const withoutLeadingCurrent = value.replace(/^\.\//u, "");
  const withoutTrailingSlash = withoutLeadingCurrent.replace(/\/+$/u, "");
  if (withoutTrailingSlash.length === 0 || withoutTrailingSlash === ".") {
    return ".";
  }
  const segments = withoutTrailingSlash.split("/");
  if (
    segments.some(
      (segment) => segment.length === 0 || segment === "." || segment === "..",
    )
  ) {
    return null;
  }
  return segments.join("/");
}

/** Remove duplicate/nested targets while preserving deterministic order. */
export function canonicalizeMigrationTargetDirectories(
  values: readonly string[],
): string[] {
  const normalized = values.map(normalizeMigrationTargetDirectory);
  if (normalized.some((value) => value === null)) {
    throw new Error("migration target directory is invalid");
  }
  const uniqueByKey = new Map<string, string>();
  for (const value of normalized.filter(
    (candidate): candidate is string => candidate !== null,
  ).sort((left, right) => left.localeCompare(right, "en"))) {
    const key = canonicalSelectionPathKey(value);
    if (!uniqueByKey.has(key)) uniqueByKey.set(key, value);
  }
  const unique = [...uniqueByKey.values()];
  if (unique.includes(".")) return ["."];
  return unique.filter(
    (candidate) => !unique.some(
      (parent) =>
        parent !== candidate &&
        canonicalSelectionPathKey(candidate).startsWith(
          `${canonicalSelectionPathKey(parent)}/`,
        ),
    ),
  );
}

export function isDocumentInMigrationTargets(
  documentPath: string,
  targetDirectories: readonly string[],
): boolean {
  const documentKey = canonicalSelectionPathKey(documentPath);
  return targetDirectories.length === 0 || targetDirectories.some(
    (target) =>
      target === "." ||
      documentKey.startsWith(`${canonicalSelectionPathKey(target)}/`),
  );
}

export function isSelectedMigrationMarkdown(
  documentPath: string,
  targetDirectories: readonly string[],
): boolean {
  return !isProtectedMigrationMarkdown(documentPath) &&
    isDocumentInMigrationTargets(documentPath, targetDirectories);
}

function canonicalSelectionPathKey(value: string): string {
  return value.normalize("NFC").toLocaleLowerCase("en-US");
}
