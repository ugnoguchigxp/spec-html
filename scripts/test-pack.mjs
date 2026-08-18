import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

let temporaryRoot;
let tarballPath;
let viewerProcess;

try {
  const packOutput = await run(npmCommand, ["pack", "--json", "--silent"], projectRoot);
  const packedFiles = parsePackOutput(packOutput.stdout);
  const packedPackage = packedFiles[0];
  const packedFile = packedPackage?.filename;
  if (typeof packedFile !== "string") {
    throw new Error("npm packのtarball名を取得できません");
  }
  const packagedPaths = Array.isArray(packedPackage.files)
    ? packedPackage.files.map((file) => file.path)
    : [];
  if (
    packagedPaths.some(
      (path) =>
        typeof path === "string" &&
        (path.includes("vendor/chart") || path.includes("vendor/mermaid")),
    )
  ) {
    throw new Error("optional integrationがtarballへbundleされています");
  }
  tarballPath = resolve(projectRoot, packedFile);

  temporaryRoot = await mkdtemp(join(tmpdir(), "spec-html-pack-"));
  await run(npmCommand, ["init", "--yes"], temporaryRoot);
  await writeConsumerFixture(temporaryRoot);
  await run(npmCommand, ["install", "--save-dev", tarballPath], temporaryRoot);

  const installedPackageJson = JSON.parse(
    await readFile(
      join(temporaryRoot, "node_modules", "spec-html", "package.json"),
      "utf8",
    ),
  );
  if (installedPackageJson.bin?.["spec-html"] !== "dist/cli.js") {
    throw new Error("packしたpackageでspec-html CLIが公開されていません");
  }
  if (
    installedPackageJson.peerDependenciesMeta?.["chart.js"]?.optional !== true ||
    installedPackageJson.peerDependenciesMeta?.mermaid?.optional !== true
  ) {
    throw new Error("optional peer dependencyのmetadataが不正です");
  }
  const versionOutput = await run(
    npmCommand,
    ["exec", "--", "spec-html", "--version"],
    temporaryRoot,
  );
  if (versionOutput.stdout.trim() !== installedPackageJson.version) {
    throw new Error("installしたspec-html CLIをpackage bin経由で実行できません");
  }
  await run(npmCommand, ["exec", "--", "spec-html", "lint", "./specs"], temporaryRoot);
  await expectExitCode(
    npmCommand,
    ["exec", "--", "spec-html", "lint", "./invalid"],
    temporaryRoot,
    1,
  );
  await expectExitCode(
    npmCommand,
    ["exec", "--", "spec-html", "lint", "./missing"],
    temporaryRoot,
    2,
  );

  viewerProcess = spawn(
    process.execPath,
    [
      join(temporaryRoot, "node_modules", "spec-html", "dist", "cli.js"),
      "./specs",
      "--port",
      "0",
      "--no-open",
    ],
    {
      cwd: temporaryRoot,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const origin = await waitForViewerUrl(viewerProcess);

  const [shell, navigation, overview, asset, viewer] = await Promise.all([
    fetch(`${origin}/`),
    fetch(`${origin}/_spec-html/navigation`),
    fetch(`${origin}/_content/overview.html`),
    fetch(`${origin}/_content/assets/pixel.svg`),
    fetch(`${origin}/_spec-html/viewer.js`),
  ]);

  if (
    !shell.ok ||
    !navigation.ok ||
    !overview.ok ||
    !asset.ok ||
    !viewer.ok
  ) {
    throw new Error("packしたViewerのHTTP endpointを確認できません");
  }
  const shellBody = await shell.text();
  if (!shellBody.includes('/_spec-html/viewer.js')) {
    throw new Error("Viewer Shellがbrowser bundleを参照していません");
  }
  if (
    !shellBody.includes('data-chart-js="false"') ||
    !shellBody.includes('data-mermaid="false"')
  ) {
    throw new Error("optional integrationなしでViewerが起動していません");
  }
  if (!(await overview.text()).includes("Consumer overview")) {
    throw new Error("consumer側の設計書を取得できません");
  }

  await stopViewer(viewerProcess);
  viewerProcess = undefined;
} finally {
  if (viewerProcess !== undefined) {
    await stopViewer(viewerProcess);
  }
  if (tarballPath !== undefined) {
    await rm(tarballPath, { force: true });
  }
  if (temporaryRoot !== undefined) {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

function parsePackOutput(stdout) {
  const jsonStart = stdout.lastIndexOf("\n[");
  const json = jsonStart === -1 ? stdout : stdout.slice(jsonStart + 1);
  const parsed = JSON.parse(json);
  if (!Array.isArray(parsed)) {
    throw new Error("npm packのJSON形式が不正です");
  }
  return parsed;
}

async function writeConsumerFixture(root) {
  const specsRoot = join(root, "specs");
  await mkdir(join(specsRoot, "assets"), { recursive: true });
  await mkdir(join(root, "invalid"), { recursive: true });
  await Promise.all([
    writeFile(
      join(specsRoot, "overview.html"),
      '<article lang="en"><h1>Consumer overview</h1></article>',
    ),
    writeFile(
      join(specsRoot, "assets", "pixel.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>',
    ),
    writeFile(
      join(root, "invalid", "bad.html"),
      '<article lang="en"><h1>Bad</h1><img src="missing.svg"></article>',
    ),
  ]);
}

function run(command, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolvePromise({ stdout, stderr });
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed: ${stderr || stdout}`));
    });
  });
}

async function expectExitCode(command, args, cwd, expected) {
  const result = await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    child.once("error", reject);
    child.once("exit", (code) => resolvePromise(code));
  });
  if (result !== expected) {
    throw new Error(`${command} ${args.join(" ")} returned ${result}, expected ${expected}`);
  }
}

function waitForViewerUrl(child) {
  return new Promise((resolvePromise, reject) => {
    let output = "";
    const timeout = setTimeout(() => {
      reject(new Error(`Viewerの起動がtimeoutしました: ${output}`));
    }, 10_000);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      output += chunk;
      const match = /Spec HTML: (http:\/\/[^\s]+\/)/.exec(output);
      if (match?.[1] !== undefined) {
        clearTimeout(timeout);
        resolvePromise(match[1].replace(/\/$/, ""));
      }
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Viewerが起動直後に終了しました: ${code ?? "signal"}`));
    });
  });
}

function stopViewer(child) {
  return new Promise((resolvePromise, reject) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      if (isExpectedViewerExit(child.exitCode, child.signalCode)) {
        resolvePromise();
      } else {
        reject(
          new Error(
            `Viewerが正常終了しませんでした: ${child.exitCode ?? child.signalCode ?? "unknown"}`,
          ),
        );
      }
      return;
    }

    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Viewerを終了できません"));
    }, 5_000);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      if (isExpectedViewerExit(code, signal)) {
        resolvePromise();
        return;
      }
      reject(
        new Error(
          `Viewerが正常終了しませんでした: ${code ?? signal ?? "unknown"}`,
        ),
      );
    });
    child.kill("SIGINT");
  });
}

function isExpectedViewerExit(code, signal) {
  return (
    (code === 0 && signal === null) ||
    (process.platform === "win32" && signal !== null)
  );
}
