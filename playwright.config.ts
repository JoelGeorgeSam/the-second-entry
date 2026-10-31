import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  webServer: { command: "npm run db:migrate && npm run start -- --hostname 127.0.0.1 --port 3100", url: "http://127.0.0.1:3100", reuseExistingServer: false, env: { SESSION_SECRET: "e2e-only-session-secret-at-least-32-characters", DEMO_ACCOUNTS_ENABLED: "true", CALLBACK_SIGNING_SECRET: "e2e-callback-secret-at-least-32-characters", PGLITE_DATA_DIR: ".tmp/e2e-pglite", LOCAL_E2E_PGLITE: "true" } },
  projects: [{ name: "system-chrome", use: { ...devices["Desktop Chrome"], channel: "chrome" } }],
});
