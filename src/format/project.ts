import { createHash } from "node:crypto";
import {
  lstat,
  open,
  readFile,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { TextDecoder } from "node:util";
import { findContentDocuments, type ContentDocument } from "../content/documents.js";
import { formatDocument } from "./document.js";
import {
  createFormatProjectResult,
  type FormatProjectResult,
} from "./diagnostics.js";

interface FormatTargetSnapshot {
  readonly absolutePath: string;
  readonly digest: string;
}

export interface FormatWriteOperations {
  readonly rename: typeof rename;
}

const projectSnapshots = new WeakMap<
  FormatProjectResult,
  ReadonlyMap<string, FormatTargetSnapshot>
>();
const utf8Decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/** Format an HTML file or every viewer document in a directory without writing. */
export async function formatProject(targetPath: string): Promise<FormatProjectResult> {
  const targets = await resolveFormatTargets(targetPath);
  const documents = [];
  const snapshots = new Map<string, FormatTargetSnapshot>();
  for (const target of targets) {
    const source = await readUtf8(target.absolutePath, target.path);
    documents.push(await formatDocument(source, target.absolutePath, target.path));
    snapshots.set(target.path, {
      absolutePath: target.absolutePath,
      digest: digest(source),
    });
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
      target.absolutePath !== snapshot.absolutePath ||
      digest(await readUtf8(target.absolutePath, document.file)) !== snapshot.digest
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
      await atomicWrite(target.absolutePath, output, operations);
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

async function atomicWrite(
  targetPath: string,
  output: string,
  operations: FormatWriteOperations,
): Promise<void> {
  const stats = await lstat(targetPath);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`書込対象が通常fileではありません: ${targetPath}`);
  }

  const directory = dirname(targetPath);
  const file = basename(targetPath);
  const mode = stats.mode & 0o777;
  let temporaryPath: string | undefined;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = join(
      directory,
      `.${file}.spec-html-${process.pid}-${attempt}.tmp`,
    );
    try {
      const handle = await open(candidate, "wx", mode);
      temporaryPath = candidate;
      try {
        await handle.writeFile(output, "utf8");
        await handle.chmod(mode);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await operations.rename(candidate, targetPath);
      temporaryPath = undefined;
      return;
    } catch (error: unknown) {
      if (temporaryPath === undefined && isNodeError(error, "EEXIST")) {
        continue;
      }
      throw error;
    } finally {
      if (temporaryPath !== undefined) {
        await rm(temporaryPath, { force: true });
      }
    }
  }
  throw new Error(`一時file名を確保できません: ${targetPath}`);
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function readUtf8(absolutePath: string, displayPath: string): Promise<string> {
  const source = await readFile(absolutePath);
  try {
    return utf8Decoder.decode(source);
  } catch (error: unknown) {
    throw new Error(`UTF-8として解釈できないfileです: ${displayPath}`, {
      cause: error,
    });
  }
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
