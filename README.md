# Second Entry

Second Entry is a synthetic financial-operations portfolio application: customers/orders → invoices → payment ingestion → deterministic reconciliation → governed exceptions → advisory ML → human decisions → audit/analytics. It is not a bank, payment processor, compliance certification, or production-ready financial system.

## Verified local start

Prerequisites: Node.js 22+, npm, and a strong locally generated secret. Never reuse the examples below outside local testing.

```powershell
npm ci --legacy-peer-deps
Copy-Item .env.example .env.local
# Edit .env.local: set SESSION_SECRET to an unpredictable 32+ character value.
npm run db:migrate
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Then open `http://localhost:3000`. The public isolated-demo entry creates synthetic data only. Local elevated role UAT is disabled by default. To enable it, set `DEMO_ACCOUNTS_ENABLED=true` in `.env.local`; each login receives a new isolated `demo-role-*` workspace.

For an employer-facing deployment, both the landing page and `/login` expose **Enter public demo**. It creates an isolated synthetic guest workspace without credentials. Keep `DEMO_ACCOUNTS_ENABLED` unset or `false` publicly so local analyst/approver/admin credentials and their sign-in form remain disabled.

Local-only role credentials:

| Role | Email | Password |
|---|---|---|
| Analyst | `analyst@secondentry.local` | `Analyst-Demo-2026!` |
| Approver | `approver@secondentry.local` | `Approver-Demo-2026!` |
| Administrator | `admin@secondentry.local` | `Admin-Demo-2026!` |

Never enable these credentials on a public/shared deployment. The login page does not expose them.

## Verified scope and limits

Verified locally with PGlite and system Chrome: exact-cent order/payment flow, concurrency-safe/idempotent reconciliation, tenant validation, runtime model inference/provenance, exception notes and approve/reject decisions, audit-chain verification, CSV 3/1 sample, durable outbox retry, real worker scoring, callback replay/conflict guards, mobile navigation, and logout.

Incomplete: customer creation, multi-line order editing/confirm/cancel, invoice detail/search/history, expanded analytics, durable distributed rate limiting, and full policy registry coverage. PostgreSQL adapter code exists but no external PostgreSQL runtime was available. AWS/Vercel are not deployed; live SQS/Lambda/SAM service validation is not verified. No live LLM provider exists or was called. Production deliberately requires `DATABASE_URL`; migrations are an explicit deployment step and never run during request startup. See [FINDING_CLOSURE_MATRIX.md](FINDING_CLOSURE_MATRIX.md) and [HANDOFF.md](HANDOFF.md).

## Commands

```powershell
npm run lint
npm run typecheck
npm test
npm run test:coverage
npm run ml:evaluate       # dry run; does not rewrite the artifact
npm run aws:validate      # local structural assertions, not sam validate
npm run build
npm run test:e2e          # uses installed system Chrome and the built app
```

For Vercel, configure a pooled PostgreSQL `DATABASE_URL`, `SESSION_SECRET`, `CALLBACK_SIGNING_SECRET`, `CRON_SECRET`, `AWS_REGION`, and `RISK_QUEUE_URL`. Run `npm run db:migrate` once against the target database before routing traffic. The checked-in Vercel Cron calls the authenticated dispatcher; Vercel supplies `Authorization: Bearer $CRON_SECRET`. Leave `NEXT_OUTPUT_MODE` unset on Vercel. Set it to `standalone` only for a self-hosted container build and start the emitted standalone server in that deployment.
