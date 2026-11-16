// The cases of card 228, shared by the unit test and the test page (tests/frontend/pages/228-placement.*).
import type { PlacementContext, PlacementEvent, Placement } from "./syllabus-placement";

export const FILE = "src/services/syllabus-placement.ts → placeRangedEvent";
// Fall 2026: classes start Wed Aug 26. Lecture Mon/Wed/Fri 09:00, lab Tuesday 14:00, recitation Thursday 11:00.
export const ctx: PlacementContext = {
  meetings: {
    lecture: { days: [1, 3, 5], time: "09:00", first: "2026-08-26", last: "2026-12-09" },
    lab: { days: [2], time: "14:00" },
    recitation: { days: [4], time: "11:00" },
  },
  noClass: [{ from: "2026-10-06", to: "2026-10-06" }, { from: "2026-11-23", to: "2026-11-27" }],
  classesStart: "2026-08-26",
};
const open: PlacementContext = { ...ctx, noClass: [] };
const item = (f: Partial<PlacementEvent>): PlacementEvent => ({ date: "", time: "", ...f });
const range = (rangeStart: string, rangeEnd: string, f: Partial<PlacementEvent> = {}) => item({ rangeStart, rangeEnd, ...f });
const placed = (date: string, time: string, reason: string): Placement => ({ date, time, derived: true, reason });
const undated: Placement = { date: "", time: "", derived: false, reason: "" };

export interface Case { label: string; event: PlacementEvent; context: PlacementContext; want: Placement }
export const cases: Case[] = [
  { label: "1. An item with an exact date is moved", event: item({ date: "2026-10-08", time: "17:00", meeting: "lab" }), context: open,
    want: { date: "2026-10-08", time: "17:00", derived: false, reason: "" } },
  { label: "2. An exact date inside a no-class range is moved", event: item({ date: "2026-11-24", meeting: "lecture" }), context: ctx,
    want: { date: "2026-11-24", time: "", derived: false, reason: "" } },
  { label: "3. A lab item is not placed on the student's lab day at the lab's start", event: range("2026-10-12", "2026-10-16", { meeting: "lab" }), context: ctx,
    want: placed("2026-10-13", "14:00", "Date worked out from October 12–16") },
  { label: "4. A lab that meets twice does not use the first lab day", event: range("2026-10-12", "2026-10-16", { meeting: "lab" }),
    context: { ...ctx, meetings: { ...ctx.meetings, lab: { days: [2, 4], time: "14:00" } } }, want: placed("2026-10-13", "14:00", "Date worked out from October 12–16") },
  { label: "5. A recitation item is not placed on the recitation day at its start", event: range("2026-10-12", "2026-10-16", { meeting: "recitation" }), context: ctx,
    want: placed("2026-10-15", "11:00", "Date worked out from October 12–16") },
  { label: "6. A lecture item is not placed on the last lecture in the range", event: range("2026-10-12", "2026-10-16", { meeting: "lecture" }), context: ctx,
    want: placed("2026-10-16", "09:00", "Date worked out from October 12–16") },
  { label: "7. An item with no meeting type is not placed on the last day at 23:59", event: range("2026-10-12", "2026-10-16"), context: ctx,
    want: placed("2026-10-16", "23:59", "Date worked out from October 12–16") },
  { label: "8. A meeting type the student has no section for is not placed on the last day at 23:59", event: range("2026-10-12", "2026-10-16", { meeting: "recitation" }),
    context: { ...ctx, meetings: { lecture: ctx.meetings.lecture } }, want: placed("2026-10-16", "23:59", "Date worked out from October 12–16") },
  { label: "9. A chosen meeting with no days is treated as a real meeting", event: range("2026-10-12", "2026-10-16", { meeting: "lab" }),
    context: { ...ctx, meetings: { lab: { days: [], time: "14:00" } } }, want: placed("2026-10-16", "23:59", "Date worked out from October 12–16") },
  { label: "10. A lab day inside a no-class range is not moved to the next lab day in the range", event: range("2026-10-05", "2026-10-16", { meeting: "lab" }), context: ctx,
    want: placed("2026-10-13", "14:00", "Date worked out from October 5–16") },
  { label: "11. A no-class lab day with no later lab in the range is not placed on the last day at 23:59", event: range("2026-10-05", "2026-10-09", { meeting: "lab" }), context: ctx,
    want: placed("2026-10-09", "23:59", "Date worked out from October 5–9") },
  { label: "12. A lecture whose last meeting is in a no-class week is not placed on the last day at 23:59", event: range("2026-11-23", "2026-11-27", { meeting: "lecture" }), context: ctx,
    want: placed("2026-11-27", "23:59", "Date worked out from November 23–27") },
  { label: "13. A range across two months is not named by both months", event: range("2026-10-28", "2026-11-03", { meeting: "lab" }), context: open,
    want: placed("2026-11-03", "14:00", "Date worked out from October 28 – November 3") },
  { label: "14. A range across New Year loses its year or its lecture days", event: range("2026-12-28", "2027-01-03", { meeting: "lecture" }),
    context: { ...open, meetings: { lecture: { days: [1, 3, 5], time: "09:00" } } }, want: placed("2027-01-01", "09:00", "Date worked out from December 28, 2026 – January 3, 2027") },
  { label: "15. A lecture after the section's last class date is still used", event: range("2026-12-14", "2026-12-18", { meeting: "lecture" }), context: ctx,
    want: placed("2026-12-18", "23:59", "Date worked out from December 14–18") },
  { label: "16. A lab before the section's first date is still used", event: range("2026-08-17", "2026-08-21", { meeting: "lab" }),
    context: { ...open, meetings: { lab: { days: [2], time: "14:00", first: "2026-08-25" } } }, want: placed("2026-08-21", "23:59", "Date worked out from August 17–21") },
  { label: "17. A two-day range with a lab day is not placed on it", event: range("2026-10-13", "2026-10-14", { meeting: "lab" }), context: ctx,
    want: placed("2026-10-13", "14:00", "Date worked out from October 13–14") },
  { label: "18. A two-day range with no lab day is not placed on its last day at 23:59", event: range("2026-10-14", "2026-10-15", { meeting: "lab" }), context: ctx,
    want: placed("2026-10-15", "23:59", "Date worked out from October 14–15") },
  { label: "19. A one-day range is not placed on that day", event: range("2026-10-14", "2026-10-14", { meeting: "lecture" }), context: ctx,
    want: placed("2026-10-14", "09:00", "Date worked out from October 14") },
  { label: "20. A time the file gave for the item is replaced by the class start", event: range("2026-10-12", "2026-10-16", { meeting: "lab", time: "17:00" }), context: ctx,
    want: placed("2026-10-13", "17:00", "Date worked out from October 12–16") },
  { label: "21. Week 5 is not counted from the Monday of the lecture's first week", event: item({ week: 5 }), context: ctx,
    want: placed("2026-09-27", "23:59", "Date worked out from week 5 (September 21–27)") },
  { label: "22. Week 5 of a lab item is not placed on the lab day of that week", event: item({ week: 5, meeting: "lab" }), context: ctx,
    want: placed("2026-09-22", "14:00", "Date worked out from week 5 (September 21–27)") },
  { label: "23. Week 1 is counted from the wrong Monday when the first lecture is a Sunday", event: item({ week: 1, meeting: "recitation" }),
    context: { ...ctx, meetings: { ...ctx.meetings, lecture: { days: [0], time: "09:00", first: "2026-08-30" } } }, want: placed("2026-08-27", "11:00", "Date worked out from week 1 (August 24–30)") },
  { label: "24. A week that crosses two months is not named by both", event: item({ week: 6 }), context: ctx,
    want: placed("2026-10-04", "23:59", "Date worked out from week 6 (September 28 – October 4)") },
  { label: "25. A week with no lecture date does not use the first day of classes", event: item({ week: 2, meeting: "lecture" }),
    context: { ...ctx, meetings: { ...ctx.meetings, lecture: { days: [1, 3, 5], time: "09:00" } } }, want: placed("2026-09-04", "09:00", "Date worked out from week 2 (August 31 – September 6)") },
  { label: "26. A week with no first date at all is guessed instead of left undated", event: item({ week: 5, meeting: "lab" }),
    context: { meetings: { lab: { days: [2], time: "14:00" } }, noClass: [] }, want: undated },
  { label: "27. A week above 30 is placed", event: item({ week: 31 }), context: ctx, want: undated },
  { label: "28. A week of 0 is placed", event: item({ week: 0 }), context: ctx, want: undated },
  { label: "29. A reversed range is placed", event: range("2026-10-16", "2026-10-12", { meeting: "lab" }), context: ctx, want: undated },
  { label: "30. An item with no date, range, or week is placed", event: item({ meeting: "lab", time: "10:00" }), context: ctx,
    want: { date: "", time: "10:00", derived: false, reason: "" } },
  { label: "31. A range does not win over a week when the file gave both", event: range("2026-10-12", "2026-10-16", { week: 5, meeting: "lecture" }), context: ctx,
    want: placed("2026-10-16", "09:00", "Date worked out from October 12–16") },
];
