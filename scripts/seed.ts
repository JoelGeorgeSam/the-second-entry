import { ensureWorkspace } from "../src/server/db/repository";
await ensureWorkspace("workspace-portfolio");
console.log("Deterministic synthetic workspace seeded successfully.");
