# Second Entry — Feature Coverage Matrix

Status definitions follow the audit brief. The 63 numbered rows below are the source of the report counts.

| # | Capability / scenario | Status | Independent evidence |
|---:|---|---|---|
| 1 | Landing page, branding, product description, synthetic disclaimer | PASS | `/`; browser DOM and visual inspection |
| 2 | Try isolated demo without subscription | PASS | `/api/session/demo` entered a seeded guest workspace |
| 3 | Demo session survives refresh | PASS | Created order/payment records persisted after reload |
| 4 | Separate demo-session isolation | PASS | Distinct workspace IDs; second context had only its own seed records |
| 5 | Baseline dashboard arithmetic | PASS | 9,379.00 − 2,443.00 = 6,936.00 |
| 6 | Dashboard updates after invoice | PASS | Invoiced total increased by 226.23 after reload |
| 7 | Dashboard updates after payment | PASS | Received and completion metrics changed after reload |
| 8 | Create valid synthetic order | PASS | `Independent QA services` created |
| 9 | Reject negative order quantity | PASS | Native `min=1`; submission prevented |
| 10 | Order persists after refresh with exact tax/total | PASS | 200.20 + 26.03 = 226.23 |
| 11 | Issue invoice from eligible order | PASS | Draft was confirmed and invoice issued |
| 12 | Create customer | NOT IMPLEMENTED | No customer page, route, or form |
| 13 | Multiple order line items | NOT IMPLEMENTED | Single description/quantity/price only |
| 14 | Edit draft and explicit confirm transition | NOT IMPLEMENTED | No edit/confirm controls; issuance combines transitions |
| 15 | Invoice creation, association, dates, totals, identifier | PASS | `INV-2026-617524`, Aster, current/+30 dates, 226.23 |
| 16 | Invoice status and balance after exact payment | PASS | Paid 226.23; outstanding 0.00 |
| 17 | Invoice detail/search/filter/history/PDF | NOT IMPLEMENTED | Register-only page; PDF absence documented |
| 18 | Manual exact payment | PASS | `qa-exact-20261030-01` auto-matched |
| 19 | Reject negative payment amount | PASS | Native validation message observed |
| 20 | Require source event ID | PASS | Native required validation observed |
| 21 | Partial payment | PASS | 100.00 allocated; remaining balance correct |
| 22 | Two distinct same-amount payments | PASS | Both 100.00 source events allocated |
| 23 | Identical source-event replay | PASS | `Duplicate delivery ignored`; no second allocation |
| 24 | Conflicting source-event replay | PASS | Conflict denied; balance unchanged |
| 25 | Unknown/missing invoice reference | PASS | Unmatched-payment exception created |
| 26 | Customer mismatch | PASS | Customer-mismatch exception created |
| 27 | Overpayment | PASS | High-severity exception; no allocation |
| 28 | Payment against already-paid invoice | PASS | Already-paid exception; no allocation |
| 29 | Currency mismatch | NOT VERIFIED | UI/API schema expose CAD only; source rejects non-CAD before reconciliation |
| 30 | Bundled sample CSV import | FAIL | Fresh demo: 1 accepted, 3 rejected |
| 31 | Clear per-row CSV rejection messages | FAIL | UI discards API row/error details |
| 32 | Reconciliation decision evidence | PASS | 11 processed rows with deterministic reason text |
| 33 | Exception details, evidence, severity, risk display | PASS | Browser inspected six exception cards |
| 34 | Backend denial of guest approval | PASS | Denial message plus audit event |
| 35 | Authorized approver resolution and history | BLOCKED | Documented approver login rejected |
| 36 | Exception filters, notes, review history | NOT IMPLEMENTED | No filter/note/history controls |
| 37 | Honest deterministic AI fallback | PASS | Clearly labeled non-AI and advisory |
| 38 | Runtime ML scoring for new exceptions | FAIL | All audit-created exceptions show `Not scored`; inference function unused |
| 39 | Governance registry, metrics, policies, limitations | PASS | `/app/governance` inspected |
| 40 | Per-decision model/version/input record | PARTIAL | Seed scores exist; UI has no decision records and new records are unscored |
| 41 | Finance Analyst login | FAIL | Documented credentials rejected |
| 42 | Finance Approver login | FAIL | Documented credentials rejected |
| 43 | Administrator login | FAIL | Documented credentials rejected |
| 44 | Logout and practical session-expiry UX | NOT IMPLEMENTED | No logout; eight-hour expiry not browser-waited |
| 45 | Workflow Lab duplicate delivery | PASS | Same payment ID; duplicate ignored; no duplicate allocation |
| 46 | Workflow Lab worker timeout | PARTIAL | Retry-pending record inserted; no retry/recovery observed |
| 47 | Workflow Lab queue delivery failure | PARTIAL | Pending outbox/job inserted; no delivery/recovery observed |
| 48 | Workflow Lab unauthorized approval | PASS | Analyst denial and unchanged exception evidence |
| 49 | Workflow Lab AI service failure | PASS | Unavailable status, deterministic fallback, no finance mutation |
| 50 | Workflow Lab conflicting events | PASS | Conflict detected; no silent overwrite |
| 51 | Persistent job/recovery lifecycle | PARTIAL | Jobs persisted after reload; no transition beyond pending states |
| 52 | Analytics reconciliation/exception counts | PASS | Counts matched visible records after audit operations |
| 53 | Latency, workflow-failure stats, filters | NOT IMPLEMENTED | Not rendered on analytics page |
| 54 | Architecture explorer and deployment truth | PASS | Local/code-ready/not-deployed distinction is explicit |
| 55 | Desktop layout | PASS | 1440×900; no horizontal overflow |
| 56 | Tablet layout | PASS | 768×1024; no horizontal overflow |
| 57 | Mobile content layout | PASS | 390×844; KPI cards stack, no horizontal overflow |
| 58 | Mobile application navigation | FAIL | Sidebar hidden and no menu control rendered |
| 59 | Representative keyboard navigation | PASS | Logical focus order across navigation links |
| 60 | Automatic UI refresh after mutation | FAIL | Lists/KPIs stale until manual reload |
| 61 | Console cleanliness during core actions | FAIL | Repeated null `reset` TypeError |
| 62 | Fresh unit/integration suite | PASS | 8 files, 27/27 tests passed |
| 63 | Fresh existing E2E suite | PASS | 1/1 passed; navigation visibility only |

## Claim/evidence distinctions

| Area | Browser-observed behavior | Code presence | Independent automated evidence |
|---|---|---|---|
| Persistence | Records survive refresh | PGlite client + migration | Repository integration tests pass |
| Exact/partial reconciliation | Exercised successfully | Deterministic domain function + transaction | Unit/integration tests pass |
| Idempotency/conflict | Exercised sequentially | Unique workspace/source constraint | Integration tests pass; concurrency not covered |
| Server authorization | Guest denial exercised | Role policy in repository | Policy/integration tests pass; positive browser path blocked |
| Audit evidence | Events visible with hashes | Append function and predecessor hash | No independent chain-verification test |
| ML inference | New exceptions unscored | Model and inference function exist | Model unit tests only; no runtime integration test |
| AWS worker | Not deployed or invoked | SAM, worker, signing, callback code exist | Local unit/static evidence only |
| Recovery | Pending states visible | Simulation inserts jobs/outbox | No real retry/redrive/recovery integration test |

