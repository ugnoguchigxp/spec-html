import { lstat, realpath, rename } from "node:fs/promises";
import { basename, extname } from "node:path";
import { findContentDocuments, type ContentDocument } from "../content/documents.js";
import {
  atomicReplace,
  createFileSnapshot,
  fileMatchesSnapshot,
  readUtf8File,
  type AtomicWriteOperations,
  type FileSnapshot,
} from "../content/safe-write.js";
import { formatDocument } from "./document.js";
import {
  createFormatProjectResult,
  type FormatProjectResult,
} from "./diagnostics.js";

export type FormatWriteOperations = AtomicWriteOperations;

const projectSnapshots = new WeakMap<
  FormatProjectResult,
  ReadonlyMap<string, FileSnapshot>
>();

/** Format an HTML file or every viewer document in a directory without writing. */
export async function formatProject(targetPath: string): Promise<FormatProjectResult> {
  const targets = await resolveFormatTargets(targetPath);
  const documents = [];
  const snapshots = new Map<string, FileSnapshot>();
  for (const target of targets) {
    const source = await readUtf8File(target.absolutePath, target.path);
    documents.push(await formatDocument(source, target.absolutePath, target.path));
    snapshots.set(target.path, createFileSnapshot(target.absolutePath, source));
  }
  const result = createFormatProjectResult(documents);
  projectSnapshots.set(result, snapshots);
  return result;
}

/** Write a fully preflighted format result using per-file atomic replacement. */
export async function writeFormatProject(
  targetPath: string,
  result: FormatProjectResult,
  operations: FormatWriteOperations = { rename },
): Promise<void> {
  if (
    result.summary.blocked > 0 ||
    result.documents.some((document) => document.status === "blocked")
  ) {
    throw new Error("変換できないHTMLがあるためfileを書き換えませんでした");
  }

  const targets = await resolveFormatTargets(targetPath);
  const targetByPath = new Map(targets.map((target) => [target.path, target]));
  const snapshotByPath = projectSnapshots.get(result);
  const changed = result.documents.filter((document) => document.changed);
  if (
    targetByPath.size !== result.documents.length ||
    snapshotByPath === undefined ||
    snapshotByPath.size !== result.documents.length ||
    result.documents.some((document) =>
      !targetByPath.has(document.file) || !snapshotByPath.has(document.file)
    )
  ) {
    throw new Error("整形後に対象fileの集合が変わったため書き換えませんでした");
  }
  for (const document of result.documents) {
    const target = targetByPath.get(document.file);
    const snapshot = snapshotByPath.get(document.file);
    if (
      target === undefined ||
      snapshot === undefined ||
      !(await fileMatchesSnapshot(
        target.absolutePath,
        document.file,
        snapshot,
      ))
    ) {
      throw new Error(`整形後に内容が変わったためfileを書き換えませんでした: ${document.file}`);
    }
  }
  const writePlan = changed.map((document) => {
    const target = targetByPath.get(document.file);
    if (target === undefined || document.output === null) {
      throw new Error(`整形対象fileを再解決できません: ${document.file}`);
    }
    return { document, target, output: document.output };
  });
  const written: string[] = [];
  for (const [index, { document, target, output }] of writePlan.entries()) {
    try {
      await atomicReplace(target.absolutePath, output, "spec-html", operations);
      written.push(document.file);
    } catch (error: unknown) {
      const pending = writePlan.slice(index + 1).map((item) => item.document.file);
      const completed = written.length === 0 ? "なし" : written.join(",");
      const remaining = pending.length === 0 ? "なし" : pending.join(",");
      throw new Error(
        `書込に失敗しました: ${document.file}; 完了=${completed}; 未処理=${remaining}; ${messageOf(error)}`,
        { cause: error },
      );
    }
  }
}

async function resolveFormatTargets(targetPath: string): Promise<ContentDocument[]> {
  let stats;
  try {
    stats = await lstat(targetPath);
  } catch {
    throw new Error(`対象pathが見つかりません: ${targetPath}`);
  }
  if (stats.isSymbolicLink()) {
    throw new Error(`symbolic linkは整形できません: ${targetPath}`);
  }

  if (stats.isDirectory()) {
    const root = await realpath(targetPath);
    return findContentDocuments(root);
  }
  if (!stats.isFile()) {
    throw new Error(`対象pathはHTML fileまたはdirectoryではありません: ${targetPath}`);
  }
  if (extname(targetPath).toLowerCase() !== ".html") {
    throw new Error(`対象fileは.htmlではありません: ${targetPath}`);
  }
  if (basename(targetPath).toLowerCase() === "nav.html") {
    throw new Error("nav.htmlはViewer文書ではないため整形対象にできません");
  }
  const absolutePath = await realpath(targetPath);
  return [{ absolutePath, path: basename(absolutePath) }];
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
