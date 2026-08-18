import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { formatCompact, formatJson } from "../lint/diagnostics.js";
import { lintProject } from "../lint/project.js";
import { getRule } from "../lint/rules.js";
import { messageForCliError } from "./errors.js";
import { openViewer } from "./open-browser.js";
import {
  CliUsageError,
  parseCliCommand,
  type CliLintOptions,
  type CliRunOptions,
} from "./options.js";
import { resolveOptionalIntegrations } from "../server/integrations.js";
import { startServer } from "../server/start.js";

export const HELP_TEXT = `使い方: spec-html [directory] [options]

Options:
  --host <host>    listenするhost（既定: 127.0.0.1）
  --port <port>    listenするport（既定: 4173、0で自動割り当て）
  --open           起動後にbrowserを開く（既定）
  --no-open        browserを開かない
  --help           このhelpを表示
  --version        versionを表示

Lint:
  spec-html lint [directory] [options]`;

export const LINT_HELP_TEXT = `使い方: spec-html lint [directory] [options]

Options:
  --format <compact|json>  出力形式（既定: compact）
  --warnings-as-errors     warningも終了code 1にする
  --max-issues <number>    最大表示件数（既定: 50、0で全件）
  --explain <RULE_ID>      ruleの理由と最小例を表示
  --help                   このhelpを表示`;

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
      case "version":
        console.log(__SPEC_HTML_VERSION__);
        return 0;
      case "explain":
        console.log(formatExplanation(command.rule));
        return 0;
      case "lint":
        return await runLint(command.options);
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
    return args[0] === "lint" ? 2 : 1;
  }
}

export async function runLint(options: CliLintOptions): Promise<number> {
  const result = await lintProject(options.contentRoot);
  const output = options.format === "json"
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
