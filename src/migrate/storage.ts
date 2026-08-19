import { randomBytes } from "node:crypto";
import {
  lstat,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { atomicCreate, atomicReplace } from "../content/safe-write.js";
import {
  documentFormatFromPath,
  removeDocumentExtension,
} from "../content/document-format.js";
import {
  acquireContentMutationLock,
  CONTENT_STATE_DIRECTORY,
  ContentMutationLockedError,
  type ContentMutationLock,
} from "../content/mutation-lock.js";
import { messageOf } from "../shared/error-message.js";

export const MIGRATION_STATE_DIRECTORY = CONTENT_STATE_DIRECTORY;
export const MIGRATION_DIRECTORY = "migrations";

export type MigrationJournalState =
  | "prepared"
  | "applying"
  | "committed"
  | "rolling-back"
  | "rolled-back"
  | "finalized";

export interface MigrationJournalSource {
  path: string;
  outputPath: string;
  digest: string;
  outputDigest: string;
  archived: boolean;
}

export interface MigrationJournalCreate {
  path: string;
  digest: string;
  applied: boolean;
}

export interface MigrationJournalReplacement {
  path: string;
  beforeDigest: string;
  afterDigest: string;
  backupPath: string;
  applied: boolean;
}

export interface MigrationJournal {
  version: 1;
  id: string;
  state: MigrationJournalState;
  createdAt: string;
  language: string;
  sources: MigrationJournalSource[];
  creates: MigrationJournalCreate[];
  replacements: MigrationJournalReplacement[];
}

export interface MigrationOwnership {
  readonly migrationId: string;
  readonly outputPath: string;
  readonly state: Exclude<MigrationJournalState, "rolled-back">;
}

export { ContentMutationLockedError };
export type MigrationLock = ContentMutationLock;

export function createMigrationId(now = new Date()): string {
  return `${now.toISOString().replace(/[-:.]/g, "").replace("Z", "Z")}-${randomBytes(3).toString("hex")}`;
}

export async function acquireMigrationLock(
  contentRoot: string,
): Promise<MigrationLock> {
  return acquireContentMutationLock(contentRoot);
}

export async function ensureMigrationsRoot(contentRoot: string): Promise<string> {
  const stateRoot = await ensureStateRoot(contentRoot);
  const migrationsRoot = join(stateRoot, MIGRATION_DIRECTORY);
  await ensureDirectory(migrationsRoot);
  return migrationsRoot;
}

export function migrationPath(contentRoot: string, migrationId: string): string {
  assertMigrationId(migrationId);
  return join(
    contentRoot,
    MIGRATION_STATE_DIRECTORY,
    MIGRATION_DIRECTORY,
    migrationId,
  );
}

export async function createMigrationStorage(
  contentRoot: string,
  migrationId: string,
): Promise<string> {
  assertMigrationId(migrationId);
  const migrationsRoot = await ensureMigrationsRoot(contentRoot);
  const directory = join(migrationsRoot, migrationId);
  await mkdir(directory, { mode: 0o700 });
  try {
    const backups = join(directory, "backups", "existing-html");
    await mkdir(backups, { recursive: true, mode: 0o700 });
    return directory;
  } catch (error: unknown) {
    try {
      await rm(directory, { recursive: true });
    } catch (cleanupError: unknown) {
      throw new Error(
        `migration storageの準備とcleanupに失敗しました: ${messageOf(error)}; cleanup=${messageOf(cleanupError)}`,
        { cause: cleanupError },
      );
    }
    throw error;
  }
}

/** Remove storage created before any content mutation when preparation fails. */
export async function removePreparedMigrationStorage(
  contentRoot: string,
  migrationId: string,
): Promise<void> {
  const directory = migrationPath(contentRoot, migrationId);
  let stats;
  try {
    stats = await lstat(directory);
  } catch (error: unknown) {
    if (isNodeError(error, "ENOENT")) return;
    throw error;
  }
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error(`migration storageが通常directoryではありません: ${directory}`);
  }
  await rm(directory, { recursive: true });
}

/** Verify the filesystem primitive used by atomicCreate before content mutation. */
export async function probeAtomicCreate(
  contentRoot: string,
  contentDirectories: readonly string[] = [],
): Promise<void> {
  const stateRoot = await ensureStateRoot(contentRoot);
  for (const directory of new Set([stateRoot, ...contentDirectories])) {
    const path = join(
      directory,
      `.spec-html-migrate-capability-${process.pid}-${randomBytes(4).toString("hex")}`,
    );
    try {
      await atomicCreate(path, "spec-html migration capability probe\n", "probe");
    } finally {
      await rm(path, { force: true });
    }
  }
}

export async function writeMigrationJournal(
  contentRoot: string,
  journal: MigrationJournal,
  create: boolean,
): Promise<void> {
  validateMigrationJournal(journal);
  const path = join(migrationPath(contentRoot, journal.id), "journal.json");
  const output = `${JSON.stringify(journal, null, 2)}\n`;
  if (create) {
    await atomicCreate(path, output, "spec-html-migrate-journal");
  } else {
    await atomicReplace(path, output, "spec-html-migrate-journal", {
      rename,
    });
  }
}

export async function readMigrationJournal(
  contentRoot: string,
  migrationId: string,
): Promise<MigrationJournal> {
  const migrationsRoot = join(
    contentRoot,
    MIGRATION_STATE_DIRECTORY,
    MIGRATION_DIRECTORY,
  );
  await assertExistingDirectory(join(contentRoot, MIGRATION_STATE_DIRECTORY));
  await assertExistingDirectory(migrationsRoot);
  const directory = migrationPath(contentRoot, migrationId);
  await assertExistingDirectory(directory);
  const path = join(directory, "journal.json");
  const stats = await lstat(path);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`migration journalが通常fileではありません: ${path}`);
  }
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!isMigrationJournal(parsed) || parsed.id !== migrationId) {
    throw new Error(`migration journalが不正です: ${path}`);
  }
  validateMigrationJournal(parsed);
  return parsed;
}

export async function writeMigrationBackup(
  contentRoot: string,
  migrationId: string,
  relativePath: string,
  source: string,
): Promise<string> {
  if (!isSafeContentPath(relativePath)) {
    throw new Error(`backup対象pathが不正です: ${relativePath}`);
  }
  const relativeBackup = `backups/existing-html/${relativePath}`;
  const absoluteBackup = join(
    migrationPath(contentRoot, migrationId),
    ...relativeBackup.split("/"),
  );
  await mkdir(dirname(absoluteBackup), { recursive: true, mode: 0o700 });
  await atomicCreate(
    absoluteBackup,
    source,
    "spec-html-migrate-backup",
  );
  return relativeBackup;
}

export async function findMigrationOwnership(
  contentRoot: string,
  documentPath: string,
): Promise<MigrationOwnership | null> {
  const migrationsRoot = join(
    contentRoot,
    MIGRATION_STATE_DIRECTORY,
    MIGRATION_DIRECTORY,
  );
  let entries;
  try {
    await assertExistingDirectory(join(contentRoot, MIGRATION_STATE_DIRECTORY));
    await assertExistingDirectory(migrationsRoot);
    entries = await readdir(migrationsRoot, { withFileTypes: true });
  } catch (error: unknown) {
    if (isNodeError(error, "ENOENT")) {
      return null;
    }
    throw error;
  }
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name, "en")
  )) {
    if (!entry.isDirectory() || !isMigrationId(entry.name)) {
      continue;
    }
    const journal = await tryReadMigrationJournal(contentRoot, entry.name);
    if (journal === null) {
      continue;
    }
    if (journal.state === "rolled-back") {
      continue;
    }
    const source = journal.sources.find((item) => item.path === documentPath);
    if (source !== undefined) {
      return {
        migrationId: journal.id,
        outputPath: source.outputPath,
        state: journal.state,
      };
    }
  }
  return null;
}

export async function findIncompleteMigrationId(
  contentRoot: string,
): Promise<string | null> {
  const migrationIds = await listMigrationIds(contentRoot);
  for (const migrationId of migrationIds) {
    const journal = await tryReadMigrationJournal(contentRoot, migrationId);
    if (journal === null) {
      continue;
    }
    if (
      journal.state === "prepared" ||
      journal.state === "applying" ||
      journal.state === "rolling-back"
    ) {
      return migrationId;
    }
  }
  return null;
}

async function tryReadMigrationJournal(
  contentRoot: string,
  migrationId: string,
): Promise<MigrationJournal | null> {
  try {
    return await readMigrationJournal(contentRoot, migrationId);
  } catch (error: unknown) {
    if (isNodeError(error, "ENOENT")) {
      return null;
    }
    throw error;
  }
}

export function validateMigrationJournal(journal: MigrationJournal): void {
  if (!isMigrationJournal(journal)) {
    throw new Error("migration journal schemaが不正です");
  }
  assertMigrationId(journal.id);
  const paths = [
    ...journal.sources.flatMap((source) => [source.path, source.outputPath]),
    ...journal.creates.map((create) => create.path),
    ...journal.replacements.map((replacement) => replacement.path),
  ];
  if (paths.some((path) => !isSafeContentPath(path))) {
    throw new Error("migration journalに不正なcontent pathがあります");
  }
  if (
    journal.sources.some(
      (source) =>
        documentFormatFromPath(source.path) !== "markdown" ||
        documentFormatFromPath(source.outputPath) !== "html" ||
        source.outputPath !== `${removeDocumentExtension(source.path)}.html`,
    ) ||
    journal.creates.some(
      (create) => documentFormatFromPath(create.path) !== "html",
    ) ||
    journal.replacements.some(
      (replacement) => documentFormatFromPath(replacement.path) !== "html",
    )
  ) {
    throw new Error("migration journalの文書形式または出力pathが不正です");
  }
  const sourcePaths = journal.sources.map((source) => source.path);
  const outputPaths = journal.sources.map((source) => source.outputPath);
  const createPaths = journal.creates.map((create) => create.path);
  const replacementPaths = journal.replacements.map(
    (replacement) => replacement.path,
  );
  for (const [label, values] of [
    ["source", sourcePaths],
    ["output", outputPaths],
    ["create", createPaths],
    ["replacement", replacementPaths],
  ] as const) {
    if (canonicalPathSet(values).size !== values.length) {
      throw new Error(`migration journalの${label} pathが重複しています`);
    }
  }
  const createByPath = new Map(
    journal.creates.map((create) => [canonicalPathKey(create.path), create]),
  );
  if (
    createByPath.size !== journal.sources.length ||
    journal.sources.some((source) => {
      const create = createByPath.get(canonicalPathKey(source.outputPath));
      return create === undefined || create.digest !== source.outputDigest;
    })
  ) {
    throw new Error("migration journalのsourceとcreateが一対一ではありません");
  }
  const sourceKeys = canonicalPathSet(sourcePaths);
  const outputKeys = canonicalPathSet(outputPaths);
  const replacementKeys = canonicalPathSet(replacementPaths);
  if (
    intersects(sourceKeys, outputKeys) ||
    intersects(sourceKeys, replacementKeys) ||
    intersects(outputKeys, replacementKeys)
  ) {
    throw new Error("migration journalの管理pathが相互に衝突しています");
  }
  if (
    journal.replacements.some(
      (replacement) =>
        replacement.backupPath !==
          `backups/existing-html/${replacement.path}` ||
        !isSafeRelativePath(replacement.backupPath),
    )
  ) {
    throw new Error("migration journalに不正なbackup pathがあります");
  }
  const fullyApplied = journal.sources.every((source) => source.archived) &&
    journal.creates.every((create) => create.applied) &&
    journal.replacements.every((replacement) => replacement.applied);
  const fullyUnapplied = journal.sources.every((source) => !source.archived) &&
    journal.creates.every((create) => !create.applied) &&
    journal.replacements.every((replacement) => !replacement.applied);
  if (
    (journal.state === "prepared" && !fullyUnapplied) ||
    (["committed", "finalized"].includes(journal.state) && !fullyApplied) ||
    (journal.state === "rolled-back" && !fullyUnapplied)
  ) {
    throw new Error("migration journalのstateと適用flagが整合しません");
  }
}

function canonicalPathSet(paths: readonly string[]): Set<string> {
  return new Set(paths.map(canonicalPathKey));
}

function canonicalPathKey(path: string): string {
  return path.normalize("NFC").toLocaleLowerCase("en-US");
}

function intersects(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  for (const value of left) {
    if (right.has(value)) return true;
  }
  return false;
}

function isMigrationJournal(value: unknown): value is MigrationJournal {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.version === 1 &&
    typeof record.id === "string" &&
    isMigrationState(record.state) &&
    typeof record.createdAt === "string" &&
    typeof record.language === "string" &&
    Array.isArray(record.sources) &&
    record.sources.every(isJournalSource) &&
    Array.isArray(record.creates) &&
    record.creates.every(isJournalCreate) &&
    Array.isArray(record.replacements) &&
    record.replacements.every(isJournalReplacement)
  );
}

function isJournalSource(value: unknown): value is MigrationJournalSource {
  return isRecord(value) &&
    typeof value.path === "string" &&
    typeof value.outputPath === "string" &&
    isDigest(value.digest) &&
    isDigest(value.outputDigest) &&
    typeof value.archived === "boolean";
}

function isJournalCreate(value: unknown): value is MigrationJournalCreate {
  return isRecord(value) &&
    typeof value.path === "string" &&
    isDigest(value.digest) &&
    typeof value.applied === "boolean";
}

function isJournalReplacement(
  value: unknown,
): value is MigrationJournalReplacement {
  return isRecord(value) &&
    typeof value.path === "string" &&
    isDigest(value.beforeDigest) &&
    isDigest(value.afterDigest) &&
    typeof value.backupPath === "string" &&
    typeof value.applied === "boolean";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDigest(value: unknown): value is string {
  return typeof value === "string" && /^[\da-f]{64}$/.test(value);
}

function isMigrationState(value: unknown): value is MigrationJournalState {
  return [
    "prepared",
    "applying",
    "committed",
    "rolling-back",
    "rolled-back",
    "finalized",
  ].includes(String(value));
}

function assertMigrationId(value: string): void {
  if (!isMigrationId(value)) {
    throw new Error(`migration IDが不正です: ${value}`);
  }
}

function isMigrationId(value: string): boolean {
  return /^\d{8}T\d{6}\d{3}Z-[\da-f]{6}$/.test(value);
}

function isSafeContentPath(value: string): boolean {
  if (!isSafeRelativePath(value) || !/\.(?:html|md|markdown)$/i.test(value)) {
    return false;
  }
  const segments = value.split("/");
  return segments.every(
    (segment) => !segment.startsWith(".") && segment !== "node_modules",
  ) && segments.at(-1)?.toLocaleLowerCase("en-US") !== "nav.html";
}

function isSafeRelativePath(value: string): boolean {
  return value.length > 0 &&
    !value.startsWith("/") &&
    !value.includes("\\") &&
    !value.includes("\0") &&
    value.split("/").every((segment) =>
      segment.length > 0 && segment !== "." && segment !== ".."
    );
}

async function ensureStateRoot(contentRoot: string): Promise<string> {
  const stateRoot = join(contentRoot, MIGRATION_STATE_DIRECTORY);
  await ensureDirectory(stateRoot);
  return stateRoot;
}

async function ensureDirectory(path: string): Promise<void> {
  try {
    await mkdir(path, { mode: 0o700 });
  } catch (error: unknown) {
    if (!isNodeError(error, "EEXIST")) {
      throw error;
    }
  }
  const stats = await lstat(path);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error(`migration state pathが通常directoryではありません: ${path}`);
  }
}

async function assertExistingDirectory(path: string): Promise<void> {
  const stats = await lstat(path);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error(`migration state pathが通常directoryではありません: ${path}`);
  }
}

async function listMigrationIds(contentRoot: string): Promise<string[]> {
  const stateRoot = join(contentRoot, MIGRATION_STATE_DIRECTORY);
  const migrationsRoot = join(stateRoot, MIGRATION_DIRECTORY);
  try {
    await assertExistingDirectory(stateRoot);
    await assertExistingDirectory(migrationsRoot);
  } catch (error: unknown) {
    if (isNodeError(error, "ENOENT")) {
      return [];
    }
    throw error;
  }
  const entries = await readdir(migrationsRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && isMigrationId(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, "en"));
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
