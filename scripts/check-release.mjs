import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const packageJsonPath = resolve(projectRoot, "package.json");
const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
const failures = [];

if (packageJson.license === "UNLICENSED" || !hasText(packageJson.license)) {
  failures.push("公開ライセンスをpackage.jsonのlicenseへ設定してください");
}

try {
  await access(resolve(projectRoot, "LICENSE"));
} catch {
  failures.push("選択したライセンスの全文をLICENSEへ追加してください");
}

if (!hasText(packageJson.author) && !hasText(packageJson.author?.name)) {
  failures.push("package.jsonにauthorを設定してください");
}

const repositoryUrl =
  typeof packageJson.repository === "string"
    ? packageJson.repository
    : packageJson.repository?.url;
if (!hasText(repositoryUrl)) {
  failures.push("package.jsonに公開repository URLを設定してください");
}
if (!hasText(packageJson.homepage)) {
  failures.push("package.jsonにhomepageを設定してください");
}
if (!hasText(packageJson.bugs?.url)) {
  failures.push("package.jsonにbugs.urlを設定してください");
}

if (packageJson.bin?.["html-docs"] !== "dist/cli.js") {
  failures.push("bin.html-docsはdist/cli.jsである必要があります");
}
for (const requiredFile of [
  "dist",
  "README.md",
  "RELEASING.md",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "docs/authoring.md",
]) {
  if (!packageJson.files?.includes(requiredFile)) {
    failures.push(`filesに${requiredFile}を含めてください`);
  }
}
if (packageJson.publishConfig?.access !== "public") {
  failures.push("publishConfig.accessはpublicである必要があります");
}
if (packageJson.publishConfig?.registry !== "https://registry.npmjs.org/") {
  failures.push("publishConfig.registryは公式npm registryである必要があります");
}
if (packageJson.peerDependenciesMeta?.["chart.js"]?.optional !== true) {
  failures.push("Chart.jsはoptional peer dependencyにしてください");
}
if (packageJson.peerDependenciesMeta?.mermaid?.optional !== true) {
  failures.push("Mermaidはoptional peer dependencyにしてください");
}

const releaseTag = process.env.GITHUB_REF_NAME;
if (hasText(releaseTag) && releaseTag !== `v${packageJson.version}`) {
  failures.push(
    `release tag ${releaseTag} とpackage version v${packageJson.version}が一致しません`,
  );
}

if (failures.length > 0) {
  throw new Error(`npm公開条件を満たしていません:\n- ${failures.join("\n- ")}`);
}

console.log(`npm公開metadata: OK (${packageJson.name}@${packageJson.version})`);

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}
