import { defineConfig, devices } from "@playwright/test";

const testPort = process.env.SPEC_HTML_TEST_PORT ?? "4173";
const testBaseUrl = `http://127.0.0.1:${testPort}`;

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 15_000,
  use: {
    baseURL: testBaseUrl,
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
      `node dist/cli.js ./tests/fixtures/browser --port ${testPort} --no-open`,
    url: `${testBaseUrl}/`,
    reuseExistingServer: false,
    timeout: 15_000,
  },
});
