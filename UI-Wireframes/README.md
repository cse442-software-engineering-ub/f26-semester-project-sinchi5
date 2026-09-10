# margin°

margin is a clean, collaborative notes workspace for students. A student uploads course syllabi at the start of a semester and gets an organized view of courses, weeks, lectures, assignments, exams, and due dates. Notes can be captured from a handwritten photo, automatically associated with a course and lecture date, searched, sorted, categorized, pinned, shared, and commented on.

This repository is a front-end UI mockup for that product idea. It uses realistic sample content and lightweight client-side interactions to make the core user stories tangible without requiring a backend or authentication service.

## Run locally

The mockup is intentionally dependency-free:

```bash
python3 -m http.server 4171
```

Then open [http://localhost:4171](http://localhost:4171) in a browser.

## What is implemented

- Overview dashboard with a weekly course schedule, upcoming focus items, and pinned notes.
- Color-scheme picker with persistent Mint, Apricot, and Ocean palettes.
- Syllabus upload/drop zone with a detected-course confirmation modal showing assignments, exams, and dates.
- Editable course events and manual event creation, with changes reflected in the schedule.
- Handwritten-note capture flow with automatic course/date organization confirmation.
- Notes workspace with keyword search, category filters, pinned-note state, and sorting controls.
- Dedicated note page with the note itself, checklist items, collaborators, and comments.
- Markdown note editor with headings, emphasis, bullets, quotes, inline code, live preview, and custom checklist items.
- Shared-with-me view for collaborator access and study-group notes.
- Responsive layout for desktop, tablet, and narrow mobile screens.

## Product intent

The primary confirmation pattern is visible state change: when something is uploaded, edited, searched, shared, pinned, or scheduled, the mockup responds with a modal, an updated list, or a toast. This mirrors the acceptance criteria in the user stories and gives future implementation work a clear interaction contract.

## File map

- `index.html` — app shell, views, accessible labels, modal host, and upload inputs.
- `styles.css` — visual system, responsive layout, typography, motion, and component states.
- `app.js` — sample data, view switching, filters, sorting, schedule editing, modals, and demo feedback.
- `AGENTS.md` — contributor instructions and product guardrails.

## Notes for extending the mockup

This is a prototype, so uploads and persistence are simulated in memory. A production implementation should replace the sample arrays with API calls, persist note/event state, parse syllabus files server-side, OCR handwritten notes, and add real-time collaboration. Keep the visible confirmation states even when those services are introduced.
