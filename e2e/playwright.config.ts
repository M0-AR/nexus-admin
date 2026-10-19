import { defineConfig, devices } from "@playwright/test";

const UI_BASE = process.env.E2E_UI_URL ?? "http://localhost:3200";
const API_BASE = process.env.E2E_API_URL ?? "http://localhost:4000";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: "disabled" },
  },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{arg}{ext}",
  use: {
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
    timezoneId: "UTC",
    colorScheme: "light",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "api",
      testMatch: /api\/.*\.spec\.ts/,
      use: { baseURL: API_BASE },
      dependencies: ["setup"],
    },
    {
      name: "chromium",
      testMatch: /ui\/.*\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: UI_BASE,
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
});
