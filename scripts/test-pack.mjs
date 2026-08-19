import { spawn } from "node:child_process";
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const npmCommand = process.platform === "win32" ? process.execPath : "npm";
const npmArgumentPrefix =
  process.platform === "win32"
    ? [
        process.env.npm_execpath ??
          resolve(
            dirname(process.execPath),
            "node_modules",
            "npm",
            "bin",
            "npm-cli.js",
          ),
      ]
    : [];

let temporaryRoot;
let tarballPath;
let viewerProcess;

try {
  const packOutput = await run(
    npmCommand,
    ["pack", "--json", "--silent"],
    projectRoot,
  );
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
  if (installedPackageJson.private === true) {
    throw new Error("packしたpackageに公開禁止設定が残っています");
  }
  if (
    installedPackageJson.publishConfig?.access !== "public" ||
    installedPackageJson.publishConfig?.registry !==
      "https://registry.npmjs.org/"
  ) {
    throw new Error("packしたpackageの公開先設定が不正です");
  }
  if (installedPackageJson.dependencies?.prettier !== "3.9.6") {
    throw new Error("packしたpackageのPrettier versionが固定されていません");
  }
  if (
    installedPackageJson.dependencies?.marked !== "18.0.10" ||
    installedPackageJson.dependencies?.["github-slugger"] !== "2.0.0"
  ) {
    throw new Error(
      "packしたpackageのMarkdown dependency versionが固定されていません",
    );
  }
  const expectedDocumentation = [
    "README.md",
    "README.ja.md",
    "CONTRIBUTING.md",
    "CONTRIBUTING.ja.md",
    "RELEASING.md",
    "RELEASING.ja.md",
    "CHANGELOG.md",
    "docs/authoring.html",
    "docs/authoring.ja.html",
    "docs/charts-showcase.html",
    "docs/mermaid-showcase.html",
    "assets/LightMode.webp",
    "assets/darkMode.webp",
    "assets/source.webp",
  ];
  const missingDocumentation = expectedDocumentation.filter(
    (path) => !packagedPaths.includes(path),
  );
  if (missingDocumentation.length > 0) {
    throw new Error(
      `公開用documentがpackageに含まれていません: ${missingDocumentation.join(", ")}`,
    );
  }
  if (
    packagedPaths.includes("docs/charts-showcase.ja.html") ||
    packagedPaths.includes("docs/mermaid-showcase.ja.html")
  ) {
    throw new Error("英語版だけを提供するshowcaseに日本語版が含まれています");
  }
  if (
    installedPackageJson.peerDependenciesMeta?.["chart.js"]?.optional !==
      true ||
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
    throw new Error(
      "installしたspec-html CLIをpackage bin経由で実行できません",
    );
  }
  await run(
    npmCommand,
    ["exec", "--", "spec-html", "lint", "./specs"],
    temporaryRoot,
  );
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
  const convertedStdout = await run(
    npmCommand,
    ["exec", "--", "spec-html", "convert", "./specs/guide.md", "--lang", "en"],
    temporaryRoot,
  );
  if (
    !convertedStdout.stdout.startsWith('<article lang="en">') ||
    !convertedStdout.stdout.includes(
      '<h1 id="consumer-guide">Consumer guide</h1>',
    )
  ) {
    throw new Error("packしたConverterがstdoutへHTMLを出力していません");
  }
  await run(
    npmCommand,
    [
      "exec",
      "--",
      "spec-html",
      "convert",
      "./specs/guide.md",
      "--lang",
      "en",
      "--output",
      "./specs/guide.html",
    ],
    temporaryRoot,
  );
  await expectExitCode(
    npmCommand,
    [
      "exec",
      "--",
      "spec-html",
      "convert",
      "./specs/guide.md",
      "--lang",
      "en",
      "--output",
      "./specs/guide.html",
    ],
    temporaryRoot,
    2,
  );
  if (
    (await readFile(join(temporaryRoot, "specs", "guide.md"), "utf8")) !==
    "# Consumer guide\n"
  ) {
    throw new Error("Converterが元Markdownを変更しました");
  }
  await run(
    npmCommand,
    [
      "exec",
      "--",
      "spec-html",
      "migrate",
      "./migration",
      "--lang",
      "en",
      "--check",
    ],
    temporaryRoot,
  );
  await assertMissing(join(temporaryRoot, "migration", "guide.html"));
  await assertMissing(join(temporaryRoot, "migration", ".spec-html"));
  const migrated = await run(
    npmCommand,
    [
      "exec",
      "--",
      "spec-html",
      "migrate",
      "./migration",
      "--lang",
      "en",
      "--write",
      "--reporter",
      "json",
    ],
    temporaryRoot,
  );
  const migrationReport = JSON.parse(migrated.stdout);
  const migrationId = migrationReport.migrationId;
  if (typeof migrationId !== "string") {
    throw new Error("packしたMigrateがmigration IDを報告していません");
  }
  if (
    !(await readFile(join(temporaryRoot, "migration", "guide.html"), "utf8"))
      .includes("<caption>") ||
    !(await readFile(join(temporaryRoot, "migration", "index.html"), "utf8"))
      .includes("./guide.html")
  ) {
    throw new Error("packしたMigrateがHTMLとlinkを一括移行していません");
  }
  await assertMissing(join(temporaryRoot, "migration", "guide.md"));
  await run(
    npmCommand,
    [
      "exec",
      "--",
      "spec-html",
      "migrate",
      "./migration",
      "--rollback",
      migrationId,
    ],
    temporaryRoot,
  );
  if (
    !(await readFile(join(temporaryRoot, "migration", "guide.md"), "utf8"))
      .includes("# Migration guide")
  ) {
    throw new Error("packしたMigrateがmigration全体をrollbackしていません");
  }
  await expectExitCode(
    npmCommand,
    ["exec", "--", "spec-html", "fix", "./fixable", "--check"],
    temporaryRoot,
    1,
  );
  await run(
    npmCommand,
    ["exec", "--", "spec-html", "fix", "./fixable", "--write"],
    temporaryRoot,
  );
  await run(
    npmCommand,
    ["exec", "--", "spec-html", "fix", "./fixable", "--check"],
    temporaryRoot,
  );
  const fixedDocument = await readFile(
    join(temporaryRoot, "fixable", "document.html"),
    "utf8",
  );
  if (
    !fixedDocument.includes('<script>const teh = "<div>";</script>') ||
    !fixedDocument.includes('onclick="if (teh) run()"')
  ) {
    throw new Error(
      "installしたFixerがHTML名だけを修正してJavaScriptを保持していません",
    );
  }
  await expectExitCode(
    npmCommand,
    ["exec", "--", "spec-html", "fix", "./missing", "--check"],
    temporaryRoot,
    2,
  );
  await expectExitCode(
    npmCommand,
    ["exec", "--", "spec-html", "format", "./specs", "--check"],
    temporaryRoot,
    1,
  );
  await run(
    npmCommand,
    ["exec", "--", "spec-html", "format", "./specs", "--write"],
    temporaryRoot,
  );
  await run(
    npmCommand,
    ["exec", "--", "spec-html", "format", "./specs", "--check"],
    temporaryRoot,
  );
  await run(
    npmCommand,
    ["exec", "--", "spec-html", "check", "./specs"],
    temporaryRoot,
  );
  await run(
    npmCommand,
    ["exec", "--", "spec-html", "format", "./full", "--write"],
    temporaryRoot,
  );
  const normalizedDocument = await readFile(
    join(temporaryRoot, "full", "document.html"),
    "utf8",
  );
  if (
    normalizedDocument.includes("<html") ||
    normalizedDocument.includes("<body")
  ) {
    throw new Error("full HTML documentがfragmentへ正規化されていません");
  }
  await expectExitCode(
    npmCommand,
    ["exec", "--", "spec-html", "format", "./blocked", "--write"],
    temporaryRoot,
    1,
  );
  await expectExitCode(
    npmCommand,
    ["exec", "--", "spec-html", "format", "./missing", "--check"],
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
  viewerProcess.stderr.setEncoding("utf8");
  viewerProcess.stderr.on("data", (chunk) => process.stderr.write(chunk));
  const origin = await waitForViewerUrl(viewerProcess);

  const [shell, navigation, overview, markdown, asset, viewer] =
    await Promise.all([
      fetch(`${origin}/`),
      fetch(`${origin}/_spec-html/navigation`),
      fetch(`${origin}/_content/overview.html`),
      fetch(`${origin}/_content/guide.md`),
      fetch(`${origin}/_content/assets/pixel.svg`),
      fetch(`${origin}/_spec-html/viewer.js`),
    ]);

  if (
    !shell.ok ||
    !navigation.ok ||
    !overview.ok ||
    !markdown.ok ||
    !asset.ok ||
    !viewer.ok
  ) {
    throw new Error("packしたViewerのHTTP endpointを確認できません");
  }
  const [
    shellBody,
    navigationBody,
    overviewBody,
    markdownBody,
    assetBody,
    viewerBody,
  ] = await Promise.all([
    shell.text(),
    navigation.text(),
    overview.text(),
    markdown.text(),
    asset.arrayBuffer(),
    viewer.text(),
  ]);
  if (!shellBody.includes("/_spec-html/viewer.js")) {
    throw new Error("Viewer Shellがbrowser bundleを参照していません");
  }
  if (
    !shellBody.includes('data-chart-js="false"') ||
    !shellBody.includes('data-mermaid="false"')
  ) {
    throw new Error("optional integrationなしでViewerが起動していません");
  }
  if (!overviewBody.includes("Consumer overview")) {
    throw new Error("consumer側の設計書を取得できません");
  }
  if (
    markdown.headers.get("content-type") !== "text/markdown; charset=utf-8" ||
    markdownBody !== "# Consumer guide\n"
  ) {
    throw new Error("consumer側のMarkdownを取得できません");
  }
  if (!navigationBody.includes('aria-label="Markdown">MD</span>')) {
    throw new Error("consumer側のMarkdownがnavigationへ表示されていません");
  }
  if (assetBody.byteLength === 0 || viewerBody.length === 0) {
    throw new Error("packしたViewerのassetまたはbrowser bundleが空です");
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
  await mkdir(join(root, "full"), { recursive: true });
  await mkdir(join(root, "blocked"), { recursive: true });
  await mkdir(join(root, "fixable"), { recursive: true });
  await mkdir(join(root, "migration"), { recursive: true });
  await Promise.all([
    writeFile(
      join(specsRoot, "overview.html"),
      '<article lang="en"><h1>Consumer overview</h1></article>',
    ),
    writeFile(join(specsRoot, "guide.md"), "# Consumer guide\n"),
    writeFile(
      join(specsRoot, "assets", "pixel.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>',
    ),
    writeFile(
      join(root, "invalid", "bad.html"),
      '<article lang="en"><h1>Bad</h1><img src="missing.svg"></article>',
    ),
    writeFile(
      join(root, "full", "document.html"),
      '<!doctype html><html lang="en"><head><title>Full</title></head><body><article><h1>Full</h1></article></body></html>',
    ),
    writeFile(
      join(root, "blocked", "document.html"),
      '<html><head><style>body { color: red }</style></head><body><article lang="en"><h1>Blocked</h1></article></body></html>',
    ),
    writeFile(
      join(root, "fixable", "document.html"),
      '<article lang="en"><h1>Fixable</h1><button onclik="if (teh) run()">Run</button><scritp>const teh = "<div>";</scritp></article>',
    ),
    writeFile(
      join(root, "migration", "guide.md"),
      "# Migration guide\n\n## Status\n\n| Item | Value |\n| --- | ---: |\n| Ready | 1 |\n",
    ),
    writeFile(
      join(root, "migration", "index.html"),
      '<article lang="en"><h1>Migration index</h1><p><a href="./guide.md">Guide</a></p></article>',
    ),
  ]);
}

async function assertMissing(path) {
  try {
    await access(path);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
  throw new Error(`存在しないはずのpathがあります: ${path}`);
}

function run(command, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, commandArguments(command, args), {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
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
      reject(
        new Error(`${command} ${args.join(" ")} failed: ${stderr || stdout}`),
      );
    });
  });
}

async function expectExitCode(command, args, cwd, expected) {
  const result = await new Promise((resolvePromise, reject) => {
    const child = spawn(command, commandArguments(command, args), {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.once("error", reject);
    child.once("exit", (code) => resolvePromise(code));
  });
  if (result !== expected) {
    throw new Error(
      `${command} ${args.join(" ")} returned ${result}, expected ${expected}`,
    );
  }
}

function commandArguments(command, args) {
  return command === npmCommand ? [...npmArgumentPrefix, ...args] : args;
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
