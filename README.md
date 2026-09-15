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

The prototype does not perform server authentication, OCR, binary document parsing, file storage, or real-time collaboration. Original upload files remain local and are not persisted. TXT/Markdown note contents and detected metadata are saved in browser localStorage after review. PDF, DOCX, and image notes use filename metadata only; syllabus event extraction still uses deterministic sample results. The upload dialog’s **Prototype preview options** can exercise successful, partial, and failed processing. The 20 MB limit and supported extensions are enforced by the import repository.

### Sprint 1: automatic note organization (User Story #4)

Note uploads use a small local parser in `src/services/noteMetadata.ts`, with no new dependencies or AI service. It matches existing workspace course codes case-insensitively, accepting spaces, hyphens, underscores, or joined codes (for example, `CSE 442`, `CSE-442`, and `cse442`). It stores the existing course ID so the review form, note editor, and course folders display the canonical code **CSE 442**. A `Course:` or `Course code:` header takes precedence over course references in the body. Courses that are not in the workspace are left undetected.

Lecture dates are read first from `Lecture date:`/`Lecture:` headers, then `Date:` headers, then standalone date lines. Markdown heading/emphasis markers are supported. Accepted dates include `2026-09-14`, `2026/9/14`, US `9/14/2026`, `September 14, 2026`, and `14 September 2026`. A four-digit year is required; invalid calendar dates and conflicting candidates are left empty. Assignment/deadline dates in prose are not treated as lecture dates. Each field can fall back to the filename when its content metadata is absent. Stored dates use `YYYY-MM-DD`, independent of timezone; native date inputs display them according to the browser locale.

Missing fields stay empty and display **Not detected**. They do not default to the first course or today's date. Students can save a partially detected note or correct either field in the existing review form/editor. Undated course notes have a **Lecture date: Not detected** folder and are excluded from date-range searches. Metadata fields stack vertically on mobile.

No test note was supplied with the story; `tests/fixtures/cse442-lecture.txt` provides a reproducible example with course **CSE 442**, lecture date **September 14, 2026**, and a different assignment deadline. To try it, start the app, choose **Take a look around first**, then **Create → Upload document**, upload that fixture, review, and choose **Save to my notes**. Open `cse442-lecture` in All notes. Both fields and the note text survive a reload. For PDF/DOCX/images, a filename such as `CSE442_2026-09-14.pdf` is supported; reading those formats' contents requires a later parser/OCR implementation.

Run these commands from the repository root with Node 22.12 or newer:

```sh
npm ci
npm test
npm run build
npx playwright install chromium
npx playwright test tests/note-metadata.spec.ts --project=chromium --project=mobile
npm run dev
```

Unit/repository tests cover formats, exact course matching, date precedence, missing/invalid/conflicting metadata, partial saves, review corrections, filename-only binary imports, read failures, and persistence. Browser tests cover real upload/review/open/reload flows, missing fields, course folders, and metadata visibility/overflow at 320, 375, 768, and 1440 pixels. To run all existing browser regressions as well, install all engines with `npx playwright install chromium firefox webkit`, then run `npm run test:e2e`.

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
