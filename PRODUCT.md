# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

University students (UB, CSE 442's own audience) who keep lecture notes per course, turn their course syllabi into a semester schedule, and check what is due today. They use it on a laptop during and after class and on a phone in between classes, often for short glances.

## Product Purpose

Notely keeps a student's semester in one calm place: courses, their notes, their schedule and deadlines, and the classmates they study with. Success is a student opening Today and knowing in seconds what is next, then writing or finding a note without friction.

## Positioning

The schedule builds itself from the student's real syllabi (an AI reader places lectures, labs, exams and "week of" items on the right days, asking for the student's section when needed), and every note lives inside the course and lecture it belongs to.

## Operating Context

- Pages: Today, Schedule, Assignments, Notes (list and editor), Courses (list, course page, syllabus upload and review), Friends, Settings (Account, Appearance, Data), and the landing / log in / sign up flow.
- Notes are rich text (TipTap) with a formatting toolbar, details and people panels, history, reminders, pinning and sharing with friends.
- Data lives on the server per account so laptop and phone agree.
- Built and graded inside the CSE 442 course: Sprint 4 freezes on Dec 1, 2026.

## Capabilities and Constraints

- React + TypeScript + Vite, CSS modules, every color a CSS variable in `src/app/tokens.css` (no hex elsewhere; a unit test enforces it).
- Must keep working: the four color schemes (Sage, Fjord, Rosé, Mocha) in light and dark, and up to four custom themes a student builds from three colors (`src/services/palette.ts`).
- Typeface stays Inter.
- Every screen works from 320 px phones to very wide monitors with no dead space and no horizontal scroll; touch targets at least 44 px.
- Each change ships through a scrum card with a test page on the course test server.

## Brand Commitments

- Name: Notely. Voice: warm, plain, encouraging ("Your ideas, right within reach.").
- Typeface: Inter (user decision, 2026-11-17).
- Color schemes and custom themes are a product feature and stay.
- The polish should sit alongside Things 3 / Apple Notes, Notion / Craft, and Linear / Arc (user decision, 2026-11-17).
- It must not feel like a corporate dashboard, and must not feel bare (big empty areas, thin hairlines on flat white, nothing to hold the eye).

## Evidence on Hand

- Real syllabi for testing live in the local-only `slides/syllabi` folder (never committed or shown in the app).
- No testimonials, user counts or press exist; none may be invented.

## Product Principles

1. Today first: the next thing due is never more than a glance away.
2. Notes belong somewhere: every note sits in its course and lecture.
3. Calm, not empty: rich in structure and detail, quiet in noise.
4. The student's theme is theirs: every surface follows the chosen scheme.
5. Same app on every screen: phone and monitor are both first-class.

## Accessibility & Inclusion

Text meets WCAG AA contrast in every scheme and mode; focus is always visible; everything works by keyboard; motion stops under reduced-motion settings.
