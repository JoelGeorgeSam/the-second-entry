import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(path.dirname(fileURLToPath(import.meta.url)), "src") } },
  cacheDir: ".vitest-cache",
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: { SESSION_SECRET: "test-only-session-secret-32-characters-long", DEMO_ACCOUNTS_ENABLED: "true" },
    coverage: { reporter: ["text", "json-summary"] },
  },
});
