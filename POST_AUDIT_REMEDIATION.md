# Post-audit remediation status

Evidence date: 2026-11-01 (Asia/Riyadh)

## Corrected

- Production and Vercel fail closed when `DATABASE_URL` is absent. Filesystem PGlite remains available for development/test only; the production E2E override is rejected on Vercel and restricted to a project-local `.tmp` path.
- Application startup no longer runs migrations. `npm run db:migrate` is the explicit migration entry point. PostgreSQL migration ledger checks and pending DDL run in one transaction under `pg_advisory_xact_lock`.
- The Vercel Cron definition invokes an authenticated dispatcher route. The route requires a timing-safe `CRON_SECRET` bearer token and a durable `RISK_QUEUE_URL`; it cannot silently deliver into process memory.
- Outbox delivery, retry, and dead-letter states propagate to the linked exception and inference worker-state provenance.
- Signed sessions use strict runtime claim validation and return `null` for validly signed malformed JSON or invalid claims.
- Logout now enforces the same JSON content type and same-origin checks as other mutation routes.
- CSV formula protection rejects leading `-` in addition to `=`, `+`, `@`, and tab. Payment-page CSV documentation now names `customer_code` correctly.
- Failed signed callbacks terminalize the job, linked exception processing state, and inference worker state without erasing the valid local inference.
- Standalone output is opt-in through `NEXT_OUTPUT_MODE=standalone`; default builds are compatible with `next start` and Vercel.
- Public copy now describes a synthetic locally verified portfolio rather than a deployed production/cloud service.
- ESLint excludes disposable `.tmp` build mirrors.

## Verification

- `npm run lint`: pass
- `npm run typecheck`: pass
- `npm test`: pass, 12 files / 58 tests
- `npm run test:coverage`: pass — 89.01% statements, 81.28% branches, 83.11% functions, 91.81% lines
- `npm run ml:evaluate`: pass, dry-run artifact reproduction
- `npm run aws:validate`: pass, 9 structural assertions
- `npm run build`: pass, 28 routes, no standalone-start warning and no project-tracing warning
- `npm run test:e2e`: pass, 3/3 with system Chrome
- `npm audit --omit=dev`: pass, zero production dependency advisories
- `npm audit`: 16 moderate advisories remain in the development-only ESLint/minimatch chain. The npm-proposed forced fix is breaking and was not applied.
- Local PGlite migrations `0004` and `0005`: applied successfully through the explicit runner.

## Data safety

A recoverable pre-migration copy of the original local PGlite directory was created at `.tmp/pglite-backup-before-0004-20261101-005759`. The migrations were additive; no tables or records were intentionally deleted.

## Still requires external verification or a product decision

- Real multi-process PostgreSQL race and migration execution remains unverified because Docker, `psql`, and a PostgreSQL service are unavailable in this environment. A pooled hosted PostgreSQL provider must be selected and its aggregate Vercel connection behavior load-tested.
- SAM CLI is not installed, and no live AWS SQS/Lambda/IAM/CloudWatch resource was contacted. `sam validate --lint` and live callback reachability remain external verification steps if AWS stays in release scope.
- Vercel and AWS are not provisioned or deployed.
- Customer creation, multi-line order editing, explicit confirm/cancel, invoice detail/history/search/filter, persisted overdue scheduling, broad analytics, and PDF export remain outside the implemented release slice. Product claims have been narrowed accordingly; decide which are required before public release.
- The one-minute Vercel Cron schedule must be checked against the selected Vercel plan before deployment and adjusted if that plan has a lower frequency limit.

## Deployment gate

The code-level blockers from the independent report are corrected locally. Do not migrate or deploy a shared environment until a disposable real PostgreSQL database passes the multi-process financial race suite and the selected Vercel/AWS service configuration is reviewed.
