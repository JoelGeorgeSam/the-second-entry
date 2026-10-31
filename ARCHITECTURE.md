# Architecture

Second Entry remains a Next.js 16 modular monolith. The request transaction is the financial consistency boundary: idempotent payment insert, workspace customer validation, normalized invoice lookup and row lock, deterministic decision, guarded balance update, allocation/exception, inference provenance, durable job/outbox, and audit append commit or roll back together.

PGlite is the verified local-development/test adapter and is rejected in production. `DATABASE_URL` selects a Postgres.js adapter; this code path is not runtime-verified. Migrations are an explicit, advisory-lock-serialized deployment command and never run from application startup. The dispatcher claims durable outbox rows and publishes through a transport interface. Its local adapter and failure/recovery behavior are verified. The authenticated Vercel Cron route requires both `CRON_SECRET` and `RISK_QUEUE_URL`; without either it fails closed rather than marking work delivered to process memory.

The worker receives bounded feature snapshots, runs the versioned artifact, and posts a signed advisory result. The callback validates timestamp/HMAC/nonce, workspace/job/exception ownership, and terminal-state monotonicity. Completed and failed terminal results propagate to both the linked exception and separate worker-state fields on inference provenance without erasing the valid local inference. The callback cannot mutate invoices, allocations, credits, or approvals.

Audit events use a locked per-workspace head, chain sequence and timestamp in the signed payload, and atomic business transactions. `verifyAuditChain` independently recomputes the chain. This is database tamper evidence, not external notarization.

AWS and Vercel are not deployed. See the in-app Architecture page for verified/code-ready/not-deployed status.
