# Second Entry — Independent Browser & Functional QA Audit

Audit date: 2026-10-30 (Asia/Riyadh)  
Target: `http://localhost:3000`  
Primary browser: user-referenced Chrome tab  
Isolation check: separate ChatGPT in-app browser context  
Auditor role: independent read-only QA; no application code, schema, configuration, or tests were changed

## Executive summary

**Final assessment: NOT READY.**

Second Entry loads reliably and its most important deterministic money invariants worked in the exercised sequential browser scenarios. A synthetic order produced the exact expected subtotal, 13% HST, and invoice total. Exact and partial payments updated balances correctly after refresh. Two legitimate same-amount payments were both retained, an identical event replay was ignored, a conflicting replay was denied, and customer mismatch, overpayment, already-paid, and missing-reference cases created exceptions without changing invoice balances. A second isolated browser session received a distinct workspace and could not see the first session's test records.

The application is not ready for complete manual UAT because several advertised enterprise capabilities are unavailable or demonstrably incomplete in the running environment:

1. All three documented role accounts (analyst, approver, administrator) are rejected, so the positive approval path and role-to-role workflow cannot be exercised.
2. The ML inference implementation is not connected to payment/exception creation. Every newly created exception displayed `Not scored`; only seeded exceptions contain pre-populated risk values.
3. The bundled `samples/payments.csv` accepted only 1 of 4 rows in a fresh isolated demo. The rows named `sample-correct-001` and `sample-partial-002` were rejected because the sample uses unscoped customer identifiers while seeded customer primary keys are workspace-suffixed. The UI reports only counts, not row-level rejection reasons.
4. Every successful `ActionForm` mutation raises a client-side `TypeError: Cannot read properties of null (reading 'reset')`. Because the exception occurs before `router.refresh()`, tables and KPI surfaces remain stale until a manual reload.
5. At a 390×844 viewport, the sidebar is hidden and no replacement menu is rendered, leaving no visible application navigation.

No critical financial corruption, duplicate allocation, or cross-demo data exposure was observed in the sequential scope. Concurrency correctness was not established.

## Scope and counts

63 discrete checks were evaluated: 61 feature/browser checks and two supplementary fresh test-suite executions.

| Status | Count |
|---|---:|
| PASS | 41 |
| FAIL | 9 |
| PARTIAL | 4 |
| NOT IMPLEMENTED | 7 |
| NOT VERIFIED | 1 |
| BLOCKED | 1 |
| **Total** | **63** |

The full itemization is in `FEATURE_COVERAGE_MATRIX.md`.

## Environment and accessibility

- Project directory confirmed: `C:\Users\user\Documents\The Second Entry`.
- The directory contains no `.git` entry. Branch, commit, and clean/dirty repository state therefore could not be verified.
- `README.md`, `HANDOFF.md`, `ARCHITECTURE.md`, `TEST_RESULTS.md`, `SECURITY.md`, routes, domain services, database migration, worker, and tests were inspected read-only.
- Landing page, demo entry, and every documented application route loaded.
- Backend persistence is functioning through local PGlite/PostgreSQL-compatible storage. Browser-created records survived refresh.
- Exact launch command/build mode could not be read because process inspection was denied by the host. Runtime behavior is consistent with the production account gate being active, but the build mode is recorded as **NOT VERIFIED** rather than inferred as fact.
- Browser console captured repeated form-action errors; no missing assets or route-level server error pages were observed.
- Fresh execution results during this audit: `npm test` → 27/27 passed; `npm run test:e2e` → 1/1 passed. The E2E test only asserts that navigation links are visible after entering a demo.

Initial evidence: [01-overview-initial.png](screenshots/01-overview-initial.png).

## Financial workflow evidence

### Successful order-to-cash — PASS with UI refresh defect

Created `Independent QA services`, quantity 2, CAD 100.10 each.

- Observed subtotal: CAD 200.20.
- Observed tax: CAD 26.03.
- Observed invoice total: CAD 226.23.
- Issued invoice: `INV-2026-617524`.
- Exact payment source: `qa-exact-20261030-01`.
- Final invoice state after reload: Paid CAD 226.23; outstanding CAD 0.00.
- Dashboard moved from invoiced CAD 9,379.00 / received CAD 2,443.00 to invoiced CAD 9,605.23 / received CAD 2,669.23.

The mutation success messages appeared immediately, but lists did not refresh because of the client exception described in F-04.

### Partial payment — PASS

Two separate source events, `qa-partial-a-20261030` and `qa-partial-b-20261030`, each allocated CAD 100.00 to `INV-2026-082`. The balance changed from paid CAD 1,200.00 / outstanding CAD 1,512.00 to paid CAD 1,400.00 / outstanding CAD 1,312.00. This confirms that identical amounts with distinct source IDs are not incorrectly deduplicated.

### Duplicate/conflict protection — PASS in sequential browser testing

- Resubmitting the exact `qa-exact-20261030-01` payload returned `Duplicate delivery ignored`.
- Reusing the source ID with CAD 1.00 returned `Conflicting data for existing source event ID`.
- The invoice remained paid exactly once.
- Audit evidence recorded `payment.duplicate_ignored` and `payment.conflict`.

Concurrency races were not tested; do not treat this sequential evidence as proof of concurrent safety.

### Unsafe payments — PASS

The following produced exceptions and did not allocate funds:

- Customer mismatch (`qa-mismatch-20261030`).
- Overpayment (`qa-overpay-20261030`).
- Payment against an already-paid invoice (`qa-already-paid-20261030`).
- Missing invoice reference (`qa-missing-ref-20261030`).

The reconciliation page accurately described deterministic outcomes, and the underlying invoice totals remained unchanged.

## Critical and high-priority findings

No **CRITICAL** defect was observed.

### F-01 — HIGH — Documented role accounts are unavailable

All credentials copied from `README.md` were rejected by `/login` with `Invalid credentials or local accounts are disabled`. This blocks approver/admin UAT, authorized exception resolution, and positive role-transition evidence. See [04-documented-logins-fail.png](screenshots/04-documented-logins-fail.png).

### F-02 — HIGH — Runtime ML scoring is not integrated

All exceptions created during the audit display `ML risk score: Not scored`. Read-only search found `inferAnomaly` defined only in `src/server/ml/inference.ts`; no application path invokes it and no application path inserts `inference_records`. Seed data alone supplies the two visible scores. The model artifact and evaluation exist, but live application inference is not demonstrated. See [07-ai-fallback-and-unscored-exceptions.png](screenshots/07-ai-fallback-and-unscored-exceptions.png).

### F-03 — HIGH — Bundled CSV does not execute its advertised correct and partial examples

In a fresh isolated demo, uploading `samples/payments.csv` reported `1 accepted; 3 rejected.` Only the missing-reference row was persisted. The seeded database stores customer IDs as `cust-aster<workspaceId>` / `cust-northstar<workspaceId>`, while the sample contains `cust-aster` / `cust-northstar`. The import service performs exact workspace-scoped customer lookup. See [06-bundled-csv-three-rejected.png](screenshots/06-bundled-csv-three-rejected.png).

### F-04 — HIGH — Successful mutations throw and leave the UI stale

Chrome logged repeated `TypeError: Cannot read properties of null (reading 'reset')` errors after form actions. Source confirms `event.currentTarget.reset()` is called after awaited network work; the React event's current target is null at that point. The exception occurs before `router.refresh()`. This was independently visible when order and payment tables did not update until reload.

### F-05 — HIGH (conditional source risk) — Production sessions can fall back to a public signing secret

`src/server/auth/session.ts` uses `second-entry-local-demo-secret-change-before-deployment` whenever `SESSION_SECRET` is absent, including production. The running process environment could not be inspected, so exploitation of the live instance is **not claimed**. The implementation must fail closed in production rather than silently using a repository-known secret.

## Medium findings and incomplete capabilities

- **F-06 — Mobile navigation absent.** At 390×844 the sidebar is `display:none`, but `AppShell` renders no mobile menu despite `.mobile-head` CSS. Page content has no horizontal overflow, but users cannot navigate. Evidence: [05-mobile-overview.png](screenshots/05-mobile-overview.png).
- **F-07 — CSV rejection detail discarded.** The API returns `{row,error}` entries, but `CsvImport` renders only accepted/rejected counts.
- **F-08 — Customer/order lifecycle UI incomplete.** There is no customer creation route, multi-line order editor, draft edit, or explicit confirmation control. `Issue invoice` accepts a draft and combines confirmation/issuance.
- **F-09 — Invoice management incomplete.** No invoice detail, payment history, search/filter, or PDF export exists. PDF absence is documented; the other omissions conflict with the requested management workflow.
- **F-10 — Exception investigation UI incomplete.** No filters, separate investigation notes, review-history display, or model/version display exists. Raw JSON evidence is shown directly.
- **F-11 — Analytics incomplete.** Reconciliation and exception counts match visible data, and synthetic model metrics are honestly labeled. Processing latency, workflow failure statistics, financial KPI trend/filter controls, and workflow-event analytics are not rendered even though repository code queries workflow aggregates.
- **F-12 — Workflow recovery is only partially simulated.** Duplicate/conflict scenarios invoke real payment logic. Worker timeout and queue failure directly insert persistent `retry_pending` / `delivery_pending` records; no retry, redrive, recovery transition, or terminal failure can be observed. Evidence: [03-workflow-lab-results.png](screenshots/03-workflow-lab-results.png).
- **F-13 — UI claims searchable audit evidence without search.** Settings renders a table only.
- **F-14 — No logout control.** Session expiry behavior was not practical to wait eight hours and is covered only by unit tests.

## Authorization and security observations

- Guest resolution attempt was denied server-side with `Role demo_guest cannot perform approve`, and a denied audit event was written. This is stronger evidence than a hidden button. Evidence: [02-guest-approval-denied.png](screenshots/02-guest-approval-denied.png).
- The positive approver path is blocked by F-01.
- A second browser context produced workspace `demo-e4563131-0ab2...`, distinct from the primary workspace `demo-f4ac5017-494c...`. The second workspace had only its own four seeded payments and no primary QA records.
- Signed-session tamper and expiry unit tests passed. Protected-route redirect without an existing session was not independently re-exercised after both browser contexts received sessions.
- No brute force, token forgery, or destructive security testing was performed.

## AI/ML observations

- PASS: the UI clearly labels generated summaries as `Non-AI Fallback`, says no external provider is called, and preserves human review.
- PASS: fallback summaries referenced the correct exception type, source event, and amount.
- PASS: governance displays model type, version, intended use, synthetic holdout size, precision, recall, F1, ROC AUC, limitations, and deterministic policies.
- FAIL: newly created exceptions are not scored and no runtime inference/decision record is created.
- PARTIAL: seeded scores demonstrate display only, not live inference quality or provenance.
- NOT VERIFIED: external LLM behavior, because no provider is configured by design.

## AWS/local integration observations

- Architecture copy accurately distinguishes `Live Local`, `Code Ready`, and `Not deployed`. Evidence: [08-architecture-deployment-truth.png](screenshots/08-architecture-deployment-truth.png).
- Source includes SAM SQS/DLQ/Lambda resources, partial-batch failure handling, HMAC callback signing, timestamp checks, and callback nonce storage.
- Fresh unit tests for worker and signing are included in the 27/27 pass.
- No AWS resource was deployed or invoked. Queue retry, DLQ redrive, Lambda execution, IAM, log retention behavior, callback replay under concurrency, and service-side SAM validation remain unverified.

## UI/UX and accessibility

- Desktop and tablet layouts rendered without horizontal overflow.
- Mobile content rendered without horizontal overflow, but navigation is inaccessible (F-06).
- Representative desktop keyboard tab order reached brand and navigation links in logical order.
- Form labels and native validation were present. Negative payment amount produced `Value must be greater than or equal to 0.01`; missing source ID produced `Please fill out this field`.
- Tables use semantic table markup, but raw IDs/JSON make exception investigation difficult.
- Automated contrast analysis and screen-reader testing were not performed.

## Test-coverage assessment

The reported 27 unit/integration tests genuinely pass, but they do not cover the observed browser defects. The sole E2E test checks only that navigation links are visible after demo entry. Missing automated coverage includes:

- Login for every documented role in the supported launch modes.
- Positive and negative browser approval flows.
- Bundled CSV import expectations and row-level error presentation.
- Successful form refresh/reset behavior and console cleanliness.
- Mobile navigation.
- Runtime inference record creation.
- Invoice/customer/order lifecycle breadth.
- Workflow retry/recovery transitions.
- Concurrent payment ingestion.

## Readiness decision

**NOT READY** for complete manual user acceptance testing of the advertised enterprise workflow.

The deterministic finance core is promising and passed the exercised sequential scenarios, but approver access is blocked, live ML scoring is absent, the bundled CSV demo is broken, and successful mutations leave stale screens while emitting client errors. Fix F-01 through F-05 first, then rerun the full browser matrix. This assessment is not a production-readiness claim.

