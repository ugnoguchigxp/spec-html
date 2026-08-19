import {
  getDocumentArchived,
  setDocumentArchived as setContentDocumentArchived,
} from "../content/archive.js";
import { acquireContentMutationLock } from "../content/mutation-lock.js";
import { findMigrationOwnership } from "./storage.js";

export class MigrationManagedDocumentError extends Error {
  override name = "MigrationManagedDocumentError";

  constructor(
    readonly documentPath: string,
    readonly migrationId: string,
  ) {
    super(
      `A migration-managed document cannot be restored individually: ${documentPath} (${migrationId})`,
    );
  }
}

export interface DocumentArchiveState {
  readonly archived: boolean;
  readonly restoreAllowed: boolean;
  readonly migrationId: string | null;
  readonly migrationOutputPath: string | null;
}

export async function getDocumentArchiveState(
  contentRoot: string,
  documentPath: string,
): Promise<DocumentArchiveState> {
  const archived = await getDocumentArchived(contentRoot, documentPath);
  const ownership = archived
    ? await findMigrationOwnership(contentRoot, documentPath)
    : null;
  return {
    archived,
    restoreAllowed: !archived || ownership === null,
    migrationId: ownership?.migrationId ?? null,
    migrationOutputPath: ownership?.outputPath ?? null,
  };
}

export async function setDocumentArchived(
  contentRoot: string,
  documentPath: string,
  archived: boolean,
): Promise<boolean> {
  const lock = await acquireContentMutationLock(contentRoot);
  try {
    if (!archived) {
      const ownership = await findMigrationOwnership(contentRoot, documentPath);
      if (ownership !== null) {
        throw new MigrationManagedDocumentError(
          documentPath,
          ownership.migrationId,
        );
      }
    }
    return setContentDocumentArchived(contentRoot, documentPath, archived, {
      migrationOperation: true,
    });
  } finally {
    await lock.release();
  }
}
