import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5500",
    trace: "on-first-retry",
    // Pin locale so date-formatting assertions (e.g. the "Sunday, July 12"
    // heading test) don't implicitly depend on Chromium's default locale.
    locale: "en-US",
  },
  webServer: {
    command: "npx serve . -l 5500",
    url: "http://localhost:5500",
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
