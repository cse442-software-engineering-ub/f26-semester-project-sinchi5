// Card 234: the placement cases, written once. The test page (234-placement.test.tsx) and the private unit test
// (src/services/syllabus-placement.test.ts) both run this list against the real placeRangedEvent.
// Fall 2026 calendar used below: Aug 24, Sep 21, Sep 28, Oct 5, Nov 23 and Dec 28 are Mondays.
import type { Placement, PlacementContext, RangedEvent } from "../../../src/services/syllabus-placement";

const FILE = "src/services/syllabus-placement.ts";
const PLACE = `${FILE} → placeRangedEvent`;
const RANGE = `${FILE} → rangeOf`;

// The student's sections: lecture Mon/Wed/Fri 1:00 PM, lab Tuesday 2:00 PM, recitation Thursday 9:00 AM.
const lecture = { days: [1, 3, 5], time: "13:00", firstDate: "2026-08-24", lastDate: "2026-12-07" };
const lab = { days: [2], time: "14:00" };
const recitation = { days: [4], time: "09:00" };
const usual: PlacementContext = { meetings: { lecture: [lecture], lab: [lab], recitation: [recitation] }, noClass: [] };
const oct5to9 = { date: "", rangeStart: "2026-10-05", rangeEnd: "2026-10-09" };
const from = (label: string) => `Date worked out from ${label}`;
const undated: Placement = { date: "", time: "", derived: false, reason: "" };

export interface PlacementCase {
  label: string;
  lookAt: string;
  event: RangedEvent;
  context: PlacementContext;
  expect: Placement;
}

export const CASES: PlacementCase[] = [
  { label: "An item with an exact date is moved, or marked as worked out", lookAt: `${PLACE} (the first line: an exact date is returned as it is)`,
    event: { date: "2026-09-28", time: "23:59", rangeStart: "2026-10-05", rangeEnd: "2026-10-09", week: 7, meeting: "lab" }, context: usual,
    expect: { date: "2026-09-28", time: "23:59", derived: false, reason: "" } },
  { label: "An exactly dated item with no time is given a time", lookAt: `${PLACE} (the first line)`,
    event: { date: "2026-10-14" }, context: usual, expect: { date: "2026-10-14", time: "", derived: false, reason: "" } },
  { label: "A lab item is not put on the student's lab day at the lab's start time", lookAt: `${PLACE} (scheduled and chosen)`,
    event: { ...oct5to9, meeting: "lab" }, context: usual, expect: { date: "2026-10-06", time: "14:00", derived: true, reason: from("October 5–9") } },
  { label: "A recitation item lands on the lab or lecture day instead of the recitation day", lookAt: `${PLACE} (context.meetings[event.meeting])`,
    event: { ...oct5to9, meeting: "recitation" }, context: usual, expect: { date: "2026-10-08", time: "09:00", derived: true, reason: from("October 5–9") } },
  { label: "A lecture item lands on the first lecture of the range instead of the last", lookAt: `${PLACE} (the lecture branch of chosen)`,
    event: { ...oct5to9, meeting: "lecture" }, context: usual, expect: { date: "2026-10-09", time: "13:00", derived: true, reason: from("October 5–9") } },
  { label: "An item with no meeting type is not due on the last day of the range at 11:59 PM", lookAt: `${PLACE} (the last return)`,
    event: { ...oct5to9, meeting: "" }, context: usual, expect: { date: "2026-10-09", time: "23:59", derived: true, reason: from("October 5–9") } },
  { label: "A lab item for a student with no lab section is dropped or put on a lecture day", lookAt: `${PLACE} (no chosen meeting of that kind)`,
    event: { ...oct5to9, meeting: "lab" }, context: { meetings: { lecture: [lecture] }, noClass: [] },
    expect: { date: "2026-10-09", time: "23:59", derived: true, reason: from("October 5–9") } },
  { label: "A lab that meets twice a week puts the item on the second lab day instead of the first", lookAt: `${PLACE} (scheduled[0])`,
    event: { ...oct5to9, meeting: "lab" }, context: { ...usual, meetings: { lab: [{ days: [2, 4], time: "14:00" }] } },
    expect: { date: "2026-10-06", time: "14:00", derived: true, reason: from("October 5–9") } },
  { label: "A lab day with no class keeps the item on that day instead of moving it to the next lab in the range", lookAt: `${PLACE} (the closed check)`,
    event: { ...oct5to9, meeting: "lab" }, context: { meetings: { lab: [{ days: [2, 4], time: "14:00" }] }, noClass: [{ from: "2026-10-06", to: "2026-10-06" }] },
    expect: { date: "2026-10-08", time: "14:00", derived: true, reason: from("October 5–9") } },
  { label: "A lab day with no class and no other lab in the range is not moved to the last day at 11:59 PM", lookAt: `${PLACE} (the closed check, then the last return)`,
    event: { ...oct5to9, meeting: "lab" }, context: { ...usual, noClass: [{ from: "2026-10-06", to: "2026-10-06" }] },
    expect: { date: "2026-10-09", time: "23:59", derived: true, reason: from("October 5–9") } },
  { label: "A last lecture that falls in a break keeps the lecture time instead of the last day at 11:59 PM", lookAt: `${PLACE} (the closed check: no lecture follows the last one)`,
    event: { date: "", rangeStart: "2026-11-23", rangeEnd: "2026-11-27", meeting: "lecture" }, context: { ...usual, noClass: [{ from: "2026-11-25", to: "2026-11-27" }] },
    expect: { date: "2026-11-27", time: "23:59", derived: true, reason: from("November 23–27") } },
  { label: "A range that is all break leaves the item undated instead of on its last day", lookAt: `${PLACE} (the last return)`,
    event: { date: "", rangeStart: "2026-11-23", rangeEnd: "2026-11-27", meeting: "recitation" }, context: { ...usual, noClass: [{ from: "2026-11-23", to: "2026-11-27" }] },
    expect: { date: "2026-11-27", time: "23:59", derived: true, reason: from("November 23–27") } },
  { label: "A break on another day moves an item whose own class day is open", lookAt: `${PLACE} (closed is asked only about the chosen day)`,
    event: { ...oct5to9, meeting: "lab" }, context: { ...usual, noClass: [{ from: "2026-10-05", to: "2026-10-05" }, { from: "2026-10-09", to: "2026-10-09" }] },
    expect: { date: "2026-10-06", time: "14:00", derived: true, reason: from("October 5–9") } },
  { label: "Week 5 is not counted from the Monday of the first lecture's week (Aug 24), or the reason omits the week", lookAt: `${RANGE} (the week branch)`,
    event: { date: "", week: 5, meeting: "lab" }, context: usual, expect: { date: "2026-09-22", time: "14:00", derived: true, reason: from("week 5 (September 21–27)") } },
  { label: "Week 1 starts on the first class day (a Wednesday) instead of that week's Monday, or ends before Sunday", lookAt: `${RANGE} (the Monday of the first week)`,
    event: { date: "", week: 1 }, context: { meetings: { lecture: [{ ...lecture, firstDate: "2026-08-26" }] }, noClass: [] },
    expect: { date: "2026-08-30", time: "23:59", derived: true, reason: from("week 1 (August 24–30)") } },
  { label: "A course whose first day is a Sunday counts week 1 from the next Monday instead of the Monday before", lookAt: `${RANGE} (the Monday of the first week)`,
    event: { date: "", week: 1 }, context: { meetings: {}, noClass: [], classesStart: "2026-08-30" },
    expect: { date: "2026-08-30", time: "23:59", derived: true, reason: from("week 1 (August 24–30)") } },
  { label: "A week is left undated when only the course's first day of classes is known", lookAt: `${RANGE} (the classesStart fallback)`,
    event: { date: "", week: 2, meeting: "lecture" }, context: { meetings: { lecture: [{ days: [1, 3, 5], time: "13:00" }] }, noClass: [], classesStart: "2026-08-31" },
    expect: { date: "2026-09-11", time: "13:00", derived: true, reason: from("week 2 (September 7–13)") } },
  { label: "Weeks are counted from the course's first day when the lecture's own first date is known", lookAt: `${RANGE} (the lecture's first date comes first)`,
    event: { date: "", week: 1, meeting: "lecture" }, context: { ...usual, classesStart: "2026-08-31" },
    expect: { date: "2026-08-28", time: "13:00", derived: true, reason: from("week 1 (August 24–30)") } },
  { label: "A week is given a made-up day when neither the lecture's first date nor the first day of classes is known", lookAt: `${RANGE} (returns null without a first day)`,
    event: { date: "", week: 5, meeting: "lab" }, context: { meetings: { lab: [lab] }, noClass: [] }, expect: undated },
  { label: "A range that crosses into the next month loses its class day, or its reason names one month", lookAt: `${FILE} → describeRange, and addDays`,
    event: { date: "", rangeStart: "2026-09-28", rangeEnd: "2026-10-02", meeting: "recitation" }, context: usual,
    expect: { date: "2026-10-01", time: "09:00", derived: true, reason: from("September 28 – October 2") } },
  { label: "A range that crosses into the next year lands in the wrong year, or its reason has no years", lookAt: `${FILE} → describeRange, and addDays`,
    event: { date: "", rangeStart: "2026-12-28", rangeEnd: "2027-01-01", meeting: "lecture" }, context: { meetings: { lecture: [{ days: [1, 3, 5], time: "13:00" }] }, noClass: [] },
    expect: { date: "2027-01-01", time: "13:00", derived: true, reason: from("December 28, 2026 – January 1, 2027") } },
  { label: "A range shorter than a week reaches outside itself for the lab day (Tuesday is not in Wed–Fri)", lookAt: `${PLACE} (scheduled stays inside the range)`,
    event: { date: "", rangeStart: "2026-10-07", rangeEnd: "2026-10-09", meeting: "lab" }, context: usual,
    expect: { date: "2026-10-09", time: "23:59", derived: true, reason: from("October 7–9") } },
  { label: "A one-day range is refused, or its reason reads as a span", lookAt: `${FILE} → describeRange (from equals to)`,
    event: { date: "", rangeStart: "2026-10-07", rangeEnd: "2026-10-07", meeting: "lecture" }, context: usual,
    expect: { date: "2026-10-07", time: "13:00", derived: true, reason: from("October 7") } },
  { label: "A span with only its first day (\"week of October 5\") is refused instead of running through Sunday", lookAt: `${RANGE} (the span branch)`,
    event: { date: "", rangeStart: "2026-10-05" }, context: usual, expect: { date: "2026-10-11", time: "23:59", derived: true, reason: from("October 5–11") } },
  { label: "A lab item is put on a Tuesday before the student's lab has started", lookAt: `${PLACE} (firstDate bounds scheduled)`,
    event: { date: "", rangeStart: "2026-08-31", rangeEnd: "2026-09-04", meeting: "lab" }, context: { meetings: { lab: [{ ...lab, firstDate: "2026-09-08" }] }, noClass: [] },
    expect: { date: "2026-09-04", time: "23:59", derived: true, reason: from("August 31 – September 4") } },
  { label: "A lecture item is put on a day after the last lecture of the term (Dec 7)", lookAt: `${PLACE} (lastDate bounds scheduled)`,
    event: { date: "", rangeStart: "2026-12-07", rangeEnd: "2026-12-11", meeting: "lecture" }, context: usual,
    expect: { date: "2026-12-07", time: "13:00", derived: true, reason: from("December 7–11") } },
  { label: "A due time the syllabus gave the item is replaced by the class time or by 11:59 PM", lookAt: `${PLACE} (time || chosen.time)`,
    event: { ...oct5to9, time: "17:00", meeting: "lab" }, context: usual, expect: { date: "2026-10-06", time: "17:00", derived: true, reason: from("October 5–9") } },
  { label: "A section with no posted start time leaves the item with an empty or invalid time", lookAt: `${PLACE} (END_OF_DAY when the class has no time)`,
    event: { ...oct5to9, meeting: "lab" }, context: { meetings: { lab: [{ days: [2], time: "" }] }, noClass: [] },
    expect: { date: "2026-10-06", time: "23:59", derived: true, reason: from("October 5–9") } },
  { label: "A lecture with different times on different days uses the wrong day's time", lookAt: `${PLACE} (the sort of scheduled)`,
    event: { ...oct5to9, meeting: "lecture" }, context: { meetings: { lecture: [{ days: [3], time: "15:00" }, { days: [1], time: "10:00" }] }, noClass: [] },
    expect: { date: "2026-10-07", time: "15:00", derived: true, reason: from("October 5–9") } },
  { label: "A span that ends before it starts is given a day", lookAt: `${RANGE} (to >= rangeStart)`,
    event: { date: "", rangeStart: "2026-10-09", rangeEnd: "2026-10-05", meeting: "lab" }, context: usual, expect: undated },
  { label: "A span with an impossible day (February 30) is given a day", lookAt: `${FILE} → isDate`,
    event: { date: "", rangeStart: "2026-02-30", rangeEnd: "2026-03-02" }, context: usual, expect: undated },
  { label: "Week 0 is given a day", lookAt: `${RANGE} (week must be a whole number from 1 to 30)`,
    event: { date: "", week: 0 }, context: usual, expect: undated },
  { label: "Week 31 is given a day", lookAt: `${RANGE} (week must be a whole number from 1 to 30)`,
    event: { date: "", week: 31 }, context: usual, expect: undated },
  { label: "Week 2.5 is given a day", lookAt: `${RANGE} (week must be a whole number from 1 to 30)`,
    event: { date: "", week: 2.5 }, context: usual, expect: undated },
  { label: "Week 30, the last allowed, is refused", lookAt: `${RANGE} (week must be a whole number from 1 to 30)`,
    event: { date: "", week: 30 }, context: usual, expect: { date: "2027-03-21", time: "23:59", derived: true, reason: from("week 30 (March 15–21)") } },
  { label: "An item with no date, span, or week (\"Final exam: TBA\") is given a day, or loses its time", lookAt: `${RANGE} (returns null)`,
    event: { date: "", time: "08:00", meeting: "lecture" }, context: usual, expect: { date: "", time: "08:00", derived: false, reason: "" } },
];
