# AGENTS.md

## Project overview

This project is the front-end mockup for **margin°**, a student-first notes app. Its main promise is simple: turn the messy inputs around a semester—syllabi, handwritten pages, deadlines, group notes—into a calm, searchable workspace.

The core flow is:

1. A student uploads a syllabus.
2. margin detects courses, weeks, subjects, assignments, exams, and due dates.
3. The student confirms or edits the detected events.
4. The schedule and notes stay connected through course and lecture date metadata.

Notes also support photo capture, automatic organization, keyword search, categories, pinning, reminders, checklists, collaborator permissions, and comments.

## Working agreements

- Keep this repository dependency-free unless a change clearly benefits from a framework or package.
- Use plain HTML, CSS, and JavaScript patterns that can be understood and tested without a build step.
- Preserve the main confirmation pattern: every meaningful action should produce a visible state change, updated list, modal confirmation, or toast.
- Treat sample data as demo fixtures. Do not imply that file uploads, OCR, syllabus parsing, reminders, or collaboration are backed by a real service yet.
- Keep course metadata attached to notes and events. A note should be able to show its course and lecture date at a glance.
- Use semantic HTML and accessible labels for interactive controls. Keyboard focus and Escape-to-close behavior matter for the modal flows.
- Use the existing design language: ink-dark navigation, warm paper surfaces, mint as the primary action/success accent, coral for attention, and DM Mono for compact metadata.
- Inter is the primary UI font and is loaded from Google Fonts in `index.html`.
- Add temporary or incomplete content as clearly labeled placeholder notes, for example `Formatting placeholder — lecture 07`, rather than disguising it as final product content.

## UI behaviors to protect

- Syllabus upload opens a detected-events confirmation view.
- The top-bar color-scheme picker supports Mint, Apricot, and Ocean. New palette work should update the shared CSS variables so cards, accents, and controls stay coordinated.
- Saving an edited or manually created event updates the schedule immediately.
- Note search narrows the results to matching note content.
- Category filters and sorting rearrange the notes view.
- Pinning changes the note’s pinned state and keeps pinned notes in the overview collection.
- Opening a note navigates to a dedicated page with the note content, checklist, collaborators, comments, and an `All notes` breadcrumb.
- Note editing uses plain Markdown in the browser. Keep the toolbar and parser aligned when adding formatting options, and preserve the preview/edit flow.
- Checklist items can be toggled or added from the note page. Keep checklist state attached to the demo note while the prototype remains in memory.
- Shared notes are discoverable in the “Shared with me” view.

## Local verification

Run the mockup with:

```bash
python3 -m http.server 4173
```

Then manually verify the core flows in a browser:

- Search `binary` and confirm only matching notes are shown.
- Switch between Overview, All notes, Course schedule, and Shared with me.
- Upload any local file through the syllabus drop zone and confirm the scan modal.
- Add or edit a schedule event and confirm it appears in the schedule.
- Open a note, enter Edit note mode, add Markdown formatting and a checklist item, preview the result, toggle a checklist item, invite a collaborator, and add a comment.
- Resize the viewport to check the mobile layout.

For a quick JavaScript syntax check, run:

```bash
node --check app.js
```

## Change boundaries

Do not add authentication, backend persistence, billing, or real OCR as part of a visual mockup-only change. If product requirements expand into those areas, document the new boundary and keep the UI’s optimistic/prototype states easy to replace with real data.
