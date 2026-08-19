import { lstat, link, open, realpath, rm } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

import {
  atomicCreate,
  createFileSnapshot,
  fileMatchesSnapshot,
  readUtf8File,
  type AtomicCreateOperations,
  type FileSnapshot,
} from "../content/safe-write.js";
import {
  documentFormatFromPath,
  isHtmlDocumentPath,
  removeDocumentExtension,
} from "../content/document-format.js";
import { formatDocument } from "../format/document.js";
import type { LintDiagnostic } from "../lint/diagnostics.js";
import { compileMarkdown, type MarkdownNotice } from "../markdown/compiler.js";
import { canonicalizeLanguageTag } from "../markdown/language.js";

export interface ConvertMarkdownOptions {
  inputPath: string;
  outputPath?: string;
  language: string;
}

export interface ConvertMarkdownResult {
  readonly inputPath: string;
  readonly outputPath: string | null;
  readonly output: string;
  readonly notices: readonly MarkdownNotice[];
  readonly diagnostics: readonly LintDiagnostic[];
}

export type ConvertWriteOperations = AtomicCreateOperations;

interface ConversionSnapshot {
  readonly input: FileSnapshot;
  readonly output: string;
  readonly outputPath: string | null;
}

const conversionSnapshots = new WeakMap<
  ConvertMarkdownResult,
  ConversionSnapshot
>();

export async function convertMarkdownDocument(
  options: ConvertMarkdownOptions,
): Promise<ConvertMarkdownResult> {
  const language = canonicalizeLanguageTag(options.language);
  const inputPath = resolve(options.inputPath);
  const inputStats = await lstatWithMessage(inputPath, "入力file");
  if (inputStats.isSymbolicLink() || !inputStats.isFile()) {
    throw new Error(`入力は通常fileで指定してください: ${inputPath}`);
  }
  if (documentFormatFromPath(inputPath) !== "markdown") {
    throw new Error(
      `入力fileは.mdまたは.markdownで指定してください: ${inputPath}`,
    );
  }

  const inputDirectory = await realpath(dirname(inputPath));
  const canonicalInputPath = await realpath(inputPath);
  const outputPath =
    options.outputPath === undefined
      ? null
      : await resolveOutputPath(
          resolve(options.outputPath),
          inputDirectory,
          canonicalInputPath,
        );
  const source = await readUtf8File(canonicalInputPath, basename(inputPath));
  const snapshot = createFileSnapshot(canonicalInputPath, source);
  const compiled = compileMarkdown(source, { language });
  const virtualOutputPath =
    outputPath ??
    resolve(
      inputDirectory,
      `${removeDocumentExtension(basename(canonicalInputPath))}.html`,
    );
  const relativeOutputPath = basename(virtualOutputPath);
  const formatted = await formatDocument(
    compiled.fragment,
    virtualOutputPath,
    relativeOutputPath,
  );
  if (formatted.status === "blocked" || formatted.output === null) {
    const detail = formatted.problems
      .map((problem) => `${problem.code}: ${problem.message}`)
      .join("; ");
    throw new Error(`生成HTMLを整形できませんでした: ${detail}`);
  }

  const result: ConvertMarkdownResult = {
    inputPath: canonicalInputPath,
    outputPath,
    output: formatted.output,
    notices: compiled.notices,
    diagnostics: formatted.diagnostics,
  };
  conversionSnapshots.set(result, {
    input: snapshot,
    output: formatted.output,
    outputPath,
  });
  return result;
}

export async function writeConvertedDocument(
  result: ConvertMarkdownResult,
  operations: ConvertWriteOperations = { link, open, rm },
): Promise<void> {
  if (result.outputPath === null) {
    throw new Error("--outputを指定していない変換結果はfileへ書き込めません");
  }
  const snapshot = conversionSnapshots.get(result);
  if (snapshot === undefined) {
    throw new Error("変換結果の入力snapshotを確認できません");
  }
  if (
    result.outputPath !== snapshot.outputPath ||
    result.output !== snapshot.output
  ) {
    throw new Error("変換結果が変わったため出力を作成しませんでした");
  }

  const currentStats = await lstatWithMessage(result.inputPath, "入力file");
  if (
    currentStats.isSymbolicLink() ||
    !currentStats.isFile() ||
    !(await fileMatchesSnapshot(
      result.inputPath,
      basename(result.inputPath),
      snapshot.input,
    ))
  ) {
    throw new Error("変換後に入力fileが変わったため出力を作成しませんでした");
  }
  if (await entryExists(result.outputPath)) {
    throw new Error(`出力先が既に存在します: ${result.outputPath}`);
  }

  try {
    await atomicCreate(
      result.outputPath,
      result.output,
      "spec-html-convert",
      operations,
    );
  } catch (error: unknown) {
    if (isNodeError(error, "EEXIST")) {
      throw new Error(`出力先が既に存在します: ${result.outputPath}`, {
        cause: error,
      });
    }
    throw error;
  }
}

async function resolveOutputPath(
  requestedPath: string,
  inputDirectory: string,
  inputPath: string,
): Promise<string> {
  if (!isHtmlDocumentPath(requestedPath)) {
    throw new Error(`出力fileは.htmlで指定してください: ${requestedPath}`);
  }
  if (basename(requestedPath).toLowerCase() === "nav.html") {
    throw new Error("nav.htmlはViewer文書ではないため出力先に指定できません");
  }
  const outputDirectory = await realpath(dirname(requestedPath));
  if (outputDirectory !== inputDirectory) {
    throw new Error("出力fileは入力fileと同じdirectoryへ作成してください");
  }
  const outputPath = resolve(outputDirectory, basename(requestedPath));
  if (outputPath === inputPath || (await entryExists(outputPath))) {
    throw new Error(`出力先が既に存在します: ${outputPath}`);
  }
  return outputPath;
}

async function lstatWithMessage(path: string, label: string) {
  try {
    return await lstat(path);
  } catch (error: unknown) {
    if (isNodeError(error, "ENOENT")) {
      throw new Error(`${label}が見つかりません: ${path}`, { cause: error });
    }
    throw error;
  }
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

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
