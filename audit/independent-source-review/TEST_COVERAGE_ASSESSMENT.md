# Second Entry — Test Coverage Assessment

## 1. Re-execution of the reported verification claims

All commands ran in an isolated copy of the repository under the session scratchpad. That copy has its own `node_modules` from `npm ci --legacy-peer-deps` against the project's `package-lock.json`, so the project tree and `data/pglite` were not modified. Node v22.14.0, npm 10.9.2, Windows 11.

| Claim (TEST_RESULTS.md / HANDOFF.md) | Auditor result | Notes |
|---|---|---|
| 27/27 unit and integration tests pass | **Reproduced: 27 passed, 0 failed** (8 files, 3.6 s) | Uses in-memory PGlite (`NODE_ENV=test`) |
| 1 Chromium E2E test passes | **Reproduced: 1 passed**, using **system Chrome** (`channel: "chrome"`) against a scratch `next start` on :3100 | No Playwright browser bundle exists on this machine (`%LOCALAPPDATA%\ms-playwright` absent). The default config fails with "Executable doesn't exist" |
| Typecheck passes | **Reproduced** (`tsc --noEmit`, no diagnostics) | — |
| Lint passes | **Reproduced** (`eslint .`, no diagnostics) | `no-explicit-any` is disabled globally |
| Production build passes | **Reproduced** (Next 16.4.3 Turbopack; 24 routes) | Fails when `node_modules` is a junction (Turbopack root check); passes with a real install |
| Reproducible ML evaluation | **Reproduced**: two fresh `train(false)` runs are byte-identical to the committed artifact, excluding `generatedAt` | `npm run ml:evaluate` was **not** run in the project, because it overwrites the committed artifact |
| AWS infrastructure validation passes | **Reproduced**, but it is a **substring check** of six tokens (`scripts/validate-aws.ts:4-6`) | Not schema or service validation. SAM CLI unavailable → BLOCKED |
| Zero dependency vulnerabilities | **Reproduced**: `npm audit` → 0, and `npm audit --omit=dev` → 0 | — |

**Conclusion:** the reported commands pass. The suite they exercise is shallow, though, and does not detect the confirmed critical defects (SE-C1, SE-C2) or the misrepresented ML, AWS and Workflow Lab behaviour.

## 2. Coverage measurement

`vitest run --coverage` (v8), with include `src/**`, `aws/**`, `ml/**`:

| Scope | Statements | Branches | Functions | Lines |
|---|---:|---:|---:|---:|
| **Total** | **33.09%** | **29.13%** | **26.62%** | 58.77% |
| `src/domain/policy.ts` | 100 | 100 | 100 | 100 |
| `src/domain/reconciliation.ts` | 86.7 | 87.5 | 100 | 100 |
| `src/domain/money.ts` | 68.4 | 55.6 | 85.7 | 80 |
| `src/server/db/repository.ts` | 68.1 | 68.2 | 65.4 | 75 |
| `src/server/auth/session.ts` | 56.3 | 50 | 42.9 | 65.4 |
| `aws/worker.ts` | 90 | 66.7 | 100 | 100 |
| `aws/signing.ts`, `aws/contracts.ts`, `ml/model.ts` | 100 | 100 | 100 | 100 |
| **All 9 API route handlers** | **0** | **0** | **0** | **0** |
| `src/server/parse.ts` (decimal → cents) | 0 | 0 | 0 | 0 |
| `src/server/api-response.ts` (error mapping) | 0 | 0 | 0 | 0 |
| `src/server/ml/inference.ts` | 0 | — | 0 | 0 |
| `ml/train.ts` | 0 | 0 | 0 | 0 |
| All pages and components | 0 | — | 0 | 0 |

The line metric (58.8%) is inflated because the source is condensed onto very long single lines. Statement and branch coverage are the honest measures.

## 3. Test-by-test analysis (27 Vitest tests + 1 E2E)

| File | Test | What it really verifies | Value | Gaps / mock concerns |
|---|---|---|---|---|
| `money.test.ts` | integer arithmetic | `add`/`subtract`/`multiply` on small ints | Low–Med | No overflow, negative, or cross-currency tests |
| | tax rounding | 10005 × 13% → 1301 | Med | One value; no boundary table |
| | rejects fractional | `money(1.2)` throws | Low | — |
| `policy.test.ts` | approver can approve | Table lookup | Low | Pure table; no route-level 403 |
| | analysts/guests denied | Table lookup | Med | Same |
| | guest can ingest | Table lookup | Low | — |
| `reconciliation.test.ts` | exact match | Pure function | Med | — |
| | partial | Pure function | Med | — |
| | overpayment not allocated | Pure function | Med | — |
| | customer mismatch | Pure function | Med | — |
| | unknown invoice | Pure function | Med | **Missing:** already_paid, currency_mismatch, voided, overdue, zero outstanding |
| `session.test.ts` | intact session | HMAC round-trip | Med | Runs with the **fallback secret**, so it never tests a missing-secret failure |
| | tampering rejected | Mutates the payload | Med | `token.replace("u","x")` alters the first `u` of the base64 body; this works but is fragile |
| | expiry rejected | `expiresAt: 0` | Med | — |
| `aws-signing.test.ts` | valid / modified body / stale | HMAC and time window | Med–High | No nonce-replay test (needs DB) |
| `aws-worker.test.ts` | malformed → batch failure | Partial batch response | Med | — |
| | valid → one callback | `fetch` mocked | Low | Asserts call count only; never checks that the score is meaningful (it is constant 0.5) |
| `ml.test.ts` | artifact version/seed/weights | Static JSON fields | Low | — |
| | bounded score | Sigmoid range | Low | Trivially true for any sigmoid |
| | suspicious > normal | Monotonic sanity check | Med | Never tests `inferAnomaly` or app integration |
| `repository.integration.test.ts` (real in-memory PGlite) | order + invoice | Exact total 22602; invoice exists | **High** | No line-item, status, or audit assertions |
| | replay idempotent, distinct legitimate | Sequential replay | **High** | **Sequential only.** No concurrency |
| | conflict | Amount conflict throws | Med | No reference/customer conflict (SE-M2) |
| | unauthorized resolution | Calls `runSimulation(…,"unauthorized_approval")` | **≈0** | Asserts `denied:true, stateUnchanged:true`, which are **hard-coded** by the simulation (`repository.ts:141`). The test cannot fail for the reason it claims |
| | approver resolves | Analyst 403, approver resolves | **High** | No assertion on review row, audit row, or financial effect |
| `e2e/guided-demo.spec.ts` | complete navigation | Demo link → overview → 11 nav links visible | **Low** | No order, invoice, payment, CSV, exception, approval, or lab interaction. "Complete workflow" is not exercised |

**Mocks:** only `fetch` in the worker test, which is appropriate. Persistence tests use real PGlite. The main problem is not mocks hiding defects but **absent scenarios**.

## 4. Business-critical scenarios with no test

| Area | Missing test | Related finding |
|---|---|---|
| Concurrency | Parallel payments against one invoice; allocation sum equals `paid_cents` | SE-C1 (probe P1/P1b fails this invariant today) |
| Concurrency | Parallel identical source events → both 200, same payment ID | SE-M1 |
| Concurrency | Parallel audit appends keep a linear chain | SE-H2 |
| Auth | Server refuses to run, or sign, without `SESSION_SECRET` | SE-C2 |
| Auth | Route-level 401/403 for every mutating endpoint, for each role | I-series |
| Auth | Demo-mode production gate; public-demo role ceiling | SE-H1 |
| Tenancy | Cross-workspace IDs rejected (customer, order, exception, job) | SE-M3 |
| Payments | `decimalToCents` edge cases ("0.1", "1.005", "01", "1e3", 10 digits) | — |
| Payments | CSV: bundled sample, quoted fields, header variants, 501 rows, formula cells | SE-M4 |
| Reconciliation | already_paid, voided, overdue, currency mismatch, multi-payment accumulation to `paid` | SE-M6 |
| Exceptions | Resolution writes review and audit atomically; reject path; financial effect | SE-H6 |
| ML | Exception creation produces an inference record and score | SE-H3 |
| ML | Training reproducibility test (`train(false)` equals the artifact) | — |
| AWS | Callback: same-nonce replay → 409; re-delivery dedupe; terminal-state guard; unknown job | SE-H5 |
| AWS | Outbox dispatcher: publish success/failure/retry | SE-H5 |
| Lab | Each scenario's outcome flips to `invariant_violated` when the invariant is broken | SE-H4 |
| E2E | Order → invoice → payment → exception → approve, verified in the UI and DB | — |
| E2E | Analyst denied, approver allowed, through the browser | — |

## 5. Auditor probes (evidence, not project tests)

These live in `evidence/`, saved with a `.txt` suffix and never added to the project's test globs.

- `financial.probe.test.ts.txt` (P1–P14): 16 probes; outputs in `financial-probe-output.txt`.
- `callback.probe.test.ts.txt` (C1–C2): outputs in `callback-probe-output.txt`.
- `http-probe.mjs.txt` (H1–H13), `http-race.mjs.txt`, `http-race-csv.mjs.txt`: against a scratch `next start` on :3100.

Key results:
- P1/P1b demonstrate ledger divergence.
- P4 demonstrates audit chain forking.
- P6/P7 show the lab's outcomes are constant.
- P9 shows no ML scoring at runtime.
- H3/H3b show forged-admin access.
- H6 shows the CSV sample failing.
- C1/C2 show worker and callback non-idempotency and the constant score.
- HTTP race scripts did **not** reproduce SE-C1 over HTTP on local single-process PGlite (6 rounds).

## 6. Verdict on test evidence

The 27 tests show that a handful of pure functions behave correctly on the happy path, and that sequential repository flows work against a real (embedded) PostgreSQL engine. They do **not** provide evidence for:
- concurrency safety
- authorization at the API layer
- secret handling
- tenant isolation
- ML integration
- AWS reliability
- Workflow Lab truthfulness
- complete end-to-end workflows

One integration test (`denies unauthorized resolution without mutation`) asserts values that are hard-coded in the code under test.
