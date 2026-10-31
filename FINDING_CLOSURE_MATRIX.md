# Finding Closure Matrix

Evidence date: 2026-10-31 (Asia/Riyadh). `audit/` remains unchanged.

Status meanings: **FIXED** = implemented and locally verified; **PARTIAL** = meaningful remediation exists but acceptance is incomplete; **NOT FIXED** = no material closure; **NOT VERIFIED** = code exists without required runtime; **BLOCKED** = unavailable external environment/tool.

## Independent source findings

| ID | Status | Changed evidence | Verification |
|---|---|---|---|
| SE-C1 | FIXED | `repository.ts`, `audit.ts`, migrations 0002/0003 | 10 simultaneous payments × 20 iterations, repeated 3 runs; allocation sum equals invoice paid balance and never exceeds total |
| SE-C2 | FIXED | `session.ts`, Vitest env | missing/weak secret fails closed; retired public-secret token rejected |
| SE-H1 | FIXED | server-only `DEMO_ACCOUNTS_ENABLED`; isolated `demo-role-*` workspace | unit isolation test; approver browser flow |
| SE-H2 | FIXED | locked `audit_heads`, atomic `appendAuditTx`, independent verifier | 20 concurrent mutations produce no fork; verifier returns valid |
| SE-H3 | FIXED | runtime feature extraction/inference, inference records, real worker scoring | new exceptions and seed exceptions use model 1.1.0; worker score is not constant |
| SE-H4 | FIXED | Workflow Lab queries before/after state and drives real services/dispatcher/fallback | integration scenarios; no fixed verdict assignment |
| SE-H5 | PARTIAL | durable outbox, retrying dispatcher, local/SQS adapters, real worker, terminal callback guards | local retry and callback duplicate/conflict tests pass; no live SQS/Lambda |
| SE-H6 | FIXED | transactional approve/reject/note lifecycle; overpayment `refund_due` credit | service and browser approver tests |
| SE-H7 | PARTIAL | typed, schema-validated provider contract and evidence-specific deterministic fallback | forced outage records fallback; live provider intentionally disabled/unverified |
| SE-H8 | FIXED | required docs and Architecture page truth pass | documentation review |
| SE-M1 | FIXED | atomic `ON CONFLICT` replay handling | concurrent identical replay returns one payment ID |
| SE-M2 | FIXED | normalized full economic fingerprint | reference/customer/amount/currency conflicts rejected without overwrite |
| SE-M3 | FIXED | workspace customer lookup before insert | cross-workspace customer test |
| SE-M4 | FIXED | quoted CSV parser, external customer codes, row errors, corrected sample | bundled sample 3 accepted / 1 rejected |
| SE-M5 | FIXED | transactional per-workspace document sequences | concurrent creation no longer uses wall-clock numbers |
| SE-M6 | PARTIAL | draft/voided rejected; overdue payable | decision tests pass; overdue is still derived in KPI rather than persisted by a scheduler |
| SE-M7 | PARTIAL | seeding moved to explicit session creation; mutations validate JSON/origin | durable serverless rate limiting and demo expiry cleanup not implemented |
| SE-M8 | NOT FIXED | existing single-line order and register preserved | customer creation, multi-line edit/confirm/cancel, and invoice detail remain open |
| SE-M9 | PARTIAL | inference/review links and human-only resolution are persisted | some Governance copy still summarizes broad policies rather than a per-policy registry |
| SE-M10 | FIXED | train/validation/held-out groups, validation threshold, true baselines, contribution explanations, dry-run default | deterministic model reproduction test and `npm run ml:evaluate` |
| SE-M11 | PARTIAL | esbuild/CodeUri, SecureString reference, DLQ alarm, 9 structural assertions | local structural validation passes; SAM CLI unavailable |
| SE-M12 | NOT VERIFIED | `DATABASE_URL` Postgres adapter and migration ledger | PGlite verified; no PostgreSQL service supplied; Drizzle schema remains non-authoritative |
| SE-M13 | PARTIAL | 39 tests, concurrency, CSV, callback, pipeline, role and 3 browser workflows | coverage 78.54% statements / 67.64% branches, below requested 80% |
| SE-L1 | FIXED | malformed login mapped to stable 400 | route behavior/source review |
| SE-L2 | FIXED | logout route and UI | browser redirect/protected-route test |
| SE-L3 | FIXED | CSP, frame, MIME, referrer, permissions, production HSTS headers | production build/config |
| SE-L4 | PARTIAL | JSON/content-type and same-host Origin checks on financial/workflow/exception routes | helper and browser use verified; a complete route matrix remains open |
| SE-L5 | FIXED | timing-safe comparison; credentials removed from rendered login page | source and browser login |
| SE-L6 | NOT FIXED | — | analytics naming/latency breadth remains limited |
| SE-L7 | FIXED | Architecture statuses distinguish verified/code-ready/not-deployed | page/source review |
| SE-L8 | PARTIAL | new/remediated critical modules are formatted and typed | legacy condensed files and non-authoritative Drizzle file remain |
| SE-L9 | FIXED | ML evaluation is dry-run unless `--write` | command output and reproduction test |
| SE-L10 | FIXED | Playwright explicitly uses installed system Chrome | 3/3 E2E pass |

## Independent browser findings

| ID | Status | Evidence |
|---|---|---|
| F-01 | FIXED | server-only isolated role login; approver browser test passes |
| F-02 | FIXED | new exceptions persist model score/version/input/explanation |
| F-03 | FIXED | bundled CSV integration test: 3 accepted / 1 rejected |
| F-04 | FIXED | stable form reference captured before await; immediate-row E2E and clean console |
| F-05 | FIXED | no fallback signing secret; retired-secret negative test |
| F-06 | FIXED | accessible mobile menu, Escape focus return, navigation test |
| F-07 | FIXED | rejected row number and sanitized reason rendered |
| F-08 | NOT FIXED | customer/multi-line/draft lifecycle breadth remains open |
| F-09 | NOT FIXED | invoice detail/search/history remain open; PDF remains out of scope |
| F-10 | PARTIAL | structured evidence, notes, provenance and review timeline added; filters remain open |
| F-11 | NOT FIXED | latency/trend/filter analytics remain open |
| F-12 | FIXED | timeout reaches terminal failure; queue failure retries then delivers |
| F-13 | FIXED | inaccurate “searchable” claim removed; table remains clearly an evidence register |
| F-14 | FIXED | desktop/mobile logout clears cookie and protected route redirects |
