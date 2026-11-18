# Test pages

Open https://aptitude.cse.buffalo.edu/CSE442/2026-Fall/cse-442c/tests/ to see every test page, grouped as Backend tests and Frontend tests (link text "<card#> <page title>"). Open a page and wait for the last line, `Result: N of N passed`. Each failing row shows expected vs got, then "If this fails, look at: <file> → <function>".

- Backend pages (`tests/backend/pages/<card>-<slug>.html`) call the real API with the runner in `tests/shared/runner.js`: `page`, `test`, `expect`, `api`, `api.raw`, `signIn`, `signOut`.
- Frontend pages (`tests/frontend/pages/<card>-<slug>.html` + `.test.tsx`, built by Vite) mount the real screen with the API replaced, using `tests/frontend/harness.tsx`: `mount`, `stubApi`, `byRole`, `byLabel`, `byText`, `click`, `type`, `press`, `waitFor`.

Add a page: copy `206-accounts.html` (backend) or `207-log-in.*` (frontend) and rename it to your card number. The page's `<title>` becomes its link; nothing shared needs editing, because the build lists the files it finds.

## Where older tests moved

Nothing test-related lives in `src/` or `backend/` any more. These are laptop-gate tests (never cited on a card); the build copies only the test pages into `dist/tests/`.

| Old location | New location | Run with |
| --- | --- | --- |
| `src/**/*.test.ts` and their helpers (`*.mock.ts`, `*-testkit.ts`) | `tests/frontend/unit/` (same subfolders) | `npm test` |
| `tests/*.spec.ts`, `tests/support/`, `tests/fixtures/`, `tests/harness/`, `tests/inspect.mjs` | `tests/frontend/browser/` | `npm run test:e2e` |
| `backend/tests/*.php` | `tests/backend/php/` | `npm run test:php` and the `test:*` scripts |
| `backend/tests/*-http.mjs`, `backend/tests/http.mjs` | `tests/backend/http/` | the `test:*` scripts in `package.json` |
| `backend/tests/data/` | `tests/backend/data/` | read by the HTTP and browser tests |

`src/services/syllabus-placement.cases.ts` stays in `src/` because the card 228 test page imports it.

Laptop check: `npm run build`, serve `dist` with PHP's built-in server and the local database (see the `cse442-test-local-db` skill), then `node scripts/run-test-page.mjs <page url>`. It prints every row and exits 0 only if all passed.
