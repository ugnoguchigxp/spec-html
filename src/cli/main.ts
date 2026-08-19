import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { formatFixCompact, formatFixJson } from "../fix/diagnostics.js";
import { fixProject, writeFixProject } from "../fix/project.js";
import {
  formatFormatCompact,
  formatFormatJson,
} from "../format/diagnostics.js";
import { formatProject, writeFormatProject } from "../format/project.js";
import { formatCompact, formatJson } from "../lint/diagnostics.js";
import { lintProject } from "../lint/project.js";
import { getRule } from "../lint/rules.js";
import { messageOf } from "../shared/error-message.js";
import { DocumentDiscoveryCache } from "../content/documents.js";
import {
  convertMarkdownDocument,
  writeConvertedDocument,
} from "../convert/document.js";
import {
  conversionHasErrors,
  formatConversionDiagnostics,
  formatConversionSummary,
} from "../convert/diagnostics.js";
import { messageForCliError } from "./errors.js";
import { openViewer } from "./open-browser.js";
import {
  CliUsageError,
  parseCliCommand,
  type CliCheckOptions,
  type CliCheckStage,
  type CliConvertOptions,
  type CliFixOptions,
  type CliFormatOptions,
  type CliLintOptions,
  type CliMigrateOptions,
  type CliRunOptions,
} from "./options.js";
import { resolveOptionalIntegrations } from "../server/integrations.js";
import { startServer } from "../server/start.js";
import { normalizeDocumentPath } from "../content/document-path.js";
import { documentFormatFromPath } from "../content/document-format.js";
import { canonicalizeLanguageTag } from "../markdown/language.js";
import {
  formatMigrationLifecycleReport,
  formatMigrationPlanReport,
} from "../migrate/diagnostics.js";
import {
  createMigrationPlan,
  migrationPlanHasBlockers,
} from "../migrate/planner.js";
import {
  applyMigration,
  finalizeMigration,
  MigrationBlockedError,
  rollbackMigration,
} from "../migrate/runner.js";

export const HELP_TEXT = `Usage: spec-html [directory] [options]

Options:
  --host <host>                  Host to listen on (default: 127.0.0.1)
  --allowed-host <hostname>      Allowed Host for non-loopback listeners (repeatable; required for wildcard hosts)
  --port <port>                  Port to listen on (default: 4173; 0 selects a free port)
  --markdown-lang <language-tag> Language of rendered Markdown documents (default: en)
  --open                         Open a browser after startup (default)
  --no-open                      Do not open a browser
  --help                         Show this help
  --version                      Show the version

Lint:
  spec-html lint [directory] [options]

Format:
  spec-html format [path] --check|--write [options]

Fix:
  spec-html fix [path] --check|--write [options]

Check:
  spec-html check [directory] [--fix] [options]

Convert:
  spec-html convert <input.md> --lang <language-tag> [--output <output.html>]

Migrate:
  spec-html migrate [directory] [--target <directory>...] --lang <language-tag> --check|--write`;

export const LINT_HELP_TEXT = `Usage: spec-html lint [directory] [options]

Options:
  --format <compact|json>  Output format (default: compact)
  --warnings-as-errors     Return exit code 1 for warnings
  --max-issues <number>    Maximum issues to display (default: 50; 0 shows all)
  --explain <RULE_ID>      Show the rule rationale and minimal examples
  --help                   Show this help`;

export const FORMAT_HELP_TEXT = `Usage: spec-html format [path] --check|--write [options]

Options:
  --check                      Check whether formatting changes are needed
  --write                      Write formatted output to files
  --reporter <compact|json>    Report format (default: compact)
  --help                       Show this help`;

export const FIX_HELP_TEXT = `Usage: spec-html fix [path] --check|--write [options]

Options:
  --check                      Check for safely fixable markup issues
  --write                      Write fixes to files
  --reporter <compact|json>    Report format (default: compact)
  --help                       Show this help`;

export const CHECK_HELP_TEXT = `Usage: spec-html check [directory] [--fix] [options]

Without a stage option, fixer, formatter, and linter run in that order.
When one or more of --fixer, --format, and --lint are present, only those stages run.

Options:
  --fix                        Write fixer and formatter changes to files
  --fixer                      Run the fixer stage
  --format                     Run the formatter stage
  --lint                       Run the linter stage
  --reporter <compact|json>    Report format (default: compact)
  --warnings-as-errors         Return exit code 1 for lint warnings
  --max-issues <number>        Maximum lint issues to display (default: 50; 0 shows all)
  --help                       Show this help`;

export const CONVERT_HELP_TEXT = `Usage: spec-html convert <input.md> --lang <language-tag> [options]

Options:
  --lang <language-tag>    BCP 47 language tag for the generated article (required)
  --output <output.html>   Create a new HTML file in the same directory (existing entries are rejected)
  --help                   Show this help

Without --output, generated HTML is written to stdout.
The Markdown source remains and is not synchronized with the generated HTML.`;

export const MIGRATE_HELP_TEXT = `Usage: spec-html migrate [directory] [options]

Options:
  --check                      Validate a batch migration without side effects
  --write                      Apply the migration after validation succeeds
  --rollback <migration-id>    Restore the state before a migration
  --finalize <migration-id>    Keep current HTML and remove rollback backups
  --lang <language-tag>        Article language for check/write (required)
  --language-map <json>        Override language tags by Markdown path
  --target <directory>         Migrate a content-root-relative directory (repeatable)
  --allow-lossy                Explicitly allow removal of raw HTML and unsafe URLs
  --reporter <compact|json>    Report format (default: compact)
  --warnings-as-errors         Treat warnings as blockers for check/write
  --help                       Show this help

The four actions are mutually exclusive. After --write, Markdown moves to the
migration-managed archive and can only be restored with --rollback. README,
CONTRIBUTING, CHANGELOG, SECURITY, and AGENTS Markdown variants stay active.`;

/** Dispatch a parsed command without an import-time process side effect. */
export async function main(args: readonly string[]): Promise<number> {
  try {
    const command = parseCliCommand(args, process.cwd());
    switch (command.kind) {
      case "help":
        console.log(HELP_TEXT);
        return 0;
      case "lint-help":
        console.log(LINT_HELP_TEXT);
        return 0;
      case "format-help":
        console.log(FORMAT_HELP_TEXT);
        return 0;
      case "fix-help":
        console.log(FIX_HELP_TEXT);
        return 0;
      case "check-help":
        console.log(CHECK_HELP_TEXT);
        return 0;
      case "convert-help":
        console.log(CONVERT_HELP_TEXT);
        return 0;
      case "migrate-help":
        console.log(MIGRATE_HELP_TEXT);
        return 0;
      case "version":
        console.log(__SPEC_HTML_VERSION__);
        return 0;
      case "explain":
        console.log(formatExplanation(command.rule));
        return 0;
      case "lint":
        return await runLint(command.options);
      case "format":
        return await runFormat(command.options);
      case "fix":
        return await runFix(command.options);
      case "check":
        return await runCheck(command.options);
      case "convert":
        return await runConvert(command.options);
      case "migrate":
        return await runMigrate(command.options);
      case "run":
        return await runViewer(command.options);
    }
  } catch (error: unknown) {
    console.error(`spec-html: ${messageForCliError(error)}`);
    if (
      process.env.SPEC_HTML_DEBUG === "1" &&
      error instanceof Error &&
      !(error instanceof CliUsageError)
    ) {
      console.error(error.stack);
    }
    return args[0] === "lint" ||
      args[0] === "format" ||
      args[0] === "fix" ||
      args[0] === "check" ||
      args[0] === "convert" ||
      args[0] === "migrate"
      ? 2
      : 1;
  }
}

export async function runConvert(options: CliConvertOptions): Promise<number> {
  const result = await convertMarkdownDocument(options);
  const diagnostics = formatConversionDiagnostics(result);

  if (result.outputPath === null) {
    process.stdout.write(result.output);
    if (diagnostics.length > 0) {
      process.stderr.write(diagnostics);
    }
    process.stderr.write(`${formatConversionSummary(result)}\n`);
  } else {
    await writeConvertedDocument(result);
    console.log(`Created: ${result.outputPath}`);
    console.log(`Source retained (not synchronized): ${result.inputPath}`);
    console.log(formatConversionSummary(result));
    if (diagnostics.length > 0) {
      process.stderr.write(diagnostics);
    }
  }

  return conversionHasErrors(result) ? 1 : 0;
}

export async function runMigrate(options: CliMigrateOptions): Promise<number> {
  const languages = "languageMapPath" in options && options.languageMapPath !== undefined
    ? await readLanguageMap(options.languageMapPath)
    : undefined;
  if (options.action === "check") {
    const plan = await createMigrationPlan({
      contentRoot: options.contentRoot,
      language: options.language,
      ...(options.allowLossy === undefined
        ? {}
        : { allowLossy: options.allowLossy }),
      ...(languages === undefined ? {} : { languages }),
      ...(options.targetDirectories === undefined
        ? {}
        : { targetDirectories: options.targetDirectories }),
    });
    console.log(
      formatMigrationPlanReport(
        plan,
        "check",
        options.reporter,
        options.warningsAsErrors,
      ),
    );
    return migrationPlanHasBlockers(plan, options.warningsAsErrors) ? 1 : 0;
  }
  if (options.action === "write") {
    try {
      const result = await applyMigration({
        ...options,
        ...(languages === undefined ? {} : { languages }),
      });
      console.log(
        formatMigrationPlanReport(
          result.plan,
          "write",
          options.reporter,
          options.warningsAsErrors,
          result.migrationId,
        ),
      );
      return migrationPlanHasBlockers(result.plan, options.warningsAsErrors)
        ? 1
        : 0;
    } catch (error: unknown) {
      if (error instanceof MigrationBlockedError) {
        console.error(`spec-html: ${error.message}`);
        return 1;
      }
      throw error;
    }
  }
  try {
    if (!("migrationId" in options)) {
      throw new Error("Could not resolve the migration action");
    }
    const journal = options.action === "rollback"
      ? await rollbackMigration(options.contentRoot, options.migrationId)
      : await finalizeMigration(options.contentRoot, options.migrationId);
    console.log(
      formatMigrationLifecycleReport(
        options.action,
        journal,
        options.reporter,
      ),
    );
    return 0;
  } catch (error: unknown) {
    if (error instanceof MigrationBlockedError) {
      console.error(`spec-html: ${error.message}`);
      return 1;
    }
    throw error;
  }
}

async function readLanguageMap(path: string): Promise<ReadonlyMap<string, string>> {
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CliUsageError("--language-map must contain a JSON object");
  }
  const languages = new Map<string, string>();
  for (const [documentPath, value] of Object.entries(parsed)) {
    if (
      normalizeDocumentPath(documentPath) !== documentPath ||
      documentFormatFromPath(documentPath) !== "markdown"
    ) {
      throw new CliUsageError(`Invalid Markdown path in --language-map: ${documentPath}`);
    }
    if (typeof value !== "string") {
      throw new CliUsageError(`Language tag in --language-map must be a string: ${documentPath}`);
    }
    languages.set(documentPath, canonicalizeLanguageTag(value));
  }
  return languages;
}

interface CheckStageReport {
  stage: CliCheckStage;
  compact: string;
  json: string;
}

export async function runCheck(options: CliCheckOptions): Promise<number> {
  const reports: CheckStageReport[] = [];
  let exitCode = 0;
  const discoveryCache = new DocumentDiscoveryCache();

  for (const stage of options.stages) {
    let stop = false;
    if (stage === "fixer") {
      const result = await fixProject(options.targetPath, discoveryCache);
      if (options.mode === "fix" && result.summary.blocked === 0) {
        await writeFixProject(options.targetPath, result);
      }
      reports.push({
        stage,
        compact: formatFixCompact(result),
        json: formatFixJson(result, options.mode === "fix" ? "write" : "check"),
      });
      if (
        result.summary.blocked > 0 ||
        (options.mode === "check" && result.summary.changed > 0)
      ) {
        exitCode = 1;
      }
      stop = options.mode === "fix" && result.summary.blocked > 0;
    } else if (stage === "formatter") {
      const result = await formatProject(options.targetPath, discoveryCache);
      if (options.mode === "fix" && result.summary.blocked === 0) {
        await writeFormatProject(options.targetPath, result);
      }
      reports.push({
        stage,
        compact: formatFormatCompact(result),
        json: formatFormatJson(
          result,
          options.mode === "fix" ? "write" : "check",
        ),
      });
      if (
        result.summary.blocked > 0 ||
        (options.mode === "check" && result.summary.changed > 0)
      ) {
        exitCode = 1;
      }
      stop = options.mode === "fix" && result.summary.blocked > 0;
    } else {
      const result = await lintProject(options.targetPath, discoveryCache);
      reports.push({
        stage,
        compact: formatCompact(result, options.maxIssues),
        json: formatJson(result, options.maxIssues),
      });
      if (
        result.summary.errors > 0 ||
        (options.warningsAsErrors && result.summary.warnings > 0)
      ) {
        exitCode = 1;
      }
    }
    if (stop) {
      break;
    }
  }

  console.log(formatCheckReport(reports, options));
  return exitCode;
}

function formatCheckReport(
  reports: readonly CheckStageReport[],
  options: CliCheckOptions,
): string {
  if (options.reporter === "json") {
    const stages = Object.fromEntries(
      reports.map((report) => [report.stage, parseJsonReport(report.json)]),
    );
    return JSON.stringify({ version: 1, mode: options.mode, stages }, null, 2);
  }
  return reports
    .map((report) => `== ${report.stage} ==\n${report.compact.trimEnd()}`)
    .join("\n\n");
}

function parseJsonReport(report: string): unknown {
  return JSON.parse(report) as unknown;
}

export async function runFix(options: CliFixOptions): Promise<number> {
  const result = await fixProject(options.targetPath);
  if (options.mode === "write" && result.summary.blocked === 0) {
    await writeFixProject(options.targetPath, result);
  }
  const output =
    options.reporter === "json"
      ? formatFixJson(result, options.mode)
      : formatFixCompact(result);
  console.log(output.trimEnd());
  if (result.summary.blocked > 0) {
    return 1;
  }
  return options.mode === "check" && result.summary.changed > 0 ? 1 : 0;
}

export async function runFormat(options: CliFormatOptions): Promise<number> {
  const result = await formatProject(options.targetPath);
  if (options.mode === "write" && result.summary.blocked === 0) {
    await writeFormatProject(options.targetPath, result);
  }
  const output =
    options.reporter === "json"
      ? formatFormatJson(result, options.mode)
      : formatFormatCompact(result);
  console.log(output.trimEnd());
  if (result.summary.blocked > 0) {
    return 1;
  }
  return options.mode === "check" && result.summary.changed > 0 ? 1 : 0;
}

export async function runLint(options: CliLintOptions): Promise<number> {
  const result = await lintProject(options.contentRoot);
  const output =
    options.format === "json"
      ? formatJson(result, options.maxIssues)
      : formatCompact(result, options.maxIssues);
  console.log(output.trimEnd());
  return result.summary.errors > 0 ||
    (options.warningsAsErrors && result.summary.warnings > 0)
    ? 1
    : 0;
}

export async function runViewer(options: CliRunOptions): Promise<number> {
  await assertContentDirectory(options.contentRoot);
  const runtimeRoot = fileURLToPath(new URL("./browser/", import.meta.url));
  const integrations = await resolveOptionalIntegrations();
  const runningServer = await startServer({
    ...options,
    runtimeRoot,
    integrations,
  });
  const viewerUrl = `${runningServer.origin}/`;
  console.log(`Spec HTML: ${viewerUrl}`);
  const shutdownSignal = waitForShutdownSignal();

  if (options.openBrowser) {
    try {
      await openViewer(viewerUrl);
    } catch (error: unknown) {
      console.warn(`spec-html: Could not open the browser: ${messageOf(error)}`);
    }
  }

  await shutdownSignal;
  try {
    await runningServer.close();
    return 0;
  } catch (error: unknown) {
    console.error(`spec-html: Could not stop the server: ${messageOf(error)}`);
    return 1;
  }
}

type ShutdownSignal = "SIGINT" | "SIGTERM";

export interface ShutdownSignalSource {
  once(signal: ShutdownSignal, listener: () => void): unknown;
  off(signal: ShutdownSignal, listener: () => void): unknown;
}

export function waitForShutdownSignal(
  signalSource: ShutdownSignalSource = process,
): Promise<ShutdownSignal> {
  return new Promise((resolve) => {
    const onSigint = (): void => finish("SIGINT");
    const onSigterm = (): void => finish("SIGTERM");
    const finish = (signal: ShutdownSignal): void => {
      signalSource.off("SIGINT", onSigint);
      signalSource.off("SIGTERM", onSigterm);
      resolve(signal);
    };

    signalSource.once("SIGINT", onSigint);
    signalSource.once("SIGTERM", onSigterm);
  });
}

function formatExplanation(ruleId: Parameters<typeof getRule>[0]): string {
  const rule = getRule(ruleId);
  return `${rule.id} ${rule.name} [${rule.severity}]
Reason: ${rule.reason}
Bad: ${rule.bad}
Good: ${rule.good}`;
}

async function assertContentDirectory(contentRoot: string): Promise<void> {
  let rootStats;
  try {
    rootStats = await stat(contentRoot);
  } catch {
    throw new Error(`Content directory not found: ${contentRoot}`);
  }
  if (!rootStats.isDirectory()) {
    throw new Error("Content path is not a directory");
  }
}
