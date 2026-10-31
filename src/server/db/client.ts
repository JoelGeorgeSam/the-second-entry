import { PGlite } from "@electric-sql/pglite";
import postgres, { type Sql } from "postgres";
import { mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";

export type DbResult<T extends Record<string, unknown> = Record<string, unknown>> = { rows: T[]; affectedRows?: number };
export interface DatabaseClient {
  readonly kind: "pglite" | "postgres";
  query<T extends Record<string, unknown> = Record<string, unknown>>(statement: string, params?: unknown[]): Promise<DbResult<T>>;
  exec(statement: string): Promise<unknown>;
  transaction<T>(work: (tx: DatabaseClient) => Promise<T>): Promise<T>;
  close?(): Promise<void>;
}

class PgliteAdapter implements DatabaseClient {
  readonly kind = "pglite" as const;
  constructor(private readonly client: PGlite) {}
  async query<T extends Record<string, unknown>>(statement: string, params: unknown[] = []) { return this.client.query<T>(statement, params); }
  exec(statement: string) { return this.client.exec(statement); }
  transaction<T>(work: (tx: DatabaseClient) => Promise<T>): Promise<T> { return this.client.transaction((tx) => work(new TransactionAdapter(tx))); }
  async close() { await this.client.close(); }
}

class TransactionAdapter implements DatabaseClient {
  constructor(private readonly client: { query<T extends Record<string, unknown>>(statement: string, params?: unknown[]): Promise<DbResult<T>>; exec(statement: string): Promise<unknown> }, readonly kind: "pglite" | "postgres" = "pglite") {}
  query<T extends Record<string, unknown>>(statement: string, params: unknown[] = []) { return this.client.query<T>(statement, params); }
  exec(statement: string) { return this.client.exec(statement); }
  transaction<T>(): Promise<T> { throw new Error("Nested transactions are not supported"); }
}

class PostgresAdapter implements DatabaseClient {
  readonly kind = "postgres" as const;
  constructor(private readonly client: Sql) {}
  async query<T extends Record<string, unknown>>(statement: string, params: unknown[] = []) { const result = await this.client.unsafe<T[]>(statement, params as never[]); return { rows: [...result] as T[], affectedRows: result.count }; }
  exec(statement: string) { return this.client.unsafe(statement); }
  transaction<T>(work: (tx: DatabaseClient) => Promise<T>): Promise<T> { return this.client.begin((tx) => work(new PostgresAdapter(tx as unknown as Sql))) as unknown as Promise<T>; }
  async close() { await this.client.end({ timeout: 5 }); }
}

declare global {
  var __secondEntryDb: DatabaseClient | undefined;
  var __secondEntryReady: Promise<DatabaseClient> | undefined;
  var __secondEntryPostgres: Sql | undefined;
}

function permitsDisposableProductionPglite(env: NodeJS.ProcessEnv) {
  if (env.VERCEL === "1" || env.LOCAL_E2E_PGLITE !== "true" || !env.PGLITE_DATA_DIR) return false;
  const candidate = env.PGLITE_DATA_DIR.replaceAll("\\", "/");
  const segments = candidate.split("/");
  return (candidate.startsWith(".tmp/") || candidate.startsWith("./.tmp/")) && !segments.includes("..") && !candidate.includes(":");
}

export function assertDatabaseConfiguration(env: NodeJS.ProcessEnv = process.env) {
  if ((env.NODE_ENV === "production" || env.VERCEL === "1") && !env.DATABASE_URL && !permitsDisposableProductionPglite(env)) {
    throw new Error("DATABASE_URL is required in production; filesystem PGlite is local-only");
  }
}

export async function applyMigrations(db: DatabaseClient) {
  const migrationDir = path.join(process.cwd(), "db", "migrations");
  const migrations = (await readdir(migrationDir)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
  const files = await Promise.all(migrations.map(async (version) => ({ version, sql: await readFile(path.join(migrationDir, version), "utf8") })));
  await db.transaction(async (tx) => {
    if (tx.kind === "postgres") {
      await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", ["second-entry-schema-migrations"]);
    }
    await tx.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    for (const { version, sql } of files) {
      const applied = await tx.query<{ version: string }>("SELECT version FROM schema_migrations WHERE version=$1", [version]);
      if (applied.rows.length) continue;
      await tx.exec(sql);
      await tx.query("INSERT INTO schema_migrations(version) VALUES($1)", [version]);
    }
  });
}

async function createDatabase() {
  assertDatabaseConfiguration();
  let db: DatabaseClient;
  if (process.env.DATABASE_URL && process.env.NODE_ENV !== "test") {
    const sql = globalThis.__secondEntryPostgres ?? postgres(process.env.DATABASE_URL, { max: 1, prepare: false, idle_timeout: 20, connect_timeout: 10 });
    globalThis.__secondEntryPostgres = sql;
    db = new PostgresAdapter(sql);
  } else {
    const location = process.env.NODE_ENV === "test" ? "memory://" : process.env.PGLITE_DATA_DIR || path.join(process.cwd(), "data", "pglite");
    if (process.env.NODE_ENV !== "test") await mkdir(path.dirname(location), { recursive: true });
    db = new PgliteAdapter(new PGlite(location));
  }
  if (process.env.NODE_ENV === "test") await applyMigrations(db);
  return db;
}

export function database(): Promise<DatabaseClient> {
  globalThis.__secondEntryReady ??= createDatabase();
  return globalThis.__secondEntryReady;
}

export async function migrateDatabase() {
  const db = await database();
  await applyMigrations(db);
}

export async function closeDatabase() {
  const db = await globalThis.__secondEntryReady;
  await db?.close?.();
  globalThis.__secondEntryDb = undefined;
  globalThis.__secondEntryReady = undefined;
  globalThis.__secondEntryPostgres = undefined;
}
