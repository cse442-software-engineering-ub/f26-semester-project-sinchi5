# Notely

A responsive student workspace for notes, courses, and schedules. Built with React, TypeScript, Vite, CSS Modules, Base UI, and self-hosted Inter. The interface includes a complete first-run journey, a populated demo workspace, note editing and history, shared-note comments, combined library filters, a calendar, and reviewed document/photo/syllabus imports.

## Run locally

Use **Node 22.12 or newer** (`nvm use` reads `.nvmrc`).

```sh
npm install
npm run dev
```

Open the URL printed by Vite. Choose **Take a look around first** for the populated workspace, or **Create your workspace** to walk through onboarding. Passwords are validated as form input only and are never persisted. Use sample credentials.

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

All product data access goes through the typed repository interfaces. Prototype records live under `notely-data-v1` in browser localStorage; appearance lives under `notely-theme`. Use Settings → Reset sample data to remove prototype changes and return to onboarding. Seed dates are relative to the day the workspace is first created so its initial dashboard is useful. Resetting creates a fresh set of relative dates.

Library query parameters are `q`, `course`, `category`, `visibility`, `from`, `to`, `sort` (`modified`, `created`, `title`), and `view` (`grid`, `list`). Calendar parameters are `date` (`YYYY-MM-DD`) and `view` (`agenda`, `month`). Course lecture links use `/courses/:id?lecture=YYYY-MM-DD`.

## PHP / XAMPP handoff

The prototype deliberately does not perform server authentication, OCR, document parsing, file storage, or real-time collaboration. Upload files remain local and are not persisted; extraction uses deterministic sample results. The upload dialog’s **Prototype preview options** can exercise successful, partial, and failed processing. The 20 MB limit and supported extensions are enforced by the mock import repository.

Replace the repository implementations in `src/services/repositories.ts` with HTTP adapters for future `/api/v1` PHP JSON endpoints. Keep the domain interfaces as the boundary. Suggested resource groups are `/auth`, `/courses`, `/notes` (including comments and versions), `/events`, and `/imports`. Server-side validation, authorization, session handling, file scanning/storage, and actual extraction belong in that later backend milestone. Do not treat localStorage as an authentication or authorization boundary.

For Apache at the web root, copy `dist/` contents into the document root after building. Vite copies `public/.htaccess` into `dist`; enable `mod_rewrite` and `AllowOverride FileInfo` for SPA deep links. Requests under `api/` are excluded from the SPA fallback. Do not expose a PHP production service through the Vite development server.

For a subdirectory such as `/notely/`, build with the matching base:

```sh
BASE_PATH=/notely/ npm run build
```

Copy the output into that Apache directory. React Router uses the generated base URL. PHP service URLs should continue to use the chosen `/api/v1` endpoint configuration independently of the frontend base.

## Design and verification

The interface uses the supplied sage, mint, brown, and slate palette, with semantic neutral surfaces and theme-specific text. CSS motion is limited to press feedback, anchored menus, and dialogs/sheets. Keyboard use bypasses motion, reduced motion removes positional transitions, and reduced transparency uses solid navigation. Base UI provides dialog/menu focus management and dismissal.

Automated coverage includes repository behavior, onboarding, library search/filter/sort, lecture links, event creation, note saving/comments/history, imports, theme persistence, keyboard dismissal, responsive overflow, and accessibility. Final physical-device and additional-browser checks should be completed with the team’s target devices before release. Screenshots and traces are generated in ignored `test-results/` on browser runs.

Verified on September 10, 2026:

- TypeScript and production build pass; JavaScript is approximately **128 KB gzip**, below the 200 KB target.
- **7 repository tests** and **22 browser checks** pass. Browser coverage includes Chromium desktop/mobile workflows and Chromium, Firefox, and WebKit screen/theme/dialog checks.
- Responsive checks cover 375, 768, 1024, and 1440 pixel widths; the notes library also passes a 200% text-size overflow check. Automated axe checks report no violations in the tested states.
- Lighthouse on the production welcome page: **98 performance, 100 accessibility, 100 best practices**, LCP **2.0 s**, CLS **0**, and total blocking time **80 ms**. These are local lab measurements, not field metrics for every screen.
- Dependency installation audit reports **zero vulnerabilities**.

Physical iOS/Android devices and branded Microsoft Edge/Safari have not been tested here; WebKit testing is engine coverage rather than a claim of testing Safari itself.
