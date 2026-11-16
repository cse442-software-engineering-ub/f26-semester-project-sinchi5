// Card 234: gives a day to a syllabus item that came with only a span of days ("Oct 5–9") or a numbered
// week ("Week 5"). The reader (card 233) never picks the day; this does, from the student's own sections.
// Pure: no clock, no storage, no network. Dates are calendar days counted in UTC, like meetingDates.
import type { ClassKind } from "../domain";
import { meetingDates, type DateRange } from "./syllabus";

// What placement reads from an event. A ProposedEvent or a DetectedEvent carrying the reader's fields fits.
export interface RangedEvent {
  date: string;
  time?: string;
  rangeStart?: string;
  rangeEnd?: string;
  week?: number;
  meeting?: ClassKind | "";
}
// One weekly time of a section the student is in. firstDate and lastDate bound it when they are known.
export interface ChosenMeeting {
  days: number[];
  time: string;
  firstDate?: string;
  lastDate?: string;
}
export interface PlacementContext {
  // The student's own section of each kind. A class with different times on different days is one entry per time.
  meetings: Partial<Record<ClassKind, ChosenMeeting[]>>;
  noClass: DateRange[];
  // The course's first day of classes, used to count weeks when the lecture's first date isn't known.
  classesStart?: string;
}
export interface Placement {
  date: string;
  time: string;
  // True when this function worked the day out, so the review screen shows the reason.
  derived: boolean;
  reason: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const END_OF_DAY = "23:59";
const isDate = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(Date.parse(value) || 0).toISOString().slice(0, 10) === value;
const addDays = (date: string, days: number) => new Date(Date.parse(date) + days * DAY_MS).toISOString().slice(0, 10);
const weekday = (date: string) => new Date(Date.parse(date)).getUTCDay();

// "October 5–9", "September 28 – October 2", "December 28, 2026 – January 1, 2027", or "October 7".
export function describeRange(from: string, to: string): string {
  const part = (date: string, options: Intl.DateTimeFormatOptions) => new Date(Date.parse(date)).toLocaleDateString("en-US", { timeZone: "UTC", ...options });
  const long = (date: string, year: boolean) => part(date, { month: "long", day: "numeric", ...(year ? { year: "numeric" } : {}) });
  if (from === to) return long(from, false);
  const years = from.slice(0, 4) !== to.slice(0, 4);
  return !years && from.slice(0, 7) === to.slice(0, 7)
    ? `${long(from, false)}–${part(to, { day: "numeric" })}`
    : `${long(from, years)} – ${long(to, years)}`;
}

// The days the item may fall on, with how to name them, or null when the event gives nothing to work from.
function rangeOf(event: RangedEvent, context: PlacementContext): { from: string; to: string; label: string } | null {
  if (isDate(event.rangeStart)) {
    // A span with only its first day ("week of October 5") runs through that week's Sunday.
    const to = event.rangeEnd ? event.rangeEnd : addDays(event.rangeStart, (7 - weekday(event.rangeStart)) % 7);
    return isDate(to) && to >= event.rangeStart ? { from: event.rangeStart, to, label: describeRange(event.rangeStart, to) } : null;
  }
  const week = event.week;
  if (typeof week !== "number" || !Number.isInteger(week) || week < 1 || week > 30) return null;
  // Week 1 is the Monday-to-Sunday week that holds the first lecture, or the course's first day of classes.
  const first = (context.meetings.lecture ?? []).map((m) => m.firstDate).filter(isDate).sort()[0] ?? context.classesStart;
  if (!isDate(first)) return null;
  const from = addDays(first, -((weekday(first) + 6) % 7) + 7 * (week - 1));
  const to = addDays(from, 6);
  return { from, to, label: `week ${week} (${describeRange(from, to)})` };
}

// An item with an exact date comes back unchanged (derived false). An item with a span or week gets:
// - lab or recitation item: the student's first lab or recitation day in the range, at that class's start time;
// - lecture item: the last lecture in the range, at the lecture's start time;
// - no meeting type, no chosen section of that kind, or no such class day in the range: the range's last day, 23:59.
// A chosen day with no class moves to the next meeting of that kind in the range, or to the last day at 23:59.
// A time the syllabus gave the item is kept. With nothing to work from, the item stays undated (derived false).
export function placeRangedEvent(event: RangedEvent, context: PlacementContext): Placement {
  const time = event.time ?? "";
  if (event.date) return { date: event.date, time, derived: false, reason: "" };
  const range = rangeOf(event, context);
  if (!range) return { date: "", time, derived: false, reason: "" };
  const reason = `Date worked out from ${range.label}`;
  const closed = (date: string) => context.noClass.some((off) => date >= off.from && date <= off.to);
  // Every scheduled meeting of the item's kind inside the range, in order, whether or not class is held.
  const scheduled = (event.meeting ? context.meetings[event.meeting] ?? [] : [])
    .flatMap((m) => meetingDates({
      days: m.days,
      starts: isDate(m.firstDate) && m.firstDate > range.from ? m.firstDate : range.from,
      ends: isDate(m.lastDate) && m.lastDate < range.to ? m.lastDate : range.to,
    }).map((date) => ({ date, time: m.time })))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  let chosen = event.meeting === "lecture" ? scheduled.at(-1) : scheduled[0];
  if (chosen && closed(chosen.date)) {
    const after = chosen.date;
    chosen = scheduled.find((m) => m.date > after && !closed(m.date));
  }
  return chosen
    ? { date: chosen.date, time: time || chosen.time || END_OF_DAY, derived: true, reason }
    : { date: range.to, time: time || END_OF_DAY, derived: true, reason };
}
