import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 5_000,
    exclude: ["tests/browser/**", "node_modules/**", "dist/**"],
  },
});
