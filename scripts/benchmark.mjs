import { performance } from "node:perf_hooks";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const checkMode = process.argv.includes("--check");
const scales = checkMode ? [50, 500] : [50, 500, 5_000];
const budgets = new Map([
  [50, { startup: 1_000, cold: 1_500, warm: 1_000 }],
  [500, { startup: 1_000, cold: 5_000, warm: 2_500 }],
]);
const rows = [];

for (const count of scales) {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "spec-html-benchmark-"));
  const contentRoot = join(fixtureRoot, "specs");
  await mkdir(contentRoot);
  try {
    await writeDocuments(contentRoot, count);
    const startupStart = performance.now();
    const server = await startViewer(contentRoot);
    const startup = performance.now() - startupStart;
    try {
      const navigationUrl = `${server.origin}/_spec-html/navigation`;
      const coldStart = performance.now();
      await fetchNavigation(navigationUrl);
      const cold = performance.now() - coldStart;
      const warmStart = performance.now();
      await fetchNavigation(navigationUrl);
      const warm = performance.now() - warmStart;
      rows.push({ documents: count, startup, cold, warm });
    } finally {
      await server.close();
    }
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
}

console.log("documents startup_ms navigation_cold_ms navigation_warm_ms");
for (const row of rows) {
  console.log(
    [row.documents, row.startup, row.cold, row.warm]
      .map((value, index) => index === 0 ? String(value) : value.toFixed(1))
      .join(" "),
  );
}

if (checkMode) {
  const failures = rows.flatMap((row) => {
    const budget = budgets.get(row.documents);
    if (budget === undefined) return [];
    return ["startup", "cold", "warm"].flatMap((metric) =>
      row[metric] > budget[metric]
        ? [`${row.documents} ${metric}: ${row[metric].toFixed(1)}ms > ${budget[metric]}ms`]
        : []
    );
  });
  if (failures.length > 0) {
    throw new Error(`Benchmark budgets exceeded:\n${failures.join("\n")}`);
  }
}

async function writeDocuments(root, count) {
  const batchSize = 100;
  for (let start = 0; start < count; start += batchSize) {
    const end = Math.min(start + batchSize, count);
    await Promise.all(
      Array.from({ length: end - start }, (_, offset) => {
        const index = start + offset;
        const filename = `document-${String(index).padStart(5, "0")}.md`;
        return writeFile(
          join(root, filename),
          `# Document ${index}\n\nBenchmark fixture.\n`,
          "utf8",
        );
      }),
    );
  }
}

function startViewer(contentRoot) {
  return new Promise((resolveStart, reject) => {
    const child = spawn(
      process.execPath,
      [resolve("dist/cli.js"), contentRoot, "--port", "0", "--no-open"],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Viewer startup timed out: ${stderr}`));
    }, 10_000);
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      const origin = /Spec HTML: (http:\/\/[^\s]+)/.exec(stdout)?.[1];
      if (origin === undefined) return;
      clearTimeout(timeout);
      resolveStart({
        origin: origin.replace(/\/$/, ""),
        close: () => new Promise((resolveClose, rejectClose) => {
          child.once("exit", (code, signal) => {
            if (code === 0 || signal === "SIGTERM") {
              resolveClose();
            } else {
              rejectClose(
                new Error(`Viewer exited with ${String(code)}: ${stderr}`),
              );
            }
          });
          child.kill("SIGTERM");
        }),
      });
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      if (!stdout.includes("Spec HTML:")) {
        reject(new Error(`Viewer exited before startup (${String(code)}): ${stderr}`));
      }
    });
  });
}

async function fetchNavigation(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Navigation request failed: HTTP ${response.status}`);
  }
  await response.text();
}
