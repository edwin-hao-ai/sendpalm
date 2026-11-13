// @ts-check
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e-report" }]],
  expect: {
    // 10 s, not the 5 s default. The suite is 196 tests on one worker, and the
    // machine is usually doing something else at the same time (a cargo build,
    // another session); several assertions were observed to miss 5 s while the
    // view itself was fine — each time it read as "the app is broken" until the
    // test was run alone. A longer ceiling does not hide a genuinely broken
    // flow: every one of these waits is on a real element.
    timeout: 10_000,
  },
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
