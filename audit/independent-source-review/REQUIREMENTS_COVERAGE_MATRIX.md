# Second Entry — Requirements Coverage Matrix

Legend:
- **PASS:** implemented and verified (by test, probe, or, for IaC, by inspection).
- **PARTIAL:** implemented but incomplete or insufficiently verified.
- **FAIL:** confirmed defective behaviour.
- **MISSING:** not implemented.
- **NOT VERIFIED:** insufficient evidence.
- **BLOCKED:** an external limitation prevented the check.

Finding IDs (SE-xx) refer to `CRITICAL_FINDINGS.md`. Probe IDs (P#, H#, C#) refer to `evidence/`. "repo" = `src/server/db/repository.ts`.

## Summary

| Status | Count |
|---|---:|
| PASS | 52 |
| PARTIAL | 55 |
| FAIL | 13 |
| MISSING | 24 |
| NOT VERIFIED | 1 |
| BLOCKED | 1 |
| **Total** | **146** |

---

## A. Customer and Order Management

| # | Requirement | Status | Code | Evidence | Missing behaviour | Remediation |
|---|---|---|---|---|---|---|
| A1 | Customer creation and persistence | MISSING | repo:34 (seed only) | No route or UI inserts customers | Create/edit customer | Add `POST /api/customers` with Zod validation, workspace scoping, audit |
| A2 | Order creation (DB-backed) | PASS | repo:96-103 | Integration test; P13/P14 | — | — |
| A3 | Multiple line items | MISSING | repo:96-101; `api/orders/route.ts:2` | Input takes one description/qty/price | N items per order | Accept an `items[]` array; sum exact cents per line |
| A4 | Quantity/price validation | PARTIAL | `api/orders/route.ts:2`; `server/parse.ts:1`; repo:98 | Code inspection; route coverage 0% | Route-level tests | Add route tests (bounds, decimals, negatives) |
| A5 | Subtotal and tax | PASS | `domain/money.ts:28-32`; repo:100 | money.test; integration (22602); P11 exact at the upper bound | — | — |
| A6 | Order state transitions | PARTIAL | migration:14; repo:107 | Only draft/confirmed → invoiced | Cancel, confirm, state machine | Explicit transition table plus guarded UPDATEs |
| A7 | Order confirmation | MISSING | — | Confirmation merged into invoicing | Discrete confirm step | `POST /api/orders/:id/confirm` |
| A8 | Invoice from confirmed order (once) | PASS | repo:105-108; migration:24 `UNIQUE(order_id)` | P13: concurrent double issue → one invoice | — | Return 409 rather than a raw DB error |
| A9 | Customer/order/invoice relationships | PASS | migration FKs:13,24 | Schema inspection; integration test | — | — |
| A10 | Prevention of invalid financial mutations | PARTIAL | migration CHECKs; no edit APIs | SE-C1, SE-M6 | Concurrency-safe guards; immutability | See SE-C1 |

## B. Invoice Management

| # | Requirement | Status | Code | Evidence | Missing behaviour | Remediation |
|---|---|---|---|---|---|---|
| B1 | Unique invoice IDs | PARTIAL | repo:107 | UUID PK unique; number from `Date.now()` collides (SE-M5) | Collision-free numbering | Per-workspace sequence |
| B2 | Invoice totals | PASS | repo:107 copies order totals | Integration test | — | — |
| B3 | Due dates | PASS | repo:107 (`CURRENT_DATE+30`) | Inspection | Configurable terms | Optional |
| B4 | Outstanding balances | PARTIAL | `invoices/page.tsx:2` | Correct when sequential; diverges from allocations under concurrency (P1) | Concurrency safety | SE-C1 |
| B5 | Paid / partially-paid states | PARTIAL | repo:118 | Correct when sequential (H4, CSV rounds); P1b divergence | — | SE-C1 |
| B6 | Overdue invoices | PARTIAL | repo:81 (KPI only) | P10: status never becomes `overdue` | Status derivation | Derived view or scheduled job; reconciliation must accept overdue |
| B7 | Payment history per invoice | MISSING | — | No allocation view | History | Invoice detail page and API |
| B8 | Invoice-to-order association | PASS | migration:24 | Inspection | — | — |
| B9 | Restrictions on editing finalized records | PARTIAL | No edit APIs exist | P5: voided invoice accepts allocations | DB immutability; void handling | Reject voided/draft in `decideReconciliation`; triggers |
| B10 | Exact monetary arithmetic | PASS | `money.ts`; integer `bigint` columns | money.test; P11 | — | Use BigInt for the multiply-before-divide step if bounds rise |

## C. Payment Processing

| # | Requirement | Status | Code | Evidence | Missing behaviour | Remediation |
|---|---|---|---|---|---|---|
| C1 | Manual payment creation | PASS | `api/payments/route.ts`; repo:110-121 | H4, H5 (HTTP 201/200) | — | — |
| C2 | CSV import | FAIL | `api/payments/import/route.ts:3` | H6: bundled sample → 2 of 3 valid rows rejected (FK) | Usable customer key; RFC-4180 | SE-M4 |
| C3 | Input validation | PASS | Zod schemas, `decimalToCents` | H9; code | — | — |
| C4 | Synthetic provider-event simulation | MISSING | — | No webhook/provider simulator | Provider event feed | Signed synthetic provider webhook route |
| C5 | Duplicate detection | PARTIAL | repo:112 | Sequential idempotent (integration, H5); concurrent → 400 (P2); conflict check ignores reference/customer (SE-M2) | Atomic idempotency | `ON CONFLICT` plus full fingerprint |
| C6 | Persistent payment records | PASS | migration:30-35 | Integration test | — | — |
| C7 | Invalid payment handling | PASS | repo:111; CSV row checks | H6 row 5 rejected; code | — | — |
| C8 | Currency handling | PASS | `money.ts:3`; Zod literal; repo:111 | Code; non-CAD rejected | Multi-currency (out of scope) | — |
| C9 | Same-amount legitimate payments distinguishable | PASS | migration:34 | Integration test "same-amount distinct events" | — | — |

## D. Reconciliation Engine

| # | Requirement | Status | Code | Evidence | Missing behaviour | Remediation |
|---|---|---|---|---|---|---|
| D1 | Exact matching | PASS | `domain/reconciliation.ts:33` | Unit test; H4 | — | — |
| D2 | Partial payments | PASS | reconciliation.ts:34 | Unit test; HTTP race rounds | — | — |
| D3 | Multiple payments vs one invoice | PARTIAL | repo:118 | Sequential correct (27×20000 = 540000); concurrent corrupt (P1b) | — | SE-C1 |
| D4 | Duplicate event handling | PARTIAL | repo:112 | P2; SE-M2 | — | SE-M1/M2 |
| D5 | Unmatched payments | PASS | reconciliation.ts:28 | Unit test; H5 | — | — |
| D6 | Ambiguous invoice references | PARTIAL | migration:28 unique number | Ambiguity structurally impossible; no normalisation (case/whitespace) | Normalisation, multi-reference | Normalise references; handle multi-invoice remittances |
| D7 | Incorrect customer references | PASS | reconciliation.ts:29 | Unit test | Only checked when a customer is supplied | — |
| D8 | Currency mismatches | PARTIAL | reconciliation.ts:30 | Branch unreachable (CAD forced upstream); untested | — | Keep the input rejection; test the branch |
| D9 | Overpayments | PARTIAL | reconciliation.ts:32 | Unit test; P8: no resolution policy | Refund/credit/apply-and-hold | Explicit overpayment policy |
| D10 | Already-paid invoices | PARTIAL | reconciliation.ts:31 | Untested | Test | Add unit and integration tests |
| D11 | Conflicting payment events | PARTIAL | repo:112 | Integration (amount conflict); SE-M2 | Full-field conflict | Fingerprint comparison |
| D12 | Reconciliation status updates | PASS | repo:117 | H4; CSV rounds | — | — |
| D13 | Locking / idempotency / concurrency | **FAIL** | repo:114-118 | P1, P1b (corruption); P2 | Row lock; rowcount check | **SE-C1** |

## E. Exception Management

| # | Requirement | Status | Code | Evidence | Missing behaviour | Remediation |
|---|---|---|---|---|---|---|
| E1 | Exception generation | PASS | repo:119 | P9; integration | — | — |
| E2 | Categorization | PASS | reconciliation.ts:22 | Unit tests | — | — |
| E3 | Severity | PARTIAL | repo:119 | Overpayment = high, everything else = medium | Severity policy | Rule table (amount, type, risk) |
| E4 | Supporting evidence | PARTIAL | repo:119 | Only `{reason, amountCents}` | Invoice snapshot, customer, references | Structured evidence schema |
| E5 | Investigation status | MISSING | — | Status ∈ {open, resolved} | investigating / awaiting info | State machine |
| E6 | Reviewer notes | PARTIAL | repo:125 | Reason only at resolution | Interim notes | `exception_notes` |
| E7 | Exception resolution | PARTIAL | repo:123-126 | P8: no financial effect; non-atomic | Resolution actions | SE-H6 |
| E8 | Approval or rejection | PARTIAL | repo:125 (`'approved'` only) | No reject path | Reject / return | Add actions |
| E9 | Complete event history | PARTIAL | `exception_reviews`; audit | Not displayed; audit non-atomic | History UI | Show the timeline |
| E10 | Appropriate status transitions | MISSING | repo:125 `status<>'resolved'` | — | Transition rules | State machine with guarded UPDATEs |

## F. Machine Learning

| # | Requirement | Status | Code | Evidence | Missing behaviour | Remediation |
|---|---|---|---|---|---|---|
| F1 | Dataset generation | PASS | `ml/train.ts:6-7` | Reproduced | — | — |
| F2 | Feature engineering | PASS | `ml/model.ts:1`; train.ts:11 | Inspection | Features not derivable from app data yet | Implement feature extraction from DB |
| F3 | Model selection | PARTIAL | train.ts | One model; no comparison | Candidate comparison | Compare against real baselines |
| F4 | Training implementation | PASS | train.ts:11 (gradient descent + L2) | Reproduced | — | — |
| F5 | Saved model artifact | PASS | `ml/artifacts/anomaly-model.json` | Hash unchanged; reproduced byte-identical | — | — |
| F6 | Inference implementation | PARTIAL | `server/ml/inference.ts:5` | 0% coverage; explanations rank raw values | Contribution-based explanation | `w_i × z_i` contributions |
| F7 | Model versioning | PARTIAL | artifact `version`; `model_versions` row | P12: placeholder metrics, approved=true | Registry populated from artifact | Upsert the registry from the evaluation run |
| F8 | Model actually used by the app | **FAIL** | No callers of `inferAnomaly`; repo:62-65 | P9; C2 | Scoring on exception creation | **SE-H3** |
| F9 | Evaluation methodology | PARTIAL | train.ts:9,11 | Threshold tuned on test; pseudo-baseline | Validation split; true baselines | SE-M10 |
| F10 | Train/test separation | PASS | train.ts:11 (group split, train-only scaling) | Inspection; reproduced | — | — |
| F11 | Data-leakage risks | PARTIAL | train.ts:11 | Threshold selection leak; circular labels | — | Use a validation fold |
| F12 | Reproducibility | PASS | train.ts seed | Two runs identical to committed artifact (excluding `generatedAt`) | — | — |
| F13 | Reported metrics verified | PASS | ML_EVALUATION.md | P 0.4975 / R 0.7279 / F1 0.5910 / AUC 0.7223 reproduced exactly | — | — |

## G. Generative AI

| # | Requirement | Status | Code | Evidence | Missing behaviour | Remediation |
|---|---|---|---|---|---|---|
| G1 | Real provider integration | MISSING | — | No SDK or code; env vars unread | — | Optional adapter (local/free provider), disabled by default |
| G2 | Structured AI outputs | MISSING | — | — | — | Zod schema for AI output |
| G3 | Model/provider abstraction | MISSING | — | ADR-004 claim false | — | `AiProvider` interface plus fallback implementation |
| G4 | Prompt versioning | MISSING | — | — | — | Versioned prompt registry |
| G5 | Exception-context preparation | MISSING | — | — | — | Bounded, redacted context builder |
| G6 | Output validation | MISSING | — | — | — | Schema-validate; reject on failure |
| G7 | Fallback not misrepresented as live AI | PASS | `ai-insights/page.tsx:2` | Labelled "non-AI fallback" | Summary is generic | Make the fallback evidence-specific |
| G8 | LLM cannot authorize financial changes | PASS | — | Structural: no AI → write path exists (vacuous) | — | Keep it enforced when AI is added |
| G9 | Failure handling / prompt-injection defences | MISSING | — | — | — | Timeouts, AI-failure records, input delimiting |

## H. AI Governance

| # | Requirement | Status | Code | Evidence | Missing behaviour | Remediation |
|---|---|---|---|---|---|---|
| H1 | Model registry | PARTIAL | migration:55-58; repo:66 | P12; UI reads the JSON artifact instead | — | SE-M9 |
| H2 | Model versions | PARTIAL | artifact; registry | Single hard-coded version | Version lifecycle | — |
| H3 | AI decision records | MISSING | `inference_records` never written | P9 | — | Persist every inference |
| H4 | Human approval workflow | PARTIAL | repo:123-126 | Integration test; H8 (403) | Reject; four-eyes | SE-H6 |
| H5 | Governance policies | PARTIAL | `governance/page.tsx:2` | 1 of 5 shown policies enforced | — | SE-M9 |
| H6 | Deterministic policy enforcement (approve) | PASS | `domain/policy.ts`; repo:124 | policy.test; integration; H8 | — | — |
| H7 | Human overrides | MISSING | — | — | — | Override record linked to inference |
| H8 | AI failure records | MISSING | — | Lab writes a literal only | — | Persist AI failures |
| H9 | Approval history | PARTIAL | `exception_reviews` | Written, never displayed | — | UI timeline |
| H10 | Recommendation-to-decision traceability | MISSING | — | No recommendation IDs | — | FK from review to inference record |

## I. Authentication and Security

| # | Requirement | Status | Code | Evidence | Missing behaviour | Remediation |
|---|---|---|---|---|---|---|
| I1 | Authentication implementation | PARTIAL | `session.ts:48-59` | Hard-coded accounts | Real IdP / hashed credentials | SE-H1 |
| I2 | Session management | **FAIL** | `session.ts:7,11` | H3 forged admin accepted | Fail-closed secret; logout | **SE-C2**, SE-L2 |
| I3 | Server-enforced roles | PASS | `policy.ts`; repo:97,106,111,124 | H8; integration | — | — |
| I4 | Analyst permissions | PASS | `policy.ts:5-8` | Integration (analyst denied approve) | — | — |
| I5 | Approver permissions | PASS | `policy.ts:8` | Integration | — | — |
| I6 | Administrator permissions | PARTIAL | `policy.ts:9` | `administer` never checked | Admin-only capabilities | Define or remove |
| I7 | Guest access | PASS | `session.ts:42-44` | H4 isolated workspace; H8 guest 403 | — | — |
| I8 | Tenant/demo isolation | PARTIAL | repo queries scoped | P3 cross-workspace customer; named accounts share a tenant | — | SE-M3, SE-H1 |
| I9 | Restricted API endpoints | PASS | All routes check the session | H9 → 401 | — | — |
| I10 | Input validation | PARTIAL | Zod in routes | H2 → 500; raw DB errors leaked | — | Error mapping |
| I11 | Secure cookie configuration | PASS | `session.ts:46` | Inspection | — | — |
| I12 | CSRF protection | PARTIAL | SameSite=Lax | H11 `text/plain` accepted | Origin/content-type check | SE-L4 |
| I13 | Secrets management | **FAIL** | `session.ts:7` | H3 | Fail closed | SE-C2 |
| I14 | Rate limiting | MISSING | — | — | — | SE-M7 |
| I15 | Cross-user access risks | PARTIAL | — | Shared portfolio tenant; forgeable workspace ID | — | SE-C2, SE-H1 |
| I16 | Public demo cannot gain admin | **FAIL** | `.env.example:12`; README; `session.ts:55` | Code-confirmed; H3 | — | SE-H1, SE-C2 |

## J. AWS Cloud Architecture

| # | Requirement | Status | Code | Evidence | Missing behaviour | Remediation |
|---|---|---|---|---|---|---|
| J1 | TypeScript Lambda worker | PARTIAL | `aws/worker.ts` | C2 constant 0.5 | Real scoring | SE-H3 |
| J2 | SQS producer | MISSING | — | client-sqs never imported | — | Outbox dispatcher using `SendMessage` |
| J3 | Message schemas | PASS | `aws/contracts.ts` | Worker test; C1 | — | — |
| J4 | Queue consumer | PARTIAL | worker.ts:6 | aws-worker.test | Real processing | — |
| J5 | Retry behaviour | PARTIAL | template:15,32 | Malformed → batchItemFailure (test) | Callback 409 classified as failure → retry loop | Treat duplicate-ack as success |
| J6 | Dead-letter queue | PARTIAL | template:8-15 | Inspection only | DLQ handling/alarm | Alarm and runbook |
| J7 | Idempotent worker processing | **FAIL** | worker.ts; result route | C1 redelivery 200; C2 duplicate callbacks | Dedupe on job/processing ID | SE-H5 |
| J8 | Persistent job tracking | PARTIAL | migration:64-67 | Rows created only by the lab | Jobs created by the domain | — |
| J9 | Transactional outbox | MISSING | migration:68-71 | Written by the lab only; no dispatcher | — | Write the outbox in the exception transaction; add a dispatcher |
| J10 | Authenticated result callbacks | PASS | `aws/signing.ts`; result route | aws-signing.test; C1; H10 | — | — |
| J11 | Callback replay protection | PARTIAL | result route | Same nonce → 409; redelivery accepted; completed → failed overwrite | Terminal guard; dedupe | SE-H5 |
| J12 | IAM permissions | PASS (inspection) | template:33-34 | `SQSPollerPolicy` scoped to the queue | — | — |
| J13 | CloudWatch configuration | PARTIAL | template:35-37 | Retention only | Alarms, structured metrics | — |
| J14 | Infrastructure as code | PARTIAL | template.yaml | No CodeUri/build metadata | Deployable bundle | SE-M11 |
| J15 | Local testing support | PARTIAL | aws-worker/signing tests | No local SQS/end-to-end loop | — | Local loop with an in-memory queue |
| J16 | Deployment documentation | PASS | AWS_DEPLOYMENT.md | Inspection | — | — |
| J17 | Resource cleanup guidance | PASS | AWS_DEPLOYMENT.md | Inspection | — | — |

## K. Failure Simulation Lab

| # | Scenario | Status | Code | Evidence | Remediation |
|---|---|---|---|---|---|
| K1 | Duplicate payment delivery | PARTIAL | repo:135 | Real ingest; `allocationDuplicated:false` literal; outcome constant (P6) | Measure post-conditions |
| K2 | Worker timeout | FAIL | repo:137 | Inserts a row only | Invoke worker with injected timeout; observe retry |
| K3 | Queue failure | FAIL | repo:139 | Inserts rows only; no dispatcher | Run the dispatcher with a failing publisher |
| K4 | Unauthorized approval | FAIL | repo:141 | P7: tautological; admin still "denied" | Call `resolveException` with an analyst session |
| K5 | AI service outage | FAIL | repo:143 | Object literal | Force an adapter failure |
| K6 | Conflicting financial events | PARTIAL | repo:145 | Real conflict path; `silentOverwrite` literal | Verify the stored row is unchanged |
| K7 | Persisted and auditable | PASS | repo:147 | `workflow_events` and audit rows (P6) | — |

## L. Analytics and Dashboard

| # | Metric | Status | Code | Evidence | Remediation |
|---|---|---|---|---|---|
| L1 | Invoiced amounts | PASS | repo:81 | SQL on `invoices` | — |
| L2 | Received payments | PARTIAL | repo:81; `app/page.tsx:3` | Shows allocated `paid_cents`, not cash received | Separate "cash received" from "applied" |
| L3 | Outstanding balances | PASS | repo:81 | SQL (inherits SE-C1 risk) | — |
| L4 | Overdue | PASS | repo:81 | SQL `due_date < CURRENT_DATE` | — |
| L5 | Reconciliation rate | PARTIAL | `app/page.tsx:3` | Counts partials as matched | Define the metric explicitly |
| L6 | Pending exceptions | PASS | repo:83 | SQL | — |
| L7 | Processing latency | MISSING | — | — | Timestamps on jobs |
| L8 | Workflow reliability | MISSING | repo:129 (queried, not rendered) | `analytics/page.tsx` | Render it, or remove the query |
| L9 | ML evaluation metrics | PASS | `analytics/page.tsx:2` | Matches the reproduced artifact | Relabel the baseline |
| L10 | Model version info | PASS | `governance/page.tsx:2` | From the artifact | — |

## M. Architecture Explorer

| # | Requirement | Status | Code | Evidence | Remediation |
|---|---|---|---|---|---|
| M1 | Accurately represents components | FAIL | `architecture/page.tsx:2`; ARCHITECTURE.md | Outbox "live local", "idempotent worker", Model → Domain are false | Correct the statuses; derive them from config |
| M2 | Honest deployment status (AWS/Vercel not deployed) | PASS | `architecture/page.tsx:3`; settings page | Inspection | — |

## N. Cross-cutting / Platform

| # | Requirement | Status | Code | Evidence | Remediation |
|---|---|---|---|---|---|
| N1 | Durable, atomic audit trail | FAIL | repo:71-77 | P4 fork; non-atomic | SE-H2 |
| N2 | Drizzle ORM | PARTIAL | `db/schema.ts` | Unused; diverges from migration | SE-M12 |
| N3 | PostgreSQL production adapter | MISSING | `server/db/client.ts` | `DATABASE_URL` ignored | SE-M12 |
| N4 | Vercel deployment preparation | PARTIAL | `next.config.ts` | PGlite unsuitable (documented); `output: standalone` | Postgres adapter |
| N5 | Vitest / Playwright | PARTIAL | tests/ | 27/27 and 1/1 reproduced; shallow | See test assessment |
| N6 | CI | PARTIAL | `.github/workflows/ci.yml` | No E2E; `ml:evaluate` rewrites the artifact | Add E2E and an artifact-diff check |
| N7 | Zero dependency vulnerabilities | PASS | package-lock | `npm audit` (all and prod): 0 | — |
| N8 | Typecheck / lint / build | PASS | — | All three reproduced in the scratch copy | — |
| N9 | SAM service-side validation | BLOCKED | template.yaml | No SAM CLI or AWS authorisation | Run `sam validate --lint` when authorised |
| N10 | Vercel runtime file tracing of `db/migrations` | NOT VERIFIED | `client.ts:12` | Not deployed | Verify in a preview deploy once Postgres is in place |
