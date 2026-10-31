# Second Entry — Recommended Fix Plan

**Principles:**
- Keep the modular-monolith architecture, the domain functions, the schema style and the existing passing tests.
- Fix the critical invariants first.
- Make every claim either true or removed.
- Do not rewrite. Every work package is a targeted change with measurable acceptance criteria.

Findings referenced: `CRITICAL_FINDINGS.md`.

## Phase 0 — Stop-the-line (CRITICAL)

### WP-1 Ledger-safe reconciliation (SE-C1, SE-M1, SE-M2, SE-M3, SE-M6)
**Files:** `src/server/db/repository.ts` (`ingestAndReconcile`), `src/domain/reconciliation.ts`, `db/migrations/0002_*.sql` (new).

**Changes:**
1. Move the duplicate check, invoice read and decision **inside one transaction**.
   - Insert the payment with `INSERT … ON CONFLICT (workspace_id, source_event_id) DO NOTHING RETURNING id`.
   - On conflict, load the stored row and compare a fingerprint over `amount_cents, currency, customer_id, invoice_reference` → duplicate (200) or conflict (409).
2. Read the invoice with `SELECT … FOR UPDATE`, scoped by `workspace_id`.
3. Check the UPDATE row count. If it is 0, throw and roll back. Never commit an allocation without the matching `paid_cents` change.
4. Validate `customerId` belongs to `session.workspaceId`. Optionally add composite FKs `(workspace_id, id)`.
5. In `decideReconciliation`, reject `voided`/`draft` invoices and accept `overdue` as payable.
6. Add migration `0002`: a trigger or constraint guaranteeing `sum(payment_allocations.amount_cents) per invoice = invoices.paid_cents ≤ total_cents`.

**Acceptance criteria:**
- New test: 10 concurrent exact or partial payments against one invoice → `sum(allocations) == paid_cents ≤ total_cents`. Every payment whose allocation was not applied is an `exception` (overpayment/already_paid). Repeat 20 iterations.
- New test: 2 concurrent identical events → both resolve with the same `paymentId`; one reports `duplicate:true`; no 4xx.
- New test: same source ID with a different invoice reference → 409 conflict; the stored row is unchanged.
- New test: a cross-workspace `customerId` is rejected.
- New tests: voided → exception; overdue → allocates.
- All existing 27 tests still pass.

### WP-2 Fail-closed session secret and demo role ceiling (SE-C2, SE-H1, SE-L2, SE-L5)
**Files:** `src/server/auth/session.ts`, `src/app/api/session/*`, `.env.example`, `README.md`, `src/app/login/page.tsx`.

**Changes:**
1. Delete `fallbackSecret`. `secret()` throws unless `SESSION_SECRET` is at least 32 bytes. In `NODE_ENV=test`, use a test-only secret injected by the test setup, not a source constant.
2. Set `.env.example` to `NEXT_PUBLIC_DEMO_MODE=false`. Rename it to a server-only `DEMO_ACCOUNTS_ENABLED`; it should not be `NEXT_PUBLIC_`.
3. When demo accounts are enabled, sign each named-role login into a **fresh isolated `demo-*` workspace**, never the shared `workspace-portfolio`. Alternatively, offer a role switcher valid only inside the visitor's own demo workspace.
4. Add `POST /api/session/logout`, which clears the cookie.
5. Use constant-time password comparison. Stop pre-filling or printing passwords on the login page; keep them in the README only for local use.
6. Either implement an admin-only capability that checks `administer`, or remove the permission.

**Acceptance criteria:**
- A unit test proves `signSession`/`verifySession` throw when the secret is unset or short.
- An HTTP test proves a token signed with the old public constant is rejected (401/redirect).
- A test proves a named-role demo login lands in a unique `demo-*` workspace.
- Logout clears the cookie.

## Phase 1 — Integrity and honest behaviour (HIGH)

### WP-3 Atomic, linear audit chain (SE-H2)
**Files:** `repository.ts` (`appendAudit` and all callers); migration `0002`.

**Changes:**
- `appendAudit(tx, …)` runs inside the caller's transaction.
- Lock a per-workspace `audit_heads` row (`SELECT … FOR UPDATE`).
- Include `sequence` and `occurred_at` in the hash.
- Add `verifyAuditChain(workspaceId)` and display its result on Settings.

**Acceptance criteria:**
- A concurrency test with 20 parallel mutations shows each `previous_hash` used at most once, and `verifyAuditChain` returns `valid`.
- A test that forces the audit insert to fail rolls back the business change.

### WP-4 Exception lifecycle (SE-H6)
**Files:** `repository.ts`; `src/app/api/exceptions/[id]/*`; `src/app/app/exceptions/page.tsx`; migration.

**Changes:**
- Add a state machine: `open → investigating → resolved_approved | resolved_rejected`, with `reopen` if desired.
- Use guarded UPDATEs inside one transaction with review and audit.
- Add actions: `approve`, `reject`, `add_note`.
- Define overpayment resolution policies in deterministic domain code, for example:
  - `apply_and_hold_credit`: allocate up to the outstanding balance and record a customer credit row.
  - `mark_refund_due`.
- Show the review history in the UI. Hide the approve control for roles that cannot approve; server enforcement stays.

**Acceptance criteria:**
- Tests for every legal and illegal transition.
- Resolving an overpayment with `apply_and_hold_credit` updates `paid_cents` exactly and creates a credit record, atomically.
- An analyst gets 403 at the route level.

### WP-5 Wire the real ML model (SE-H3, SE-M9, SE-M10)
**Files:** `src/server/ml/inference.ts`, new `src/server/ml/features.ts`, `repository.ts`, `ml/train.ts`, `src/app/app/governance/page.tsx`, `ml/artifacts/anomaly-model.json` (regenerate only via the script).

**Changes:**
1. Implement `extractFeatures(tx, payment, invoice, workspaceId)` from DB facts, with each feature's definition documented.
2. On exception creation (same transaction), call `inferAnomaly`. Insert an `inference_records` row and set `exceptions.risk_score` and `model_version`.
3. Remove the hard-coded seed scores (`repository.ts:62-65`); score seed exceptions through the same path.
4. Explanations: rank by `|w_i × z_i|` (standardised contribution), not raw value.
5. Training:
   - Split train into train and validation; choose the threshold on validation only.
   - Replace `baselineF1` with real baselines (predict-all, simple rule) and label them correctly.
   - Write the artifact only with `--write`; default to a dry run, so CI does not dirty the tree.
6. Populate `model_versions` from the artifact (metrics, threshold, dataset hash), and have Governance read it.

**Acceptance criteria:**
- An integration test proves that a new overpayment exception has a non-null score, a matching `inference_records` row, and `model_version == artifact.version`.
- A reproducibility test: `train({write:false})` equals the committed artifact, excluding the timestamp.
- The docs' metrics match the regenerated artifact.

### WP-6 Truthful Workflow Lab (SE-H4)
**Files:** `repository.ts` (`runSimulation`), `src/app/app/workflow-lab/page.tsx`.

**Changes:**
- Compute `outcome` from post-condition SQL checks: payment count, allocation sum equals `paid_cents`, exception status before and after, stored row unchanged.
- `unauthorized_approval` calls `resolveException` with a synthetic analyst session in the caller's workspace and verifies the 403 plus unchanged status.
- `ai_unavailable` calls the AI adapter (WP-8) with a forced failure and records an AI-failure row.
- `worker_timeout` and `queue_failure` drive the real dispatcher and worker code (WP-7) with injected faults.
- Restrict the lab to the caller's own workspace (already true) and keep guests allowed only in `demo-*` workspaces.

**Acceptance criteria:** for each scenario, a test that deliberately breaks the invariant (via a test hook) yields `invariant_violated`. Remove the test that asserts hard-coded literals (`repository.integration.test.ts`, "denies unauthorized resolution") and replace it with a real route- or service-level denial test.

### WP-7 Connected asynchronous pipeline (SE-H5, SE-M11)
**Files:** new `src/server/outbox/dispatcher.ts`, new `src/server/queue/{publisher.ts,local-queue.ts,sqs-publisher.ts}`, `aws/worker.ts`, `src/app/api/internal/jobs/result/route.ts`, `aws/template.yaml`, `scripts/validate-aws.ts`.

**Changes:**
1. Exception creation inserts a `processing_jobs` row plus an `outbox_events` row in the same transaction.
2. The dispatcher claims pending outbox rows (`FOR UPDATE SKIP LOCKED`) and publishes through a `Publisher` interface:
   - `LocalQueuePublisher` (in-process, default, free).
   - `SqsPublisher` (`@aws-sdk/client-sqs`; used only when `RISK_QUEUE_URL` is set).
   - It marks the row delivered or increments `attempt_count` with backoff.
3. The worker loads the model artifact and scores real features carried in the message (or fetched through a narrow read API). It must not return a constant.
4. The callback dedupes on `(jobId)` terminal state:
   - A duplicate identical result → 200 (idempotent ack), so the worker doesn't loop.
   - A conflicting result after a terminal state → 409, stored for review, no overwrite.
   - It verifies the job belongs to the workspace in the message, and writes the score to the exception or inference record.
   - It maps DB errors to stable messages and prunes nonces older than the window.
5. SAM:
   - Add `CodeUri` and `Metadata: BuildMethod: esbuild` for the TS handler.
   - Move the secret to SSM SecureString or Secrets Manager (note any cost).
   - Add a CloudWatch alarm on DLQ `ApproximateNumberOfMessagesVisible > 0`.
   - Replace the substring validator with a YAML parse plus structural assertions. Keep `sam validate --lint` documented as the authoritative step when authorised.

**Acceptance criteria:** a local end-to-end test drives exception → outbox → dispatcher → local queue → worker handler → signed callback → exception scored, with these checks:
- duplicate delivery → one terminal result
- publisher failure → outbox stays pending, then delivers on retry
- worker failure → batch item failure

## Phase 2 — Completeness (MEDIUM)

### WP-8 Optional, governed GenAI adapter (SE-H7)
**Files:** new `src/server/ai/{provider.ts,deterministic.ts,prompts/v1.ts,schema.ts}`, `src/app/app/ai-insights/page.tsx`, `DECISIONS.md`.

**Changes:**
- Add an `AiProvider` interface returning a Zod-validated `{summary, risks[], recommendedNextSteps[], confidence}`.
- The default `DeterministicProvider` builds an evidence-specific summary from structured exception data, labelled non-AI.
- An optional real provider is enabled only by explicit env configuration, with a timeout, no financial tools, and delimited untrusted fields. No paid service is called by default.
- Record every call (prompt version, provider, latency, validation result, failure) in an `ai_decision_records` table.

**Acceptance criteria:**
- Tests for schema rejection, timeout → fallback with a failure record, prompt-injection text in a remittance reference not changing structured fields, and no code path from AI output to repository writes (enforce with a dependency or lint rule).

### WP-9 Order-to-cash gaps (SE-M5, SE-M8, SE-M4)
**Changes:**
- Customer create API and UI.
- Multi-line orders with per-line exact cents.
- Discrete confirm and cancel actions with guarded transitions.
- A per-workspace `document_sequences` table for `SE-` and `INV-` numbers.
- Invoice detail with allocation history.
- An overdue status derivation.
- CSV: accept a customer code or name shown in the UI; quoted-field parsing; fix `samples/payments.csv`; map DB errors to stable messages.

**Acceptance criteria:**
- Importing the bundled sample in a fresh demo workspace gives 3 accepted and 1 rejected (the negative row).
- 50 concurrent order creations produce no number collisions.
- Order cancel and confirm transitions are tested.

### WP-10 Governance that enforces (SE-M9)
**Changes:**
- Every policy shown in Governance maps to a code predicate with a test, or is removed from the UI.
- Implement "high-risk score requires approver" by routing exceptions with `risk_score ≥ threshold` to approver-only resolution.
- Implement "uncertain output → investigation".
- Add override records linking a review to an inference record.

**Acceptance criteria:** a test per displayed policy.

### WP-11 Abuse and hardening (SE-M7, SE-L1, SE-L3, SE-L4)
**Changes:**
- Rate-limit login and demo creation (an in-memory token bucket locally; document the edge limit for production).
- Cap and expire demo workspaces with a cleanup job.
- Move seeding out of GET renders: seed on demo session creation.
- Wrap login parsing in try/catch → 400.
- Add security headers (CSP, `frame-ancestors 'none'`, HSTS in production) via `next.config.ts` `headers()`.
- Require `content-type: application/json` and a same-origin `Origin` on mutating routes.

**Acceptance criteria:** HTTP tests: malformed login → 400; `text/plain` → 415; foreign `Origin` → 403; headers present.

### WP-12 Persistence adapter honesty (SE-M12)
Either implement a `postgres`-backed adapter selected by `DATABASE_URL`, with a migration ledger table, and align `db/schema.ts` with the SQL (or generate one from the other), or remove the Drizzle and `postgres` claims from the docs and dependencies.

**Acceptance criteria:** the integration suite runs against both PGlite and (optionally, when `DATABASE_URL` is provided by the user) a local PostgreSQL. A schema-drift test compares the Drizzle tables with `information_schema`.

## Phase 3 — Evidence and documentation (LOW plus cross-cutting)

### WP-13 Tests and CI (SE-M13, SE-L9, SE-L10)
- Add route-level tests for all 9 handlers (role matrix, validation, error mapping).
- Add E2E: order → invoice → payment → exception → analyst denied → approver resolves, asserting the UI and DB.
- CI: run E2E with `npx playwright install --with-deps chromium` inside CI only. Fail on `git diff --exit-code ml/artifacts`.
- Coverage gates: ≥80% statements and branches for `src/domain`, `src/server`, and the API routes.

### WP-14 Documentation truth pass (SE-H8, SE-L6, SE-L7)
- Update HANDOFF, ARCHITECTURE, SECURITY, DATABASE, DECISIONS, ML_EVALUATION and TEST_RESULTS so every claim maps to code and a test.
- Make Architecture Explorer statuses data-driven (for example, outbox "live local" only when the dispatcher is enabled).
- Fix analytics labels: cash received versus applied; reconciliation-rate definition; render or remove workflow reliability; add job latency.

### WP-15 Repository hygiene (SE-L8)
- Recommend the user initialise a project-level Git repository. The user should do this; the fix agent must not.
- Format the source with Prettier so reviews and diffs are readable.
- Remove unused dependencies (`recharts`, and `postgres`/`client-sqs` if WP-7 and WP-12 are not adopted).
- Re-enable `no-explicit-any` for `src/domain` and `src/app/api`.

## Suggested order and exit criteria

1. WP-1 and WP-2. **Exit:** SE-C1 and SE-C2 regression tests pass; nothing critical open.
2. WP-3, WP-4, WP-5, WP-6, WP-7. **Exit:** no HIGH finding open, and every displayed ML score, lab outcome and pipeline step is produced by executed code.
3. WP-8 to WP-12.
4. WP-13 to WP-15. **Exit:** re-run the full verification and update TEST_RESULTS.md with actual output.

After Phase 1, re-audit for readiness classification **A (Ready for manual user testing)**.
