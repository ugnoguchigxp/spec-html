import { lstat, realpath, statfs } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { removeDocumentExtension } from "../content/document-format.js";
import { validateDocumentArchiveDestination } from "../content/archive.js";
import { findViewerDocuments } from "../content/documents.js";
import {
  createFileSnapshot,
  fileMatchesSnapshot,
  readUtf8File,
  type FileSnapshot,
} from "../content/safe-write.js";
import { formatDocument } from "../format/document.js";
import type { LintDiagnostic } from "../lint/diagnostics.js";
import { diagnosticStableKey } from "../lint/diagnostic-key.js";
import { messageOf } from "../shared/error-message.js";
import { isPathWithin } from "../shared/path-boundary.js";
import {
  lintProject,
  lintProjectSources,
  type HtmlProjectDocument,
} from "../lint/project.js";
import {
  compileMarkdown,
  type MarkdownNotice,
  type MarkdownTableCaption,
} from "../markdown/compiler.js";
import { canonicalizeLanguageTag } from "../markdown/language.js";
import { scanUnsupportedMarkdown } from "../markdown/feature-scan.js";
import {
  rewriteHtmlMigrationLinks,
  type HtmlLinkRewrite,
} from "./html-links.js";
import {
  canonicalMigrationPathKey,
  createMigrationLinkIndex,
  rewriteMigrationLink,
} from "./links.js";
import { compareMarkdownWithHtml } from "./parity.js";
import { resolveMigrationContentRoot } from "./content-root.js";

export type MigrationIssueSeverity = "error" | "warning";

export interface MigrationIssue {
  readonly severity: MigrationIssueSeverity;
  readonly code: string;
  readonly message: string;
  readonly file?: string;
  readonly line?: number;
  readonly column?: number;
}

export interface MigrationSourcePlan {
  readonly path: string;
  readonly absolutePath: string;
  readonly outputPath: string;
  readonly outputAbsolutePath: string;
  readonly source: string;
  readonly output: string;
  readonly sourceSnapshot: FileSnapshot;
  readonly directorySnapshot: string;
  readonly outputDigest: string;
  readonly language: string;
  readonly notices: readonly MarkdownNotice[];
  readonly captions: readonly MarkdownTableCaption[];
}

export interface MigrationReplacementPlan {
  readonly path: string;
  readonly absolutePath: string;
  readonly source: string;
  readonly output: string;
  readonly sourceSnapshot: FileSnapshot;
  readonly directorySnapshot: string;
  readonly outputDigest: string;
  readonly rewrites: readonly HtmlLinkRewrite[];
}

export interface MigrationPlanSummary {
  readonly markdown: number;
  readonly creates: number;
  readonly captions: number;
  readonly htmlRewrites: number;
  readonly archives: number;
  readonly errors: number;
  readonly warnings: number;
  readonly parityMatched: number;
  readonly inputBytes: number;
  readonly sourceBytes: number;
  readonly outputBytes: number;
  readonly backupBytes: number;
  readonly requiredBytes: number;
  readonly availableBytes: number;
  readonly maxPathLength: number;
}

export interface MigrationPlan {
  readonly contentRoot: string;
  readonly language: string;
  readonly mapping: ReadonlyMap<string, string>;
  readonly sources: readonly MigrationSourcePlan[];
  readonly replacements: readonly MigrationReplacementPlan[];
  readonly issues: readonly MigrationIssue[];
  readonly summary: MigrationPlanSummary;
  readonly expectedDiagnosticKeys: readonly string[];
}

export interface CreateMigrationPlanOptions {
  readonly contentRoot: string;
  readonly language: string;
  readonly allowLossy?: boolean;
  readonly languages?: ReadonlyMap<string, string>;
}

const MAX_DOCUMENT_INPUT_BYTES = 64 * 1024 * 1024;
const MAX_MIGRATION_INPUT_BYTES = 256 * 1024 * 1024;

export async function createMigrationPlan(
  options: CreateMigrationPlanOptions,
): Promise<MigrationPlan> {
  const language = canonicalizeLanguageTag(options.language);
  const contentRoot = await resolveMigrationContentRoot(options.contentRoot);
  const viewerDocuments = await findViewerDocuments(contentRoot);
  const markdownDocuments = viewerDocuments.filter(
    (document) => document.format === "markdown",
  );
  const htmlDocuments = viewerDocuments.filter(
    (document) => document.format === "html",
  );
  const issues: MigrationIssue[] = [];
  const inputSizes = new Map<string, number>();
  const directorySnapshots = new Map<string, string>();
  let compilationAllowed = true;
  for (const document of viewerDocuments) {
    const stats = await lstat(document.absolutePath);
    if (!stats.isFile() || stats.isSymbolicLink()) {
      issues.push(
        errorIssue("MIG014", "入力が通常fileではありません", document.path),
      );
      compilationAllowed = false;
      continue;
    }
    const canonicalDirectory = await realpath(dirname(document.absolutePath));
    if (!isPathWithin(contentRoot, canonicalDirectory)) {
      issues.push(
        errorIssue(
          "MIG014",
          "入力の親directoryがcontent root外を参照しています",
          document.path,
        ),
      );
      compilationAllowed = false;
      continue;
    }
    directorySnapshots.set(document.path, canonicalDirectory);
    inputSizes.set(document.path, stats.size);
    if (stats.size > MAX_DOCUMENT_INPUT_BYTES) {
      issues.push(
        errorIssue(
          "MIG014",
          `1文書の入力上限64 MiBを超えます: ${stats.size} byte`,
          document.path,
        ),
      );
      compilationAllowed = false;
    }
  }
  const inputBytes = [...inputSizes.values()].reduce(
    (total, size) => total + size,
    0,
  );
  if (inputBytes > MAX_MIGRATION_INPUT_BYTES) {
    issues.push(
      errorIssue(
        "MIG014",
        `migration入力上限256 MiBを超えます: ${inputBytes} byte`,
      ),
    );
    compilationAllowed = false;
  }
  const mapping = new Map<string, string>();
  const sourceKeys = new Map<string, string>();
  const outputKeys = new Map<string, string>();
  const activePathKeys = new Map(
    viewerDocuments.map((document) => [
      canonicalMigrationPathKey(document.path),
      document.path,
    ]),
  );
  for (const document of markdownDocuments) {
    try {
      await validateDocumentArchiveDestination(contentRoot, document.path);
    } catch (error: unknown) {
      issues.push(
        errorIssue(
          "MIG007",
          `archive先を安全に準備できません: ${messageOf(error)}`,
          document.path,
        ),
      );
    }
    const outputPath = `${removeDocumentExtension(document.path)}.html`;
    const sourceKey = canonicalMigrationPathKey(document.path);
    const previousSource = sourceKeys.get(sourceKey);
    if (previousSource !== undefined) {
      issues.push(
        errorIssue(
          "MIG002",
          `大文字小文字またはUnicode正規化後のsource pathが衝突します: ${previousSource}, ${document.path}`,
          document.path,
        ),
      );
      continue;
    }
    sourceKeys.set(sourceKey, document.path);
    const key = canonicalMigrationPathKey(outputPath);
    if (
      outputPath.split("/").at(-1)?.toLocaleLowerCase("en-US") === "nav.html"
    ) {
      issues.push(
        errorIssue("MIG002", "nav.htmlは移行先にできません", document.path),
      );
      continue;
    }
    const collision = outputKeys.get(key);
    if (collision !== undefined) {
      issues.push(
        errorIssue(
          "MIG002",
          `出力先が衝突します: ${collision}, ${document.path}`,
          document.path,
        ),
      );
      continue;
    }
    outputKeys.set(key, document.path);
    const activeCollision = activePathKeys.get(key);
    if (activeCollision !== undefined) {
      issues.push(
        errorIssue(
          "MIG001",
          `大文字小文字を区別しない出力先が既に存在します: ${activeCollision}`,
          document.path,
        ),
      );
    }
    mapping.set(document.path, outputPath);
  }

  for (const [sourcePath, outputPath] of mapping) {
    const absoluteOutput = join(contentRoot, ...outputPath.split("/"));
    if (
      !activePathKeys.has(canonicalMigrationPathKey(outputPath)) &&
      (await entryExists(absoluteOutput))
    ) {
      issues.push(
        errorIssue(
          "MIG001",
          `出力先が既に存在します: ${outputPath}`,
          sourcePath,
        ),
      );
    }
  }
  for (const path of options.languages?.keys() ?? []) {
    if (!mapping.has(path)) {
      issues.push(
        errorIssue(
          "MIG013",
          "language mapのpathがactive Markdownと一致しません",
          path,
        ),
      );
    }
  }

  const sources: MigrationSourcePlan[] = [];
  const canonicalMapping = createMigrationLinkIndex(mapping);
  let parityMatched = 0;
  for (const document of markdownDocuments) {
    const outputPath = mapping.get(document.path);
    if (outputPath === undefined || !compilationAllowed) {
      continue;
    }
    const source = await readUtf8File(document.absolutePath, document.path);
    const sourceSnapshot = createFileSnapshot(document.absolutePath, source);
    const directorySnapshot = directorySnapshots.get(document.path);
    if (
      directorySnapshot === undefined ||
      !(await directoryMatches(document.absolutePath, directorySnapshot))
    ) {
      issues.push(
        errorIssue(
          "MIG014",
          "plan作成中に入力directoryが変更されました",
          document.path,
        ),
      );
      continue;
    }
    if (
      !(await fileMatchesSnapshot(
        document.absolutePath,
        document.path,
        sourceSnapshot,
      ))
    ) {
      issues.push(
        errorIssue(
          "MIG014",
          "plan作成中に入力fileが変更されました",
          document.path,
        ),
      );
      continue;
    }
    for (const feature of scanUnsupportedMarkdown(source)) {
      issues.push({
        severity: "error",
        code: "MIG008",
        message: feature.message,
        file: document.path,
        line: feature.line,
        column: feature.column,
      });
    }
    const resolver = (url: string): string =>
      rewriteMigrationLink(url, document.path, mapping, canonicalMapping).value;
    const sourceLanguage = canonicalizeLanguageTag(
      options.languages?.get(document.path) ?? language,
    );
    const compiled = compileMarkdown(source, {
      language: sourceLanguage,
      linkResolver: resolver,
    });
    for (const caption of compiled.mermaidCaptions) {
      if (caption.caption === null) {
        issues.push(
          errorIssue(
            "MIG010",
            "Mermaid diagramには同一block scope内の先行見出しが必要です",
            document.path,
          ),
        );
      }
    }
    const outputAbsolutePath = join(contentRoot, ...outputPath.split("/"));
    const formatted = await formatDocument(
      compiled.fragment,
      outputAbsolutePath,
      outputPath,
    );
    if (formatted.status === "blocked" || formatted.output === null) {
      const detail = formatted.problems
        .map((problem) => `${problem.code}: ${problem.message}`)
        .join("; ");
      issues.push(
        errorIssue(
          "MIG003",
          `生成HTMLを整形できません: ${detail}`,
          document.path,
        ),
      );
      continue;
    }
    for (const notice of compiled.notices) {
      issues.push(
        options.allowLossy === true
          ? warningIssue("MIG101", notice.message, document.path)
          : errorIssue(
              "MIG009",
              `${notice.message} 続行する場合は--allow-lossyで明示してください`,
              document.path,
            ),
      );
    }
    const parity = await compareMarkdownWithHtml(
      source,
      formatted.output,
      outputAbsolutePath,
      resolver,
    );
    if (parity.matched) {
      parityMatched += 1;
    } else {
      issues.push(
        errorIssue(
          "MIG004",
          `content parityが一致しません: ${parity.mismatches.join(", ")}`,
          document.path,
        ),
      );
    }
    const remainingLinks = await rewriteHtmlMigrationLinks(
      formatted.output,
      outputAbsolutePath,
      outputPath,
      mapping,
    );
    if (
      remainingLinks.rewrites.length > 0 ||
      remainingLinks.blockers.length > 0
    ) {
      issues.push(
        errorIssue(
          "MIG005",
          "生成HTMLに移行対象Markdownへの未処理参照があります",
          document.path,
        ),
      );
    }
    sources.push({
      path: document.path,
      absolutePath: document.absolutePath,
      outputPath,
      outputAbsolutePath,
      source,
      output: formatted.output,
      sourceSnapshot,
      directorySnapshot,
      outputDigest: createFileSnapshot(outputAbsolutePath, formatted.output)
        .digest,
      language: sourceLanguage,
      notices: compiled.notices,
      captions: compiled.tableCaptions,
    });
  }

  const replacements: MigrationReplacementPlan[] = [];
  const htmlSources = new Map<string, HtmlProjectDocument>();
  for (const document of htmlDocuments) {
    if (!compilationAllowed) {
      continue;
    }
    const source = await readUtf8File(document.absolutePath, document.path);
    const sourceSnapshot = createFileSnapshot(document.absolutePath, source);
    const directorySnapshot = directorySnapshots.get(document.path);
    if (
      directorySnapshot === undefined ||
      !(await directoryMatches(document.absolutePath, directorySnapshot))
    ) {
      issues.push(
        errorIssue(
          "MIG014",
          "plan作成中に入力directoryが変更されました",
          document.path,
        ),
      );
      continue;
    }
    if (
      !(await fileMatchesSnapshot(
        document.absolutePath,
        document.path,
        sourceSnapshot,
      ))
    ) {
      issues.push(
        errorIssue(
          "MIG014",
          "plan作成中に入力fileが変更されました",
          document.path,
        ),
      );
      continue;
    }
    const rewritten = await rewriteHtmlMigrationLinks(
      source,
      document.absolutePath,
      document.path,
      mapping,
    );
    for (const blocker of rewritten.blockers) {
      issues.push({
        severity: "error",
        code: "MIG006",
        message: `${blocker.element}[${blocker.attribute}]は自動書換え対象ではありません`,
        file: document.path,
        line: blocker.line,
        column: blocker.column,
      });
    }
    htmlSources.set(document.path, {
      path: document.path,
      absolutePath: document.absolutePath,
      source: rewritten.output,
    });
    if (rewritten.output !== source) {
      replacements.push({
        path: document.path,
        absolutePath: document.absolutePath,
        source,
        output: rewritten.output,
        sourceSnapshot,
        directorySnapshot,
        outputDigest: createFileSnapshot(
          document.absolutePath,
          rewritten.output,
        ).digest,
        rewrites: rewritten.rewrites,
      });
    }
  }

  for (const source of sources) {
    htmlSources.set(source.outputPath, {
      path: source.outputPath,
      absolutePath: source.outputAbsolutePath,
      source: source.output,
    });
  }

  let expectedDiagnosticKeys: string[] = [];
  if (compilationAllowed) {
    const [baselineLint, virtualLint] = await Promise.all([
      lintProject(contentRoot),
      lintProjectSources(contentRoot, [...htmlSources.values()], {
        unavailablePaths: [...mapping.keys()],
      }),
    ]);
    addLintIssues(
      issues,
      baselineLint.diagnostics,
      virtualLint.diagnostics,
      new Set(sources.map((source) => source.outputPath)),
    );
    expectedDiagnosticKeys = virtualLint.diagnostics.map(diagnosticStableKey);
  }

  const sampleMigrationRoot = join(
    contentRoot,
    ".spec-html",
    "migrations",
    "20260819T120000000Z-abcdef",
  );
  const journalPath = join(sampleMigrationRoot, "journal.json");
  const outputPaths = sources.map((source) => source.outputAbsolutePath);
  const replacementPaths = replacements.map(
    (replacement) => replacement.absolutePath,
  );
  const backupPaths = replacements.map((replacement) =>
    join(
      sampleMigrationRoot,
      "backups",
      "existing-html",
      ...replacement.path.split("/"),
    ),
  );
  const pathCandidates = [
    ...markdownDocuments.flatMap((document) => [
      document.absolutePath,
      join(
        contentRoot,
        ...(mapping.get(document.path) ?? document.path).split("/"),
      ),
      archivedPath(contentRoot, document.path),
    ]),
    ...outputPaths.map((path) =>
      atomicTemporaryPath(path, "spec-html-migrate-create"),
    ),
    ...replacementPaths.flatMap((path) => [
      path,
      atomicTemporaryPath(path, "spec-html-migrate-replace"),
      atomicTemporaryPath(path, "spec-html-migrate-rollback"),
    ]),
    ...backupPaths.flatMap((path) => [
      path,
      atomicTemporaryPath(path, "spec-html-migrate-backup"),
    ]),
    journalPath,
    atomicTemporaryPath(journalPath, "spec-html-migrate-journal"),
    join(contentRoot, ".spec-html", "migrate.lock"),
    join(
      contentRoot,
      ".spec-html",
      ".spec-html-migrate-capability-9999999999-ffffffff",
    ),
    ...[...new Set(sources.map((source) => source.directorySnapshot))].map(
      (directory) =>
        join(directory, ".spec-html-migrate-capability-9999999999-ffffffff"),
    ),
  ];
  const maxPathLength = pathCandidates.reduce(
    (maximum, path) => Math.max(maximum, Buffer.byteLength(path, "utf8")),
    0,
  );
  if (maxPathLength > 240) {
    issues.push(
      errorIssue(
        "MIG011",
        `portable path長上限240 byteを超えます: ${maxPathLength} byte`,
      ),
    );
  }
  const portablePathProblems = new Map<string, string>();
  for (const path of [
    ...viewerDocuments.map((document) => document.path),
    ...mapping.values(),
    ...replacements.map((replacement) => replacement.path),
  ]) {
    const problem = portableMigrationPathProblem(path);
    if (problem !== null) portablePathProblems.set(path, problem);
  }
  for (const [path, problem] of portablePathProblems) {
    issues.push(
      errorIssue(
        "MIG011",
        `portable pathとして使用できません: ${problem}`,
        path,
      ),
    );
  }
  const sourceBytes = markdownDocuments.reduce(
    (total, document) => total + (inputSizes.get(document.path) ?? 0),
    0,
  );
  const outputBytes = sources.reduce(
    (total, source) => total + Buffer.byteLength(source.output, "utf8"),
    0,
  );
  const backupBytes = replacements.reduce(
    (total, replacement) =>
      total + Buffer.byteLength(replacement.source, "utf8"),
    0,
  );
  const requiredBytes = outputBytes * 2 + backupBytes * 2 + 1_048_576;
  let availableBytes = 0;
  let capacityChecked = false;
  try {
    const filesystem = await statfs(contentRoot);
    availableBytes = Number(filesystem.bavail) * Number(filesystem.bsize);
    capacityChecked = true;
  } catch (error: unknown) {
    issues.push(
      errorIssue(
        "MIG012",
        `filesystemの空き容量を確認できません: ${messageOf(error)}`,
      ),
    );
  }
  if (capacityChecked && requiredBytes > availableBytes) {
    issues.push(
      errorIssue(
        "MIG012",
        `空き容量が不足しています: required=${requiredBytes} available=${availableBytes}`,
      ),
    );
  } else if (outputBytes + backupBytes > 268_435_456) {
    issues.push(
      warningIssue(
        "MIG102",
        "生成物とbackupが256 MiBを超えるため実行時間と容量を確認してください",
      ),
    );
  }

  const sortedIssues = [...issues].sort(compareIssues);
  const summary: MigrationPlanSummary = {
    markdown: markdownDocuments.length,
    creates: sources.length,
    captions: sources.reduce(
      (count, source) =>
        count +
        source.captions.filter((caption) => caption.caption !== null).length,
      0,
    ),
    htmlRewrites: replacements.reduce(
      (count, replacement) => count + replacement.rewrites.length,
      0,
    ),
    archives: sources.length,
    errors: sortedIssues.filter((issue) => issue.severity === "error").length,
    warnings: sortedIssues.filter((issue) => issue.severity === "warning")
      .length,
    parityMatched,
    inputBytes,
    sourceBytes,
    outputBytes,
    backupBytes,
    requiredBytes,
    availableBytes,
    maxPathLength,
  };
  return {
    contentRoot,
    language,
    mapping,
    sources,
    replacements,
    issues: sortedIssues,
    summary,
    expectedDiagnosticKeys,
  };
}

function atomicTemporaryPath(targetPath: string, tag: string): string {
  return join(
    dirname(targetPath),
    `.${basename(targetPath)}.${tag}-9999999999-99.tmp`,
  );
}

export function portableMigrationPathProblem(path: string): string | null {
  for (const segment of path.split("/")) {
    if (
      /[<>:"\\|?*]/.test(segment) ||
      [...segment].some((character) => character.charCodeAt(0) <= 0x1f)
    ) {
      return `Windowsで無効な文字を含みます: ${segment}`;
    }
    if (/[ .]$/.test(segment)) {
      return `segment末尾がdotまたはspaceです: ${segment}`;
    }
    const base = (segment.split(".", 1)[0] ?? "")
      .replace(/[ .]+$/, "")
      .toLocaleUpperCase("en-US");
    if (/^(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])$/.test(base)) {
      return `Windowsの予約名です: ${segment}`;
    }
  }
  return null;
}

function archivedPath(contentRoot: string, documentPath: string): string {
  return join(
    contentRoot,
    ...dirname(documentPath)
      .split("/")
      .filter((segment) => segment !== "."),
    ".archived",
    basename(documentPath),
  );
}

export function migrationPlanHasBlockers(
  plan: MigrationPlan,
  warningsAsErrors: boolean,
): boolean {
  return (
    plan.summary.errors > 0 || (warningsAsErrors && plan.summary.warnings > 0)
  );
}

async function entryExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error: unknown) {
    if (isNodeError(error, "ENOENT")) {
      return false;
    }
    throw error;
  }
}

async function directoryMatches(
  absolutePath: string,
  expectedDirectory: string,
): Promise<boolean> {
  try {
    return (await realpath(dirname(absolutePath))) === expectedDirectory;
  } catch {
    return false;
  }
}

function addLintIssues(
  issues: MigrationIssue[],
  baseline: readonly LintDiagnostic[],
  virtual: readonly LintDiagnostic[],
  generated: ReadonlySet<string>,
): void {
  const baselineCounts = diagnosticCounts(baseline);
  for (const diagnostic of virtual) {
    const key = diagnosticStableKey(diagnostic);
    const generatedDiagnostic = generated.has(diagnostic.file);
    if (!generatedDiagnostic) {
      const count = baselineCounts.get(key) ?? 0;
      if (count > 0) {
        baselineCounts.set(key, count - 1);
        continue;
      }
    }
    issues.push(lintIssue(diagnostic));
  }
}

function diagnosticCounts(
  diagnostics: readonly LintDiagnostic[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const diagnostic of diagnostics) {
    const key = diagnosticStableKey(diagnostic);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function lintIssue(diagnostic: LintDiagnostic): MigrationIssue {
  return {
    severity: diagnostic.severity,
    code: diagnostic.rule,
    message: diagnostic.message,
    file: diagnostic.file,
    line: diagnostic.line,
    column: diagnostic.column,
  };
}

function errorIssue(
  code: string,
  message: string,
  file?: string,
): MigrationIssue {
  return {
    severity: "error",
    code,
    message,
    ...(file === undefined ? {} : { file }),
  };
}

function warningIssue(
  code: string,
  message: string,
  file?: string,
): MigrationIssue {
  return {
    severity: "warning",
    code,
    message,
    ...(file === undefined ? {} : { file }),
  };
}

function compareIssues(left: MigrationIssue, right: MigrationIssue): number {
  return (
    (left.file ?? "").localeCompare(right.file ?? "", "en") ||
    (left.line ?? 0) - (right.line ?? 0) ||
    (left.column ?? 0) - (right.column ?? 0) ||
    left.code.localeCompare(right.code, "en")
  );
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
