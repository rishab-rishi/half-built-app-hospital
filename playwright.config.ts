import { defineConfig, devices } from "@playwright/test";

const CSP_IGNORE = /csp\.spec\.ts/;

export default defineConfig({
  testDir: "./tests",
  testMatch: /.*\.spec\.ts/,
  use: { baseURL: "http://localhost:3100" },
  projects: [
    { name: "desktop", testIgnore: CSP_IGNORE, use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", testIgnore: CSP_IGNORE, use: { ...devices["Pixel 7"] } },
    // Same build, but with the Content-Security-Policy enforced rather than report-only.
    {
      name: "csp-enforce",
      testMatch: CSP_IGNORE,
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:3101" },
    },
  ],
  webServer: [
    {
      command: "npx next start -p 3100",
      url: "http://localhost:3100",
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "npx next start -p 3101",
      url: "http://localhost:3101",
      reuseExistingServer: false,
      timeout: 60_000,
      env: { CSP_MODE: "enforce" },
    },
  ],
});
