# Database

Migrations are ordered in `db/migrations` and recorded in `schema_migrations`; they are non-destructive upgrades. They run only through `npm run db:migrate`, never during application/request startup. The migration runner wraps the ledger check and all pending DDL in one transaction; PostgreSQL additionally takes a transaction-scoped advisory lock so concurrent migration runners serialize.

Runtime selection:

- development with no `DATABASE_URL`: embedded PGlite at `data/pglite` (or `PGLITE_DATA_DIR` for disposable browser tests);
- production/Vercel with no `DATABASE_URL`: fail closed before opening a database;
- `DATABASE_URL` in non-test mode: Postgres.js adapter with a per-instance connection limit of one. The URL must point to a provider-supported serverless pooler because application code cannot impose a global connection limit across Vercel instances.

Important constraints/services include workspace/source uniqueness, invoice paid-total checks, unique allocation per payment, transactional per-workspace document sequences, locked audit heads, inference records, processing jobs, durable outbox events, callback nonces, exception notes/reviews, and customer credits.

PGlite migrations and integration behavior are verified. Real PostgreSQL compatibility and aggregate provider limits remain **NOT VERIFIED** because no service/URL was supplied. Drizzle declarations remain non-authoritative and are not a completeness claim.

The production-browser test has one constrained escape hatch: `LOCAL_E2E_PGLITE=true` is accepted only outside Vercel and only when `PGLITE_DATA_DIR` resolves beneath the project `.tmp` directory. This cannot enable the persistent `data/pglite` store in production.
