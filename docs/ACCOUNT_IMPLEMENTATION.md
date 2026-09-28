# Account implementation and deployment

This implements `devwork-ai/Account_imp.md` with the user's revised requirement: recovery uses a code issued at signup, not university email. Accounts accept valid email addresses; no mail service, third-party authentication, Laravel, or external account API is used.

## What is implemented

- Register, sign in, sign out, resume onboarding, edit name/email, change password, replace a recovery code, recover an account, and permanently delete an account.
- PHP owns account validation and authorization. PDO connects only to `localhost` MySQL. The UI never decides which server account to update; account mutations derive the user ID from the session.
- Passwords are processed by PHP `password_hash`/`password_verify`: Argon2id (19 MiB, 2 iterations, 1 thread) when available, otherwise bcrypt cost 12. PHP supplies a random salt. Successful login upgrades hashes when needed. Passwords preserve spaces, require 15 characters, and are capped at 72 UTF-8 bytes to avoid bcrypt truncation. No credentials enter localStorage, sessionStorage, URLs, or application logs.
- Signup returns a 128-bit random recovery code once. Only its SHA-256 hash is stored. Recovery needs the account email, code, and new password. A transaction locks the user, consumes the old code by replacing its hash, changes the password, and invalidates all user sessions. Recovery returns a new code and leaves the user signed out. Logged-in users can replace a lost code after supplying their password. Losing both password and code means there is no self-service recovery.
- Session cookies contain 256-bit random opaque tokens. Only SHA-256 token hashes are stored in MySQL. Cookies are HttpOnly, Secure on TEST/PROD, SameSite=Lax, host-only, and scoped to the app path. Session tokens rotate at login/registration and credential changes. Idle timeout is 30 minutes; absolute timeout is 12 hours. Sign-out deletes the current session. Password/email changes and recovery invalidate other sessions; deletion cascades to all sessions.
- Every POST requires the configured Origin, JSON, and a session-bound CSRF header, including login and registration. Requests have an 8 KiB limit. Responses disable caching and exclude database internals and secrets. Prepared statements and unique email constraints protect database operations.
- MySQL throttling uses atomic counters with 15-minute fixed windows. Limits: signup 10/IP, login 60/IP and 20/email, recovery 20/IP and 10/email, authenticated actions 90/IP and 20/user, anonymous session creation 120/IP. All attempts count, not just failures. Buckets store keyed hashes instead of email/IP text. Password errors do not reveal whether an account exists.

Security design references: [PHP password hashing](https://www.php.net/manual/en/function.password-hash.php), [OWASP authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html), and [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html). These controls do not constitute a security audit or guarantee against every attack.

## Scope of the existing workspace

Account data, sessions, onboarding completion, and throttling persist in MySQL. Notes, courses, events, import previews, and collaborators remain the existing browser prototype. Their local data is separated by authenticated user ID (`notely-workspace-v1-<id>`), but browser storage is not an authorization boundary or a private cloud backup. This milestone does not implement server-backed note permissions or cross-device note synchronization.

The sample workspace is explicitly entered using **Take a look around first**. It has the synthetic `student` user and cannot authenticate to PHP. Its tab-local flag is `notely-demo`; its sample content retains `notely-data-v1`. Legacy prototype users are never accepted as real accounts. Theme remains `notely-theme`. Deleting an account also removes its workspace from the current browser; data in other browsers is not remotely erased. Reset sample data does not delete real accounts.

Email is a normalized, case-insensitive login identifier, not a verified mailbox. Changing it requires the current password. No email is sent. Recovery codes are deliberately absent from session responses and cannot be retrieved after issuance; users may generate a replacement in Settings.

## Repository map

| Location | Purpose |
| --- | --- |
| `backend/index.php` | Public JSON entry point and request validation |
| `backend/lib/security.php` | Field validation, password hashing, recovery code generation |
| `backend/lib/bootstrap.php` | Private configuration, PDO, throttling, cookies, sessions, CSRF |
| `backend/lib/accounts.php` | Account lifecycle and transactional credential changes |
| `backend/migrations/001_accounts.sql` | MySQL schema; run separately on each environment |
| `backend/config.example.php` | Non-secret private configuration template |
| `backend/prune.php` | CLI removal of expired sessions and old rate counters |
| `backend/tests/` | PHP validation/schema and real HTTP integration tests |
| `src/services/auth.ts` | Same-origin PHP account adapter |
| `src/services/app-repositories.ts` | Account/demo selection and prototype workspace isolation |
| `src/features/account.tsx` | Account settings and one-time recovery code UI |
| `src/features/onboarding.tsx` | Registration, login, recovery, onboarding |
| `scripts/copy-backend.mjs` | Copies only public PHP files into the build |
| `devwork-ai/ACCOUNT_STORY_TASKS.md` | Copy-ready story, task cards, acceptance/task tests |

## Account API contract

All routes use `api/index.php?route=<name>` under the app's base path. GET `session` returns `{user, onboarding, csrfToken}`; the user is null when signed out. POSTs require `Content-Type: application/json`, the configured Origin, the session cookie, and `X-CSRF-Token` obtained from GET `session`. Successful account actions return the updated session object. Only registration/recovery/code replacement additionally return `recoveryCode`. Error responses are `{error: string}`; clients must show the error and let the user retry rather than replaying mutations automatically.

| Method/route | JSON fields |
| --- | --- |
| GET `session` | none |
| POST `register` | `name`, `email`, `password` |
| POST `login` | `email`, `password` |
| POST `logout` | `{}` |
| POST `onboarding` | `{}` |
| POST `profile` | `name`, `email`, `currentPassword` (required for email changes) |
| POST `password` | `currentPassword`, `password` (new value) |
| POST `reset-password` | `email`, `recoveryCode`, `password` (new value) |
| POST `recovery-code` | `currentPassword` |
| POST `delete` | `currentPassword` |

Registration returns 201; other successful actions return 200. Errors use 400 (malformed JSON/HTTP), 401 (unauthenticated/invalid login), 403 (Origin/CSRF), 404 (route), 405 (method), 409 (conflicting registration/email), 413 (body limit), 415 (media type), 422 (field/current-password/code validation), 429 (throttled, with Retry-After), or 503 (service/configuration failure).

## Database contract

All tables use InnoDB. `id` values are sent to JavaScript as strings. Timestamps use UTC. Names use utf8mb4; email/hash columns use ASCII binary collation. Email is trimmed/lowercased before storage. Never add a plaintext password or recovery-code column.

| Table | Column | MySQL type | Null/default/key |
| --- | --- | --- | --- |
| `notely_users` | `id` | BIGINT UNSIGNED | PK, auto increment |
| | `name` | VARCHAR(100) | NOT NULL |
| | `email` | VARCHAR(254) | NOT NULL, unique `notely_users_email` |
| | `password_hash` | VARCHAR(255) | NOT NULL |
| | `recovery_code_hash` | CHAR(64) | NOT NULL |
| | `onboarding_completed` | TINYINT(1) | NOT NULL, default 0 |
| | `created_at` | DATETIME | NOT NULL, current timestamp |
| | `updated_at` | DATETIME | NOT NULL, current timestamp; updates automatically |
| `notely_sessions` | `token_hash` | CHAR(64) | PK |
| | `user_id` | BIGINT UNSIGNED | NULL for anonymous CSRF sessions; indexed FK to users, ON DELETE CASCADE |
| | `created_at` | DATETIME | NOT NULL |
| | `last_seen_at` | DATETIME | NOT NULL |
| | `expires_at` | DATETIME | NOT NULL, indexed |
| `notely_rate_limits` | `bucket_hash` | CHAR(64) | PK |
| | `window_start` | BIGINT UNSIGNED | NOT NULL, indexed |
| | `attempts` | INT UNSIGNED | NOT NULL, default 1 |

Only apply `001_accounts.sql` to a schema with no conflicting preexisting `notely_*` tables. `CREATE TABLE IF NOT EXISTS` is repeatable but does not upgrade a differently shaped table. Review existing definitions first. Runtime database permissions are SELECT, INSERT, UPDATE, DELETE on these three tables; schema import additionally needs CREATE/REFERENCES/index privileges. Account deletion is permanent.

## Local DEV setup

Use Node 22.12+, PHP 8.0+ with PDO MySQL, and MySQL 5.7+/8 or MariaDB 10.2+. Prefer the department's actual PHP/MySQL versions. PHP is not a Node dependency; XAMPP or a native PHP/MySQL installation is suitable.

1. Start local MySQL and create a dedicated DEV database/user with a nonempty password. Import `backend/migrations/001_accounts.sql` using PhpMyAdmin or `mysql -h localhost -u YOUR_DEV_USER -p YOUR_DEV_DATABASE < backend/migrations/001_accounts.sql`. Enter the password at the prompt.
2. Copy `backend/config.example.php` **outside the web root and repository**, for example to a private config directory. Set `db_name`, `db_user`, and `db_password` to the DEV database. Generate an independent app key with `php -r 'echo bin2hex(random_bytes(32)), PHP_EOL;'` and put the result in `app_key`. Use `origin = http://127.0.0.1:5173`, `cookie_path = /`, and `secure_cookies = false`. Set mode 600 on this file.
3. In the PHP terminal: `export NOTELY_CONFIG=/absolute/private/path/notely-dev.php`, then `npm run dev:api`. The development router accepts only `/api/index.php` on `127.0.0.1:8080`.
4. In another terminal: `npm install`, then `npm run dev`. Visit **http://127.0.0.1:5173** exactly. Vite proxies `/api` to PHP and preserves the browser Origin. Do not use `localhost:5173` with a `127.0.0.1` origin configuration.
5. Run `npm run test:php`, `npm run test:schema`, and `NOTELY_TEST_ORIGIN=http://127.0.0.1:5173 npm run test:accounts`. The first two commands need PHP on PATH; schema testing also needs `NOTELY_CONFIG`. The HTTP suite creates disposable accounts and deletes them. Wait 15 minutes between repeated runs if throttled; do not disable throttling on a shared server.

Environment variables can replace the config file: `NOTELY_DB_NAME`, `NOTELY_DB_USER`, `NOTELY_DB_PASSWORD`, `NOTELY_APP_KEY`, `NOTELY_ORIGIN`, `NOTELY_COOKIE_PATH`, and `NOTELY_ALLOW_LOCAL_HTTP=1` for loopback-only DEV. Do not put secrets into `VITE_*`, source code, a command history, or a frontend `.env` file. An invalid/incomplete configuration fails closed with HTTP 503. HTTP mode refuses non-loopback origins.

## TEST and PROD release procedure

TEST: https://aptitude.cse.buffalo.edu/CSE442/2026-Fall/cse-442c/

PROD: https://cattle.cse.buffalo.edu/CSE442/2026-Fall/cse-442c/

Both document roots: `/data/web/CSE442/2026-Fall/cse-442c/`. Both database names: `cse442_2026_fall_team_c_db`, on `localhost` of that machine. University network/VPN access is required. TEST and PROD have separate databases, keys, and credentials; never copy their data/session rows between environments.

1. Configure and verify **aptitude first**, during the sprint. Confirm PHP executes and `pdo_mysql` is enabled. Import the migration into that server's database. Preserve existing unrelated tables.
2. Place the private config file outside `/data/web`, readable only by the account/PHP execution identity. Use `origin = https://aptitude.cse.buffalo.edu`, `cookie_path = /CSE442/2026-Fall/cse-442c/`, `secure_cookies = true`, and a unique random app key. Set `NOTELY_CONFIG` in the Apache/PHP environment to the private path. If permitted, a server-local Apache `SetEnv NOTELY_CONFIG /absolute/private/path/notely.php` directive can set the path. The supplied example contains no usable credentials.
3. Build: `BASE_PATH=/CSE442/2026-Fall/cse-442c/ npm run build`. The API URL automatically follows the same base. Upload the **contents of `dist/`**, including dotfiles, to the shared document root. Do not upload the whole repository, migration, tests, config example, or private config. Build output includes `api/index.php`, `api/lib/*.php`, and access-denying `.htaccess` files, alongside the SPA. If setting `NOTELY_CONFIG` in the deployed `api/.htaccess`, append the `SetEnv` directive after uploading and retain the existing access restrictions. Reapply the server-local directive after future uploads that replace that file; generated builds do not contain the private configuration path.
4. Confirm Apache supports the supplied rewrite rules and `.htaccess` authorization directives; requests under `api/` must not be rewritten to the SPA. Direct requests to `/api/lib/security.php` must return 403. A GET to `/api/index.php?route=session` must return JSON with a null user and CSRF token, never PHP source. Confirm the cookie is Secure, HttpOnly, SameSite=Lax, and has the class path.
5. Run the task tests on aptitude: `NOTELY_TEST_URL=https://aptitude.cse.buffalo.edu/CSE442/2026-Fall/cse-442c/api/index.php npm run test:accounts`. Run PHP/schema tests on the server using the private config. Record outcomes on each task. Run `php backend/prune.php` daily via an approved scheduler/cron outside the web root to bound expired session/rate-limit storage.
6. Only at the end-of-sprint release, repeat configuration/migration on **cattle** with cattle's origin and distinct secrets. Deploy the reviewed release from main using the same base. Run the nontechnical acceptance tests in `../devwork-ai/ACCOUNT_STORY_TASKS.md` against cattle. Do not run the automated destructive task suite on PROD; it explicitly rejects cattle.

The department serves several teams on one web origin. Cookie paths avoid accidental collisions but cannot isolate hostile JavaScript served by another application on the same origin. Origin-wide isolation requires department-controlled separate origins. These application files cannot change that hosting boundary.

No remote deployment, database migration, or scrum-board publication is performed by the local implementation. Release requires a configured PHP/MySQL environment and the course's branch/PR/card workflow. The private config and PHP version/permissions must be confirmed by the team on the target server.

## Verification commands and limits

```sh
npm test
npm run build
npm run test:e2e
npm run test:php
npm run test:schema
NOTELY_TEST_ORIGIN=http://127.0.0.1:5173 npm run test:accounts
```

Vitest covers the adapter and workspace selection. Browser account tests use an explicit HTTP fixture to exercise UI behavior without a database; they do **not** prove PHP/MySQL behavior. The real HTTP suite in `backend/tests/http.mjs` exercises PHP/MySQL, including cookie rotation/replay, server validation, CSRF/origin rejection, credential revocation, recovery-code single use, deletion, and rate limiting. PHP schema tests verify the teammate-facing table contract. Live database tests and PROD acceptance tests remain required before release.

### Verification record — September 27–28, 2026

- Node 22.23.2: 26 Vitest tests passed; TypeScript and the production build passed, including the class subdirectory base.
- Temporary PHP 8.5.10 WebAssembly runtime: all 26 security/validation checks passed. This runtime does not provide Argon2id, so the executed password tests cover the bcrypt fallback. Native server PHP/Argon2id behavior must be checked on the target environment.
- All nine PHP files passed syntax checks; the final credential-race change in `accounts.php` was linted again.
- Packaging inspection confirmed that `dist/api` contains only the entry point, protected PHP libraries, and access-control files.
- Browser verification: 58 desktop/mobile Chromium tests passed. WebKit passed on a serial retry with a 120-second limit. Firefox remained incomplete: its retry hit the 120-second overall timeout during axe accessibility analysis (initial page creation took 33 seconds). This is not recorded as a passed Firefox check. The initial full run had two engine timeouts; no assertions were disabled or weakened.
- On September 28 the user reported importing the migration on aptitude and seeing all three tables. The automated schema and real HTTP integration suites remain **not run**; the PHP service still needs private configuration/deployment. No agent-run deployment or PROD acceptance testing was performed.

- Aptitude setup follow-up: the user confirmed database `cse442_2026_fall_team_c_db`, CLI PHP 8.1.2 (Ubuntu package), and the PDO MySQL extension. The config template and runtime default now match that database. After resolving a MySQL 1045 login error, the user reported that the CLI PDO connection check using the private configuration succeeded. Web PHP access to that configuration, the schema test, and the real HTTP integration suite remain unverified.
