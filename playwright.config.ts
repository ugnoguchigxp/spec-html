import { defineConfig, devices } from "@playwright/test";

const testPort = process.env.SPEC_HTML_TEST_PORT ?? "4173";
const testBaseUrl = `http://127.0.0.1:${testPort}`;

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 15_000,
  workers: 1,
  use: {
    baseURL: testBaseUrl,
    ...devices["Desktop Chrome"],
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox-smoke",
      grep: /@smoke/,
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit-smoke",
      grep: /@smoke/,
      use: { ...devices["Desktop Safari"] },
    },
  ],
  webServer: {
    command: `node dist/cli.js ./tests/fixtures/browser --port ${testPort} --no-open`,
    url: `${testBaseUrl}/`,
    reuseExistingServer: false,
    timeout: 15_000,
  },
});
