import {
  lstat,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import {
  getDocumentArchiveState,
  setDocumentArchived,
} from "../content/archive.js";
import {
  atomicCreate,
  atomicReplace,
  digestText,
  fileMatchesSnapshot,
  readUtf8File,
  safeRemove,
} from "../content/safe-write.js";
import { findViewerDocuments } from "../content/documents.js";
import { lintProject } from "../lint/project.js";
import {
  createMigrationPlan,
  migrationPlanHasBlockers,
  type MigrationPlan,
} from "./planner.js";
import {
  acquireMigrationLock,
  createMigrationId,
  createMigrationStorage,
  findIncompleteMigrationId,
  findMigrationOwnership,
  migrationPath,
  probeAtomicCreate,
  readMigrationJournal,
  removePreparedMigrationStorage,
  writeMigrationBackup,
  writeMigrationJournal,
  type MigrationJournal,
} from "./storage.js";

export class MigrationBlockedError extends Error {
  override name = "MigrationBlockedError";
}

export interface ApplyMigrationOptions {
  readonly contentRoot: string;
  readonly language: string;
  readonly warningsAsErrors: boolean;
  readonly allowLossy?: boolean;
  readonly languages?: ReadonlyMap<string, string>;
  readonly createId?: () => string;
  readonly operationHook?: (operation: {
    kind: "create" | "replace" | "archive" | "journal";
    phase: "before" | "after";
    index: number;
  }) => Promise<void>;
}

export interface ApplyMigrationResult {
  readonly plan: MigrationPlan;
  readonly migrationId: string | null;
}

export async function applyMigration(
  options: ApplyMigrationOptions,
): Promise<ApplyMigrationResult> {
  const contentRoot = await resolveContentRoot(options.contentRoot);
  const lock = await acquireMigrationLock(contentRoot);
  try {
    const incompleteMigration = await findIncompleteMigrationId(contentRoot);
    if (incompleteMigration !== null) {
      throw new MigrationBlockedError(
        `未完了migrationがあります。先にrollbackしてください: ${incompleteMigration}`,
      );
    }
    const plan = await createMigrationPlan({
      contentRoot,
      language: options.language,
      allowLossy: options.allowLossy ?? false,
      ...(options.languages === undefined ? {} : { languages: options.languages }),
    });
    if (migrationPlanHasBlockers(plan, options.warningsAsErrors)) {
      return { plan, migrationId: null };
    }
    if (plan.sources.length === 0) {
      return { plan, migrationId: null };
    }
    await verifyPlanSnapshots(plan);
    await probeAtomicCreate(
      contentRoot,
      plan.sources.map((source) => source.directorySnapshot),
    );
    const migrationId = options.createId?.() ?? createMigrationId();
    await createMigrationStorage(contentRoot, migrationId);
    let journal: MigrationJournal;
    try {
      const replacements = [];
      for (const replacement of plan.replacements) {
        const backupPath = await writeMigrationBackup(
          contentRoot,
          migrationId,
          replacement.path,
          replacement.source,
        );
        replacements.push({
          path: replacement.path,
          beforeDigest: replacement.sourceSnapshot.digest,
          afterDigest: replacement.outputDigest,
          backupPath,
          applied: false,
        });
      }
      journal = {
        version: 1,
        id: migrationId,
        state: "prepared",
        createdAt: new Date().toISOString(),
        language: plan.language,
        sources: plan.sources.map((source) => ({
          path: source.path,
          outputPath: source.outputPath,
          digest: source.sourceSnapshot.digest,
          outputDigest: source.outputDigest,
          archived: false,
        })),
        creates: plan.sources.map((source) => ({
          path: source.outputPath,
          digest: source.outputDigest,
          applied: false,
        })),
        replacements,
      };
      await writeMigrationJournal(contentRoot, journal, true);
    } catch (error: unknown) {
      try {
        await removePreparedMigrationStorage(contentRoot, migrationId);
      } catch (cleanupError: unknown) {
        throw new Error(
          `migration準備に失敗しstorageも除去できませんでした: ${messageOf(error)}; cleanup=${messageOf(cleanupError)}`,
          { cause: cleanupError },
        );
      }
      throw error;
    }

    try {
      let journalOperationIndex = 0;
      const persistJournal = async (): Promise<void> => {
        const index = journalOperationIndex;
        await options.operationHook?.({
          kind: "journal",
          phase: "before",
          index,
        });
        await writeMigrationJournal(contentRoot, journal, false);
        await options.operationHook?.({
          kind: "journal",
          phase: "after",
          index,
        });
        journalOperationIndex += 1;
      };
      journal.state = "applying";
      await persistJournal();
      for (const [index, source] of plan.sources.entries()) {
        await options.operationHook?.({ kind: "create", phase: "before", index });
        await assertDirectorySnapshot(source);
        await assertSourceSnapshot(source);
        await atomicCreate(
          source.outputAbsolutePath,
          source.output,
          "spec-html-migrate-create",
        );
        await options.operationHook?.({ kind: "create", phase: "after", index });
        journal.creates[index]!.applied = true;
        await persistJournal();
      }
      for (const [index, replacement] of plan.replacements.entries()) {
        await options.operationHook?.({ kind: "replace", phase: "before", index });
        await assertDirectorySnapshot(replacement);
        if (
          !(await fileMatchesSnapshot(
            replacement.absolutePath,
            replacement.path,
            replacement.sourceSnapshot,
          ))
        ) {
          throw new Error(
            `移行中に既存HTMLが変更されました: ${replacement.path}`,
          );
        }
        await atomicReplace(
          replacement.absolutePath,
          replacement.output,
          "spec-html-migrate-replace",
          { rename },
        );
        await options.operationHook?.({ kind: "replace", phase: "after", index });
        journal.replacements[index]!.applied = true;
        await persistJournal();
      }
      for (const [index, source] of plan.sources.entries()) {
        await options.operationHook?.({ kind: "archive", phase: "before", index });
        await assertDirectorySnapshot(source);
        await assertSourceSnapshot(source);
        await setDocumentArchived(contentRoot, source.path, true, {
          migrationOperation: true,
        });
        await options.operationHook?.({ kind: "archive", phase: "after", index });
        journal.sources[index]!.archived = true;
        await persistJournal();
      }
      await verifyAppliedMigration(contentRoot, journal);
      await verifyFinalProjectState(contentRoot, plan);
      journal.state = "committed";
      await persistJournal();
      for (const source of journal.sources) {
        const ownership = await findMigrationOwnership(contentRoot, source.path);
        if (ownership?.migrationId !== migrationId) {
          throw new Error(`Restore guardを確認できません: ${source.path}`);
        }
      }
      return { plan, migrationId };
    } catch (error: unknown) {
      try {
        await rollbackJournalUnlocked(contentRoot, journal);
      } catch (rollbackError: unknown) {
        throw new Error(
          `migrationに失敗しrollbackも完了できませんでした: ${messageOf(error)}; rollback=${messageOf(rollbackError)}`,
          { cause: rollbackError },
        );
      }
      throw error;
    }
  } finally {
    await lock.release();
  }
}

async function verifyFinalProjectState(
  contentRoot: string,
  plan: MigrationPlan,
): Promise<void> {
  const activeMarkdown = (await findViewerDocuments(contentRoot))
    .filter((document) => document.format === "markdown")
    .map((document) => document.path);
  if (activeMarkdown.length > 0) {
    throw new Error(
      `commit直前にactive Markdownが残っています: ${activeMarkdown.join(", ")}`,
    );
  }
  const expectedCounts = diagnosticCounts(plan.expectedDiagnosticKeys);
  const postLint = await lintProject(contentRoot);
  const unexpectedDiagnostics = postLint.diagnostics.filter((diagnostic) => {
    const key = diagnosticStableKey(diagnostic);
    const remaining = expectedCounts.get(key) ?? 0;
    if (remaining === 0) return true;
    expectedCounts.set(key, remaining - 1);
    return false;
  });
  if (unexpectedDiagnostics.length > 0) {
    throw new Error(
      `commit直前のproject再検証に失敗しました: ${unexpectedDiagnostics.map((diagnostic) => `${diagnostic.file}:${diagnostic.line}:${diagnostic.rule}`).join(", ")}`,
    );
  }
}

function diagnosticCounts(keys: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const key of keys) {
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function diagnosticStableKey(diagnostic: {
  file: string;
  rule: string;
  detail?: string;
}): string {
  return `${diagnostic.file}\0${diagnostic.rule}\0${diagnostic.detail ?? ""}`;
}

export async function rollbackMigration(
  requestedRoot: string,
  migrationId: string,
): Promise<MigrationJournal> {
  const contentRoot = await resolveContentRoot(requestedRoot);
  const lock = await acquireMigrationLock(contentRoot);
  try {
    const journal = await readMigrationJournal(contentRoot, migrationId);
    if (journal.state === "finalized") {
      throw new MigrationBlockedError(
        `finalized migrationはrollbackできません: ${migrationId}`,
      );
    }
    if (journal.state === "rolled-back") {
      return journal;
    }
    await preflightRollback(contentRoot, journal);
    await rollbackJournalUnlocked(contentRoot, journal);
    return journal;
  } finally {
    await lock.release();
  }
}

export async function finalizeMigration(
  requestedRoot: string,
  migrationId: string,
): Promise<MigrationJournal> {
  const contentRoot = await resolveContentRoot(requestedRoot);
  const lock = await acquireMigrationLock(contentRoot);
  try {
    const journal = await readMigrationJournal(contentRoot, migrationId);
    if (journal.state === "finalized") {
      await removeMigrationBackups(contentRoot, migrationId);
      return journal;
    }
    if (journal.state !== "committed") {
      throw new MigrationBlockedError(
        `committed migrationだけfinalizeできます: ${journal.state}`,
      );
    }
    for (const source of journal.sources) {
      const archivedPath = archivedAbsolutePath(contentRoot, source.path);
      await assertRegularFile(archivedPath, source.path);
      const outputPath = contentAbsolutePath(contentRoot, source.outputPath);
      await assertRegularFile(outputPath, source.outputPath);
      const output = await readUtf8File(outputPath, source.outputPath);
      source.outputDigest = digestText(output);
      const create = journal.creates.find(
        (item) => item.path === source.outputPath,
      );
      if (create !== undefined) {
        create.digest = source.outputDigest;
      }
    }
    for (const replacement of journal.replacements) {
      const path = contentAbsolutePath(contentRoot, replacement.path);
      await assertRegularFile(path, replacement.path);
      replacement.afterDigest = digestText(
        await readUtf8File(path, replacement.path),
      );
    }
    journal.state = "finalized";
    await writeMigrationJournal(contentRoot, journal, false);
    await removeMigrationBackups(contentRoot, migrationId);
    return journal;
  } finally {
    await lock.release();
  }
}

async function removeMigrationBackups(
  contentRoot: string,
  migrationId: string,
): Promise<void> {
  const backups = join(migrationPath(contentRoot, migrationId), "backups");
  if (!(await entryExists(backups))) {
    return;
  }
  const stats = await lstat(backups);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new MigrationBlockedError(
      `backup pathが通常directoryではありません: ${backups}`,
    );
  }
  await rm(backups, { recursive: true });
}

async function verifyPlanSnapshots(plan: MigrationPlan): Promise<void> {
  for (const source of plan.sources) {
    await assertDirectorySnapshot(source);
    await assertSourceSnapshot(source);
    if (await entryExists(source.outputAbsolutePath)) {
      throw new MigrationBlockedError(
        `出力先がpreflight後に作成されました: ${source.outputPath}`,
      );
    }
  }
  for (const replacement of plan.replacements) {
    await assertDirectorySnapshot(replacement);
    if (
      !(await fileMatchesSnapshot(
        replacement.absolutePath,
        replacement.path,
        replacement.sourceSnapshot,
      ))
    ) {
      throw new MigrationBlockedError(
        `既存HTMLがpreflight後に変更されました: ${replacement.path}`,
      );
    }
  }
}

async function assertSourceSnapshot(
  source: MigrationPlan["sources"][number],
): Promise<void> {
  if (
    !(await fileMatchesSnapshot(
      source.absolutePath,
      source.path,
      source.sourceSnapshot,
    ))
  ) {
    throw new MigrationBlockedError(
      `Markdown sourceがpreflight後に変更されました: ${source.path}`,
    );
  }
}

async function assertDirectorySnapshot(
  item: { absolutePath: string; directorySnapshot: string; path: string },
): Promise<void> {
  let current: string;
  try {
    current = await realpath(dirname(item.absolutePath));
  } catch {
    throw new MigrationBlockedError(
      `管理directoryがpreflight後に変更されました: ${item.path}`,
    );
  }
  if (current !== item.directorySnapshot) {
    throw new MigrationBlockedError(
      `管理directoryがpreflight後に変更されました: ${item.path}`,
    );
  }
}

async function verifyAppliedMigration(
  contentRoot: string,
  journal: MigrationJournal,
): Promise<void> {
  for (const source of journal.sources) {
    const state = await getDocumentArchiveState(contentRoot, source.path);
    if (!state.archived) {
      throw new Error(`MarkdownをArchiveできませんでした: ${source.path}`);
    }
    const archivedPath = archivedAbsolutePath(contentRoot, source.path);
    if (digestText(await readUtf8File(archivedPath, source.path)) !== source.digest) {
      throw new Error(`Archived Markdownのdigestが一致しません: ${source.path}`);
    }
    const outputPath = contentAbsolutePath(contentRoot, source.outputPath);
    if (
      digestText(await readUtf8File(outputPath, source.outputPath)) !==
        source.outputDigest
    ) {
      throw new Error(`生成HTMLのdigestが一致しません: ${source.outputPath}`);
    }
  }
  for (const replacement of journal.replacements) {
    const path = contentAbsolutePath(contentRoot, replacement.path);
    if (
      digestText(await readUtf8File(path, replacement.path)) !==
        replacement.afterDigest
    ) {
      throw new Error(`既存HTML rewriteのdigestが一致しません: ${replacement.path}`);
    }
  }
}

async function preflightRollback(
  contentRoot: string,
  journal: MigrationJournal,
): Promise<void> {
  for (const source of journal.sources) {
    const active = contentAbsolutePath(contentRoot, source.path);
    const archived = archivedAbsolutePath(contentRoot, source.path);
    const activeExists = await entryExists(active);
    const archivedExists = await entryExists(archived);
    if (!activeExists && !archivedExists) {
      throw new MigrationBlockedError(
        `Markdown sourceの配置を特定できません: ${source.path}`,
      );
    }
    if (activeExists && archivedExists && source.archived) {
      throw new MigrationBlockedError(
        `Markdown sourceの配置が競合しています: ${source.path}`,
      );
    }
    const path = activeExists && !source.archived ? active : archived;
    if (digestText(await readUtf8File(path, source.path)) !== source.digest) {
      throw new MigrationBlockedError(
        `Markdown sourceが変更されているためrollbackできません: ${source.path}`,
      );
    }
  }
  for (const create of journal.creates) {
    const path = contentAbsolutePath(contentRoot, create.path);
    if (
      (await entryExists(path)) &&
      digestText(await readUtf8File(path, create.path)) !== create.digest
    ) {
      throw new MigrationBlockedError(
        `生成HTMLが変更されているためrollbackできません: ${create.path}`,
      );
    }
  }
  for (const replacement of journal.replacements) {
    const path = contentAbsolutePath(contentRoot, replacement.path);
    const digest = digestText(await readUtf8File(path, replacement.path));
    if (digest !== replacement.beforeDigest && digest !== replacement.afterDigest) {
      throw new MigrationBlockedError(
        `既存HTMLが変更されているためrollbackできません: ${replacement.path}`,
      );
    }
    const backup = backupAbsolutePath(contentRoot, journal.id, replacement.backupPath);
    if (
      digestText(await readUtf8File(backup, replacement.backupPath)) !==
        replacement.beforeDigest
    ) {
      throw new MigrationBlockedError(
        `rollback backupが一致しません: ${replacement.path}`,
      );
    }
  }
}

async function rollbackJournalUnlocked(
  contentRoot: string,
  journal: MigrationJournal,
): Promise<void> {
  await preflightRollback(contentRoot, journal);
  journal.state = "rolling-back";
  await writeMigrationJournal(contentRoot, journal, false);
  for (const source of journal.sources) {
    const archived = archivedAbsolutePath(contentRoot, source.path);
    const active = contentAbsolutePath(contentRoot, source.path);
    const archivedExists = await entryExists(archived);
    const activeExists = await entryExists(active);
    if (archivedExists && !activeExists) {
      await setDocumentArchived(contentRoot, source.path, false, {
        migrationOperation: true,
      });
    } else if (
      archivedExists &&
      activeExists &&
      !source.archived &&
      (await pathsShareInode(active, archived))
    ) {
      await safeRemove(archived, source.path, source.digest);
    }
    source.archived = false;
    await writeMigrationJournal(contentRoot, journal, false);
  }
  for (const replacement of [...journal.replacements].reverse()) {
    const path = contentAbsolutePath(contentRoot, replacement.path);
    const current = await readUtf8File(path, replacement.path);
    if (digestText(current) === replacement.afterDigest) {
      const backup = backupAbsolutePath(
        contentRoot,
        journal.id,
        replacement.backupPath,
      );
      await atomicReplace(
        path,
        await readUtf8File(backup, replacement.backupPath),
        "spec-html-migrate-rollback",
        { rename },
      );
    }
    replacement.applied = false;
    await writeMigrationJournal(contentRoot, journal, false);
  }
  for (const create of [...journal.creates].reverse()) {
    const path = contentAbsolutePath(contentRoot, create.path);
    if (await entryExists(path)) {
      await safeRemove(path, create.path, create.digest);
    }
    create.applied = false;
    await writeMigrationJournal(contentRoot, journal, false);
  }
  journal.state = "rolled-back";
  await writeMigrationJournal(contentRoot, journal, false);
}

async function pathsShareInode(left: string, right: string): Promise<boolean> {
  const [leftStats, rightStats] = await Promise.all([lstat(left), lstat(right)]);
  return (
    leftStats.isFile() &&
    rightStats.isFile() &&
    !leftStats.isSymbolicLink() &&
    !rightStats.isSymbolicLink() &&
    leftStats.dev === rightStats.dev &&
    leftStats.ino === rightStats.ino
  );
}

function contentAbsolutePath(contentRoot: string, relativePath: string): string {
  return join(contentRoot, ...relativePath.split("/"));
}

function archivedAbsolutePath(contentRoot: string, relativePath: string): string {
  return join(
    contentRoot,
    ...dirname(relativePath)
      .split("/")
      .filter((segment) => segment !== "."),
    ".archived",
    basename(relativePath),
  );
}

function backupAbsolutePath(
  contentRoot: string,
  migrationId: string,
  relativeBackup: string,
): string {
  return join(
    migrationPath(contentRoot, migrationId),
    ...relativeBackup.split("/"),
  );
}

async function assertRegularFile(path: string, displayPath: string): Promise<void> {
  let stats;
  try {
    stats = await lstat(path);
  } catch {
    throw new MigrationBlockedError(`管理対象fileが見つかりません: ${displayPath}`);
  }
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new MigrationBlockedError(
      `管理対象が通常fileではありません: ${displayPath}`,
    );
  }
}

async function resolveContentRoot(requestedRoot: string): Promise<string> {
  const absoluteRoot = resolve(requestedRoot);
  let stats;
  try {
    stats = await lstat(absoluteRoot);
  } catch {
    throw new Error(`対象ディレクトリが見つかりません: ${absoluteRoot}`);
  }
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error(`対象は通常directoryで指定してください: ${absoluteRoot}`);
  }
  return realpath(absoluteRoot);
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

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
