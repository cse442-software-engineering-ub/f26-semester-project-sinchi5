# Notely design system

The Planner Spread (card 251): content sits on white sheets over a scheme-tinted ground, two-page views are split by
a spine, lists sit on faint rules, and one accent ribbon marks now, today and the active item. Every color comes from a CSS variable in
`src/app/tokens.css`; no other stylesheet may contain a hex value (a unit test enforces it).

## Color variables

Each variable is defined in all eight blocks of `tokens.css` (four schemes, light and dark). Use the
variable, never a value, so a scheme change recolors everything.

| Variable | Use |
|---|---|
| `--bg`, `--surface`, `--surface-soft`, `--nav` | page, cards and inputs, quiet fills, sidebar and tab bar |
| `--text`, `--muted` | body text, secondary text (both pass 4.5:1 on `--bg` and `--surface`) |
| `--line` | hairline borders and dividers |
| `--primary`, `--primary-text` | the one accent: main buttons, active states; text placed on it |
| `--sage`, `--mint` | soft brand fills (logo tile, today chip), selection color |
| `--danger`, `--danger-soft`, `--danger-line` | error and destructive text, its tinted background, its border (`--danger` is at least 4.5:1 on both `--danger-soft` and `--surface`) |
| `--danger-solid`, `--danger-solid-text` | filled destructive button and its label |
| `--danger-field` | border of an invalid input |
| `--success` | a met password rule |
| `--highlight-yellow/green/pink`, `--highlight-ink` | note highlight marks and the text on them; `--reading-mark` is the reading-animation highlighter |
| `--art-bg`, `--art-ink`, `--art-accent`, `--art-muted`, `--art-1`, `--art-2`, `--art-paper`, `--art-rule` | landing artwork panel, headline, paper stack |
| `--logo-ink`, `--logo-star` | logo mark and its sparkle |
| `--tint-a/b/c` and `--tint-a/b/c-ink` | avatar and quick-action icon tiles |
| `--glyph-1/2/3` | quiet decorative icons (quick action, quiet note, dropzone) |
| `--hover-line`, `--dropzone-line` | hover border on cards, dashed dropzone border |
| `--selection-ink` | text color on selected text |
| `--overlay`, `--overlay-strong` | modal backdrop (the strong one under reduced transparency) |
| `--shadow`, `--shadow-button`, `--shadow-pop`, `--shadow-card-hover`, `--shadow-paper` | elevation, from page-level to a button's resting shadow |
| `--swatch-line` | border of the theme swatches in Settings |
| `--ground` | the tinted page ground behind every sheet (body, main area) |
| `--sheet`, `--sheet-edge`, `--sheet-shadow` | the sheet surface, its hairline edge (the edge light in dark mode), its two-layer soft shadow |
| `--spine`, `--spine-shade` | the gutter line between two pages and the shading each page takes toward it |
| `--rule` | faint ruled lines: hour lines, list dividers |
| `--ribbon`, `--ribbon-text`, `--ribbon-notch` | the accent ribbon (primary buttons, today's disc, the active-item marker, focus rings), text on it, its darker fold (hover) |
| `--warn`, `--warn-soft` | the due-tonight chip's text and fill |

Every pair passes AA in all eight blocks and in every custom theme (`tests/frontend/unit/services/palette.test.ts`):
`--text` and `--muted` on `--sheet` and `--ground`, `--ribbon-text` on `--ribbon`, `--warn` on `--warn-soft`, and `--ribbon`
at 3:1 on `--sheet`, `--ground` and `--nav`. Custom themes get the same variables from `buildPalette`, which clamps the
ground and sheet to calm lightness and chroma whatever three colors the student picks.

## Type, spacing, radii

Defined once in the first `:root` block of `tokens.css` (they are not colors, so no scheme repeats them).

- Family: Inter Variable, with optical sizing on; tabular figures (`font-variant-numeric: tabular-nums`) for times,
  dates and counts. Tracking never goes below -0.04em.
- Type scale, each with `--fs-*`, `--lh-*` and `--ls-*`: `label` 11/16 (+0.06em, uppercase section labels), `small` 12/16,
  `body` 14/20 (the body default), `lead` 16/24 (h3), `title` 20/28 (h2), `heading` 24 to 28 fluid, `display` 32 to 40 fluid (h1).
- Spacing: `--space-1` to `--space-8` = 4, 8, 12, 16, 24, 32, 48, 64 px; `--space-gutter` is the fluid page gutter
  (16 to 56 px); `--measure-read` (68ch) caps prose, never sheets.
- Radii: `--radius-control` 10 (buttons, fields), `--radius-card` 12 (cards, empty states), `--radius-sheet` 14 (sheets),
  `--radius-pill` (chips, the floating New), 50% (avatars, today's disc).
- Touch targets are at least 44 px; focus rings are always visible.

## Elevation and motion

- Sheets (`Sheet`, `Spread`, `.panel`) declare elevation once: `--sheet-shadow` with the `--sheet-edge` hairline drawn
  inside it. Cards on a sheet (`NoteCard`) carry only the edge; hover adds the shadow. Modals and menus are sheets with
  `--shadow` over `--overlay`. Fields are sunken: `--ground` fill, `--spine` edge, lifting to `--sheet` with a ribbon
  outline on focus.
- Motion is 120 to 240 ms on `transform` and `opacity` only, with `--ease-out` (or `--ease-drawer` for
  sheets). Everything stops under `prefers-reduced-motion`; the backdrop blur drops under
  `prefers-reduced-transparency`.

## Shared components (`src/shared/ui.tsx`)

| Component | Use it for |
|---|---|
| `PageHeading` | every page's title (display size), its actions on the title's baseline, and a quiet meta line under it (`eyebrow` · `description`; nothing sits above the title) |
| `Sheet` | `{ children, label?, className? }`: a section on the sheet material |
| `Spread` | `{ left, right, label?, className? }`: two facing pages (about 55/45) with a spine; stacks when the sheet is under 720 px wide (container query) |
| `WeekStrip` | `{ date, today?, marked?, selected?, onPrev, onNext, onToday, onSelect? }`: Sunday to Saturday around `date` (YYYY-MM-DD), today as the ribbon disc, a dot on `marked` days; days are buttons only when `onSelect` is given |
| `Chip` | `{ tone?: "due" \| "later", children }`: "Due tonight 11:59 PM" in the due color, "In 12 days" quiet |
| `Modal` | any dialog (becomes a sheet on phones) |
| `DeleteNoteDialog` | confirming a note deletion |
| `Empty` | an empty list or no-results message |
| `NoteCard` | a note in a grid or list |
| `EventRow` | an event in a day list |
| `Avatar` | a student's photo or initial |
| `DateLabel` | a date with a consistent format |

Utility classes in `ui.module.css` (`primary` on the ribbon, `secondary`, `quiet`, `danger`, `dangerOutline`, `textLink`, `panel`,
`form`, `muted`, `error`, `notice`, `segment`, `srOnly`) are the one set of buttons, links and panels; screens do not
invent their own.

## Where each feature's styles live

| Screen | Component | Styles |
|---|---|---|
| Shared parts and cross-screen rules | `src/shared/ui.tsx` | `src/shared/ui.module.css` |
| Shell (sidebar, tab bar, New menu) | `src/app/App.tsx` | `src/app/shell.module.css` |
| Today | `src/features/dashboard.tsx` | `src/features/dashboard.module.css` |
| Schedule and event windows | `src/features/schedule.tsx` | `src/features/schedule.module.css` |
| Assignments | `src/features/assignments.tsx` | `src/features/assignments.module.css` |
| Notes list | `src/features/notes-list.tsx` | `src/features/notes-list.module.css` |
| Note editor (with `checklist-editor.tsx`, `collaborators.tsx`) | `src/features/note-editor.tsx` | `src/features/note-editor.module.css` |
| Course page | `src/features/course-page.tsx` | `src/features/course-page.module.css` |
| Courses list and Add course | `courses.tsx`, `course-dialog.tsx` | `src/features/courses.module.css` |
| Friends (with `share-notes.tsx`) | `src/features/friends.tsx` | `src/features/friends.module.css` |
| Upload and review | `src/features/imports.tsx` | `src/features/imports.module.css` |
| Landing, log in, sign up | `src/features/onboarding.tsx` | `src/features/onboarding.module.css` |
| Account and Settings | `account.tsx`, `settings.tsx` | `settings.module.css`, `appearance.module.css` |

A class used by one screen lives in that screen's module. A class used by two or more screens, or by a shared
component, lives in `ui.module.css`. Where a screen's own rule needs a shared class in a compound selector
(for example `.agenda .muted`), the screen applies both through a small `both` object at the top of its file.
`src/main.tsx` imports `ui.module.css` first so screen rules can override shared ones.

## Adding a color scheme

1. In `tokens.css`, add a light block `:root[data-scheme="name"]` and a dark block
   `:root[data-scheme="name"][data-theme="dark"]`, each with every variable above (copy a block and change values).
2. Check `--danger` is at least 4.5:1 on `--danger-soft` and on `--surface`, and `--muted` on `--bg`.
3. Add the name to the scheme list in `src/domain.ts`, the picker in `src/features/settings.tsx`, the allowed
   values in `backend/lib/preferences.php`, and the cases in `tests/frontend/pages/213-color-schemes`.
4. Credit the palette below if it comes from a published one.

## Credits

Fjord is built on Nord (MIT License, Sven Greb). Rose is built on Rosé Pine (MIT License, Rosé Pine
contributors). Mocha is built on Catppuccin Latte and Mocha (MIT License, Catppuccin). Sage is Notely's own.
