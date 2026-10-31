# Test Results — 2026-10-31

Environment: Windows, Node/npm project runtime, PGlite in-memory/disposable integration databases, system Chrome for Playwright.

| Command | Result |
|---|---|
| `npm ci --legacy-peer-deps` | 519 packages installed; completed in 2m |
| `npm run lint` | PASS, zero diagnostics |
| `npm run typecheck` | PASS, zero diagnostics |
| `npm test` | PASS, 10 files / 39 tests |
| concurrency file ×3 | PASS each run, 7/7 tests; each run includes 20 iterations of 10 simultaneous payments |
| `npm run test:coverage` | PASS 39/39; 78.54% statements, 67.64% branches, 79.57% functions, 86.93% lines |
| `npm run ml:evaluate` | PASS dry-run; model 1.1.0; threshold 0.25 |
| `npm run aws:validate` | PASS, 9 structural assertions |
| `npm run build` | PASS; Next.js 16.4.3; 27 routes including icon |
| `npm run test:e2e` | PASS, 3/3 using system Chrome; loopback-only production build |
| `npm audit` | 16 moderate vulnerabilities, all in dev lint dependency paths; fix offered is breaking |
| `npm audit --omit=dev` | PASS, 0 production vulnerabilities |

The 80% statement/branch target was not met (statements 78.54%, branches 67.64%). This is a remaining readiness limitation, not hidden by artificial tests.

The first sandboxed test attempt was blocked by Windows temp-cache `EPERM`; project-local `TEMP/TMP=.tmp` resolved it. The first sandboxed build was blocked because Turbopack could not create a local junction; the approved unsandboxed build passed. Initial E2E runs found label association, same-origin host comparison, and missing icon issues; all were repaired before the final 3/3 pass.

No real PostgreSQL, SAM CLI, AWS, Vercel, bundled Playwright Chromium, or live LLM verification was available.
