import { defineConfig } from "@playwright/test";

// Compile with the same synthetic endpoints before running the production smoke suite.
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  use: {
    baseURL: "http://127.0.0.1:4300",
    browserName: "chromium",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    { command: "node tests/fixtures/api-server.mjs", url: "http://127.0.0.1:4301/health", reuseExistingServer: false },
    { command: "npm run start -- --hostname 127.0.0.1 --port 4300", url: "http://127.0.0.1:4300/login", reuseExistingServer: false },
  ],
});
