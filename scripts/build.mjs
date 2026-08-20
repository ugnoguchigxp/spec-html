import { build } from "esbuild";
import { chmod, copyFile, mkdir, readFile, rm, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const sourceRoot = resolve(projectRoot, "src");
const distRoot = resolve(projectRoot, "dist");
const browserDistRoot = resolve(distRoot, "browser");
const packageJson = JSON.parse(
  await readFile(resolve(projectRoot, "package.json"), "utf8"),
);

await rm(distRoot, { recursive: true, force: true });
await mkdir(browserDistRoot, { recursive: true });

const commonOptions = {
  bundle: true,
  minify: false,
  sourcemap: false,
  legalComments: "eof",
};

await build({
  ...commonOptions,
  entryPoints: [resolve(sourceRoot, "cli/entry.ts")],
  outfile: resolve(distRoot, "cli.js"),
  platform: "node",
  format: "esm",
  target: "node20",
  external: ["open", "html-validate", "jsdom", "mermaid", "prettier"],
  banner: { js: "#!/usr/bin/env node" },
  define: {
    __SPEC_HTML_VERSION__: JSON.stringify(packageJson.version),
  },
});

await build({
  ...commonOptions,
  entryPoints: { viewer: resolve(sourceRoot, "browser/start.ts") },
  outdir: browserDistRoot,
  entryNames: "[name]",
  chunkNames: "chunks/[name]-[hash]",
  splitting: true,
  platform: "browser",
  format: "esm",
  target: "es2022",
});

await build({
  ...commonOptions,
  entryPoints: [resolve(sourceRoot, "vendor/mermaid-adapter.ts")],
  outfile: resolve(browserDistRoot, "mermaid.js"),
  platform: "browser",
  format: "esm",
  target: "es2022",
});

await build({
  ...commonOptions,
  entryPoints: [resolve(sourceRoot, "vendor/chart-theme.ts")],
  outfile: resolve(browserDistRoot, "chart-theme.js"),
  platform: "browser",
  format: "iife",
  target: "es2022",
});

await copyFile(
  resolve(sourceRoot, "styles/shell.css"),
  resolve(browserDistRoot, "shell.css"),
);
await copyFile(
  resolve(sourceRoot, "styles/document.css"),
  resolve(browserDistRoot, "document.css"),
);

for (const filePath of [
  resolve(distRoot, "cli.js"),
  resolve(browserDistRoot, "viewer.js"),
  resolve(browserDistRoot, "shell.css"),
  resolve(browserDistRoot, "document.css"),
  resolve(browserDistRoot, "mermaid.js"),
  resolve(browserDistRoot, "chart-theme.js"),
]) {
  const fileStats = await stat(filePath);
  if (!fileStats.isFile()) {
    throw new Error(`Build output is not a file: ${filePath}`);
  }
}

await chmod(resolve(distRoot, "cli.js"), 0o755);
