# Notely

A responsive student workspace for notes, courses, and schedules. Built with React, TypeScript, Vite, CSS Modules, Base UI, and self-hosted Inter. The interface includes a complete first-run journey, a populated demo workspace, note editing and history, shared-note comments, combined library filters, a calendar, and reviewed document/photo/syllabus imports.

## Run locally

Use **Node 22.12 or newer** (`nvm use` reads `.nvmrc`).

```sh
npm install
npm run dev
```

Open the URL printed by Vite. Choose **Take a look around first** for the populated workspace, or **Create your workspace** to walk through onboarding. Real accounts require the PHP/MySQL service described in [Account setup and deployment](docs/ACCOUNT_IMPLEMENTATION.md). Passwords are salted and hashed on the server; signup displays a one-time recovery code to save. The sample workspace works independently of the account service.

```sh
npm run build
npm run preview
npm test
npm run test:e2e
```

Install the matching browsers once with `npx playwright install chromium firefox webkit`. The browser tests use Chromium for desktop and mobile workflow coverage, plus Firefox and WebKit for cross-engine screen, theme, and dialog checks. Mobile emulation does not replace testing on physical iOS/Android devices.

## Structure and data

- `src/domain.ts`: domain types and asynchronous repository contracts; `BRAND` is the visible product-name setting.
- `src/services/`: realistic seeded courses/notes/events, search and filtering, and repositories. `createRepositories()` accepts a storage adapter for isolated testing.
- `src/app/`: session/theme reducer context, route shell, CSS Modules, global tokens, and accessibility preferences.
- `src/features/`: dashboard, onboarding, notes/course folders, calendar, import review, and settings.
- `src/shared/`: reusable accessible dialogs, note cards, event rows, headings, and empty states.
- `tests/`: browser workflows, responsive checks, and axe accessibility tests.

Account identity, sessions, recovery-code hashes, and onboarding completion live in MySQL. Notes/courses/events remain a browser prototype: demo records use `notely-data-v1`, account workspaces use `notely-workspace-v1-<user-id>`, and appearance uses `notely-theme`. Settings → Reset sample data resets only prototype content, preserving a real account. Seed dates are relative to the day the workspace is first created so its initial dashboard is useful. Resetting creates a fresh set of relative dates.

Library query parameters are `q`, `course`, `category`, `visibility`, `from`, `to`, `sort` (`modified`, `created`, `title`), and `view` (`grid`, `list`). Calendar parameters are `date` (`YYYY-MM-DD`) and `view` (`agenda`, `month`). Course lecture links use `/courses/:id?lecture=YYYY-MM-DD`.

## PHP / MySQL accounts and XAMPP

PHP account management is implemented in `backend/`, including signup/login/logout, profile/password changes, recovery codes, and deletion. Follow [setup, database schema, deployment, and security details](docs/ACCOUNT_IMPLEMENTATION.md). The local user story and task drafts are in `devwork-ai/ACCOUNT_STORY_TASKS.md`, which is excluded from Git. Run `npm run dev:api` alongside Vite after configuring local PHP/MySQL. `npm run build` packages the public PHP endpoints in `dist/api`.

OCR, document parsing, file storage, and real-time collaboration remain prototype features. Upload files remain local and are not persisted; extraction uses deterministic sample results. The upload dialog’s **Prototype preview options** can exercise successful, partial, and failed processing. The 20 MB limit and supported extensions are enforced by the mock import repository.

The account HTTP adapter is `src/services/auth.ts`; it calls the same-origin `api/index.php?route=...` PHP API under the frontend base path. Future course/note/event/import HTTP adapters should keep the domain interfaces as their boundary. Server authorization of those resources, file scanning/storage, and actual extraction belong in a later backend milestone. Browser storage is not an authentication or authorization boundary.

For Apache at the web root, copy `dist/` contents into the document root after building. Vite copies `public/.htaccess` into `dist`; enable `mod_rewrite` and allow the FileInfo, AuthConfig, and Options directives used by the supplied `.htaccess` files for SPA deep links. Requests under `api/` are excluded from the SPA fallback. Do not expose a PHP production service through the Vite development server.

For a subdirectory such as `/notely/`, build with the matching base:

```sh
BASE_PATH=/notely/ npm run build
```

Copy the output into that Apache directory. React Router uses the generated base URL. The account API follows this base automatically. Set the PHP cookie path and configured Origin for the corresponding server; details are in the deployment guide.

For aptitude, where SPA rewrite rules are ignored, build with hash routing:

```sh
VITE_ROUTER_MODE=hash BASE_PATH=/CSE442/2026-Fall/cse-442c/ npm run build
npm run test:static-build
```

Page URLs then use `#/welcome` and `#/settings` after the class directory. Assets and PHP API URLs keep the class base path. Follow the deployment guide's upload command to preserve the server-local `api/config-path.php` and `api/.notely-config.*` credentials directory.

## Design and verification

The interface uses the supplied sage, mint, brown, and slate palette, with semantic neutral surfaces and theme-specific text. CSS motion is limited to press feedback, anchored menus, and dialogs/sheets. Keyboard use bypasses motion, reduced motion removes positional transitions, and reduced transparency uses solid navigation. Base UI provides dialog/menu focus management and dismissal.

Automated coverage includes repository behavior, onboarding, library search/filter/sort, lecture links, event creation, note saving/comments/history, imports, theme persistence, keyboard dismissal, responsive overflow, and accessibility. Final physical-device and additional-browser checks should be completed with the team’s target devices before release. Screenshots and traces are generated in ignored `test-results/` on browser runs.

Historical prototype baseline (September 10, 2026; current account verification is documented separately):

- TypeScript and production build pass; JavaScript is approximately **128 KB gzip**, below the 200 KB target.
- **7 repository tests** and **22 browser checks** pass. Browser coverage includes Chromium desktop/mobile workflows and Chromium, Firefox, and WebKit screen/theme/dialog checks.
- Responsive checks cover 375, 768, 1024, and 1440 pixel widths; the notes library also passes a 200% text-size overflow check. Automated axe checks report no violations in the tested states.
- Lighthouse on the production welcome page: **98 performance, 100 accessibility, 100 best practices**, LCP **2.0 s**, CLS **0**, and total blocking time **80 ms**. These are local lab measurements, not field metrics for every screen.
- Dependency installation audit reports **zero vulnerabilities**.

Physical iOS/Android devices and branded Microsoft Edge/Safari have not been tested here; WebKit testing is engine coverage rather than a claim of testing Safari itself.
