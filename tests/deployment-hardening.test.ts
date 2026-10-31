import { describe, expect, it } from "vitest";
import { applyMigrations, assertDatabaseConfiguration, type DatabaseClient } from "@/server/db/client";
import { isSpreadsheetFormula } from "@/server/csv";
import { authorizeBearer } from "@/server/internal-auth";
import { configuredPublisher } from "@/server/queue/publisher";
import { validateJsonMutation } from "@/server/request-security";
import { POST as logout } from "@/app/api/session/logout/route";
import { GET as dispatch } from "@/app/api/internal/outbox/dispatch/route";

describe("deployment hardening", () => {
  it("forbids filesystem PGlite in production and Vercel", () => {
    expect(() => assertDatabaseConfiguration({ NODE_ENV: "production" })).toThrow(/DATABASE_URL/);
    expect(() => assertDatabaseConfiguration({ NODE_ENV: "development", VERCEL: "1" })).toThrow(/DATABASE_URL/);
    expect(() => assertDatabaseConfiguration({ NODE_ENV: "production", DATABASE_URL: "postgres://example" })).not.toThrow();
    expect(() => assertDatabaseConfiguration({ NODE_ENV: "production", LOCAL_E2E_PGLITE: "true", PGLITE_DATA_DIR: ".tmp/e2e-safe" })).not.toThrow();
    expect(() => assertDatabaseConfiguration({ NODE_ENV: "production", VERCEL: "1", LOCAL_E2E_PGLITE: "true", PGLITE_DATA_DIR: ".tmp/e2e-safe" })).toThrow(/DATABASE_URL/);
    expect(() => assertDatabaseConfiguration({ NODE_ENV: "production", LOCAL_E2E_PGLITE: "true", PGLITE_DATA_DIR: "data/pglite" })).toThrow(/DATABASE_URL/);
    expect(() => assertDatabaseConfiguration({ NODE_ENV: "development" })).not.toThrow();
  });

  it("takes the PostgreSQL advisory migration lock before checking the ledger", async () => {
    const statements: string[] = [];
    const fake = {} as DatabaseClient;
    Object.assign(fake, {
      kind: "postgres" as const,
      query: async (statement: string) => { statements.push(statement); return { rows: statement.includes("SELECT version") ? [{ version: "already-applied" }] : [] }; },
      exec: async (statement: string) => { statements.push(statement); },
      transaction: async <T>(work: (tx: DatabaseClient) => Promise<T>) => work(fake),
    });
    await applyMigrations(fake);
    expect(statements[0]).toContain("pg_advisory_xact_lock");
    expect(statements.some((statement) => statement.includes("CREATE TABLE IF NOT EXISTS schema_migrations"))).toBe(true);
  });

  it("rejects leading spreadsheet formula markers including minus", () => {
    for (const value of ["=1+1", "+1+1", "-1+1", "@SUM(A1)", "\t=1+1"]) expect(isSpreadsheetFormula(value)).toBe(true);
    expect(isSpreadsheetFormula("INV-2026-001")).toBe(false);
  });

  it("enforces JSON content type and same-origin logout", async () => {
    const wrongType = await logout(new Request("https://app.test/api/session/logout", { method: "POST", headers: { "content-type": "text/plain", origin: "https://evil.test" } }));
    expect(wrongType.status).toBe(415);
    const foreign = await logout(new Request("https://app.test/api/session/logout", { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.test" } }));
    expect(foreign.status).toBe(403);
    const malformed = validateJsonMutation(new Request("https://app.test/api", { method: "POST", headers: { "content-type": "application/json", origin: "not a URL" } }));
    expect(malformed?.status).toBe(400);
    const allowed = await logout(new Request("https://app.test/api/session/logout", { method: "POST", headers: { "content-type": "application/json", origin: "https://app.test" } }));
    expect(allowed.status).toBe(200);
  });

  it("uses constant-time bearer authorization and fails closed when unconfigured", () => {
    const secret = "c".repeat(32);
    expect(authorizeBearer(`Bearer ${secret}`, secret)).toBe("authorized");
    expect(authorizeBearer("Bearer wrong", secret)).toBe("unauthorized");
    expect(authorizeBearer(null, secret)).toBe("unauthorized");
    expect(authorizeBearer(`Bearer ${secret}`, "short")).toBe("misconfigured");
  });

  it("does not silently dispatch to an in-memory queue", async () => {
    const previous = process.env.RISK_QUEUE_URL;
    const previousCron = process.env.CRON_SECRET;
    delete process.env.RISK_QUEUE_URL;
    delete process.env.CRON_SECRET;
    try {
      expect(() => configuredPublisher()).toThrow(/RISK_QUEUE_URL/);
      expect((await dispatch(new Request("https://app.test/api/internal/outbox/dispatch"))).status).toBe(503);
      process.env.CRON_SECRET = "c".repeat(32);
      expect((await dispatch(new Request("https://app.test/api/internal/outbox/dispatch", { headers: { authorization: "Bearer wrong" } }))).status).toBe(401);
      expect((await dispatch(new Request("https://app.test/api/internal/outbox/dispatch", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }))).status).toBe(503);
    } finally {
      if (previous) process.env.RISK_QUEUE_URL = previous; else delete process.env.RISK_QUEUE_URL;
      if (previousCron) process.env.CRON_SECRET = previousCron; else delete process.env.CRON_SECRET;
    }
  });
});
