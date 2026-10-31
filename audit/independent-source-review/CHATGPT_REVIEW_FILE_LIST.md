# Files to Upload for an Additional Independent Review (ChatGPT)

All paths are relative to `C:\Users\user\Documents\The Second Entry`. Files are listed in priority order within each group. If upload limits apply, send the **★** files first: about 15 files that cover every critical and high finding.

Don't upload `data/pglite/`, `node_modules/`, `.next/`, `.npm-cache/`, `package-lock.json` (too large and low value), or any `.env.local` (none exists today).

## 0. Audit context (upload first)
1. ★ `audit/independent-source-review/CRITICAL_FINDINGS.md`
2. ★ `audit/independent-source-review/REQUIREMENTS_COVERAGE_MATRIX.md`
3. `audit/independent-source-review/INDEPENDENT_TECHNICAL_AUDIT.md`
4. `audit/independent-source-review/TEST_COVERAGE_ASSESSMENT.md`
5. `audit/independent-source-review/RECOMMENDED_FIX_PLAN.md`

## 1. Financial correctness and database
1. ★ `src/server/db/repository.ts`: all persistence, reconciliation orchestration, audit chain, Workflow Lab
2. ★ `src/domain/reconciliation.ts`
3. ★ `db/migrations/0001_initial.sql`
4. ★ `src/domain/money.ts`
5. `src/server/parse.ts`
6. `src/server/db/client.ts`
7. `db/schema.ts`
8. `src/app/api/payments/route.ts`
9. `src/app/api/payments/import/route.ts`
10. `src/app/api/orders/route.ts`
11. `src/app/api/invoices/route.ts`
12. `samples/payments.csv`
13. `audit/independent-source-review/evidence/financial.probe.test.ts.txt`
14. `audit/independent-source-review/evidence/financial-probe-output.txt`
15. `audit/independent-source-review/evidence/http-race-output.txt`
16. `audit/independent-source-review/evidence/http-race-csv-output.txt`
17. `DATABASE.md`

## 2. Security and governance
1. ★ `src/server/auth/session.ts`
2. ★ `src/domain/policy.ts`
3. ★ `src/app/api/exceptions/[id]/resolve/route.ts`
4. `src/app/api/session/login/route.ts`
5. `src/app/api/session/demo/route.ts`
6. `src/app/api/workflow-lab/route.ts`
7. `src/server/api-response.ts`
8. `src/app/app/layout.tsx`
9. `src/app/login/page.tsx`
10. `src/app/app/governance/page.tsx`
11. `src/app/app/exceptions/page.tsx`
12. `.env.example`
13. `next.config.ts`
14. `audit/independent-source-review/evidence/http-probe.mjs.txt`
15. `audit/independent-source-review/evidence/http-probe-output.txt`
16. `SECURITY.md`
17. `README.md`

## 3. AI and ML
1. ★ `ml/train.ts`
2. ★ `ml/model.ts`
3. ★ `src/server/ml/inference.ts`
4. `ml/artifacts/anomaly-model.json`
5. `src/app/app/ai-insights/page.tsx`
6. `src/app/app/analytics/page.tsx`
7. `tests/ml.test.ts`
8. `ML_EVALUATION.md`
9. `DECISIONS.md`

## 4. AWS integration and reliability
1. ★ `aws/worker.ts`
2. ★ `src/app/api/internal/jobs/result/route.ts`
3. `aws/signing.ts`
4. `aws/contracts.ts`
5. `aws/template.yaml`
6. `scripts/validate-aws.ts`
7. `src/app/app/workflow-lab/page.tsx`
8. `src/app/app/settings/page.tsx`
9. `audit/independent-source-review/evidence/callback.probe.test.ts.txt`
10. `audit/independent-source-review/evidence/callback-probe-output.txt`
11. `AWS_DEPLOYMENT.md`

## 5. Tests and architecture
1. ★ `tests/repository.integration.test.ts`
2. `tests/reconciliation.test.ts`
3. `tests/session.test.ts`
4. `tests/policy.test.ts`
5. `tests/money.test.ts`
6. `tests/aws-worker.test.ts`
7. `tests/aws-signing.test.ts`
8. `tests/e2e/guided-demo.spec.ts`
9. `vitest.config.ts`
10. `playwright.config.ts`
11. `.github/workflows/ci.yml`
12. `package.json`
13. `src/app/app/architecture/page.tsx`
14. `src/app/app/page.tsx`
15. `ARCHITECTURE.md`
16. `HANDOFF.md`
17. `TEST_RESULTS.md`

## Suggested prompt to accompany the upload

> "Independently verify or refute each finding in CRITICAL_FINDINGS.md against the uploaded source. Pay particular attention to SE-C1 (stale read + unchecked UPDATE row count in `ingestAndReconcile`) and SE-C2 (fallback HMAC secret). Identify any additional defects the first audit missed, and flag any finding you believe is overstated."
