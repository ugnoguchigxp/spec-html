import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 5_000,
    exclude: ["tests/browser/**", "node_modules/**", "dist/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: [
        "src/{cli,content,server,lint,format,fix,markdown,convert}/**/*.ts",
      ],
      // DOM code is exercised by Playwright; bundled vendor runtimes are external code.
      exclude: ["src/browser/**", "src/vendor/**"],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 80,
      },
    },
  },
});
