# Second Entry — Defect Reproduction Steps

## F-01 — Documented role accounts rejected

Severity: **HIGH**  
Affected route: `/login`  
Precondition: running localhost instance

1. Open `http://localhost:3000/login`.
2. Enter `analyst@secondentry.local` / `Analyst-Demo-2026!` and select **Sign in**.
3. Repeat with `approver@secondentry.local` / `Approver-Demo-2026!`.
4. Repeat with `admin@secondentry.local` / `Admin-Demo-2026!`.

Expected: each documented account signs in with the matching server-side role.  
Actual: all three return `Invalid credentials or local accounts are disabled`.  
Evidence: `screenshots/04-documented-logins-fail.png`.  
Affected invariants: positive RBAC path, human approval workflow, role-consistency UAT.

## F-02 — New exceptions bypass ML inference

Severity: **HIGH**  
Affected routes: `/app/payments`, `/app/exceptions`, `/app/ai-insights`

1. Enter an isolated demo.
2. Ingest an overpayment or customer-mismatched payment.
3. Open Exception Center and AI Insights.

Expected: the exception receives the documented model version, score, threshold/input provenance, and an inspectable inference/decision record, while remaining advisory.  
Actual: every newly created exception displays `Not scored` / `Unavailable`. Only seeded exceptions contain scores. Read-only source search shows `inferAnomaly` has no caller and `inference_records` has no application insert path.  
Evidence: `screenshots/07-ai-fallback-and-unscored-exceptions.png`.  
Affected invariants: AI provenance, model governance, claimed anomaly-scoring workflow.

## F-03 — Bundled sample CSV rejects its correct/partial rows

Severity: **HIGH**  
Affected route: `/app/payments`  
Precondition: fresh isolated demo workspace

1. Open Payments.
2. Upload `samples/payments.csv`.
3. Observe the import status and payment ledger.

Expected: `sample-correct-001`, `sample-partial-002`, and `sample-missing-003` are accepted into their documented outcomes; `sample-invalid-004` is rejected for its negative amount.  
Actual: UI reports `1 accepted; 3 rejected`; only `sample-missing-003` appears. Seeded customer IDs are workspace-suffixed while the sample uses base aliases.  
Evidence: `screenshots/06-bundled-csv-three-rejected.png`.  
Affected invariants: CSV demo reliability, reconciliation coverage, user trust in supplied examples.

## F-04 — Successful forms throw and do not refresh

Severity: **HIGH**  
Affected routes: all routes using `ActionForm`, including Orders, Payments, Exception Center, Workflow Lab

1. Enter an isolated demo.
2. Create a valid order.
3. Observe the success message and order register.
4. Inspect the browser console.
5. Reload the page.

Expected: the form resets, the register refreshes immediately, and the console remains clean.  
Actual: success appears but the register stays unchanged; console logs `TypeError: Cannot read properties of null (reading 'reset')`; the record appears only after reload. The same pattern occurs for invoice/payment/workflow actions.  
Cause evidence: `event.currentTarget.reset()` is evaluated after awaited work in `src/components/action-form.tsx`, before `router.refresh()`.  
Affected invariants: observable state consistency and reliable operator feedback.

## F-05 — Public fallback session secret is allowed in production

Severity: **HIGH** (conditional source-level risk)  
Affected component: `src/server/auth/session.ts`

1. Review `secret()` in the session module.
2. Observe that missing `SESSION_SECRET` returns the repository-known fallback regardless of `NODE_ENV`.

Expected: production startup/session issuance fails closed when a strong secret is absent.  
Actual: code silently signs sessions with `second-entry-local-demo-secret-change-before-deployment`.  
Live exploit status: **NOT VERIFIED**; the running process environment was inaccessible.  
Affected invariants: signed-role integrity and workspace isolation in a misconfigured deployment.

## F-06 — Mobile users cannot navigate

Severity: **MEDIUM**  
Affected routes: all `/app/*` routes

1. Enter a demo.
2. Set viewport to 390×844.
3. Open `/app`.

Expected: a visible, keyboard-operable menu gives access to application routes.  
Actual: the desktop sidebar is hidden and no hamburger/menu/navigation replacement is present.  
Evidence: `screenshots/05-mobile-overview.png`.  
Affected invariants: mobile task completion and accessibility.

## F-07 — CSV errors lack row-level explanation

Severity: **MEDIUM**  
Affected route: `/app/payments`

1. Upload `samples/payments.csv`.
2. Observe the result message.

Expected: rejected row numbers and actionable error messages are displayed.  
Actual: only `1 accepted; 3 rejected.` is shown, although the API returns row/error objects.  
Affected invariants: operator correction and auditability of batch ingestion.

## F-08 — Exception investigation controls are incomplete

Severity: **MEDIUM**  
Affected route: `/app/exceptions`

1. Create multiple exception types.
2. Open Exception Center.

Expected: filter exceptions, add investigation notes independently of final approval, inspect review history, and see model/version provenance.  
Actual: all cards render in one grid with raw JSON evidence and only a final decision-reason form. No filters, notes, review history, or model version are visible.  
Affected invariants: accountable human investigation and usability.

## F-09 — Workflow timeout/queue simulations do not exercise recovery

Severity: **MEDIUM**  
Affected routes: `/app/workflow-lab`, `/app/settings`

1. Run **Worker timeout** and **Queue delivery failure**.
2. Reload Workflow Lab and Settings.
3. Observe the jobs over time.

Expected: meaningful retry/recovery or a terminal state is observable, with attempt progression and preserved finance state.  
Actual: static `Retry Pending` / `Delivery Pending` rows are inserted and remain unchanged; no worker/queue/retry action is executed.  
Evidence: `screenshots/03-workflow-lab-results.png`.  
Affected invariants: operational recovery evidence and reliability claims.

