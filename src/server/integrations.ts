import { access } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { constants } from "node:fs";

export interface OptionalIntegrations {
  chartFile?: string;
  mermaidRoot?: string;
}

const require = createRequire(import.meta.url);

export async function resolveOptionalIntegrations(): Promise<OptionalIntegrations> {
  const chartFile = await resolveChartFile();
  const mermaidRoot = await resolveMermaidRoot();

  return {
    ...(chartFile === undefined ? {} : { chartFile }),
    ...(mermaidRoot === undefined ? {} : { mermaidRoot }),
  };
}

async function resolveChartFile(): Promise<string | undefined> {
  try {
    const autoEntry = require.resolve("chart.js/auto");
    const chartFile = resolve(dirname(autoEntry), "..", "dist", "chart.umd.min.js");
    await access(chartFile, constants.R_OK);
    return chartFile;
  } catch (error: unknown) {
    if (isMissingOptionalDependency(error)) {
      return undefined;
    }
    throw error;
  }
}

async function resolveMermaidRoot(): Promise<string | undefined> {
  try {
    const entry = require.resolve("mermaid/dist/mermaid.esm.min.mjs");
    await access(entry, constants.R_OK);
    return dirname(entry);
  } catch (error: unknown) {
    if (isMissingOptionalDependency(error)) {
      return undefined;
    }
    throw error;
  }
}

function isMissingOptionalDependency(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    (error.code === "MODULE_NOT_FOUND" || error.code === "ENOENT")
  );
}
