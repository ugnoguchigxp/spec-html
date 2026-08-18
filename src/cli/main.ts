import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { openViewer } from "./open-browser.js";
import { CliUsageError, parseCliCommand } from "./options.js";
import { messageForCliError } from "./errors.js";
import { startServer } from "../server/start.js";
import { resolveOptionalIntegrations } from "../server/integrations.js";

const HELP_TEXT = `使い方: spec-html [directory] [options]

Options:
  --host <host>    listenするhost（既定: 127.0.0.1）
  --port <port>    listenするport（既定: 4173、0で自動割り当て）
  --open           起動後にbrowserを開く（既定）
  --no-open        browserを開かない
  --help           このhelpを表示
  --version        versionを表示`;

export async function main(args: readonly string[]): Promise<number> {
  try {
    const command = parseCliCommand(args, process.cwd());
    if (command.kind === "help") {
      console.log(HELP_TEXT);
      return 0;
    }
    if (command.kind === "version") {
      console.log(__SPEC_HTML_VERSION__);
      return 0;
    }

    await assertContentDirectory(command.options.contentRoot);
    const runtimeRoot = fileURLToPath(new URL("./browser/", import.meta.url));
    const integrations = await resolveOptionalIntegrations();
    const runningServer = await startServer({
      ...command.options,
      runtimeRoot,
      integrations,
    });
    const viewerUrl = `${runningServer.origin}/`;
    console.log(`Spec HTML: ${viewerUrl}`);

    if (command.options.openBrowser) {
      try {
        await openViewer(viewerUrl);
      } catch (error: unknown) {
        console.warn(`spec-html: browserを開けませんでした: ${messageOf(error)}`);
      }
    }

    let isClosing = false;
    const close = (): void => {
      if (isClosing) {
        return;
      }
      isClosing = true;
      void runningServer.close().catch((error: unknown) => {
        console.error(`spec-html: server終了に失敗しました: ${messageOf(error)}`);
        process.exitCode = 1;
      });
    };
    process.once("SIGINT", close);
    process.once("SIGTERM", close);
    return 0;
  } catch (error: unknown) {
    console.error(`spec-html: ${messageForCliError(error)}`);
    if (
      process.env.SPEC_HTML_DEBUG === "1" &&
      error instanceof Error &&
      !(error instanceof CliUsageError)
    ) {
      console.error(error.stack);
    }
    return 1;
  }
}

async function assertContentDirectory(contentRoot: string): Promise<void> {
  let rootStats;
  try {
    rootStats = await stat(contentRoot);
  } catch {
    throw new Error(`対象ディレクトリが見つかりません: ${contentRoot}`);
  }

  if (!rootStats.isDirectory()) {
    throw new Error(
      `対象パスはディレクトリではありません: ${contentRoot}`,
    );
  }

}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

process.exitCode = await main(process.argv.slice(2));
