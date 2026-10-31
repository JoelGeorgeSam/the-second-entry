# Independent Remediation Verification and Deployment-Readiness Audit

Evidence date: 2026-10-31 (Asia/Riyadh)  
Project: `C:\Users\user\Documents\The Second Entry`

## 1. Executive readiness verdict

**PARTIALLY READY — CORRECTIONS OR VERIFICATION REQUIRED**

The remediated application is materially better than the version described by the two original independent audits. Disposable local testing verified the core financial invariants, atomic audit-chain behavior, runtime ML inference, role enforcement, CSV happy path, local outbox/worker/callback pipeline, and the main browser workflows. No critical ledger corruption, tenant-isolation bypass, public-secret session forgery, or analyst approval bypass was reproduced.

It is not yet credible to begin a deploy-oriented Vercel phase. Real multi-connection PostgreSQL execution was unavailable; production silently falls back to filesystem PGlite when `DATABASE_URL` is absent; migrations run automatically during application startup without a cross-instance migration lock; aggregate serverless connections are not bounded by the per-process pool size; and nothing in the application schedules or invokes the outbox dispatcher. A Vercel deployment could therefore build and serve while leaving durable jobs permanently pending.

A planning-only Vercel preparation task is safe. A task that provisions, previews, migrates, or deploys is **not** recommended until the blockers in sections 17 and 18 are corrected or independently verified.

## 2. Source comparison with the audited version

**The current source materially differs from the version captured by the original audits.** This is not merely a documentation-status change. Important current implementation changes include:

- guarded invoice updates and row locking, atomic idempotency, full economic fingerprints, workspace checks, transactional allocations, and transactional exception/job/outbox/audit writes;
- fail-closed session-secret validation, server-gated role accounts, synthetic role workspaces, logout, and origin/content-type checks on core JSON mutation routes;
- locked audit heads, sequence-aware chain hashes, and an independent chain verifier;
- runtime feature extraction and model inference, persisted inference provenance, a worker that scores supplied features, and a typed deterministic non-network fallback provider;
- a durable outbox, retry/dead-letter dispatcher, queue adapters, signed terminal callback handling, and state-derived Workflow Lab outcomes;
- quoted CSV parsing, external customer codes, per-row errors, and per-workspace document sequences;
- PostgreSQL selection through `DATABASE_URL`, migration-ledger support, stronger security headers, mobile navigation, and broader tests.

Remaining application breadth is still substantially narrower than the product description: customer creation, multi-line orders, draft editing, explicit confirm/cancel, invoice detail/history/search, broad analytics, and PDF export are absent.

## 3. Reproduced audit claims and changed facts

| Original audit claim | Independent current result |
|---|---|
| Concurrent payments can corrupt `paid_cents` | Not reproduced against disposable PGlite. Exact, partial, overpayment, replay, and rollback probes preserved the required invariants. Real PostgreSQL execution is blocked. |
| Public fallback signing secret permits elevated forgery | Retired/fallback, absent, short, and placeholder secrets were rejected. A validly signed malformed payload still throws during JSON parsing instead of returning a stable rejection. |
| Audit chain forks and business/audit writes are non-atomic | Remediated locally. Twenty concurrent appends formed a linear chain; forced audit failure rolled the business transaction back; intentional tampering was detected. |
| New exceptions are not scored | Changed. New and seeded exceptions receive model 1.1.0 inference records with features, score, threshold, contributions, artifact hash, and status. |
| AWS worker returns a constant and local recovery is simulated by literals | Changed locally. The worker computes from input features, the dispatcher retries/dead-letters, signed callbacks persist terminal state, and Workflow Lab derives its result from observed state. No live AWS execution was performed. |
| Bundled CSV produces the wrong result and hides row errors | Changed for the bundled sample: exactly 3 accepted and 1 rejected, with visible row-level error and idempotent re-import. A leading-minus formula-like value is still accepted. |
| Document numbers are timestamp-based and collision-prone | Changed. Transactional per-workspace sequences produced 34 distinct numbers in the probe. |
| Role logins do not work; guest approval is the only positive path | Changed. Server-gated analyst/approver/admin logins work with isolated workspaces; analyst approval is denied and approver approve/reject paths persist reasons and audit history. No meaningful admin-only capability exists. |
| Logout/mobile navigation/immediate refresh are absent or broken | Changed. Logout and protected-route redirect, immediate refresh, and Escape/focus-return mobile navigation passed. |
| PostgreSQL production behavior is established | Still not established by execution. Adapter code exists, but no real PostgreSQL service was available. |

## 4. Independent closure matrix

Statuses below were derived from current code and reproduced evidence, not copied from `FINDING_CLOSURE_MATRIX.md`.

### Source-review findings

| ID | Status | Independent basis |
|---|---|---|
| SE-C1 | PARTIAL | Local races and invariants pass; structural PostgreSQL row locks/guarded updates look sound, but real multi-connection PostgreSQL is BLOCKED. |
| SE-C2 | PARTIAL | Weak/known secrets fail closed, but a correctly signed malformed payload throws and token claims are not schema-validated. |
| SE-H1 | VERIFIED FIXED | Demo roles are server-gated, default off, and receive isolated synthetic workspaces. |
| SE-H2 | VERIFIED FIXED | Atomic audit writes, locked heads, linear concurrent chain, and tamper detection reproduced. |
| SE-H3 | VERIFIED FIXED | Runtime and seeded exceptions use genuine persisted model inference; worker scoring is feature-dependent. |
| SE-H4 | VERIFIED FIXED | Workflow Lab exercises real services and can return `invariant_violated` under a disposable negative control. |
| SE-H5 | PARTIAL | Full local outbox/worker/callback pipeline passes; no live SQS/Lambda and no runtime dispatcher trigger exists. |
| SE-H6 | VERIFIED FIXED | Approve/reject/note lifecycle and atomic audit history reproduced. |
| SE-H7 | PARTIAL | Typed deterministic evidence-specific provider and safe fallback pass; no live provider is implemented or claimed verified. |
| SE-H8 | PARTIAL | Core technical docs are substantially honest, but landing/governance copy overstates cloud readiness/policy enforcement and the payment-page CSV header is wrong. |
| SE-M1 | VERIFIED FIXED | Atomic concurrent replay produced one financial effect and idempotent responses. |
| SE-M2 | VERIFIED FIXED | Full normalized economic fingerprint rejects conflicting reuse without overwriting stored evidence. |
| SE-M3 | VERIFIED FIXED | Cross-workspace customer use is rejected before financial insertion. |
| SE-M4 | PARTIAL | Bundled CSV and RFC-style quoting pass; leading-minus formula-like input is accepted and UI header documentation mismatches the parser. |
| SE-M5 | VERIFIED FIXED | Transactional workspace-scoped sequences did not collide under concurrency. |
| SE-M6 | PARTIAL | Draft/voided allocation is rejected and overdue is payable; overdue remains derived rather than maintained by a scheduler/status lifecycle. |
| SE-M7 | PARTIAL | Seeding moved to explicit session creation and core mutations validate JSON/origin; durable rate limiting/expiry cleanup are absent and logout omits the same checks. |
| SE-M8 | NOT FIXED | Customer creation, multi-line orders, draft edit, explicit confirm/cancel, and invoice detail remain absent. |
| SE-M9 | PARTIAL | Inference/review links and human resolution are persisted; governance policies are not a complete enforced registry. |
| SE-M10 | VERIFIED FIXED | Distinct train/validation/test groups, validation-only threshold choice, baselines, contributions, and dry-run reproduction pass. |
| SE-M11 | PARTIAL | Nine structural SAM assertions pass; service-side/SAM CLI validation is BLOCKED. |
| SE-M12 | BLOCKED | PostgreSQL adapter exists, but no real service was available; Drizzle remains incomplete/non-authoritative. |
| SE-M13 | PARTIAL | 39 tests and 3 browser tests pass; statement and branch coverage remain below 80%. |
| SE-L1 | VERIFIED FIXED | Malformed login returns stable 400. |
| SE-L2 | VERIFIED FIXED | Logout clears the cookie and protected navigation redirects to login. |
| SE-L3 | VERIFIED FIXED | CSP, frame, MIME, referrer, permissions, and production HSTS headers were observed. |
| SE-L4 | PARTIAL | Core JSON mutations return 415/403, but cross-origin `text/plain` logout returns 200. |
| SE-L5 | VERIFIED FIXED | Timing-safe comparison is used and elevated credentials are not rendered in client-visible login content. |
| SE-L6 | NOT FIXED | Latency/trend/filter analytics breadth remains absent or limited. |
| SE-L7 | VERIFIED FIXED | Architecture documentation distinguishes local/code-ready/not-deployed status. |
| SE-L8 | PARTIAL | Remediated modules are typed; condensed legacy files and the non-authoritative Drizzle schema remain. |
| SE-L9 | VERIFIED FIXED | ML evaluation is non-writing unless explicitly passed a write option. |
| SE-L10 | VERIFIED FIXED | Playwright uses installed system Chrome; 3/3 checked-in E2E tests pass. |

### Browser-review findings

| ID | Status | Independent basis |
|---|---|---|
| F-01 | VERIFIED FIXED | Server-gated isolated role sessions and approver path pass. |
| F-02 | VERIFIED FIXED | New exception UI shows the runtime score/version; database probe verifies complete provenance. |
| F-03 | VERIFIED FIXED | Fresh workspace import gives 3 accepted / 1 rejected. |
| F-04 | VERIFIED FIXED | Immediate order/payment refresh passes with no prior null-reset console error. |
| F-05 | VERIFIED FIXED | No fallback signing secret; old known-secret token is rejected. |
| F-06 | VERIFIED FIXED | Mobile menu, Escape closure, and focus return pass. |
| F-07 | VERIFIED FIXED | Rejected row and sanitized reason render. |
| F-08 | NOT FIXED | Customer/order lifecycle breadth remains absent. |
| F-09 | NOT FIXED | Invoice detail/search/filter/allocation history remain absent; no PDF export. |
| F-10 | PARTIAL | Structured evidence, notes, provenance, and review timeline exist; investigation/filter breadth remains limited. |
| F-11 | NOT FIXED | Analytics latency, trends, and filters remain absent. |
| F-12 | VERIFIED FIXED | Timeout reaches terminal failure; queue delivery failure retries and later delivers. |
| F-13 | VERIFIED FIXED | Inaccurate searchable-register claim was removed. |
| F-14 | VERIFIED FIXED | Logout clears the session and protected route redirects. |

## 5. Exact command record

All application/runtime verification used `C:\Users\user\Documents\The Second Entry\.tmp\independent-verification`, disposable databases, and project-local temporary directories. The browser server bound to `127.0.0.1:3200`, used explicit strong test-only session/callback secrets, and was stopped. No Node process remained afterward.

| Command | Result |
|---|---|
| `node --version` | PASS — `v22.14.0` |
| `npm --version` | PASS — `10.9.2` |
| `npm ci --legacy-peer-deps` | Initial workspace attempt failed with Windows `EPERM` on a locked SWC/native dependency. The same command in the disposable mirror succeeded: 519 packages added, 520 audited. |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `$env:TEMP="$PWD\.localtemp"; $env:TMP=$env:TEMP; npm test` | PASS — 10 files, 39 tests. The first run without project-local temp failed on an environment `EPERM` rename; the controlled rerun passed. |
| `$env:TEMP="$PWD\.localtemp-coverage"; $env:TMP=$env:TEMP; npm run test:coverage` | PASS — 78.54% statements, 67.64% branches, 79.57% functions, 86.93% lines. |
| `$env:TEMP="$PWD\.localtemp-run1"; $env:TMP=$env:TEMP; npx vitest run tests/remediation.integration.test.ts` | PASS — run 1, 1 file / 7 tests, including 20 race iterations. |
| `$env:TEMP="$PWD\.localtemp-run2"; $env:TMP=$env:TEMP; npx vitest run tests/remediation.integration.test.ts` | PASS — run 2, 1 file / 7 tests, including 20 race iterations. |
| `$env:TEMP="$PWD\.localtemp-run3"; $env:TMP=$env:TEMP; npx vitest run tests/remediation.integration.test.ts` | PASS — run 3, 1 file / 7 tests, including 20 race iterations. |
| `npx tsx verification-probe.ts` | Completed the disposable financial/audit/session/outbox negative and edge probes described below. |
| `npm run ml:evaluate` | PASS — model 1.1.0, threshold 0.25; metrics reproduced; artifact SHA-256 unchanged. |
| `npm run aws:validate` | PASS — 9 repository structural assertions. This is not SAM CLI validation. |
| `npm run build` | PASS — Next.js 16.4.3, 27 routes. Required an unsandboxed rerun after a Windows junction restriction. |
| `npm run test:e2e` | PASS — 3/3 with system Chrome. Warning: `next start` is incompatible with `output: "standalone"`; use the standalone server for that output. |
| `node browser-verification.mjs` | PASS for the custom browser matrix except the explicitly documented logout mutation-security defect and accepted leading-minus CSV formula. |
| `npm audit` | FAIL — 16 moderate vulnerabilities in the dev-only ESLint/minimatch dependency chain; suggested forced fix is breaking. No fix was run. |
| `npm audit --omit=dev` | PASS — 0 production dependency vulnerabilities. |

The lockfile was also inspected: lockfile version 3, 627 package entries, and no missing integrity field among applicable registry packages.

## 6. Financial concurrency and invariant evidence

The checked-in remediation concurrency test was run three independent times. Each run passed 20 iterations of ten simultaneous distinct payments against one invoice. The additional disposable probe covered the other required shapes:

- ten simultaneous exact payments: one allocated/reconciled, nine exception paths; invoice paid and allocation sum both `542400` cents;
- ten simultaneous partial payments of `60000` cents: nine allocated/reconciled, one exception; invoice paid and allocation sum both `540000` cents;
- ten simultaneous overpayments: all exception paths, no payment allocation and no invoice balance change;
- ten simultaneous identical replays: one payment/financial effect, nine idempotent duplicate responses;
- conflicting reuse: rejected; the original payment fingerprint and evidence were unchanged;
- cross-workspace customer and exception access: rejected; cross-workspace invoice reference produced only an unmatched exception in the caller workspace;
- draft and voided invoices: allocation rejected; overdue invoice: partial allocation succeeded;
- forced audit-trigger failure: payment, allocation, exception, and audit business state all rolled back;
- 34 generated document numbers (4 seed + 30 concurrent): 34 distinct; customer codes remained workspace-scoped.

For every successful race iteration exercised by the checked-in test, the post-transaction assertions verify:

`SUM(payment_allocations.amount_cents) = invoices.paid_cents`

`invoices.paid_cents <= invoices.total_cents`

Only allocated payments are reconciled, and failed allocations do not leave partial payment/allocation/audit state.

The PostgreSQL structure is materially stronger than before: invoice selection uses `FOR UPDATE`, the update is guarded, the affected-row result is checked, idempotency is database-backed, and all effects share a transaction. PGlite also uses a process-local workspace lock, however, so local success does not independently prove multi-process PostgreSQL behavior.

## 7. Session, RBAC, isolation, and mutation security

Verified:

- absent, short, placeholder (`replace-*`, `change-*`, project fallback), and retired public secrets fail closed;
- expired, tampered, old-fallback-signed, and ordinary malformed tokens are rejected;
- demo accounts default off and only become available with the server-only gate explicitly enabled;
- analyst, approver, and administrator login each receives an isolated synthetic workspace;
- a public guest cannot become an elevated user through the demo endpoint;
- analyst approval/rejection is denied at the HTTP layer with 403;
- approver approval and rejection persist reason, review timeline, terminal state, and atomic audit evidence;
- normal logout clears the cookie, and `/app` redirects to `/login` afterward;
- malformed login returns 400; payment mutation with unsupported content type returns 415; foreign Origin returns 403;
- elevated passwords were not found in rendered/client-visible content.

Defects/gaps:

1. A token with a valid HMAC but body `not-json` causes `verifySession` to throw `SyntaxError` at `JSON.parse`; it should fail closed with a stable null/401 result. Claims also lack an explicit runtime schema.
2. `POST /api/session/logout` does not call the JSON/origin mutation guard. A foreign-Origin `text/plain` POST returned 200. The action only removes the caller's cookie, so this is not an elevation bypass, but it is inconsistent route hardening.
3. The administrator role has an `administer` policy value but no meaningful admin-only capability exercises it. Admin behavior is honestly classified as absent, not verified.
4. Durable rate limiting and demo-expiry cleanup are absent.

## 8. Atomic audit-chain evidence

- Financial ingestion, exception creation, inference/job/outbox creation, exception resolution, and their audit events use the same database transaction.
- A forced audit insert failure left no payment, allocation, or exception business effect.
- Twenty concurrent appends plus the initial event produced a valid 21-event chain with unique sequence/predecessor use and no fork.
- The hash input covers sequence, timestamp, actor/action/entity, payload, and previous hash.
- An intentional disposable row mutation caused `verifyAuditChain` to fail.
- Documentation correctly calls this database tamper evidence and does not claim external notarization.

## 9. ML reproduction and runtime integration

Runtime probes verified that new exceptions and seeded exceptions are scored through the committed model rather than hard-coded risk constants. `inference_records` contains feature snapshot, model version, artifact hash, threshold, score, contribution-based indicators, provider/provenance fields, and status. The worker score changes with supplied features. Neither the worker nor provider has a path to approve an exception or mutate invoices, allocations, credits, or approval records.

The training/evaluation code uses distinct group-separated train, validation, and held-out test partitions. Threshold selection reads validation results only. Reported metrics and baselines reproduced at the committed threshold. `npm run ml:evaluate` left the artifact SHA-256 unchanged (`60405449…b951`), including no timestamp rewrite.

The deterministic provider is clearly labeled non-AI, builds evidence-specific output, and makes no network call. Forced provider failure persisted failure/fallback evidence and preserved financial state. No live AI provider was called or claimed verified.

## 10. Outbox, worker, callback, Workflow Lab, and AWS

The complete disposable local path succeeded:

`business exception → job + outbox in one transaction → dispatcher → local queue adapter → feature-based worker inference → signed callback → completed persisted result`

Observed behavior:

- publisher failure kept the outbox durable and retryable;
- subsequent dispatch advanced attempts and delivered;
- repeated failure reached `retry_pending`, `retry_pending`, then `dead_letter` at the documented budget;
- duplicate identical completed callback was acknowledged idempotently;
- nonce reuse returned 409;
- conflicting terminal callback returned 409 and could not change completed to failed;
- callback workspace/job/exception ownership is checked;
- invalid signature, stale timestamp, malformed body, and ownership mismatch have stable failure paths in tests/source;
- completed result updated the intended inference/job state once and did not change invoice/ledger state;
- the negative-control Workflow Lab run returned `invariant_violated` after deliberately arranging a violating disposable state.

Remaining issue: a `failed` terminal callback updates the job but does not clearly terminalize the associated inference/exception record, leaving incomplete failure-state propagation.

The SAM template and local structural validator agree on handler, `CodeUri`, esbuild metadata, SQS/DLQ, partial-batch behavior, scoped poller IAM, SecureString callback-secret reference, logs, retention, and alarm. `sam` was not installed, so `sam validate --lint` is **BLOCKED**. No AWS resources were created or contacted.

Most importantly for deployment, `configuredPublisher()` has no application caller and there is no cron, route, background loop, or external scheduler that invokes the dispatcher. Durable rows therefore do not imply durable processing in Vercel.

## 11. CSV, business workflow, and browser evidence

### CSV and business behavior

- Fresh bundled `samples/payments.csv`: exactly 3 accepted and 1 rejected; rejected row number/reason visible.
- Re-import: no duplicate financial effect.
- Quoted commas and escaped quotes: accepted.
- Malformed headers/column counts, `=...` formula, NUL, non-CAD currency, invalid source ID, negative/unsafe amount, unknown customer code, and oversized file: rejected safely.
- Defect: invoice reference `-1+1` was accepted because the formula guard omits leading `-`.
- Documentation defect: the payment page instructs `customer_id`; the accepted header is `customer_code`.

Remaining workflow gaps are confirmed: no customer creation, multi-line order support, draft editing, explicit confirm/cancel, invoice detail, allocation/payment history, invoice search/filter, full persisted overdue lifecycle, broad analytics, or PDF export.

### Browser matrix

The custom production-browser run used system Chrome, loopback only, a disposable PGlite directory, and test-only secrets. It verified:

- separate demo contexts and cross-context record isolation;
- immediate order refresh, invoice creation, exact payment, two distinct same-amount partial payments, identical replay, and conflicting replay;
- bundled CSV result and visible row 5 rejection;
- analyst 403, approver approve/reject, reasons, and persisted timeline;
- new-exception model score/version in the UI and full provenance in the database probe;
- Workflow Lab queue retry/recovery, timeout terminal failure, unauthorized approval, and provider fallback;
- logout and protected-route redirect;
- 390×844 mobile menu, Escape/focus return, and no horizontal overflow at mobile/tablet/desktop sizes;
- CSP/security headers in the production build.

No browser console or page exceptions occurred. Playwright reported several aborted RSC prefetch requests (`net::ERR_ABORTED`) during forced navigation; these were client-cancelled speculative requests rather than server failures. The two independently reproduced browser defects are the logout mutation guard and leading-minus CSV formula described above.

## 12. Coverage and uncovered critical branches

| Measure | Result |
|---|---:|
| Statements | 78.54% |
| Branches | 67.64% |
| Functions | 79.57% |
| Lines | 86.93% |

Critical weak areas include the AI-provider failure branches (about 10% statements / 0% branches), PostgreSQL adapter and database-client branches (about 69% statements / 41% branches), repository edge branches (about 67% statements / 65% branches), queue publisher (about 33% statements / 0% branches), callback-route branches (about 58%), and most route/UI modules excluded from direct coverage. The suite is materially stronger but does not meet an 80% statement/branch acceptance threshold.

## 13. Dependency audit

`npm audit` reports 16 moderate findings in the development ESLint/minimatch chain. The proposed forced remediation is breaking and was not executed. `npm audit --omit=dev` reports zero production dependency vulnerabilities. Therefore there is no known production dependency advisory in the installed lockfile, but the full development toolchain is not clean.

## 14. PostgreSQL verification status

**BLOCKED.** `DATABASE_URL` was absent, `psql` was unavailable, and no existing PostgreSQL service was found. Per the audit rules, no service was installed or provisioned.

Code inspection confirms that a supplied `DATABASE_URL` selects the `postgres` adapter and limits each process to one connection. That is not sufficient serverless evidence: each Vercel instance can create its own connection, so aggregate concurrency can exceed a hosted database limit. A provider pooler or explicit serverless connection design is required.

Migration safety is also unresolved. `applyMigrations` reads the migration ledger and applies migrations at first database access. It has no PostgreSQL advisory lock or equivalent cross-instance migration coordinator around the ledger check and DDL. Multiple cold Vercel instances can race. A separate, explicit, single-run pre-deploy migration step is required.

## 15. AWS/SAM verification status

- Repository structural validator: **PASS**, 9 assertions.
- Local worker/signing/dispatcher/callback path: **PASS**.
- SAM CLI service validation: **BLOCKED** (`sam` not installed).
- Live SQS/Lambda/IAM/CloudWatch behavior: **NOT VERIFIED** (no deployment or cloud call authorized).
- Runtime dispatcher scheduling: **NOT FIXED**; no caller exists.

## 16. Vercel-readiness analysis

| Area | Assessment |
|---|---|
| Hosted database selection | `DATABASE_URL` selects PostgreSQL. However, missing production `DATABASE_URL` silently selects filesystem PGlite instead of failing closed. |
| PGlite | Documentation calls it local-only, but runtime does not forbid it in production. Vercel filesystem storage is not a durable database. |
| Connection behavior | Pool max is one per process, not one globally. Use a hosted serverless pooler/provider limit and load-test the aggregate behavior. |
| Migrations | Automatically run on first access and are not cross-instance serialized. Use an explicit pre-deploy migration job; do not rely on request startup. |
| Required Vercel environment | `DATABASE_URL`; strong `SESSION_SECRET`; strong `CALLBACK_SIGNING_SECRET` when AWS callbacks are enabled; `DEMO_ACCOUNTS_ENABLED=false` or omitted; `AWS_REGION` and `RISK_QUEUE_URL` only when the SQS path is enabled. Do not set `PGLITE_DATA_DIR` in Vercel. No real values belong in source. |
| Demo accounts | Default off and fail closed for public elevated login. |
| Callback reachability | AWS needs the deployed HTTPS callback URL (for example through its `RESULTS_CALLBACK_URL` configuration) and the same strong signing secret. Signature, timestamp, nonce, and ownership checks exist. Reachability is not verified. |
| Origin/proxy behavior | Mutation checks use forwarded/host headers and secure production cookies with `SameSite=Lax`. Core routes passed behind the local production proxy shape; scheme is not compared. Logout omits the guard. |
| Distributed guarantees | `workspaceLocks`, local queue, and any process memory are per-instance only. PostgreSQL constraints/locks and a real external queue must carry correctness. |
| Outbox execution | No application scheduler/route/loop invokes the configured publisher. A Vercel Cron endpoint, separate worker, or other authenticated dispatcher runtime must be explicitly designed. |
| Secrets/client bundles | No `NEXT_PUBLIC_*` secret or elevated credential exposure was found. |
| Build/runtime | `next build` passes. `output: "standalone"` conflicts with `npm start`/`next start` for self-hosting; the emitted standalone server is the compatible start target. Vercel's framework adapter may not need the local start script, but the mismatch should be resolved/documented. |
| External packages/assets | Current Next configuration includes the required server external packages and security headers; local build assets work. Preview deployment tracing remains NOT VERIFIED. |

## 17. Material blockers and reproduction steps

1. **No real PostgreSQL verification.** Set up an authorized disposable PostgreSQL service in a future task, set only its disposable `DATABASE_URL`, run the three race suites simultaneously from separate processes/connections, inspect invariants after every iteration, and exercise concurrent migration startup. Current status: BLOCKED.
2. **Production can silently use PGlite.** In a production environment with no `DATABASE_URL`, import/call `database()`; the client selects the filesystem adapter. Vercel must fail startup closed instead.
3. **Request-time migration race.** Start two clean application instances against one empty PostgreSQL database simultaneously. Both can observe a missing ledger row before either commits. No cross-instance migration lock is present. Use an explicit pre-deploy migration job.
4. **Outbox never drains automatically.** Create an exception with SQS environment configured, then make no manual dispatcher call. The outbox remains pending because `configuredPublisher()`/dispatcher has no route, cron, worker loop, or scheduler caller.
5. **Validly signed malformed session token throws.** Sign the literal body `not-json` with a valid strong test secret and pass the token to `verifySession`; `JSON.parse` throws instead of returning a stable rejection.
6. **Logout lacks mutation hardening.** `POST /api/session/logout` with `Content-Type: text/plain` and a foreign `Origin` returns 200; core JSON mutation routes return 415/403.
7. **CSV leading-minus formula accepted.** Import a valid CSV row with `invoice_reference` equal to `-1+1`; the row is accepted because the formula regex excludes `-`.
8. **Dispatcher/failure-state completeness.** Deliver a valid signed `failed` terminal callback and inspect linked inference/exception state; the job fails, but linked records do not clearly receive a corresponding terminal failure.
9. **Feature breadth remains incomplete.** Customer creation, multi-line order, edit/confirm/cancel, invoice detail/history/search/filter, overdue lifecycle, analytics breadth, and PDF export have no executable path.
10. **Coverage remains below target.** Run `npm run test:coverage`; statements are 78.54% and branches 67.64%, with security/provider/queue/PostgreSQL branches weak.
11. **SAM and live AWS remain unverified.** Install nothing during this audit. In an authorized future environment, run `sam validate --lint`, build locally, and then separately test configured AWS resources.
12. **Dev dependency advisories.** Run `npm audit`; 16 moderate dev-tool findings remain. Do not apply the breaking forced fix without a scoped upgrade task.
13. **Start/output mismatch.** Run the checked-in E2E production server with `output: "standalone"`; Next warns that `next start` is not the compatible standalone start command.

## 18. Recommendation and required next phase

**PARTIALLY READY — CORRECTIONS OR VERIFICATION REQUIRED**

Authorize a separate correction/verification phase before any preview or production deployment. Its minimum scope should be:

1. fail closed on missing production `DATABASE_URL`, move migrations to a single explicit pre-deploy job, select a Vercel-compatible pooled PostgreSQL service, and run the required real-PostgreSQL multi-process tests;
2. design and authenticate a real outbox-dispatch runtime, plus complete failed-result propagation;
3. harden session claim parsing and logout mutation checks; fix the CSV leading-minus formula case and CSV header copy;
4. raise critical-path branch coverage and perform SAM CLI validation if AWS remains in scope;
5. decide whether the missing business features are release blockers or explicitly narrow the product claims and deployment scope.

This recommendation does not authorize code correction, provisioning, preview deployment, migration, or production deployment.

## 19. Verification-process integrity and unexpected change check

- No Git commands were run and no Git history was changed.
- No Vercel, AWS, external AI, paid service, or other cloud resource was contacted or changed.
- Nothing under `audit/` was edited.
- Current source/config/package content was compared with the pre-verification disposable mirror; no audit-driven application source repair was made. The requested report is the only intentional source-tree deliverable.
- Expected generated/disposable paths changed during verification: `.tmp`, `.next`, coverage/test output, TypeScript build metadata, npm cache/dependencies, and the new report.
- **A blanket confirmation that persistent database records were unchanged cannot be given.** Files under the original `data/pglite` directory have modification times up to `2026-10-31T22:38:33+03:00`, inside the audit window, despite all deliberate probes being directed to disposable paths. No destructive inspection was performed afterward because opening PGlite can itself write metadata. The timestamps prove the persistent store was touched; they do not prove which logical records, if any, changed. This is an audit-process deviation and also demonstrates why build/request-time automatic database initialization and ambiguous workspace-root inference must be removed before deployment.

No repair has been attempted. Explicit authorization is required before correcting any finding.
