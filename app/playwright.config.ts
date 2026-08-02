// @ts-check
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e-report" }]],
  use: {
    baseURL: "http://localhost:5180",
    trace: "on-first-retry",
    screenshot: "on",
    video: "off",
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: "pnpm exec vite --port 5180 --host 127.0.0.1",
    url: "http://localhost:5180",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
