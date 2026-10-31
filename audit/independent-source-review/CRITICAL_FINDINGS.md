# Second Entry — Critical Findings

Independent source review, 2026-10-30. Every finding below was checked against the source code. Findings marked **Reproduced** were executed by the auditor, either in an isolated scratch copy of the repository (in-memory PGlite, `NODE_ENV=test`) or against a scratch-copy `next start` server on port 3100. The existing development database (`data/pglite`) and the running instance on port 3000 were not touched.

Probe scripts and raw outputs are in `audit/independent-source-review/evidence/`. Scripts are saved with a `.txt` suffix so that the project's lint, typecheck and test globs do not pick them up.

Severity scale: **CRITICAL** = confirmed risk of financial corruption or authorization bypass. **HIGH** = a core requirement is broken or misrepresented. **MEDIUM** = a correctness, security or completeness defect with bounded impact. **LOW** = hygiene.

| ID | Severity | Title | Status |
|---|---|---|---|
| SE-C1 | CRITICAL | Concurrent reconciliation corrupts the ledger (allocations exceed invoice credit) | Reproduced (service layer) |
| SE-C2 | CRITICAL | Hard-coded fallback session secret lets anyone forge an administrator session | Reproduced (HTTP) |
| SE-H1 | HIGH | Public demo credentials grant administrator and approver roles in one shared workspace | Code-confirmed |
| SE-H2 | HIGH | Audit trail is not atomic with financial writes, and the hash chain forks under concurrency | Reproduced |
| SE-H3 | HIGH | The ML model is never used by the app; displayed "ML risk scores" are hard-coded constants | Reproduced |
| SE-H4 | HIGH | The Workflow Lab reports predetermined outcomes; four of six scenarios don't exercise real behaviour | Reproduced |
| SE-H5 | HIGH | The AWS pipeline is disconnected: no SQS producer, no outbox dispatcher, constant worker score, non-idempotent results | Reproduced |
| SE-H6 | HIGH | Exception resolution is non-atomic, has no financial effect, and has no reject path or state machine | Reproduced |
| SE-H7 | HIGH | Generative AI integration is entirely absent, despite the ADR claiming a provider interface exists | Code-confirmed |
| SE-H8 | HIGH | Documentation materially overstates completion and controls | Code-confirmed |
| SE-M1 | MEDIUM | A concurrent replay of the same source event returns 400 with a raw DB error instead of an idempotent response | Reproduced |
| SE-M2 | MEDIUM | Conflict detection ignores invoice reference and customer, so conflicting evidence is silently discarded | Code-confirmed |
| SE-M3 | MEDIUM | A payment can reference a customer that belongs to another workspace | Reproduced |
| SE-M4 | MEDIUM | The bundled CSV sample rejects 2 of its 3 valid rows; the CSV contract needs internal IDs the UI never shows | Reproduced (HTTP) |
| SE-M5 | MEDIUM | Order and invoice numbers come from `Date.now()` and collide | Reproduced |
| SE-M6 | MEDIUM | Overdue status is never assigned; voided invoices still accept allocations | Reproduced |
| SE-M7 | MEDIUM | No rate limiting; an unauthenticated GET creates and seeds a new workspace on every call | Code-confirmed |
| SE-M8 | MEDIUM | Order-to-cash gaps: no customer creation, single line item only, no discrete confirm or cancel, no per-invoice payment history | Code-confirmed |
| SE-M9 | MEDIUM | Governance UI shows unenforced policies; the registry row is a placeholder; no AI decision records are written | Reproduced |
| SE-M10 | MEDIUM | ML evaluation methodology: threshold tuned on the holdout, mislabelled "baseline", explanations rank raw magnitudes | Reproduced |
| SE-M11 | MEDIUM | SAM template is not deployable as written; "AWS validation" is a substring check | Code-confirmed |
| SE-M12 | MEDIUM | Drizzle ORM unused and divergent; no PostgreSQL adapter despite the docs; `DATABASE_URL` ignored | Code-confirmed |
| SE-M13 | MEDIUM | Test suite does not cover APIs, concurrency, or end-to-end financial workflows | Measured |
| SE-L1 | LOW | Login route returns 500 on a malformed body | Reproduced |
| SE-L2 | LOW | No logout or session revocation | Code-confirmed |
| SE-L3 | LOW | No security headers (CSP, X-Frame-Options, HSTS) | Reproduced |
| SE-L4 | LOW | `text/plain` bodies accepted from a foreign Origin; CSRF defence rests only on SameSite=Lax | Reproduced |
| SE-L5 | LOW | Non-constant-time password compare; credentials pre-filled on the login page | Code-confirmed |
| SE-L6 | LOW | Analytics labelling and coverage gaps | Code-confirmed |
| SE-L7 | LOW | Architecture Explorer is hard-coded and partly inaccurate | Code-confirmed |
| SE-L8 | LOW | Repository hygiene: no project-level Git history, condensed one-line source, unused dependencies | Observed |
| SE-L9 | LOW | `npm run ml:evaluate` / `verify` rewrite a committed artifact | Code-confirmed |
| SE-L10 | LOW | Claimed Playwright browser runtime is absent on this machine | Observed |

---

## SE-C1 — CRITICAL — Concurrent reconciliation corrupts the ledger

**Location:** `src/server/db/repository.ts`, `ingestAndReconcile`, lines 110–121 (invoice read at line 114, decision at line 115, transaction at lines 116–120, guarded UPDATE at line 118).

**Expected:** concurrent allocations can never exceed the invoice balance. Payment status, allocation rows and `invoices.paid_cents` must always agree.

**Actual:**
1. The invoice row is read **outside** the transaction, with no `SELECT … FOR UPDATE` (line 114). `decideReconciliation` then runs on that stale snapshot (line 115).
2. Inside the transaction, the code inserts the payment as `reconciled` or `partially_reconciled`, then inserts the `payment_allocations` row, then runs
   `UPDATE invoices SET paid_cents=paid_cents+$1 … WHERE id=$2 AND paid_cents+$1<=total_cents` (line 118).
3. When the guard fails because another payment already consumed the balance, the UPDATE matches **0 rows**. The return value is never checked. The transaction still commits the "reconciled" payment and its allocation, and no exception is raised.
4. The schema constraint `CHECK(paid_cents<=total_cents)` (`db/migrations/0001_initial.sql:28`) never fires because no row is updated. Nothing constrains the sum of allocations per invoice.

**Reproduction (service layer, in-memory DB):** `evidence/financial.probe.test.ts.txt`, tests P1 and P1b. Output in `evidence/financial-probe-output.txt`:

```
P1  two concurrent exact payments of 542400 to INV-2026-083 (total 542400):
    invoice paid_cents=542400 status=paid; allocations sum=1084800 (n=2);
    both payments status "reconciled"; exceptions created: 0
P1b three concurrent partials of 300000 to the same invoice:
    invoice paid_cents=300000; allocations sum=900000 (n=3); all three "partially_reconciled"
```

So $5,424 of cash is reported as reconciled against an invoice that never received it. No exception is opened, and every dashboard KPI (which reads `invoices.paid_cents`) silently disagrees with the allocation ledger.

**HTTP-level attempt:** against a scratch `next start` server, the race was **not** reproduced. That covered 3 rounds of 10 parallel `POST /api/payments` and 3 rounds of 3 parallel 20-row CSV imports (`evidence/http-race*.txt`). Local single-process PGlite serialized those requests closely enough to hide the race. The defect is structural, though: any deployment on PostgreSQL with a connection pool or several serverless instances (the documented production target) widens the window. And whenever the guard fails for any reason, the current code commits an inconsistent state.

**Remediation:**
- Perform the duplicate check, invoice read and decision inside one transaction, using `SELECT … FOR UPDATE` on the invoice row (or SERIALIZABLE isolation plus retry).
- Check the UPDATE's row count. If it is 0, abort, or reroute the payment to an exception.
- Add a DB-level invariant: a trigger or deferred constraint ensuring `sum(allocations) = invoices.paid_cents` and `≤ total_cents`.
- Add a concurrency regression test equivalent to P1/P1b.

---

## SE-C2 — CRITICAL — Forgeable administrator sessions via the hard-coded fallback secret

**Location:** `src/server/auth/session.ts`, lines 7 and 11 (`const fallbackSecret = "second-entry-local-demo-secret-change-before-deployment"`; `secret() { return process.env.SESSION_SECRET || fallbackSecret; }`).

**Expected:** with no strong secret configured, the server refuses to start or refuses to sign or verify sessions (fail closed), at least when `NODE_ENV=production`.

**Actual:** the secret is published in the source. Any environment without `SESSION_SECRET`, including `next start`, accepts tokens that anyone can sign. The cookie payload chooses `role` and `workspaceId` freely.

**Reproduction (HTTP, scratch server, no env vars):** `evidence/http-probe.mjs.txt` H3/H3b. Output:

```
H3  forged {"role":"administrator"} cookie -> GET /app/settings: 200, renders "administrator" and "Forged Admin"
H3b forged admin -> POST /api/exceptions/<id>/resolve: 200 "Exception resolution approved and audited"
```

The attacker can also target any workspace ID, including the shared `workspace-portfolio` and any guest's `demo-<uuid>` workspace.

**Environment note:** a `next start` process from this project is currently listening on `0.0.0.0:3000` (PID 6668). The project folder has no `.env.local`, so that instance very likely uses the fallback secret and is reachable from the local network. To avoid touching the development database, the auditor did **not** test it directly.

**Remediation:** remove the fallback. Require `SESSION_SECRET` of at least 32 bytes at startup in all non-test environments. Add a test asserting that startup fails without it. Rotate any secret that has been used.

---

## SE-H1 — HIGH — Public demo credentials grant admin and approver roles

**Location:** `src/server/auth/session.ts:48-58`; `.env.example:12` (`NEXT_PUBLIC_DEMO_MODE=true`); `README.md` credential table; `src/app/login/page.tsx:3` (pre-filled analyst credentials, approver credentials displayed).

**Problem:** the README says local accounts are disabled in production unless `NEXT_PUBLIC_DEMO_MODE=true`. The shipped `.env.example`, which the quick start tells users to copy, sets exactly that value. With it set, the published admin and approver passwords work for anyone. All three named accounts share the single workspace `workspace-portfolio` (line 58), so a public visitor can approve exceptions in the shared tenant. The requirement "publicly accessible demo sessions cannot acquire unrestricted administrative privileges" is **not met**.

Note also that `administer` (`src/domain/policy.ts:9`) is never checked anywhere, so the administrator role has no distinct capability.

**Remediation:**
- Default `NEXT_PUBLIC_DEMO_MODE` to false in `.env.example`.
- When public demo mode is on, issue only guest sessions, each with its own workspace.
- Make elevated roles demonstrable only inside the visitor's own isolated workspace (for example, a role switcher scoped to `demo-*` workspaces), never on a shared tenant.

## SE-H2 — HIGH — Audit trail not atomic, and the hash chain forks

**Location:** `appendAudit`, `repository.ts:71-77`, called *after* the financial transaction commits (lines 102, 107, 120, 125, 147).

- It reads the previous hash and inserts with no lock and no transaction, so concurrent events share a predecessor. **Reproduced (P4):** 4 concurrent ingests produced 4 audit rows with the same `previous_hash`. The chain is a tree, not a chain.
- A crash or DB error between the business commit and `appendAudit` leaves a committed financial change with no audit event. `resolveException` runs three separate statements outside any transaction (line 125).
- The hash covers no timestamp or sequence, and no verifier exists anywhere. The "hash chained" UI badge (`src/app/app/settings/page.tsx:2`) is unverifiable.

**Remediation:** write the audit row inside the same transaction as the business mutation. Serialize chain appends per workspace with `SELECT … FOR UPDATE` on a chain-head row or an advisory lock. Include sequence and timestamp in the hash. Add a `verifyAuditChain(workspaceId)` service plus a test.

## SE-H3 — HIGH — The ML model is not used by the application

- `inferAnomaly` (`src/server/ml/inference.ts:5`) has **zero callers** in `src/` (0% coverage). `inference_records` is never written.
- The only non-null risk scores in the app are the **hard-coded seed constants** 0.82 and 0.66, tagged `model_version='logreg-synth-1.0.0'` (`repository.ts:62-65`). The Exception Center shows them as "ML risk score" (`src/app/app/exceptions/page.tsx:2`). Every exception created at runtime is "Not scored". **Reproduced (P9):** new overpayment exception → `risk_score=null, model_version=null`; `inference_records` count = 0.
- The Lambda worker returns `riskScore: 0.5` for every message (`aws/worker.ts:6`). **Reproduced (C2):** three messages → scores `[0.5, 0.5, 0.5]`.
- `HANDOFF.md` ("Exception evidence, risk scores", "Genuine … inference path") and `ARCHITECTURE.md` ("Model → Domain") present this as working ML.

The training pipeline itself is genuine (see SE-M10). The defect is the integration and the presentation.

**Remediation:** compute features from real payment and invoice context when an exception is created. Call `inferAnomaly`, persist an `inference_records` row, and set `exceptions.risk_score` and `model_version`. Have the worker load the same artifact and score real features. Remove the hard-coded seed scores, or compute them through the same path.

## SE-H4 — HIGH — The Workflow Lab reports predetermined outcomes

**Location:** `runSimulation`, `repository.ts:132-148`.

- `const outcome="invariant_preserved"` is assigned before any scenario runs (line 133) and returned unconditionally. **Reproduced (P6):** all six scenarios → `invariant_preserved`.
- `unauthorized_approval` (line 141) calls `requirePermission("finance_analyst","approve")` on a **literal**. It never calls `resolveException`. **Reproduced (P7):** run by an *administrator*, it still reports `denied:true`. With no open exception (P7b), it still reports `invariant_preserved`.
- `ai_unavailable` (line 143) returns an object literal; no provider or fallback code executes.
- `worker_timeout` (line 137) and `queue_failure` (line 139) only INSERT rows. No worker, queue, retry or recovery runs, and nothing ever advances those rows.
- `duplicate_payment` and `conflicting_events` (lines 135, 145) do call the real ingest service. But their evidence fields `allocationDuplicated:false` and `silentOverwrite:false` are literals, not measurements.
- No permission check: guests can run every scenario (HTTP H7 → 200).

**Remediation:** derive each outcome from post-condition queries (payment count, allocation sum versus `paid_cents`, exception status before and after). Exercise real code paths: `resolveException` with an analyst session, the AI adapter with a forced failure, and the outbox dispatcher with a failing publisher. Report `invariant_violated` when the checks fail.

## SE-H5 — HIGH — The AWS pipeline is disconnected

- **No SQS producer.** `@aws-sdk/client-sqs` is a dependency but is never imported. No code reads `RISK_QUEUE_URL`.
- **No outbox dispatcher.** `outbox_events` is written only by the `queue_failure` lab scenario (`repository.ts:139`), and nothing ever reads or delivers it. "Transactional outbox: live local" (`src/app/app/architecture/page.tsx:2`) is inaccurate.
- **The worker is a stub.** It always returns `riskScore: 0.5` (see SE-H3) and loads no model.
- **The worker is not idempotent.** Re-delivering the same SQS message produces a second callback with a fresh nonce, and the callback accepts it. **Reproduced (C1/C2):** `redelivery` → 200. There is no deduplication on `processingId` or `jobId`.
- **No terminal-state guard.** A job that is `completed` can be overwritten to `failed` by a later callback (C1: `completedThenFailed: 200, finalJobStatus: failed`).
- **The callback never updates any exception or finance record.** It updates `processing_jobs` only (`src/app/api/internal/jobs/result/route.ts:2`), and has no workspace check on `jobId`.
- **Error and table hygiene.** The replay error returns the raw Postgres message (409 body: `duplicate key value violates unique constraint "callback_nonces_pkey"`). The nonce table is never pruned.

What *is* sound: HMAC over `timestamp.nonce.body`, a ±5-minute window, timing-safe compare, schema validation, and transactional nonce insert (verified: valid → 200, same nonce replay → 409, tampered or stale → rejected).

## SE-H6 — HIGH — Exception resolution is incomplete

**Location:** `resolveException`, `repository.ts:123-126`.

- The status UPDATE, the review INSERT and the audit INSERT run as three independent statements, with no transaction.
- Resolution has **no financial effect**. **Reproduced (P8):** resolving the overpayment exception leaves invoices unchanged and the payment status `exception`. No refund, credit, allocation or write-off is supported.
- The only review action is `'approved'`. There is no reject, request-more-info, assign or investigating state (status is `open` or `resolved`).
- The UI exposes "Approve resolution" to every role (server-side 403 is correct). The review history is never displayed.

## SE-H7 — HIGH — Generative AI is absent

No LLM SDK, provider adapter, prompt, schema, or output validator exists. `AI_PROVIDER`/`AI_API_KEY` (`.env.example:6-7`) are never read. `DECISIONS.md` ADR-004 states "A provider interface exists for credentialed inference", which is false. The deterministic "non-AI fallback" text (`src/app/app/ai-insights/page.tsx:2`) is honestly labelled, but it is a single fixed sentence per exception type, not an evidence summary.

## SE-H8 — HIGH — Documentation overstates completion

| Claim | Location | Reality |
|---|---|---|
| "READY FOR USER TESTING" | `HANDOFF.md` §1 | SE-C1, SE-C2 open |
| "Six real, persisted Workflow Lab simulations" | `HANDOFF.md` §2 | SE-H4 |
| "Model → Domain" (diagram); "Idempotent TypeScript worker"; "Transactional outbox … live local" | `ARCHITECTURE.md`; `architecture/page.tsx:2` | SE-H3, SE-H5 |
| "A provider interface exists" | `DECISIONS.md` ADR-004 | SE-H7 |
| "hosted PostgreSQL through the documented adapter" | `DECISIONS.md` ADR-003 | No adapter exists (SE-M12) |
| "Workspace ID … included in every persistence query" | `SECURITY.md` | Callback UPDATE by job ID only; customer FK unscoped (SE-M3) |
| "Cross-workspace identifiers are checked in every write service" | `DATABASE.md` | False (SE-M3) |
| "JSON-only mutation endpoints … non-simple JSON mutations" | `SECURITY.md` | `text/plain` accepted (SE-L4) |
| "Deterministic baseline F1 0.5773" | `ML_EVALUATION.md` | Same model at threshold 0.25 (SE-M10) |
| Allocation and paid-balance update "in one transaction" implying safety | `ARCHITECTURE.md` | Guard failure silently commits (SE-C1) |

---

## SE-M1 — Concurrent replay is not idempotent
`repository.ts:112` checks for duplicates outside the transaction. **P2:** two simultaneous identical events → one succeeds, the other throws `duplicate key value violates unique constraint "payments_workspace_id_source_event_id_key"`, which surfaces as HTTP 400 with the raw DB message. No corruption occurs; the unique constraint holds. **Fix:** use `INSERT … ON CONFLICT (workspace_id, source_event_id) DO NOTHING RETURNING`, then compare against the stored row.

## SE-M2 — Conflict detection is incomplete
`repository.ts:112`: `same = amount_cents equal && currency equal`. A replay with the same source ID but a different `invoiceReference` or `customerId` is treated as an identical duplicate and returns 200 "Duplicate delivery ignored". The conflicting evidence is discarded with no exception. `fingerprint` (line 113) is stored but never compared. **Fix:** fingerprint every economically significant field and compare fingerprints.

## SE-M3 — Cross-workspace customer reference
`ingestAndReconcile` never validates `customerId` against the session workspace. The FK only checks existence. **P3:** a payment in workspace B stored `customer_id = cust-northstar<workspaceA>`. **Fix:** check `customers.workspace_id = session.workspaceId`, or use composite FKs `(workspace_id, id)`.

## SE-M4 — The CSV sample is broken
**H6:** importing `samples/payments.csv` gives `accepted:1`, with rows 2 and 3 rejected by `payments_customer_id_fkey`. Real IDs are `cust-northstar<workspaceId>` (`repository.ts:34`), which the UI never displays. The parser is a naive `split(",")` (`src/app/api/payments/import/route.ts:3`). CSV source IDs skip the regex enforced on manual entry. Raw DB errors are returned to the client. **Fix:** accept customer *names* or public codes, or display IDs. Map DB errors to stable messages. Add a test importing the bundled sample.

## SE-M5 — Number collisions
`createOrder` uses `SE-${Date.now().toString().slice(-6)}` (`repository.ts:100`); `confirmAndInvoice` uses `INV-YYYY-<last 6 digits of ms>` (line 107). **P14:** three concurrent orders → one fails with `orders_workspace_id_order_number_key`. Values also repeat every 1,000 seconds. **Fix:** use a per-workspace sequence table, or a DB sequence.

## SE-M6 — Overdue and voided handling
No code ever sets `status='overdue'` (**P10:** an invoice 10 days past due still shows `issued`). The overdue KPI is computed in the dashboard query only. `decideReconciliation` doesn't reject `voided` invoices (`src/domain/reconciliation.ts:31-34`). **P5:** a payment to a voided invoice was allocated, and the invoice was rewritten to `partially_paid`. This is latent, since no void action exists yet. A `draft` invoice status would make Zod throw (line 15).

## SE-M7 — No abuse controls
There is no rate limiting or lockout on `/api/session/login`. `GET /api/session/demo` (unauthenticated) mints a new workspace, and the first page render seeds it with about 20 rows (`ensureWorkspace` is called from every list function). Unbounded growth is possible. Mutating DB state from GET page renders is also a design smell.

## SE-M8 — Order-to-cash gaps
- No customer creation API or UI; the only `INSERT INTO customers` is in the seed (`repository.ts:34`).
- `createOrder` accepts exactly one line item (`repository.ts:96-101`; `src/app/api/orders/route.ts:2`).
- No confirm-only or cancel action (`confirmed` and `cancelled` exist only in the CHECK constraint).
- No per-invoice payment or allocation history view.

## SE-M9 — Governance is mostly presentational
`src/app/app/governance/page.tsx:2` shows five "active" policies. Only "Analysts and guests cannot approve" is enforced. "High-risk recommendations require human approval" and "Uncertain model output routes to investigation" have no implementation, because no recommendations or model outputs exist. The `model_versions` row has `metrics={"status":"run npm run ml:evaluate"}` and `approved=true` (**P12**), and is never read by the UI (the UI reads the JSON artifact). There are no AI decision records, overrides, or AI failure records.

## SE-M10 — ML evaluation methodology
The pipeline is genuine and reproducible: two fresh runs of `train(false)` were byte-identical to the committed artifact, excluding `generatedAt`. Weaknesses:
- The threshold is chosen by maximising F1 on the **test** set (`ml/train.ts:11`). Re-tuning on the train set happened to give the same 0.33, so the reported numbers stand, but the procedure leaks.
- `baselineF1` (`ml/train.ts:9`) is the **same model** scored at threshold 0.25, not an independent baseline. Real baselines on the same holdout: predict-all-anomaly F1 = 0.5075; a two-feature rule F1 = 0.5439. The model's 0.591 is a modest lift.
- Labels are drawn from a logistic function of the very features fed to the model, so the task is circular. This is documented, but should be stated plainly wherever metrics appear.
- `inferAnomaly`'s "supportingIndicators" rank **raw feature values**, not contributions. For a normal payment it lists `daysFromInvoice: 30` as the top indicator. This is misleading.

## SE-M11 — SAM / IaC
`aws/template.yaml:20` uses `Handler: dist/worker.handler` with no `CodeUri` and no esbuild `Metadata`, and no build script produces `dist/`. `sam build` would not produce a deployable TS bundle as written. The callback secret is a plaintext Lambda environment variable. There is no DLQ-depth or error alarm. `scripts/validate-aws.ts:4-6` only checks that six substrings appear in the file. The SAM CLI was not available, so service validation is **BLOCKED**.

## SE-M12 — Persistence layer claims
`db/schema.ts` (Drizzle) is never imported by the app. It omits tables (`order_items`, `payment_allocations`, `exceptions`, `exception_reviews`, `inference_records`, `outbox_events`, `workflow_events`, `callback_nonces`) and defines a `risk_score` column on `processing_jobs` that the migration lacks. The `postgres` driver is unused, and `DATABASE_URL` is ignored. `src/server/db/client.ts` is PGlite-only and runs the full migration SQL on every boot. There is no migration ledger.

## SE-M13 — Test suite depth
See `TEST_COVERAGE_ASSESSMENT.md`. Coverage: 33.1% statements and 29.1% branches overall, with 0% for every API route, `parse.ts`, `inference.ts` and `train.ts`. The single E2E test only asserts that 11 nav links are visible.

---

## LOW findings
- **SE-L1:** `src/app/api/session/login/route.ts:3` calls `Input.parse` outside any try. `{}` → HTTP 500 (H2), with a ZodError stack in the server log.
- **SE-L2:** no logout route or session revocation. The 8-hour bearer cookie cannot be invalidated.
- **SE-L3:** no CSP, X-Frame-Options or HSTS headers (H13).
- **SE-L4:** `request.json()` ignores Content-Type. A `text/plain` POST with a foreign `Origin` succeeded (H11, 201). SameSite=Lax blocks cookies on cross-site POSTs in current browsers, so practical CSRF risk is low, but the documented "non-simple JSON" defence does not exist.
- **SE-L5:** `account.password !== password` (`session.ts:57`) is not constant-time. The login page pre-fills analyst credentials and prints the approver password.
- **SE-L6:** "Payments received" shows the sum of allocated `paid_cents`, not cash received. Unmatched cash and overpayments are excluded. "Reconciliation completion" counts partial matches as matched. `analytics().workflows` is queried but never rendered. There is no latency metric.
- **SE-L7:** the Architecture Explorer node list is a hard-coded array (`architecture/page.tsx:2`) with inaccurate statuses (see SE-H8).
- **SE-L8:** the enclosing Git repository is the user's home directory, with no commits, and the project folder is untracked. Source files are condensed into very long single lines; `repository.ts` holds the whole persistence layer with `any` typing (lint rule disabled in `eslint.config.mjs:10`). `recharts`, `postgres` and `@aws-sdk/client-sqs` are unused.
- **SE-L9:** `ml/train.ts` overwrites `ml/artifacts/anomaly-model.json` on every `ml:evaluate`, so `npm run verify` mutates a tracked file through `generatedAt`.
- **SE-L10:** no Playwright browser bundle exists under `%LOCALAPPDATA%\ms-playwright`. The E2E test was run here using the system Chrome channel; it passed.
