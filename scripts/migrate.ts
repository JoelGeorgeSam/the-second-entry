import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());
const { closeDatabase, migrateDatabase } = await import("../src/server/db/client");

try {
  await migrateDatabase();
  console.log("Database migrations applied successfully.");
} finally {
  await closeDatabase();
}
