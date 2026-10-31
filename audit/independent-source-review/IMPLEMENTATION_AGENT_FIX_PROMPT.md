# Implementation Agent Fix Prompt

Copy everything below the line into a **separate** Codex or Claude Code session opened at `C:\Users\user\Documents\The Second Entry`. The auditor has not run it.

---

## ROLE

You are a senior TypeScript/PostgreSQL engineer fixing **confirmed** defects in the existing Second Entry project. An independent audit produced these reports, which you must read first:

- `audit/independent-source-review/CRITICAL_FINDINGS.md` (finding IDs SE-xx, with reproduction evidence)
- `audit/independent-source-review/RECOMMENDED_FIX_PLAN.md` (work packages WP-1…WP-15 with acceptance criteria)
- `audit/independent-source-review/REQUIREMENTS_COVERAGE_MATRIX.md`
- `audit/independent-source-review/TEST_COVERAGE_ASSESSMENT.md`
- `audit/independent-source-review/evidence/*` (probe scripts saved as `.txt` and their outputs; use them to build regression tests)

This project uses **Next.js 16**, which has breaking changes from earlier versions. Before touching Next.js APIs (route handlers, `cookies()`, `headers()`, config), read the relevant guide in `node_modules/next/dist/docs/` as instructed by `AGENTS.md`.

## HARD RULES

1. **Do not rewrite the application.** Keep:
   - the modular-monolith structure
   - `src/domain/*` functions and their tests
   - the PGlite local path
   - the existing UI pages
   - the existing 27 tests (they must keep passing)

   The only exception is the one test the audit identifies as asserting hard-coded literals (`repository.integration.test.ts` › "denies unauthorized resolution without mutation"). Replace it with a real denial test; don't just delete it.
2. **No fabricated functionality.** Never return constants, literals or predetermined outcomes in place of computed results. Every displayed score, status, metric or "invariant preserved" label must come from executed code and persisted data. If you cannot implement something, leave it clearly marked as not implemented in both the UI and the docs.
3. **No paid services, no cloud, no deployment.** Do not call any external LLM, AWS, or Vercel API. Do not deploy, provision, or create accounts. The SQS publisher may exist as code, but it must be inactive unless `RISK_QUEUE_URL` is set; tests use a local in-process queue. Any optional AI provider must be off by default.
4. **Git is the user's.** Do not run `git init`, `git add`, `git commit`, `git push`, or change branches. Leave all changes uncommitted.
5. **Protect data.** Do not delete or reset `data/pglite`. Tests must use `NODE_ENV=test` (in-memory PGlite) or a disposable directory. Do not run `npm run ml:evaluate` until WP-5 makes artifact writing opt-in. If you regenerate the artifact intentionally, show the diff.
6. **Do not modify** anything under `audit/`.
7. **Evidence only.** Every claim in your final report and in updated docs must be backed by command output you actually ran. If a check could not run, say so explicitly.
8. Do not install software globally. Project-local `npm install --legacy-peer-deps` is allowed for new dev dependencies. Justify each one.

## PRIORITY ORDER (stop and report if you cannot finish a priority)

### Priority 1 — CRITICAL

**WP-1: Ledger-safe reconciliation.** Fixes SE-C1, SE-M1, SE-M2, SE-M3, SE-M6.
- In `src/server/db/repository.ts` `ingestAndReconcile`, do all of the following inside **one** transaction:
  - an idempotent insert (`INSERT … ON CONFLICT (workspace_id, source_event_id) DO NOTHING RETURNING`)
  - a full-field fingerprint comparison for duplicate versus conflict (amount, currency, customer, invoice reference)
  - `SELECT … FOR UPDATE` of the workspace-scoped invoice
  - the decision
  - the allocation and the invoice UPDATE, **with a row-count check** that aborts on 0 rows
  - exception creation
- Validate `customerId` belongs to the session workspace.
- In `src/domain/reconciliation.ts`, reject `voided`/`draft` invoices and allow `overdue`.
- Add `db/migrations/0002_ledger_invariants.sql` with a trigger or constraint enforcing `sum(allocations) = paid_cents ≤ total_cents`. Make `src/server/db/client.ts` apply migrations in order, with a ledger table.
- Regression tests (new file `tests/reconciliation.concurrency.test.ts`), built from `evidence/financial.probe.test.ts.txt` P1, P1b, P2, P3, P5:
  - 10 concurrent payments × 20 iterations keep `sum(allocations) == paid_cents ≤ total_cents`
  - concurrent identical replays both return the same `paymentId` with no error
  - same ID with a different reference → conflict error and an unchanged row
  - a cross-workspace customer is rejected
  - voided → exception

**WP-2: Session secret and demo roles.** Fixes SE-C2, SE-H1, SE-L2, SE-L5.
- In `src/server/auth/session.ts`, remove `fallbackSecret`. Throw if `SESSION_SECRET` is missing or shorter than 32 characters. Provide the test secret via `vitest.config.ts` `test.env`, not via source.
- `.env.example`: demo accounts disabled by default, using a server-only variable rather than `NEXT_PUBLIC_*`.
- Named-role demo logins go into a fresh `demo-*` workspace, never the shared tenant.
- Add a logout route.
- Use a constant-time password compare.
- Stop pre-filling and printing passwords in `src/app/login/page.tsx`.
- Either enforce `administer` somewhere meaningful, or remove it.
- Tests:
  - signing or verifying without a secret throws
  - a token signed with the old constant `"second-entry-local-demo-secret-change-before-deployment"` is rejected
  - a demo role login gets an isolated workspace
  - logout clears the cookie

### Priority 2 — HIGH (WP-3 … WP-7 in `RECOMMENDED_FIX_PLAN.md`)

- **WP-3 (SE-H2):** `appendAudit` runs inside the caller's transaction; a per-workspace chain-head lock; sequence and timestamp in the hash; a `verifyAuditChain()` service shown in Settings. Test: 20 concurrent mutations → a linear chain that verifies.
- **WP-4 (SE-H6):**
  - Exception state machine (open → investigating → resolved_approved | resolved_rejected) with approve, reject and note actions, all transactional with review and audit.
  - Deterministic overpayment resolution policies that update the ledger exactly.
  - Route-level 403 tests.
  - Show review history in the UI.
- **WP-5 (SE-H3, SE-M10):**
  - Add `src/server/ml/features.ts` to extract features from DB facts.
  - On exception creation, call `inferAnomaly`, persist `inference_records`, and set the exception's `risk_score`/`model_version`.
  - Delete the hard-coded seed scores in `repository.ts` (`0.82`, `0.66`) and score seeds through the same path.
  - Make explanations contribution-based.
  - In `ml/train.ts`: validation-split threshold selection, real baselines, and a write-only-with-flag artifact.
  - Populate `model_versions` from the artifact.
  - Test: a new exception has a score plus an inference record; `train` is reproducible.
- **WP-6 (SE-H4):**
  - `runSimulation` computes `outcome` from post-condition queries.
  - `unauthorized_approval` calls `resolveException` with an analyst session.
  - `ai_unavailable` uses the WP-8 adapter with forced failure.
  - `worker_timeout` and `queue_failure` drive WP-7 code with injected faults.
  - Tests where a broken invariant yields `invariant_violated`.
- **WP-7 (SE-H5, SE-M11):**
  - Outbox rows are written in the exception transaction.
  - A dispatcher (`FOR UPDATE SKIP LOCKED`) publishes through a `Publisher` interface: a local in-process queue by default, `SqsPublisher` only if configured.
  - `aws/worker.ts` scores with the real artifact (no constant).
  - The callback route gets terminal-state idempotency (a duplicate identical result → 200; a conflicting one → 409 with no overwrite), a workspace check, an exception score update, stable error messages, and nonce pruning.
  - SAM: `CodeUri` plus esbuild metadata, the secret via SSM/Secrets Manager parameter, and a DLQ alarm.
  - Replace the substring validator with a YAML-parsing structural check.
  - Local end-to-end test for the whole loop, covering duplicate delivery and publisher failure plus retry.

### Priority 3 — MEDIUM (WP-8 … WP-12)

- **WP-8:** `AiProvider` interface, a Zod-validated output, a deterministic evidence-specific default (labelled non-AI), versioned prompts, `ai_decision_records`, timeout → fallback with a failure record. No default network calls.
- **WP-9:**
  - Customer creation, multi-line orders, confirm and cancel transitions.
  - `document_sequences` for order and invoice numbers.
  - Invoice allocation history; overdue derivation.
  - CSV that accepts a user-visible customer key, with quoted fields.
  - Fix `samples/payments.csv` so that it gives 3 accepted and 1 rejected.
  - Stable error messages instead of raw DB errors.
- **WP-10:** every policy displayed in Governance is enforced by code with a test, or removed.
- **WP-11:**
  - Rate limiting for login and demo creation; demo workspace TTL and cleanup.
  - Move seeding out of GET page renders.
  - Login 400 on malformed input.
  - Security headers via `next.config.ts`.
  - Mutating routes require JSON content-type and same-origin `Origin`.
- **WP-12:** implement a `DATABASE_URL` PostgreSQL adapter plus a migration ledger, and align or generate `db/schema.ts`. Or remove the Drizzle and Postgres claims. State which.

### Priority 4 — LOW and evidence (WP-13 … WP-15)

- Route-level tests for all 9 handlers.
- A full-workflow Playwright E2E (order → invoice → payment → exception → analyst denied → approver resolves, asserting DB-backed UI values).
- CI: install the Chromium browser inside CI only; add `git diff --exit-code ml/artifacts`; coverage thresholds of ≥80% for `src/domain`, `src/server` and `src/app/api`.
- Documentation truth pass: HANDOFF, ARCHITECTURE, SECURITY, DATABASE, DECISIONS, ML_EVALUATION, TEST_RESULTS and the Architecture Explorer page. Every claim must trace to code plus a test.
- Format with Prettier. Remove unused dependencies.

## VERIFICATION YOU MUST RUN AND REPORT

Run each command and paste the exact summary lines (pass/fail counts, errors). Never paraphrase a result you did not see.

```
npm run lint
npm run typecheck
npm test
npx vitest run --coverage
npm run aws:validate
npm run build
npm run test:e2e
```

- E2E requires a Playwright browser. Do not install it globally. If the `chromium` bundle is absent and you are not permitted to download it, run once with the system Chrome channel via a temporary config, and say so.
- Also run the new concurrency tests at least 3 times and report each result.
- Re-run the audit probes in a **scratch copy**, adapted from `evidence/*.txt`, and show that P1, P1b, P2, P3, P4, P5, P7, P9, H3 and C1/C2 now produce correct results.

## FINAL REPORT FORMAT

1. Findings fixed (SE-IDs), each with the changed files and the test name that proves it.
2. Findings not fixed, and why.
3. Exact verification output.
4. Any behaviour change the user must know about (new env vars, migrations, removed demo shortcuts).
5. Confirmation that no git operations, deployments, paid calls or data resets were performed.
