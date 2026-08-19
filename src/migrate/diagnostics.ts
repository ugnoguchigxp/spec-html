import type { MigrationPlan } from "./planner.js";
import type { MigrationJournal } from "./storage.js";

export type MigrationReporter = "compact" | "json";
export type MigrationReportMode = "check" | "write";

export function formatMigrationPlanReport(
  plan: MigrationPlan,
  mode: MigrationReportMode,
  reporter: MigrationReporter,
  warningsAsErrors: boolean,
  migrationId: string | null = null,
): string {
  const ready =
    plan.summary.errors === 0 &&
    (!warningsAsErrors || plan.summary.warnings === 0);
  if (reporter === "json") {
    return JSON.stringify(
      {
        version: 1,
        mode,
        ready,
        migrationId,
        summary: plan.summary,
        issues: plan.issues,
        sources: plan.sources.map((source) => ({
          path: source.path,
          outputPath: source.outputPath,
          language: source.language,
          captions: source.captions,
          notices: source.notices,
        })),
        replacements: plan.replacements.map((replacement) => ({
          path: replacement.path,
          rewrites: replacement.rewrites,
        })),
      },
      null,
      2,
    );
  }

  const lines: string[] = [];
  for (const issue of plan.issues) {
    const location = issue.file === undefined
      ? ""
      : `${issue.file}${issue.line === undefined ? "" : `:${issue.line}:${issue.column ?? 1}`} `;
    const severity = issue.severity === "error" ? "E" : "W";
    lines.push(`${location}${severity} ${issue.code} ${issue.message}`);
  }
  if (migrationId !== null) {
    lines.push(`migration-id ${migrationId}`);
  }
  const summary = plan.summary;
  lines.push(
    `summary markdown=${summary.markdown} creates=${summary.creates} captions=${summary.captions} html-rewrites=${summary.htmlRewrites} archives=${summary.archives} parity=${summary.parityMatched}/${summary.markdown} errors=${summary.errors} warnings=${summary.warnings} ready=${String(ready)} input-bytes=${summary.inputBytes} source-bytes=${summary.sourceBytes} output-bytes=${summary.outputBytes} backup-bytes=${summary.backupBytes} required-bytes=${summary.requiredBytes} available-bytes=${summary.availableBytes} max-path-bytes=${summary.maxPathLength}`,
  );
  return lines.join("\n");
}

export function formatMigrationLifecycleReport(
  action: "rollback" | "finalize",
  journal: MigrationJournal,
  reporter: MigrationReporter,
): string {
  if (reporter === "json") {
    return JSON.stringify(
      {
        version: 1,
        action,
        migrationId: journal.id,
        state: journal.state,
        sources: journal.sources.length,
        creates: journal.creates.length,
        replacements: journal.replacements.length,
      },
      null,
      2,
    );
  }
  return `${action} migration-id=${journal.id} state=${journal.state} sources=${journal.sources.length} creates=${journal.creates.length} replacements=${journal.replacements.length}`;
}
