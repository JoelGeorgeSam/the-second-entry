# Second Entry — Project Plan

Last updated: 2026-10-30

## Milestones

1. **Foundation** — Next.js/TypeScript shell, exact-money domain, durable local database, seeded demo, validation and CI.
2. **Financial operations** — orders, invoices, payments, reconciliation, exceptions and audit evidence.
3. **AI governance** — advisory evidence summaries, model registry, policies and human approvals.
4. **ML engineering** — deterministic synthetic dataset, logistic model training, measured evaluation and inference.
5. **Cloud worker** — SQS/Lambda contracts, signed callback, outbox and local idempotency tests.
6. **Reliability** — isolated failure simulations and invariant checks.
7. **Analytics and architecture** — source-backed KPIs and architecture explorer.
8. **Release** — accessibility, security, docs, complete verification and handoff.

## Acceptance criteria

The local demo must support the complete synthetic order-to-cash path, prevent duplicate allocation, enforce role policies server-side, retain audit history, perform genuine ML inference, and run without paid services. Real AWS and Vercel deployment remain authorization-gated.

## Status

Implementation in progress. See `PROGRESS.md` and `TEST_RESULTS.md` for executed evidence.
