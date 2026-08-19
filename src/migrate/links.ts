import { posix } from "node:path";

export interface MigrationLinkResult {
  readonly value: string;
  readonly kind: "unchanged" | "rewritten" | "invalid";
  readonly targetPath: string | null;
}

export function canonicalMigrationPathKey(value: string): string {
  return value.normalize("NFC").toLocaleLowerCase("en-US");
}

export function createMigrationLinkIndex(
  mapping: ReadonlyMap<string, string>,
): ReadonlyMap<string, string> {
  return new Map(
    [...mapping].map(([source, output]) => [
      canonicalMigrationPathKey(source),
      output,
    ]),
  );
}

/** Rewrite a local document URL using content-root-relative POSIX paths. */
export function rewriteMigrationLink(
  value: string,
  sourcePath: string,
  mapping: ReadonlyMap<string, string>,
  canonicalMapping = createMigrationLinkIndex(mapping),
): MigrationLinkResult {
  const leadingLength = value.length - value.trimStart().length;
  const trailingLength = value.length - value.trimEnd().length;
  const leading = value.slice(0, leadingLength);
  const trailing =
    trailingLength === 0 ? "" : value.slice(value.length - trailingLength);
  const trimmed = value.trim();
  if (
    trimmed.length === 0 ||
    trimmed.startsWith("//") ||
    /^[a-z][a-z\d+.-]*:/i.test(trimmed)
  ) {
    return { value, kind: "unchanged", targetPath: null };
  }
  if (trimmed.includes("\0")) {
    return { value, kind: "invalid", targetPath: null };
  }

  const hashOffset = trimmed.indexOf("#");
  const beforeFragment =
    hashOffset < 0 ? trimmed : trimmed.slice(0, hashOffset);
  const fragment = hashOffset < 0 ? "" : trimmed.slice(hashOffset);
  const queryOffset = beforeFragment.indexOf("?");
  const rawPath =
    queryOffset < 0
      ? beforeFragment
      : beforeFragment.slice(0, queryOffset);
  const query = queryOffset < 0 ? "" : beforeFragment.slice(queryOffset);
  if (rawPath.length === 0) {
    return hasMalformedPercentEncoding(query + fragment)
      ? { value, kind: "invalid", targetPath: null }
      : { value, kind: "unchanged", targetPath: sourcePath };
  }

  const decodedPath = decodePath(rawPath);
  if (decodedPath === null) {
    return { value, kind: "invalid", targetPath: null };
  }
  const rootRelative = rawPath.startsWith("/");
  const targetPath = rootRelative
    ? posix.normalize(decodedPath.replace(/^\/+/, ""))
    : posix.normalize(posix.join(posix.dirname(sourcePath), decodedPath));
  if (
    targetPath.length === 0 ||
    targetPath === ".." ||
    targetPath.startsWith("../") ||
    posix.isAbsolute(targetPath)
  ) {
    return { value, kind: "invalid", targetPath: null };
  }
  if (rootRelative || hasMalformedPercentEncoding(query + fragment)) {
    return { value, kind: "invalid", targetPath };
  }
  const outputPath = mapping.get(targetPath) ??
    canonicalMapping.get(canonicalMigrationPathKey(targetPath));
  if (outputPath === undefined) {
    return { value, kind: "unchanged", targetPath };
  }

  let relativeOutput = posix.relative(posix.dirname(sourcePath), outputPath);
  if (relativeOutput.length === 0) {
    relativeOutput = posix.basename(outputPath);
  }
  const encodedOutput = relativeOutput
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const prefix = rawPath.startsWith("./") && !encodedOutput.startsWith(".")
    ? "./"
    : "";
  return {
    value: `${leading}${prefix}${encodedOutput}${query}${fragment}${trailing}`,
    kind: "rewritten",
    targetPath,
  };
}

function decodePath(value: string): string | null {
  const segments: string[] = [];
  for (const rawSegment of value.split("/")) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(rawSegment);
    } catch {
      return null;
    }
    if (
      decoded.includes("\0") ||
      decoded.includes("/") ||
      decoded.includes("\\")
    ) {
      return null;
    }
    segments.push(decoded);
  }
  return segments.join("/");
}

function hasMalformedPercentEncoding(value: string): boolean {
  return /%(?![\da-f]{2})/i.test(value);
}
