import { lstat, realpath, rename } from "node:fs/promises";
import { basename, dirname, extname } from "node:path";
import {
  findContentDocuments,
  type ContentDocument,
} from "../content/documents.js";
import {
  atomicReplace,
  createFileSnapshot,
  fileMatchesSnapshot,
  readUtf8File,
  type AtomicWriteOperations,
  type FileSnapshot,
} from "../content/safe-write.js";
import { lintDocument } from "../lint/document.js";
import { fixDocument } from "./document.js";
import {
  createFixProblem,
  createFixProjectResult,
  type FixDocumentResult,
  type FixProjectResult,
} from "./diagnostics.js";
import { collectDocumentIds, fixDocumentReferences } from "./references.js";

interface ResolvedFixTargets {
  root: string;
  documents: readonly ContentDocument[];
}

export type FixWriteOperations = AtomicWriteOperations;

const projectSnapshots = new WeakMap<
  FixProjectResult,
  ReadonlyMap<string, FileSnapshot>
>();

/** Fix an HTML file or every viewer document in a directory without writing. */
export async function fixProject(
  targetPath: string,
): Promise<FixProjectResult> {
  const resolved = await resolveFixTargets(targetPath);
  const sources = new Map<string, string>();
  const snapshots = new Map<string, FileSnapshot>();
  let documents: FixDocumentResult[] = [];
  for (const target of resolved.documents) {
    const source = await readUtf8File(target.absolutePath, target.path);
    sources.set(target.path, source);
    snapshots.set(target.path, createFileSnapshot(target.absolutePath, source));
    documents.push(await fixDocument(source, target.absolutePath, target.path));
  }

  if (documents.some((document) => document.status === "blocked")) {
    const result = createFixProjectResult(documents);
    projectSnapshots.set(result, snapshots);
    return result;
  }

  const idsByFile = new Map<string, ReadonlySet<string>>();
  for (const [index, target] of resolved.documents.entries()) {
    const document = documents[index];
    if (document?.output === null || document === undefined) {
      continue;
    }
    idsByFile.set(
      target.path,
      await collectDocumentIds(document.output, target.absolutePath),
    );
  }

  const withReferences: FixDocumentResult[] = [];
  for (const [index, target] of resolved.documents.entries()) {
    const document = documents[index];
    if (document?.output === null || document === undefined) {
      continue;
    }
    const references = await fixDocumentReferences(
      document.output,
      target.absolutePath,
      target.path,
      resolved.root,
      idsByFile,
    );
    if (references.exhausted) {
      withReferences.push({
        ...document,
        status: "blocked",
        output: null,
        changed: false,
        fixes: [...document.fixes, ...references.fixes],
        problems: [
          ...document.problems,
          createFixProblem(target.path, 1, 1, "FIX002"),
        ],
        diagnostics: [],
      });
      continue;
    }
    const lint = await lintDocument(
      references.output,
      target.absolutePath,
      target.path,
    );
    withReferences.push({
      ...document,
      output: references.output,
      changed: references.output !== sources.get(target.path),
      fixes: [...document.fixes, ...references.fixes],
      diagnostics: lint.diagnostics,
    });
  }
  documents = withReferences;
  const result = createFixProjectResult(documents);
  projectSnapshots.set(result, snapshots);
  return result;
}

/** Write a fully preflighted fix result using per-file atomic replacement. */
export async function writeFixProject(
  targetPath: string,
  result: FixProjectResult,
  operations: FixWriteOperations = { rename },
): Promise<void> {
  if (result.summary.blocked > 0) {
    throw new Error(
      "安全に修正できないHTMLがあるためfileを書き換えませんでした",
    );
  }

  const resolved = await resolveFixTargets(targetPath);
  const targetByPath = new Map(
    resolved.documents.map((target) => [target.path, target]),
  );
  const snapshotByPath = projectSnapshots.get(result);
  if (
    targetByPath.size !== result.documents.length ||
    snapshotByPath === undefined ||
    snapshotByPath.size !== result.documents.length ||
    result.documents.some(
      (document) =>
        !targetByPath.has(document.file) || !snapshotByPath.has(document.file),
    )
  ) {
    throw new Error("修正後に対象fileの集合が変わったため書き換えませんでした");
  }

  for (const document of result.documents) {
    const target = targetByPath.get(document.file);
    const snapshot = snapshotByPath.get(document.file);
    if (
      target === undefined ||
      snapshot === undefined ||
      !(await fileMatchesSnapshot(target.absolutePath, document.file, snapshot))
    ) {
      throw new Error(
        `修正後に内容が変わったためfileを書き換えませんでした: ${document.file}`,
      );
    }
  }

  const plan = result.documents
    .filter((document) => document.changed)
    .map((document) => {
      const target = targetByPath.get(document.file);
      if (target === undefined || document.output === null) {
        throw new Error(`修正対象fileを再解決できません: ${document.file}`);
      }
      return { document, target, output: document.output };
    });
  const written: string[] = [];
  for (const [index, item] of plan.entries()) {
    try {
      await atomicReplace(
        item.target.absolutePath,
        item.output,
        "spec-html-fix",
        operations,
      );
      written.push(item.document.file);
    } catch (error: unknown) {
      const pending = plan.slice(index + 1).map((entry) => entry.document.file);
      const completed = written.length === 0 ? "なし" : written.join(",");
      const remaining = pending.length === 0 ? "なし" : pending.join(",");
      throw new Error(
        `書込に失敗しました: ${item.document.file}; 完了=${completed}; 未処理=${remaining}; ${messageOf(error)}`,
        { cause: error },
      );
    }
  }
}

async function resolveFixTargets(
  targetPath: string,
): Promise<ResolvedFixTargets> {
  let stats;
  try {
    stats = await lstat(targetPath);
  } catch {
    throw new Error(`対象pathが見つかりません: ${targetPath}`);
  }
  if (stats.isSymbolicLink()) {
    throw new Error(`symbolic linkは修正できません: ${targetPath}`);
  }
  if (stats.isDirectory()) {
    const root = await realpath(targetPath);
    return { root, documents: await findContentDocuments(root) };
  }
  if (!stats.isFile()) {
    throw new Error(
      `対象pathはHTML fileまたはdirectoryではありません: ${targetPath}`,
    );
  }
  if (extname(targetPath).toLowerCase() !== ".html") {
    throw new Error(`対象fileは.htmlではありません: ${targetPath}`);
  }
  if (basename(targetPath).toLowerCase() === "nav.html") {
    throw new Error("nav.htmlはViewer文書ではないため修正対象にできません");
  }
  const absolutePath = await realpath(targetPath);
  return {
    root: dirname(absolutePath),
    documents: [{ absolutePath, path: basename(absolutePath) }],
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
