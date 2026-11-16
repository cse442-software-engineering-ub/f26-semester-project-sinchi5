// Card 228: works out the day of a syllabus item that the file gave only as a span ("Oct 5–9") or a week
// ("Week 5"), from the meetings the student chose. Pure: no clock, no storage, no network. All dates are
// YYYY-MM-DD and are counted as calendar days, so time zones and daylight saving never matter.
import type { ClassKind } from "../domain";

export interface ChosenMeeting {
  days: number[]; // 0 is Sunday
  time: string; // start, HH:MM, or ""
  first?: string; // the meeting's first and last class days, when known
  last?: string;
}
export interface PlacementContext {
  meetings: Partial<Record<ClassKind, ChosenMeeting>>;
  noClass: { from: string; to: string }[];
  classesStart?: string; // the course's first day of classes
}
// The fields of a reviewed item that placement reads (a DetectedEvent has them).
export interface PlacementEvent {
  date: string;
  time: string;
  rangeStart?: string;
  rangeEnd?: string;
  week?: number;
  meeting?: ClassKind;
}
export interface Placement {
  date: string; // "" when it stays undated
  time: string;
  derived: boolean; // true only when this function chose the day
  reason: string; // the review text, "" unless derived
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY = 86400000;
const END_OF_DAY = "23:59";
const ms = (d: string) => Date.parse(d);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const real = (d?: string): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(ms(d)) && iso(ms(d)) === d;
const label = (d: string, year: boolean) => `${MONTHS[+d.slice(5, 7) - 1]} ${+d.slice(8)}${year ? `, ${d.slice(0, 4)}` : ""}`;

// "October 5–9", "October 28 – November 3", "December 28, 2026 – January 3, 2027", or one day.
function describeRange(a: string, b: string): string {
  if (a === b) return label(a, false);
  if (a.slice(0, 4) !== b.slice(0, 4)) return `${label(a, true)} – ${label(b, true)}`;
  if (a.slice(0, 7) === b.slice(0, 7)) return `${label(a, false)}–${+b.slice(8)}`;
  return `${label(a, false)} – ${label(b, false)}`;
}

// The first and last day the item can fall on, and how the file said it, or null when it can't be placed.
function span(e: PlacementEvent, ctx: PlacementContext): { start: string; end: string; from: string } | null {
  if (real(e.rangeStart) && real(e.rangeEnd)) {
    return e.rangeStart <= e.rangeEnd ? { start: e.rangeStart, end: e.rangeEnd, from: describeRange(e.rangeStart, e.rangeEnd) } : null;
  }
  if (!Number.isInteger(e.week) || e.week! < 1 || e.week! > 30) return null;
  const base = ctx.meetings.lecture?.first ?? ctx.classesStart;
  if (!real(base)) return null;
  // Week 1 is the Monday-to-Sunday week that holds the base day.
  const monday = ms(base) - ((new Date(ms(base)).getUTCDay() + 6) % 7) * DAY;
  const start = iso(monday + (e.week! - 1) * 7 * DAY);
  const end = iso(ms(start) + 6 * DAY);
  return { start, end, from: `week ${e.week} (${describeRange(start, end)})` };
}

export function placeRangedEvent(event: PlacementEvent, context: PlacementContext): Placement {
  // A day the file gave is never touched.
  if (event.date !== "") return { date: event.date, time: event.time, derived: false, reason: "" };
  const range = span(event, context);
  if (!range) return { date: "", time: event.time, derived: false, reason: "" };
  const reason = `Date worked out from ${range.from}`;
  const lastDay = { date: range.end, time: END_OF_DAY, derived: true, reason };
  const meeting = event.meeting ? context.meetings[event.meeting] : undefined;
  if (!meeting || meeting.days.length === 0) return lastDay;

  const meets: string[] = [];
  for (let t = ms(range.start); t <= ms(range.end); t += DAY) {
    const d = iso(t);
    if (meeting.days.includes(new Date(t).getUTCDay()) && (!meeting.first || d >= meeting.first) && (!meeting.last || d <= meeting.last)) meets.push(d);
  }
  // Labs and recitations are done on the first such day; a lecture's work is due at its last meeting.
  const index = event.meeting === "lecture" ? meets.length - 1 : 0;
  const off = (d: string) => context.noClass.some((n) => d >= n.from && d <= n.to);
  const day = meets[index] === undefined ? undefined : off(meets[index]) ? meets.slice(index + 1).find((d) => !off(d)) : meets[index];
  // A time the file gave for the item itself stays; otherwise it is due when the class starts.
  return day === undefined ? lastDay : { date: day, time: event.time || meeting.time, derived: true, reason };
}
