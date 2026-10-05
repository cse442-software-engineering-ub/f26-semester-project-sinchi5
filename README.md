# Notely

Notely is a responsive study workspace for university students. It brings course notes, lecture folders, a class schedule, and syllabus/document imports into one place, with a calm interface that works on phones, tablets, and desktops.

The project has two halves:

- **Frontend**: a React + TypeScript single-page app built with Vite. It runs entirely in the browser and ships with a populated demo workspace.
- **PHP service**: a PHP + MySQL API for real accounts and the initial server-side note title endpoints.

Accounts are server-backed. Notes, courses, events, and imports are still a **browser prototype** stored in `localStorage` (see [Where data lives](#where-data-lives)).

---

## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Quick start (frontend only)](#quick-start-frontend-only)
- [Running the PHP service locally](#running-the-php-service-locally)
- [Configuration reference](#configuration-reference)
- [API](#api)
- [Database schema](#database-schema)
- [Security model](#security-model)
- [Where data lives](#where-data-lives)
- [Deployment](#deployment)
- [Testing](#testing)
- [Project structure](#project-structure)
- [URL parameters](#url-parameters)
- [Design and accessibility](#design-and-accessibility)
- [Known limitations and next steps](#known-limitations-and-next-steps)

---

## Features

**Getting started**
- Welcome screen with two paths: **Take a look around first** (demo workspace, no account needed) or **Create your workspace** (real account).
- Sign up, **Log In**, and **Recover your account** with a one-time recovery code.
- Returning users who already finished onboarding land on their **Notes** library after logging in. Users who stopped partway through onboarding resume where they left off.
- Three-step onboarding: name your space, add courses, optionally upload a syllabus. Progress is stored on the server, so onboarding resumes on any device.

**Today (dashboard)**
- Time-of-day greeting, recently edited notes, your courses, upcoming events ("On the horizon"), and deadline reminders.

**Notes**
- Library with full-text search, combined filters (course, category, visibility, lecture-date range), sorting (modified, created, title), and grid/list views. Filter state is kept in the URL.
- Note editor with autosave (it also saves when you leave the page), version history with restore, and comments on shared notes.
- **Pinning**: pinned notes stay at the top of every sort without changing their edit date.
- **Collaborators**: the note owner can invite a registered classmate by email and set **view** or **edit** permission. Viewers cannot save edits. This currently uses a frontend mock (see [limitations](#known-limitations-and-next-steps)).

**Courses and schedule**
- Course pages group notes into dated lecture folders and list upcoming course events.
- Calendar with agenda and month views. Add lectures, assignments, quizzes, exams, and deadlines manually.
- Lecture events link straight to that day's lecture folder.

**Imports**
- Upload documents (PDF, DOCX, TXT, Markdown, images), scan photos, or upload a syllabus. Files are validated (type, empty file, 20 MB limit), then shown on a review screen before anything is saved.
- Syllabus imports detect assignments and exams and add them to the calendar after review.
- Extraction is simulated. A **Prototype preview options** control in the dialog exercises success, partial, and failure outcomes.

**Settings**
- **Account**: edit name and email, change password, replace the recovery code, delete the account. Each sensitive action asks for the current password.
- **Appearance**: light, dark, or system theme.
- **Courses**: add courses with a code, name, colour, and term.
- **Workspace data**: **Reset sample data** (demo) or **Clear workspace** (account) resets prototype content without touching the server account.
- **Log out** is available in the sidebar and in the mobile navigation bar.

---

## Tech stack

| Layer | Technology |
| --- | --- |
| UI | React 18, TypeScript 5, CSS Modules, [Base UI](https://base-ui.com) (dialogs, menus), [lucide-react](https://lucide.dev) icons, self-hosted Inter |
| Routing | React Router 7 (browser history or hash routing) |
| Build | Vite 7 |
| Account API | PHP 8 (PDO, `password_hash`), MySQL 5.7+/8 or MariaDB 10.2+ |
| Unit tests | Vitest |
| Browser tests | Playwright (Chromium, mobile Chromium, Firefox, WebKit) with axe-core accessibility checks |

---

## Quick start (frontend only)

You need **Node 22.12 or newer**. If you use nvm, `nvm use` reads `.nvmrc`.

```sh
npm install
npm run dev
```

Open the URL Vite prints and choose **Take a look around first**. The demo workspace works without PHP or MySQL. Creating a real account requires the account service below; without it, sign-up and sign-in show "Could not reach the account service".

Other commands:

```sh
npm run build      # Typecheck, build to dist/, and copy the public PHP API into dist/api
npm run preview    # Serve the production build locally
```

---

## Running the PHP service locally

You need PHP 8 with `pdo_mysql`, and a local MySQL or MariaDB server (XAMPP works; see [Notes/XAMPP.md](Notes/XAMPP.md)).

1. **Create a database and user** for development, then apply the schema:

   ```sh
   mysql -h localhost -u YOUR_DEV_USER -p YOUR_DEV_DATABASE < backend/migrations/001_accounts.sql
   mysql -h localhost -u YOUR_DEV_USER -p YOUR_DEV_DATABASE < backend/migrations/002_note_titles.sql
   mysql -h localhost -u YOUR_DEV_USER -p YOUR_DEV_DATABASE < backend/migrations/003_note_content.sql
   ```

   You can also import the file through phpMyAdmin.

2. **Create a private config file outside the repository.** Copy [backend/config.example.php](backend/config.example.php) somewhere like `~/.config/notely/notely.php` and fill it in:

   ```php
   return [
       'db_name' => 'YOUR_DEV_DATABASE',
       'db_user' => 'YOUR_DEV_USER',
       'db_password' => 'YOUR_DEV_PASSWORD',
       'app_key' => '<64 hex characters>',  // php -r 'echo bin2hex(random_bytes(32)), PHP_EOL;'
       'origin' => 'http://127.0.0.1:5173',
       'cookie_path' => '/',
       'secure_cookies' => false,           // local HTTP only
   ];
   ```

   Restrict it to your user (`chmod 600`). **Never commit this file or put its values in a `VITE_*` variable.** Vite exposes `VITE_*` variables to the browser.

3. **Start the API and the frontend** in two terminals:

   ```sh
   NOTELY_CONFIG=~/.config/notely/notely.php npm run dev:api   # PHP on 127.0.0.1:8080
   npm run dev                                                  # Vite on 127.0.0.1:5173
   ```

   Vite proxies `/api` to the PHP server, so the app talks to `api/index.php` on the same origin. `backend/dev-router.php` exposes only `/api/index.php` and returns 404 for everything else.

4. **Optional housekeeping:** `php backend/prune.php` deletes expired sessions and old rate-limit rows. Run it from a cron job on servers. It refuses to run over HTTP.

---

## Configuration reference

The API looks for configuration in this order:

1. The `NOTELY_CONFIG` environment variable, holding an absolute path to a private PHP config file.
2. `config-path.php` next to `index.php`. This optional file returns **only a path**, for shared hosts that ignore `SetEnv`. Start from [backend/config-path.example.php](backend/config-path.example.php). It is git-ignored.
3. Individual environment variables. These also fill any key the file leaves out.

| Key | Environment variable | Purpose |
| --- | --- | --- |
| `db_name` | `NOTELY_DB_NAME` | Database name. Letters, digits, and `_` only. The host is always `localhost`. |
| `db_user` | `NOTELY_DB_USER` | Database user (required) |
| `db_password` | `NOTELY_DB_PASSWORD` | Database password (required) |
| `app_key` | `NOTELY_APP_KEY` | 64 hex characters. Signs CSRF tokens and keys the rate-limit hashes. Use a different key in every environment. |
| `origin` | `NOTELY_ORIGIN` | The exact scheme and host the frontend is served from. POST requests from any other `Origin` are rejected. |
| `cookie_path` | `NOTELY_COOKIE_PATH` | Session cookie path, for example `/` locally or the class directory on the server. |
| `secure_cookies` | `NOTELY_ALLOW_LOCAL_HTTP=1` disables it | HTTPS-only cookies. HTTP is accepted only for `localhost`, `127.0.0.1`, or `[::1]` origins. |

A missing or invalid configuration **fails closed**: the API returns HTTP 503 and logs only the exception class.

---

## API

The API has a single entry point, `api/index.php?route=<name>`. Every response is JSON with `Cache-Control: no-store`.

| Method | Route | Body | Signed in? |
| --- | --- | --- | --- |
| GET | `session` | none | no (starts an anonymous session if needed) |
| POST | `register` | `name`, `email`, `password` | no |
| POST | `login` | `email`, `password` | no |
| POST | `logout` | `{}` | either |
| POST | `reset-password` | `email`, `recoveryCode`, `password` | no |
| POST | `onboarding` | `{}` | yes |
| POST | `profile` | `name`, `email`, `currentPassword` (only needed when the email changes) | yes |
| POST | `password` | `currentPassword`, `password` | yes |
| POST | `recovery-code` | `currentPassword` | yes |
| POST | `delete` | `currentPassword` | yes |
| POST | `note-create` | `title` | yes |
| GET | `note&id=<id>` | none | yes (owner or collaborator) |
| POST | `note-title` | `id`, `title` | yes (owner or editor) |
| POST | `note-content` | `id`, `body` | yes (owner or editor) |

Every POST must include:
- `Content-Type: application/json` (body at most 8 KB)
- `Origin` matching the configured origin
- `X-CSRF-Token` set to the `csrfToken` from the latest response

Successful responses have this shape:

```json
{ "user": { "id": "42", "name": "…", "email": "…" } | null,
  "onboarding": { "completed": true, "step": 3 },
  "csrfToken": "…",
  "recoveryCode": "…"   // only from register, reset-password, and recovery-code
}
```

The note routes return `{ "note": { "id": "…", "title": "…" } }` instead. `note-create` returns 201. `note-title` returns 403 for a user without edit permission and 404 for a missing note. Note titles must contain 1–255 visible characters. These endpoints are the first server-side note contract; the current React workspace still stores its notes in the browser and does not call them yet.

GET `note` additionally returns `body`. POST `note-content` returns `{ "note": { "id": "…", "body": "…" } }` and uses the same owner/edit-collaborator authorization and error statuses as `note-title`. Body text must be a UTF-8 string; empty bodies are allowed and whitespace is preserved exactly. The existing 8 KB JSON request limit applies. Title-only creation initializes an empty body. Apply migration 003 before deploying this backend, with note writes paused during the migration.

Errors return `{ "error": "<message>" }` with one of these statuses: 400 (bad JSON or plain HTTP in secure mode), 401 (not signed in, or wrong login), 403 (Origin or CSRF failure), 404 (unknown route), 405 (wrong method), 409 (email conflict), 413 (body too large), 415 (wrong content type), 422 (validation failure), 429 (rate limited, with `Retry-After`), 503 (service or configuration failure).

The browser client is [src/services/auth.ts](src/services/auth.ts). It sends requests one at a time, refreshes the CSRF token after each response, and never caches recovery codes.

---

## Database schema

Defined in [backend/migrations/001_accounts.sql](backend/migrations/001_accounts.sql) and [backend/migrations/002_note_titles.sql](backend/migrations/002_note_titles.sql). Also apply [backend/migrations/003_note_content.sql](backend/migrations/003_note_content.sql), which backfills existing notes with an empty body. Apply all three in order, separately to each environment. All timestamps are UTC.

| Table | Contents |
| --- | --- |
| `notely_users` | `id`, `name` (utf8mb4, at most 100 characters), `email` (ASCII, unique, lowercased), `password_hash`, `recovery_code_hash` (SHA-256), `onboarding_completed`, timestamps |
| `notely_sessions` | `token_hash` (SHA-256 of the cookie token), `user_id` (null for anonymous sessions; cascades on user delete), `created_at`, `last_seen_at`, `expires_at` |
| `notely_rate_limits` | `bucket_hash` (HMAC of scope plus IP, email, or user), `window_start`, `attempts` |
| `notely_notes` | Server-side note ID, owner, title, body (non-null TEXT), timestamps |
| `notely_note_editors` | Per-note user permission (`view` or `edit`) |

The database never stores a plaintext password, recovery code, session token, email-to-IP pairing, or raw IP address.

---

## Security model

**Passwords**
- Hashed with Argon2id (19 MiB, 2 iterations) when PHP supports it, otherwise bcrypt cost 12. Hashes are upgraded automatically on the next sign-in.
- Length is 8–72 characters, printable ASCII only. Restricting to ASCII means bcrypt never silently truncates a password, and every password can be typed on any keyboard.
- Unknown emails still run a full hash, so response timing does not reveal whether an account exists. Login errors never say which field was wrong.

**Recovery codes**
- 128 random bits, shown once as `XXXX-XXXX-…`, and stored only as a SHA-256 hash.
- Using a code replaces it, changes the password, and signs out every session.
- Signed-in users can generate a replacement after entering their password.
- There is no email-based reset. Losing both the password and the code means the account cannot be recovered.

**Sessions**
- 256-bit random token in an `HttpOnly`, `SameSite=Lax` cookie (also `Secure` outside local development). Only its hash is stored.
- Sessions expire after 12 hours, or after 30 minutes without activity.
- A new token is issued on sign-in, sign-up, logout, password change, email change, recovery, and deletion. Password and email changes revoke all other sessions.
- Protected actions re-check inside a transaction that the session is still active, so a logout in another tab blocks a request that is already in progress (it returns 401).
- The cookie name includes a hash of the cookie path, so it does not collide with other apps on a shared host.

**Requests**
- Same-origin `Origin` check plus an HMAC-derived CSRF token on every POST.
- JSON only, 8 KB body cap, JSON depth limit, strict route and method allowlist.
- All SQL uses prepared statements with emulation disabled. The database host is hard-coded to `localhost`.
- Rate limits use 15-minute windows:

  | Action | Limit per window |
  | --- | --- |
  | Sign-up | 10 per IP |
  | Sign-in | 60 per IP, 20 per email |
  | Recovery | 20 per IP, 10 per email |
  | Account actions | 90 per IP, 20 per user |
  | New anonymous sessions | 120 per IP |

  Client-supplied forwarding headers are ignored.
- Security headers: `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`. Errors never include stack traces or SQL.

**Input validation**
- Names: letters, accents, spaces, hyphens, apostrophes, and periods. No emoji, digits, hidden or control characters, or stacked combining marks (three or more on one letter).
- Emails: ASCII only, exactly one `@`, at most 254 characters.
- [src/services/validation.ts](src/services/validation.ts) mirrors [backend/lib/security.php](backend/lib/security.php) so people see the same message before submitting. **The server is the authority**, so keep the two files' wording in sync.

**Files on the server**
- Only `index.php` is meant to be requested. `lib/` contains `Require all denied`, and each library file also refuses to run unless loaded through `index.php`.
- `.htaccess` blocks `config*`, `.sql`, and `.md` files and turns off directory listings.

These controls follow the [OWASP authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) and [session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) cheat sheets. They are not a formal security audit.

---

## Where data lives

| Data | Storage |
| --- | --- |
| Account identity, password hash, recovery-code hash, sessions, onboarding status | MySQL (server) |
| Notes created through the note API | MySQL (server) |
| Demo workspace content | `localStorage["notely-data-v1"]` |
| A signed-in account's notes, courses, events, comments, and history | `localStorage["notely-workspace-v1-<user-id>"]` |
| Theme preference | `localStorage["notely-theme"]` |
| Demo mode flag for this tab | `sessionStorage["notely-demo"]` |

Workspace content is kept separate for each account in the same browser, and is removed locally when the account is deleted. It is **not** synced between devices and is **not** protected by the server. Browser storage is a prototype convenience, not an authorization boundary. Seed dates are relative to when the workspace is created, so the demo dashboard always has upcoming items. **Settings → Reset sample data** (or **Clear workspace** for an account) recreates that content and leaves the server account alone.

Real accounts start with an empty workspace. Only the demo is pre-filled.

---

## Deployment

### Apache with rewrites (web root or subdirectory)

```sh
npm run build                          # site at /
BASE_PATH=/notely/ npm run build       # site in a subdirectory
```

Copy the **contents** of `dist/` to the document root or subdirectory. The build includes:
- the SPA
- `public/.htaccess`, which falls back to `index.html` for deep links and skips `api/`
- `dist/api/` with `index.php`, `lib/`, and `.htaccess`

The build does **not** include the tests, `dev-router.php`, `prune.php`, migrations, or any config file.

Enable `mod_rewrite` and allow the `FileInfo`, `AuthConfig`, and `Options` overrides. Set `NOTELY_CONFIG` for PHP, or place a `config-path.php` beside `api/index.php`. Match `origin` and `cookie_path` to the public URL. Never expose the PHP service through the Vite dev server.

### Course server (aptitude), no SPA rewrites

Aptitude ignores the rewrite rules, so build with hash routing:

```sh
VITE_ROUTER_MODE=hash BASE_PATH=/CSE442/2026-Fall/cse-442c/ npm run build
npm run test:static-build    # Verifies reloads, sign-in, API paths, and skip link on a host with no rewrites
```

Page URLs look like `…/cse-442c/#/settings`. Asset and API URLs still use the class base path.

When uploading, keep the server-only files intact:

```sh
rsync -rv --exclude='/api/config-path.php' --exclude='/api/.notely-config.*/' \
  dist/ YOUR_UBIT@aptitude.cse.buffalo.edu:/data/web/CSE442/2026-Fall/cse-442c/
```

On the server:
- Keep the real config file outside the web root and readable only by the PHP user. Use the HTTPS `origin`, the class `cookie_path`, `secure_cookies => true`, and a unique `app_key`.
- TEST (aptitude) and PROD (cattle) have **separate** databases, keys, and credentials. Never copy data or sessions between them.
- University network or VPN access is required.

---

## Testing

| Command | What it runs |
| --- | --- |
| `npm test` | Vitest unit tests: repository contracts, filtering, pinning, the auth adapter, validation, and the collaborator mock |
| `npm run test:e2e` | Playwright browser tests (needs `npx playwright install chromium firefox webkit` once) |
| `npm run test:static-build` | Hash-routing build under a static server with no rewrites (build first) |
| `npm run test:php` | PHP validation, hashing, and configuration checks. No database needed. |
| `npm run test:schema` | Read-only check that a live DEV/TEST database matches the expected schema |
| `npm run test:accounts` | Full HTTP contract test against a running API. Creates and then deletes uniquely named test accounts. |
| `npm run test:note-titles` | HTTP tests for the three card 108 scenarios against a running DEV/TEST API with migration 002 applied. |
| `php backend/tests/note-titles.php` | Owner, editor, viewer, and missing-note title tests against a DEV/TEST database with migration 002 applied. Creates and deletes test accounts. |
| `php backend/tests/note-content.php` | Body validation plus owner/editor/viewer, persistence, and title-preservation tests against a DEV/TEST database with all three migrations applied. |
| `node backend/tests/note-content-http.mjs` | Task 110 HTTP persistence, access, CSRF/Origin, validation, and request-limit checks against a running DEV/TEST API. |

The HTTP contract tests refuse any host except `localhost`, `127.0.0.1`, or aptitude. Point them with `NOTELY_TEST_URL` (and `NOTELY_TEST_ORIGIN` if needed). **Never run them against production.**

Browser tests mock the account API ([tests/support/account-fixture.ts](tests/support/account-fixture.ts)). They cover:
- onboarding and sign-up validation
- login: valid and incorrect credentials, empty or invalid fields, duplicate submissions, and resuming unfinished onboarding
- logout, including Back-button and direct-URL access afterwards
- account changes and recovery-code acknowledgement
- library search and filters
- events and lecture folders
- note editing, comments, history, and pinning
- collaborators
- imports and import failures
- keyboard dialog behaviour and theme persistence
- responsive layout at 375, 768, 1024, and 1440 px
- axe accessibility checks

Firefox and WebKit run the cross-engine screen, theme, and dialog suite. Screenshots and traces go to the git-ignored `test-results/`.

Emulated browsers do not replace testing on physical iOS and Android devices, Safari, or Edge.

---

## Project structure

```
backend/
  index.php               Only public PHP entry point: routing, headers, Origin/CSRF/JSON checks
  lib/bootstrap.php       Config loading, PDO connection, sessions, rate limiting, CSRF
  lib/security.php        Field validation, password hashing, recovery codes
  lib/accounts.php        Account actions (register, login, logout, profile, password, recovery, delete)
  migrations/             MySQL schema
  prune.php               CLI cleanup of expired sessions and rate-limit rows
  dev-router.php          Local PHP dev server router (not deployed)
  config*.example.php     Templates only, with no real credentials
  tests/                  PHP unit/config/schema tests and the HTTP contract test
src/
  domain.ts               Domain types and async repository interfaces; BRAND sets the product name
  main.tsx                Entry point: picks browser or hash routing from VITE_ROUTER_MODE
  app/                    App shell and routes, global state (context.tsx), theme, CSS tokens
  features/               dashboard, onboarding, notes, schedule, imports, settings, account, collaborators
  shared/ui.tsx           Accessible modal, empty state, note card, event row, page heading
  services/
    auth.ts               HTTP client for the PHP account API
    app-repositories.ts   Combines server auth with per-account local workspaces and demo mode
    repositories.ts       localStorage-backed courses/notes/schedule/imports (prototype)
    collaborators.mock.ts Frontend-only collaborator invitations
    fixtures.ts           Demo courses, notes, and events
    validation.ts         Client-side copy of the server's validation rules
tests/                    Playwright specs and the mocked account API fixture
scripts/                  Build helpers (copy PHP into dist/api, static-host test)
public/                   favicon and SPA .htaccess
Notes/                    Team research notes (XAMPP, Figma)
```

Every screen talks to data through the interfaces in `domain.ts`. To replace a local prototype repository with an HTTP one, implement the same interface. Nothing in the UI needs to change.

---

## URL parameters

- **Notes library** (`/notes`): `q`, `course`, `category`, `visibility`, `from`, `to`, `sort` (`modified` | `created` | `title`), `view` (`grid` | `list`)
- **Schedule** (`/schedule`): `date` (`YYYY-MM-DD`), `view` (`agenda` | `month`)
- **Course lecture folder**: `/courses/:id?lecture=YYYY-MM-DD`
- **Sign-in screen**: `/welcome?mode=signin`

---

## Design and accessibility

- Sage, mint, brown, and slate palette with semantic surface and text tokens for light and dark themes.
- Motion is limited to press feedback, menus, and dialogs. It is skipped during keyboard use and reduced when the system asks for reduced motion. Reduced-transparency settings switch to solid navigation.
- Base UI handles focus trapping and dismissal for dialogs and menus. Every page has a skip link, labelled navigation, and inline field errors linked with `aria-describedby`.
- Desktop uses a sidebar. Mobile uses a bottom navigation bar that includes Settings and Log out.

---

## Known limitations and next steps

- Notes, courses, events, comments, and history are stored in the browser only. They need server storage and server-side authorization.
- Collaborator invitations use a fixed frontend mock (`collaborators.mock.ts`), which is planned to become an HTTP adapter. Comments and shared notes are not real-time.
- OCR, document parsing, and file storage are simulated. Uploaded files are never stored.
- Email addresses are not verified, and no email is ever sent.
- Accounts cannot be recovered without the recovery code.
