# Decisions

1. Preserve the modular monolith and PGlite path; add a `DATABASE_URL` adapter instead of rebuilding.
2. Serialize in-process workspace mutations for PGlite and use invoice/audit-head row locks for PostgreSQL semantics. Conditional balance updates must return a row.
3. Treat amount, currency, customer, and normalized invoice reference as the idempotency fingerprint.
4. Fail closed on session secrets; local roles are default-off and tenant-isolated.
5. Keep ML advisory. Runtime and worker inference share one artifact and contribution-based explanation.
6. Default AI explanation is typed, evidence-specific, deterministic, non-network, and labeled non-AI. Live provider integration remains disabled/unverified.
7. Use an atomic durable outbox with local/SQS transport adapters. No background dispatcher or cloud claim is implied merely by code presence.
8. Overpayment approval records the full payment as `refund_due` customer credit; it does not alter invoice paid balance.
9. Audit hashing is database tamper evidence, not external immutability.
10. Do not force dependency audit fixes that downgrade/break the lint toolchain; production dependency audit is zero while the dev-only advisory is documented.
