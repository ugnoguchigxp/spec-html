import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

try {
  await checkRelease();
} catch (error) {
  console.error(`release-check: ${messageOf(error)}`);
  process.exitCode = 1;
}

async function checkRelease() {
  const packageJson = await readJson("package.json");
  const packageLock = await readJson("package-lock.json");
  const version = packageJson.version;
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error("package.jsonにrelease用のSemVer versionがありません");
  }
  if (
    packageLock.version !== version ||
    packageLock.packages?.[""]?.version !== version
  ) {
    throw new Error("package.jsonとpackage-lock.jsonのversionが一致しません");
  }

  const changelog = await readText("CHANGELOG.md");
  const releaseHeading = new RegExp(
    `^## ${escapeRegExp(version)} - \\d{4}-\\d{2}-\\d{2}$`,
    "m",
  );
  if (!releaseHeading.test(changelog)) {
    throw new Error(`CHANGELOG.mdに${version}のrelease headingがありません`);
  }

  const branch = (await run("git", ["branch", "--show-current"])).stdout.trim();
  if (branch !== "main") {
    throw new Error(
      `releaseはmain branchから実行してください: ${branch || "detached"}`,
    );
  }
  const status = (
    await run("git", ["status", "--porcelain", "--untracked-files=normal"])
  ).stdout.trim();
  if (status.length > 0) {
    throw new Error("release commitのworktreeがcleanではありません");
  }

  await assertRegistryVersionIsUnused(packageJson.name, version);

  const pack = await run(npmCommand, [
    "pack",
    "--dry-run",
    "--json",
    "--silent",
  ]);
  const packedPackage = parsePackOutput(pack.stdout)[0];
  if (
    packedPackage?.name !== packageJson.name ||
    packedPackage?.version !== version
  ) {
    throw new Error("dry-run tarballのpackage identityが一致しません");
  }
  const packagedPaths = Array.isArray(packedPackage.files)
    ? packedPackage.files.map((file) => file.path)
    : [];
  if (
    !packagedPaths.includes("package.json") ||
    !packagedPaths.includes("dist/cli.js")
  ) {
    throw new Error("dry-run tarballにpackage.jsonまたはCLIがありません");
  }

  const cliVersion = (
    await run(process.execPath, ["dist/cli.js", "--version"])
  ).stdout.trim();
  if (cliVersion !== version) {
    throw new Error(`built CLIのversionが一致しません: ${cliVersion}`);
  }

  console.log(`release check passed: ${packageJson.name}@${version}`);
}

async function assertRegistryVersionIsUnused(name, version) {
  try {
    await run(npmCommand, ["view", `${name}@${version}`, "version", "--json"]);
  } catch (error) {
    if (messageOf(error).includes("E404")) {
      return;
    }
    throw error;
  }
  throw new Error(`${name}@${version}は既にnpm registryへ公開されています`);
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

async function readJson(path) {
  return JSON.parse(await readText(path));
}

async function readText(path) {
  return readFile(resolve(projectRoot, path), "utf8");
}

function run(command, args) {
  return execFileAsync(command, args, {
    cwd: projectRoot,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function messageOf(error) {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const stderr = "stderr" in error ? String(error.stderr).trim() : "";
  return stderr.length > 0 ? `${error.message}: ${stderr}` : error.message;
}
