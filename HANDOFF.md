# Handoff

## Readiness

**PARTIALLY READY — CORRECTIONS OR VERIFICATION REQUIRED.**

The former critical ledger and session defects are fixed and locally regression-tested. Core synthetic payment reconciliation, audit integrity, runtime ML, role approval, CSV import, local queue recovery, callback guards, mobile navigation, and logout are suitable for independent local testing. The application is not production-ready: material order/invoice breadth remains incomplete, coverage is below the requested target, and hosted PostgreSQL/AWS/Vercel/live-LLM execution is unverified or not deployed.

## Important behavior changes

- `SESSION_SECRET` is mandatory and must be unpredictable with 32+ characters. The retired source-known secret is rejected.
- `DEMO_ACCOUNTS_ENABLED` is server-only and defaults off. Role logins create isolated synthetic workspaces.
- Payment conflicts compare amount, currency, customer, and normalized invoice reference.
- New exceptions are scored by model 1.1.0, store provenance, and create job/outbox records atomically.
- Overpayment approval creates a `refund_due` customer-credit record; it does not silently allocate excess funds.
- ML evaluation is non-writing by default; only `tsx ml/train.ts --write` replaces the artifact.
- E2E uses loopback port 3100, explicit test secrets, `.tmp/e2e-pglite`, and installed system Chrome.

## External authorization still required

- Supply a disposable PostgreSQL `DATABASE_URL` to verify the hosted adapter.
- Separately approve any Vercel or AWS deployment after account/cost review.
- Install/use SAM CLI if service-side template lint is desired.
- Select and explicitly authorize a permitted live AI provider before any network inference; default behavior makes no network call.

No Git operation, deployment, cloud resource, paid API call, destructive database reset, or edit under `audit/` was performed.
