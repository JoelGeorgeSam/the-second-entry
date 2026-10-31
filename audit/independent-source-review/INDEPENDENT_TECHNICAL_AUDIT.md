# Second Entry — Independent Technical Audit

| | |
|---|---|
| Audit date | 2026-10-30 |
| Scope | `C:\Users\user\Documents\The Second Entry` (all source, configuration, schema, ML, AWS, tests and docs) |
| Auditor role | Independent reviewer. Not involved in the implementation. Audit-only: no project file was modified |
| **Final classification** | **C. NOT READY — CRITICAL ENGINEERING DEFECTS** |

Companion reports:
- `REQUIREMENTS_COVERAGE_MATRIX.md` (146 requirements)
- `CRITICAL_FINDINGS.md` (33 findings)
- `TEST_COVERAGE_ASSESSMENT.md`
- `RECOMMENDED_FIX_PLAN.md`
- `IMPLEMENTATION_AGENT_FIX_PROMPT.md`
- `CHATGPT_REVIEW_FILE_LIST.md`
- `evidence/` (probe scripts and raw outputs)

---

## 1. Executive summary

Second Entry is a compact (~110 KB of source) Next.js 16 modular monolith. Its domain core is real and mostly sound:
- integer-cent money
- deterministic reconciliation rules
- server-side role checks for approval
- a real embedded PostgreSQL (PGlite) with sensible constraints
- a genuine, reproducible logistic-regression training pipeline

Every verification command the previous agent reported passes when re-run independently: 27/27 tests, the E2E test, lint, typecheck, build, ML reproduction, the AWS "validation" and npm audit.

Those passes hide serious problems:

1. **Financial corruption under concurrency (CRITICAL, SE-C1).** `ingestAndReconcile` decides on a stale invoice snapshot read outside the transaction, then ignores a guarded UPDATE that matched zero rows. Two concurrent exact payments were both marked *reconciled*, with allocations totalling **2× the invoice**, while `paid_cents` recorded only one payment. This was reproduced deterministically at the service layer. It was not reproduced over local HTTP, where single-process PGlite serialized requests (6 rounds).
2. **Authentication bypass (CRITICAL, SE-C2).** The session HMAC falls back to a secret published in the source. A forged administrator cookie was accepted by a `next start` server and used to approve an exception (HTTP 200). A `next start` instance of this project is currently listening on `0.0.0.0:3000` without a `.env.local`.
3. **Features presented as working are stubs or literals (HIGH).**
   - The ML model is never called by the app; the only "ML risk scores" are hard-coded seed constants.
   - The Lambda worker always returns 0.5.
   - There is no SQS producer and no outbox dispatcher.
   - The Workflow Lab returns `invariant_preserved` unconditionally, and its "unauthorized approval" test is a tautology.
   - Generative AI is entirely absent.
4. **Audit-trail integrity is weaker than claimed (HIGH, SE-H2).** It is non-atomic with business writes, and the hash chain forks under concurrency (reproduced).

The project is a credible foundation, and the fix plan is incremental rather than a rewrite. It is not ready for user testing as a demonstration of correct financial automation, and several portfolio claims are currently untrue.

## 2. Methodology

| Phase | Work performed |
|---|---|
| 1. Inventory | Listed every non-generated file. Read all 7 root docs plus 5 supporting docs, `package.json`, configs, CI. Noted that the enclosing Git repo is the user's home directory with no commits; the project folder is untracked |
| 2. Requirements mapping | Every source file read in full (the condensed one-line style was read with line numbers). 146 requirements mapped to file:line |
| 3. Critical correctness | Traced the payment → reconciliation → allocation → invoice path, the audit chain, the session and authorization path, and tenancy scoping |
| 4. AI/ML | Read the generator, training, artifact and inference code. Re-ran training twice in isolation. Recomputed metrics, alternative thresholds and true baselines. Searched for every call site |
| 5. AWS / reliability | Read the worker, contracts, signing, callback route, SAM template and validator. Searched for SQS usage and outbox consumers |
| 6. Verification | Created an isolated scratch copy (fresh `npm ci`). Ran lint, typecheck, tests, coverage, build, npm audit and E2E (system Chrome). Wrote 18 service-level probes (in-memory DB) and 3 HTTP probe scripts against a scratch `next start` on :3100 |
| 7. Findings | 2 CRITICAL, 8 HIGH, 13 MEDIUM, 10 LOW |
| 8. Readiness | Classification below |

**Safety controls observed:**
- No project file was edited. The `ml/artifacts/anomaly-model.json` SHA-256 is unchanged (`b4ea12a0…2e28`).
- `data/pglite` was never opened.
- The running :3000 server (PID 6668) was never sent a request.
- No git, deploy, cloud, paid, or global-install action was taken.
- The scratch server was stopped after use.

## 3. Architecture

**Structure:**
- `src/domain` holds pure money, reconciliation and policy logic.
- `src/server` holds session, persistence and inference.
- `src/app` holds pages and 9 route handlers.
- `ml/`, `aws/` and `db/` are separate top-level folders.

The separation is reasonable on paper.

**In practice:**
- **All persistence and orchestration lives in one 150-line file** (`src/server/db/repository.ts`): raw SQL strings, `any` row types, seeding, audit, reconciliation, exceptions, analytics and the Workflow Lab. Domain boundaries exist only for the pure functions.
- **Source is condensed onto single very long lines.** Most route and page files are 1–3 physical lines. Reviewability, diffs and blame are poor (SE-L8).
- **Drizzle ORM is declared but unused.** `db/schema.ts` covers 8 of 16 tables and diverges from the SQL. The `postgres` driver is unused and `DATABASE_URL` is ignored. "Hosted PostgreSQL through the documented adapter" (ADR-003) does not exist (SE-M12).
- **Side-effecting reads.** Every list function calls `ensureWorkspace`, which seeds the workspace on first GET. Page renders therefore write to the database (SE-M7).
- **The Architecture Explorer is a hard-coded array** with inaccurate statuses (outbox "live local", "idempotent worker") (SE-L7, SE-H8).

**Assessment:** the architecture is appropriate for the goal. Implementation layering is thin, and several drawn components (outbox → SQS → Lambda → model → domain) are not connected in code.

## 4. Financial correctness deep audit

| # | Invariant | Verdict | Evidence |
|---|---|---|---|
| 1 | Exact arithmetic | **Holds** | Integer cents end to end; `bigint` columns; tax half-up in integers. Exact even at the validated upper bound (P11) |
| 2 | No duplicate allocation per source event | **Holds** | `UNIQUE(workspace_id, source_event_id)` and `UNIQUE(payment_id)` on allocations |
| 3 | Partial payments accumulate correctly | **Holds sequentially; fails concurrently** | 27 × 20000 = 540000 correct over HTTP; P1b concurrent: allocations 900000 vs `paid_cents` 300000 |
| 4 | Explicit overpayment policy | **Partial** | Routed to an exception with no allocation. No refund, credit or apply policy; resolution changes nothing (P8) |
| 5 | Invalid currency rejected | **Holds** | CAD literal at route, repository and DB CHECK on invoices/orders (payments.currency has no CHECK, but the repository rejects non-CAD) |
| 6 | Repeated requests idempotent | **Holds sequentially; fails concurrently** | P2: concurrent replay → 400 with a raw DB error. Conflicts on reference/customer silently ignored (SE-M2) |
| 7 | Concurrent allocations cannot exceed balance | **FAILS** | P1: allocations 1084800 vs total 542400; both payments "reconciled". The `CHECK(paid_cents<=total_cents)` never fires because the UPDATE matches 0 rows and the count is never checked |
| 8 | Transactions protect related updates | **Partial** | Payment, allocation, invoice and exception are in one transaction, but the decision input is read outside it. `resolveException` and all audit writes are outside any transaction |
| 9 | Failed operations leave no partial state | **Partial** | Business transaction is atomic. Audit is appended after commit, so a failure leaves an unaudited change. `resolveException` can leave a resolved exception with no review row |
| 10 | Approval cannot be bypassed | **FAILS** | The role check itself is sound (H8 guest → 403), but sessions are forgeable (SE-C2), and public admin credentials are enabled by the shipped `.env.example` (SE-H1) |
| 11 | Conflicting events cannot overwrite evidence | **Partial** | Amount/currency conflicts are rejected and nothing is overwritten. Reference/customer conflicts are discarded as "duplicates". Callback results can overwrite a terminal job state (C1) |
| 12 | Durable audit events | **Partial** | Events are written for the main actions, but non-atomically, with a forkable chain (P4) and no verifier |

**Per-operation trace of `ingestAndReconcile`:**
- `src/server/db/repository.ts:111`: validate
- `:112`: duplicate check, outside the transaction
- `:114`: invoice read, outside the transaction, with no lock
- `:115`: decision
- `:116-120`: transaction
- `:118`: guarded UPDATE, return value ignored
- `:120`: audit, after commit

## 5. Business logic by module (abridged; full detail in the matrix)

| Module | Assessment |
|---|---|
| Customers and orders | Single-line orders only. No customer creation; no confirm or cancel. Exact totals. One invoice per order is DB-enforced. Numbers derived from `Date.now()` collide (P14) |
| Invoices | Totals, due dates and paid/partial states are correct sequentially. `overdue` status is never set. Voided invoices are payable (latent). No payment history view |
| Payments | Manual ingestion is solid. CSV importer works, but the bundled sample rejects 2 of its 3 valid rows (H6). No synthetic provider-event feed. Cross-workspace customer accepted (P3) |
| Reconciliation | Rules are correct and clearly prioritised. Concurrency-unsafe (SE-C1). Currency-mismatch branch unreachable. No normalisation for references |
| Exceptions | Created with type and severity (high for overpayment only) and minimal evidence. Only an approve action; no investigation state, rejection, or financial resolution |
| Analytics | Derived from DB records (not hard-coded). "Payments received" shows *applied* cash, not received cash. Workflow reliability queried but never rendered; no latency metric |

## 6. Security

| Area | Status |
|---|---|
| Session signing | HMAC-SHA256 with timing-safe compare and expiry; sound in design. **Fallback secret is public → CRITICAL** |
| Roles | `approve` is enforced server-side, and verified (route 403 and service test). `administer` is never used |
| Demo exposure | `.env.example` enables public credentials. All named roles share `workspace-portfolio`. Guests are isolated per UUID workspace (good) |
| Tenancy | Most queries are workspace-scoped. Payment `customer_id` and the callback `jobId` are not |
| Input handling | Zod on routes, strict decimal regex, CSV formula/NUL guards. Login → 500 on bad body. Raw DB errors returned to clients |
| CSRF | SameSite=Lax only; `text/plain` accepted from a foreign Origin |
| Headers | No CSP, XFO or HSTS |
| Rate limiting | None. Unauthenticated demo creation is unbounded |
| Secrets | Callback secret required (fails closed, good). Session secret fails open (bad). No secrets in client bundles were found by inspection |
| Dependencies | `npm audit`: 0 vulnerabilities |

## 7. AI/ML

**Genuine:**
- A seeded synthetic generator (1,600 rows, 80 customer groups).
- A group-based train/test split, with standardisation fitted on train only.
- Batch gradient-descent logistic regression with L2 regularisation.
- A JSON artifact and a sigmoid inference function.

Re-running training twice produced artifacts byte-identical to the committed file (excluding `generatedAt`). Reported metrics reproduce exactly: P 0.4975, R 0.7279, F1 0.5910, Acc 0.6575, AUC 0.7223, TP 99 / FP 100 / TN 164 / FN 37.

**Problems:**
- **Not integrated (HIGH, SE-H3).** `inferAnomaly` has no callers. `inference_records` is never written. New exceptions have `risk_score = null`. The two seeded scores (0.82, 0.66) are literals tagged with the model version and shown as "ML risk score". The Lambda returns 0.5 for everything.
- **Methodology (SE-M10).**
  - The threshold is selected on the test set. Re-selecting on train gave the same 0.33, so the numbers stand, but the procedure leaks.
  - "Baseline F1 0.5773" is the same model at threshold 0.25. True baselines are predict-all F1 0.5075 and a two-feature rule F1 0.5439.
  - Labels are generated from the model's own features, so the task is circular. This is acknowledged in the docs.
  - Explanations rank raw feature magnitudes rather than contributions.
- **Registry.** The `model_versions` row holds placeholder metrics yet is `approved=true`. The UI ignores it and reads the JSON artifact.

**Generative AI:** absent. No provider, abstraction, prompts, schemas or validation exist, despite ADR-004 saying a provider interface exists. The fallback is honestly labelled "non-AI", but it is a generic sentence, not an evidence summary. There is no AI → financial-write path, so the claim that the LLM cannot mutate ledgers holds trivially.

**Governance:**
- Real enforcement: role-gated approval only.
- Policies shown but not enforced: 3 of 5 displayed (+1 trivially true).
- Not present: AI decision records, overrides, AI failure records, and recommendation-to-decision traceability.

## 8. AWS and reliability

| Component | Reality |
|---|---|
| Message and result schemas | Real (Zod, versioned) |
| HMAC callback | Real and verified. Same-nonce replay → 409; stale or tampered → 401 |
| Lambda worker | Parses messages and posts a signed callback, but the **score is constant 0.5**. Not idempotent: redelivery yields a duplicate accepted callback |
| SQS producer | **Missing.** The SDK dependency is unused |
| Transactional outbox | **Table only.** Written solely by a lab scenario; no dispatcher |
| Job tracking | Rows created only by the lab. Callback can flip `completed` → `failed` |
| SAM template | Queue, DLQ (maxReceiveCount 3), reserved concurrency 2, partial-batch responses, 7-day logs, least-privilege poller policy. **Not deployable as written** (no CodeUri or esbuild build). Secret is a plaintext environment variable. No alarms |
| "AWS validation" | Substring presence check only. SAM CLI unavailable → service validation BLOCKED |

**Cost risk if deployed:** low. SQS, a small Lambda with reserved concurrency 2, and 7-day logs are modest; free-tier eligibility must not be assumed, as `AWS_DEPLOYMENT.md` correctly notes. Moving the secret to Secrets Manager adds about USD 0.40/month; SSM SecureString standard parameters are free. No NAT, VPC or always-on resources are defined.

**Deployable safely after authorisation?** Not yet. Deployment would create infrastructure that does no real work, because nothing publishes to the queue and the worker returns a constant.

## 9. Failure Simulation Lab

| Scenario | Exercises real logic? | Verdict |
|---|---|---|
| Duplicate payment | Yes (real ingest twice) | Evidence fields `allocationDuplicated:false` are literals; outcome is constant |
| Worker timeout | No (inserts a `retry_pending` row) | Predetermined |
| Queue failure | No (inserts job and outbox rows; nothing delivers or retries) | Predetermined |
| Unauthorized approval | No (`requirePermission("finance_analyst","approve")` on a literal) | Tautology; an administrator also gets `denied:true` (P7) |
| AI outage | No (object literal) | Predetermined |
| Conflicting events | Yes (real conflict path) | `silentOverwrite:false` is a literal |

All runs are persisted (`workflow_events` plus audit), but the outcome label is fixed at `invariant_preserved` before any scenario runs (`repository.ts:133`).

## 10. Frontend/backend integration

- Pages are server-rendered from DB queries, and forms post JSON to validated route handlers, so there is no business logic in client state.
- The Approve button appears for every role, but the server correctly returns 403.
- "Explore architecture" on the public landing page redirects to `/login`.
- E2E covers navigation only.

## 11. Testing

The reported suite passes (27/27, plus E2E 1/1 via system Chrome). Coverage is 33.1% statements and 29.1% branches; every API route, the decimal parser, error mapping, inference and training are at 0%.
- No concurrency, route-authorization, secret-handling, tenancy, CSV, exception-lifecycle or full-workflow tests exist.
- One integration test asserts values that are hard-coded in the code under test.

Details: `TEST_COVERAGE_ASSESSMENT.md`.

## 12. Deployment readiness

- **Local:** runs, builds and passes its checks. Usable for UI walkthroughs, but correctness under concurrency, authentication safety and several headline features fail.
- **Vercel:** not ready. PGlite cannot persist on Vercel; no PostgreSQL adapter exists; secrets fail open; demo credentials are enabled by the example env. File tracing of `db/migrations` under Vercel is NOT VERIFIED.
- **AWS:** not ready (see §8). No resources were created or verified live.

## 13. Limitations of this audit

- No live AWS or Vercel verification (out of scope and unauthorised). SAM service validation BLOCKED (no SAM CLI).
- SE-C1 was reproduced at the service layer only. HTTP-level reproduction on local single-process PGlite did not trigger in 6 rounds. No multi-connection PostgreSQL environment was available.
- The E2E test ran with system Chrome rather than Playwright's bundled Chromium. The bundle is absent and the auditor did not download browsers.
- The running instance on :3000 was intentionally not probed. Its exposure to SE-C2 is inferred from the absent `.env.local` and the `next start` command line.
- No external LLM test (no provider exists). No load testing.
- A separate `audit/independent-browser-review/` folder exists. It was not authored by this auditor, its contents were not read, and it was not relied on. Its files (reports and screenshots) were being created or updated by another process during this audit. That process may also be the one serving `next start` on :3000. Its screenshot file names are consistent with findings H1 and H6 here.

## 14. Final determination

### **C. NOT READY — CRITICAL ENGINEERING DEFECTS**

**Rationale:**
- A confirmed path to ledger corruption exists in the core reconciliation transaction (SE-C1). The fix is missing, and so is any test that would detect the problem.
- Any deployment without `SESSION_SECRET`, including the `next start` currently running, accepts forged administrator sessions (SE-C2). Separately, the shipped example configuration exposes admin credentials publicly (SE-H1).
- Several capabilities central to the project's stated purpose (ML inference in the workflow, AWS asynchronous processing, failure simulation, generative AI, governance enforcement) are absent, stubbed, or report predetermined results, while the documentation presents them as complete (SE-H3 to SE-H8).

The domain core, schema, signing and ML training are solid foundations. Completing WP-1 and WP-2 removes the critical blockers. Completing WP-3 to WP-7 would make the project's claims truthful, at which point a re-audit could reasonably reach **A. Ready for manual user testing**.
