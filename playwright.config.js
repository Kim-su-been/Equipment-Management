import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.js",
  timeout: 60000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5180",
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      executablePath:
        process.env.CHROMIUM_PATH ||
        (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
      args: ["--no-sandbox"],
    },
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "registration", testMatch: "registration.spec.js" },
    {
      name: "mail",
      testMatch: "mail.spec.js",
      use: { baseURL: "http://127.0.0.1:5181" },
    },
  ],
  webServer: [
    {
      command: "node scripts/test-dev.mjs",
      url: "http://127.0.0.1:5180",
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command: "node scripts/test-dev.mjs",
      env: { TEST_SUITE: "mail" },
      url: "http://127.0.0.1:5181",
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
  reporter: "list",
});
