import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 15_000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    ...devices["Desktop Chrome"],
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command:
      "node dist/cli.js ./tests/fixtures/browser --port 4173 --no-open",
    url: "http://127.0.0.1:4173/",
    reuseExistingServer: false,
    timeout: 15_000,
  },
});
