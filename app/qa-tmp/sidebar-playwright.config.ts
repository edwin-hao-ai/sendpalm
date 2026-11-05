import { defineConfig } from "@playwright/test";
import config from "../playwright.config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  ...config,
  testDir: "../e2e",
  webServer: { ...config.webServer, command: "pnpm exec vite --port 5180 --host 127.0.0.1", url: "http://localhost:5180", cwd: fileURLToPath(new URL("..", import.meta.url)) },
  use: { ...config.use, channel: "chrome" },
});
