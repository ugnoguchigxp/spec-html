import { stat } from "node:fs/promises";
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
  type CliRunOptions,
} from "./options.js";
import { resolveOptionalIntegrations } from "../server/integrations.js";
import { startServer } from "../server/start.js";

export const HELP_TEXT = `使い方: spec-html [directory] [options]

Options:
  --host <host>                  listenするhost（既定: 127.0.0.1）
  --allowed-host <hostname>      非loopbackで許可するHost（repeat可、wildcardでは必須）
  --port <port>                  listenするport（既定: 4173、0で自動割り当て）
  --markdown-lang <language-tag> Markdown文書の言語（既定: en）
  --open                         起動後にbrowserを開く（既定）
  --no-open                      browserを開かない
  --help                         このhelpを表示
  --version                      versionを表示

Lint:
  spec-html lint [directory] [options]

Format:
  spec-html format [path] --check|--write [options]

Fix:
  spec-html fix [path] --check|--write [options]

Check:
  spec-html check [directory] [--fix] [options]

Convert:
  spec-html convert <input.md> --lang <language-tag> [--output <output.html>]`;

export const LINT_HELP_TEXT = `使い方: spec-html lint [directory] [options]

Options:
  --format <compact|json>  出力形式（既定: compact）
  --warnings-as-errors     warningも終了code 1にする
  --max-issues <number>    最大表示件数（既定: 50、0で全件）
  --explain <RULE_ID>      ruleの理由と最小例を表示
  --help                   このhelpを表示`;

export const FORMAT_HELP_TEXT = `使い方: spec-html format [path] --check|--write [options]

Options:
  --check                      変更が必要か確認する
  --write                      整形結果をfileへ書き込む
  --reporter <compact|json>    report形式（既定: compact）
  --help                       このhelpを表示`;

export const FIX_HELP_TEXT = `使い方: spec-html fix [path] --check|--write [options]

Options:
  --check                      安全に修正できるTypoがあるか確認する
  --write                      修正結果をfileへ書き込む
  --reporter <compact|json>    report形式（既定: compact）
  --help                       このhelpを表示`;

export const CHECK_HELP_TEXT = `使い方: spec-html check [directory] [--fix] [options]

実行対象を省略するとfixer、formatter、linterをこの順で全て実行します。
--fixer、--format、--lintを1つ以上指定すると、指定した処理だけを実行します。

Options:
  --fix                        fixerとformatterの変更をfileへ書き込む
  --fixer                      fixerを実行対象にする
  --format                     formatterを実行対象にする
  --lint                       linterを実行対象にする
  --reporter <compact|json>    report形式（既定: compact）
  --warnings-as-errors         lint warningも終了code 1にする
  --max-issues <number>        lintの最大表示件数（既定: 50、0で全件）
  --help                       このhelpを表示`;

export const CONVERT_HELP_TEXT = `使い方: spec-html convert <input.md> --lang <language-tag> [options]

Options:
  --lang <language-tag>    生成するarticleのBCP 47言語tag（必須）
  --output <output.html>   同じdirectoryへ新規HTML fileを作成（既存entryは拒否）
  --help                   このhelpを表示

--outputを省略するとHTMLだけをstdoutへ出力します。`;

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
      args[0] === "convert"
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
    console.log(formatConversionSummary(result));
    if (diagnostics.length > 0) {
      process.stderr.write(diagnostics);
    }
  }

  return conversionHasErrors(result) ? 1 : 0;
}

interface CheckStageReport {
  stage: CliCheckStage;
  compact: string;
  json: string;
}

export async function runCheck(options: CliCheckOptions): Promise<number> {
  const reports: CheckStageReport[] = [];
  let exitCode = 0;

  for (const stage of options.stages) {
    let stop = false;
    if (stage === "fixer") {
      const result = await fixProject(options.targetPath);
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
      const result = await formatProject(options.targetPath);
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
      const result = await lintProject(options.targetPath);
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
      console.warn(`spec-html: browserを開けませんでした: ${messageOf(error)}`);
    }
  }

  await shutdownSignal;
  try {
    await runningServer.close();
    return 0;
  } catch (error: unknown) {
    console.error(`spec-html: server終了に失敗しました: ${messageOf(error)}`);
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
理由: ${rule.reason}
NG: ${rule.bad}
OK: ${rule.good}`;
}

async function assertContentDirectory(contentRoot: string): Promise<void> {
  let rootStats;
  try {
    rootStats = await stat(contentRoot);
  } catch {
    throw new Error(`対象ディレクトリが見つかりません: ${contentRoot}`);
  }
  if (!rootStats.isDirectory()) {
    throw new Error("対象パスはディレクトリではありません");
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
