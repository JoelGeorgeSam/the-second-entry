# Second Entry — Standalone Correction Request

You are the implementation agent for Second Entry. Treat this request as a defect-remediation task based on an independent browser audit performed on 2026-10-30. Do not mark the work complete from unit tests alone; satisfy every browser acceptance criterion below.

## Objective

Make the locally documented enterprise demo fully testable across role-based approval, order-to-cash, CSV ingestion, runtime ML scoring/governance, workflow evidence, and responsive navigation without weakening financial or authorization invariants.

## Priority 0 — Preserve existing financial correctness

The following independent scenarios currently pass and must remain regression-protected:

- Exact CAD cent arithmetic and 13% HST.
- Exact and partial payment allocation.
- Multiple distinct same-amount payments.
- Identical replay idempotency.
- Conflicting source-event rejection.
- Customer mismatch, overpayment, already-paid, and unknown-reference exception routing.
- Workspace isolation.
- Server-side denial of guest/analyst approval.

Add concurrency-focused integration coverage for identical and distinct simultaneous payments. Assert no duplicate allocation, no overpaid invoice, deterministic response behavior, and transaction rollback on a unique-constraint race.

## Priority 1 — High-severity blockers

### 1. Restore all documented local role accounts

The running localhost instance rejects analyst, approver, and administrator credentials from `README.md`.

Acceptance criteria:

- The documented quick-start command launches a mode where all documented local accounts work.
- If a production build intentionally disables them, the startup/handoff instructions explicitly set the required local-demo flag for `next start`, and the login page does not advertise credentials that are disabled.
- Browser tests sign in as analyst, approver, and administrator and assert the displayed role.
- Analyst approval is rejected by the API and leaves the exception open.
- Approver approval succeeds with a reason, writes an `exception_reviews` row and audit event, and survives refresh.
- Add a safe logout control and test that protected routes redirect after logout.

### 2. Integrate real local ML inference into the application path

`inferAnomaly` exists but has no caller. New exceptions are unscored.

Acceptance criteria:

- Exception creation invokes the versioned local model through a bounded, testable service.
- Persist `inference_records` with model version, exact input snapshot, score, threshold, supporting indicators/explanation, and status.
- Exception Center and AI Insights display the model version and provenance for new exceptions.
- Model output remains advisory and cannot mutate allocations or approve resolutions.
- Model failure produces an explicit unavailable/fallback state without fabricating a score.
- Integration tests create a new exception and verify a corresponding inference record and displayed score.

### 3. Repair the bundled CSV workflow

`samples/payments.csv` currently accepts only the missing-reference row because customer aliases do not match workspace-scoped primary keys.

Acceptance criteria:

- In a fresh demo, the bundled sample produces the documented exact, partial, unmatched, and invalid outcomes.
- Choose one explicit contract: stable external customer reference, documented customer ID exported by the UI, or server-side alias resolution. Do not weaken workspace scoping.
- The UI displays each rejected row number and sanitized actionable reason.
- Re-importing the same file demonstrates idempotency and conflicts without duplicate allocation.
- Add API and browser tests for correct, partial, missing, duplicate, invalid amount, malformed columns, formula prefix, unsupported currency, and oversized file cases.

### 4. Fix the shared form lifecycle

`ActionForm` dereferences `event.currentTarget` after awaiting fetch, causing a null reset error and preventing `router.refresh()`.

Acceptance criteria:

- Capture a stable form reference before awaiting, or otherwise avoid post-await use of the synthetic event target.
- Successful actions reset only when appropriate and refresh affected server-rendered data immediately.
- Failed actions retain correctable input and show an accessible error.
- No console error occurs for order, invoice, payment, exception, or workflow actions.
- Browser tests assert the new row/state is visible without manual reload.

### 5. Remove the production session-secret fallback

Acceptance criteria:

- In production, startup or session issuance fails closed when `SESSION_SECRET` is absent, default, or too short.
- A local-only fallback may be permitted only under an explicit development/test condition and must never apply to production.
- Add tests covering production misconfiguration, secret length, signature tamper, and expiry.

## Priority 2 — Complete core user workflows

### Orders and customers

- Add customer creation with server validation and workspace scope.
- Support multiple order line items and exact aggregate tax/total calculations.
- Support draft editing without allowing finalized/invoiced history to be silently changed.
- Make lifecycle transitions explicit: draft → confirmed → invoiced, or change product requirements/documentation consistently if intentionally combined.
- Add browser tests for required fields, negative/zero amounts, invalid quantities, persistence, and forbidden finalized edits.

### Invoice management

- Add invoice detail with line items, payment/allocation history, exact outstanding balance, issue/due dates, and audit evidence.
- Add search/filter by invoice, customer, and status.
- Keep PDF explicitly out of scope or implement it; do not imply it exists.
- Add overdue-state coverage with a controllable test clock or fixture.

### Exception investigation

- Add filters, investigation notes, review history, and clear structured evidence instead of raw JSON.
- Do not render an enabled approval control to unauthorized roles; still retain server-side checks.
- Show model/version/provenance and distinguish deterministic rules, ML inference, and optional LLM output.

## Priority 3 — Reliability, analytics, and responsive UX

### Workflow Lab

- Keep duplicate/conflict scenarios routed through real domain services.
- For timeout and queue failure, either implement a real local retry/recovery harness or label them strictly as state-fixture simulations.
- Provide an explicit retry/recovery action and show attempt/state transitions, terminal failure, and unchanged finance state.
- Do not report `Invariant Preserved` solely because a pending row was inserted.

### Analytics and audit

- Render workflow failure statistics already queried by the repository.
- Add processing latency and job-state metrics with source definitions.
- Add filters and clearly label synthetic/model evaluation sources.
- Either implement audit search or remove `searchable` from the Settings description.
- Add an independent hash-chain verification function/test from a trusted head.

### Mobile and accessibility

- Add a visible, keyboard-operable mobile navigation control with focus management and an accessible name.
- Verify representative 390×844, 768×1024, and 1440×900 layouts without overflow.
- Test keyboard navigation through forms, dialogs/menu, tables, errors, and approval controls.
- Run automated accessibility checks and fix high-impact label, focus, and contrast issues.

## Required regression suite

Expand the current single E2E navigation test into browser workflows that cover:

1. Fresh isolated demo and cross-context isolation.
2. Customer → multi-line order → confirm → invoice → exact payment → paid invoice → audit history.
3. Partial and two-distinct-identical-amount payments.
4. Duplicate and conflicting deliveries.
5. Bundled CSV with per-row results.
6. Analyst denial and approver success.
7. New exception ML inference provenance.
8. All Workflow Lab scenarios with meaningful final-state assertions.
9. Immediate mutation refresh and zero console errors.
10. Mobile navigation.

## Completion evidence

Before claiming completion, provide:

- Fresh browser evidence for every acceptance criterion.
- Unit/integration/E2E command results with exact counts.
- A mapping from each audit finding F-01 through F-14 to the fixing commit/file and regression test.
- Explicitly remaining limitations (no live AWS/LLM/Vercel unless separately authorized).
- No deployment, billable resource, or external provider activation.

