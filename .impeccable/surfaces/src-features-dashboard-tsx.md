---
version: 1
slug: "src-features-dashboard-tsx"
primary_target: "src/features/dashboard.tsx"
related_targets: ["src/app/App.tsx","src/shared/ui.tsx","src/app/tokens.css"]
---

# App shell and Today (Operate)

Scope: the signed-in app (sidebar shell, Today first; every other screen inherits). Mode: Operate.
Audience and job: a UB student on a laptop in class or a phone between classes; knows in seconds where they are in the day, what is next, what is due, and opens today's lecture note in one click.
Constraints: Inter only; all colour from scheme variables (four schemes, light/dark, custom themes); 320 px to very wide with no dead space; 44 px targets; no corporate dashboard, nothing bare.
Memorable moment: the Now ribbon crossing the day's hour rail.
Unresolved: how Settings and the landing page carry the spread (decide per screen card).

## Direction contract

THESIS: The day reads as an open planner spread: time on the left page, the notes and deadlines that belong to it on the facing page. It refuses the category default of floating white cards scattered on an empty ground.

OWN-WORLD: A scheme-tinted ground; content on wide white sheets (radius 14, soft two-layer shadow) split by a spine gutter; faint ruled hour lines; one accent ribbon (primary) marking now and the active item; Inter with tabular figures; a week strip where today is a filled accent disc; course events as soft tinted blocks with a 3 px course-coloured edge.

STORY: The student sees where they are in the day, what comes next and what is due, then opens or starts today's lecture note from the facing page.

FIRST VIEWPORT: Today at 1440: week strip across the top; one sheet below: left page about 55% with "Tuesday" at 40 px, the date and due count, and an 8 AM to 6 PM hour rail with event blocks and the Now ribbon; right page with "Notes for today" (open or start a note per class) above a "Due" list. New stays in the sidebar. On phones the pages stack: rail first, then notes and due.

FORM: The Planner Spread, first on the ordered list (Impeccable's pick, chosen by the user). seed:025df7475ef10d0c

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
