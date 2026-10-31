# Security

- Sessions use HMAC-SHA256, strict runtime claim validation, and fail closed unless `SESSION_SECRET` is unpredictable and at least 32 characters. Invalid JSON, invalid claims, expired, tampered, and retired-secret tokens are rejected without throwing.
- Cookie settings are HTTP-only, SameSite=Lax, root-scoped, and Secure in production. Logout expires the cookie.
- Local role credentials are server-gated, default off, omitted from the UI, compared timing-safely, and isolated per login.
- Server authorization—not button visibility—enforces approvals. Analyst denial and approver success are tested.
- Payment/customer/invoice/exception/job writes are workspace-scoped. Callback ownership is validated.
- Core JSON mutations, including logout, enforce `application/json` and same-host Origin when supplied. CSP, frame denial, MIME sniffing denial, referrer policy, permissions policy, and production HSTS are configured.
- The outbox Cron route requires a timing-safe `Authorization: Bearer $CRON_SECRET` check and refuses to dispatch without a durable SQS URL.
- Callback signing uses HMAC, a five-minute timestamp window, nonce replay storage/cleanup, and terminal result fingerprints.

Limitations: no distributed/serverless rate limiter or disposable-workspace expiry cleaner; not every route has a dedicated HTTP matrix test; local passwords are demonstration credentials, not an IdP. Never enable them publicly.
