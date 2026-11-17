// Card 44: cleans what the server's reader (Gemini, card 127) found in a syllabus, and turns each weekly
// class into its dates. Nothing here touches the schedule.
import { CLASS_KINDS, type ClassKind, type DetectedEvent, type DetectedMeeting } from "../domain";
import { placeRangedEvent, type ChosenMeeting, type PlacementContext } from "./syllabus-placement";

export type SyllabusEventKind = "assignment" | "exam" | "quiz" | "deadline" | "other";
export const SYLLABUS_EVENT_KINDS: readonly SyllabusEventKind[] = ["assignment", "exam", "quiz", "deadline", "other"];
export const MAX_SYLLABUS_EVENTS = 200;
const MAX_MEETINGS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;
// Longer than this is a typo in a date, and it would flood the schedule.
const MAX_CLASS_DAYS = 366;

export interface ProposedEvent {
  title: string;
  kind: SyllabusEventKind;
  // YYYY-MM-DD, or "" when the syllabus doesn't give one clear date.
  date: string;
  // 24-hour HH:MM, only when the syllabus names a time.
  time?: string;
  location?: string;
  // The syllabus text the event came from, so the student can check it.
  source: string;
  // Set when the date is missing; the student must pick it.
  needsReview?: true;
  // Card 235: a span or week the file gave instead of a day (only when date is ""), and the class it belongs to.
  rangeStart?: string;
  rangeEnd?: string;
  week?: number;
  meeting?: ClassKind;
}

// A weekly class as the reader found it. days are numbers, with 0 for Sunday.
export interface ProposedMeeting {
  title: string;
  kind: ClassKind;
  section: string;
  days: number[];
  time: string;
  location: string;
  firstDate: string;
  lastDate: string;
  source: string;
}

export interface DateRange {
  from: string;
  to: string;
}

// Returns the value when it is a real YYYY-MM-DD day, or "".
function realDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const time = Date.parse(value);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value ? value : "";
}

const clockTime = (value: unknown) => (typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : "");

function plainText(value: unknown, max: number) {
  if (typeof value !== "string") return "";
  // Control and invisible characters never belong in a title; other text is kept exactly.
  return Array.from(value.replace(/\p{C}+/gu, " ").replace(/\s+/g, " ").trim()).slice(0, max).join("");
}

const list = (items: unknown): Record<string, unknown>[] =>
  Array.isArray(items) ? items.filter((item) => item && typeof item === "object") : [];

// Known kinds, real dates or a review flag, no duplicates, and at most MAX_SYLLABUS_EVENTS.
export function normalizeEvents(items: unknown): ProposedEvent[] {
  const seen = new Set<string>();
  const events: ProposedEvent[] = [];
  for (const raw of list(items)) {
    if (events.length >= MAX_SYLLABUS_EVENTS) break;
    const title = plainText(raw.title, 255);
    if (!title) continue;
    const date = realDate(raw.date);
    const time = clockTime(raw.time);
    const location = plainText(raw.location, 120);
    const rangeStart = date ? "" : realDate(raw.rangeStart);
    const rangeEnd = date ? "" : realDate(raw.rangeEnd);
    const week = !date && Number.isInteger(raw.week) && (raw.week as number) >= 1 && (raw.week as number) <= 30 ? (raw.week as number) : 0;
    const meeting = !date && CLASS_KINDS.includes(raw.meeting as ClassKind) ? (raw.meeting as ClassKind) : undefined;
    // The same title in different weeks is different work.
    const key = `${title.toLowerCase()}|${date}|${time}|${rangeStart}|${rangeEnd}|${week}`;
    if (seen.has(key)) continue;
    seen.add(key);
    events.push({
      title,
      kind: SYLLABUS_EVENT_KINDS.includes(raw.kind as SyllabusEventKind) ? (raw.kind as SyllabusEventKind) : "other",
      date,
      ...(time ? { time } : {}),
      ...(location ? { location } : {}),
      source: plainText(raw.source, 500),
      ...(date ? {} : { needsReview: true as const }),
      ...(rangeStart && rangeEnd ? { rangeStart, rangeEnd } : {}),
      ...(week ? { week } : {}),
      ...(meeting ? { meeting } : {}),
    });
  }
  return events;
}

// A class with no real weekdays can't repeat, so it is left out.
export function normalizeMeetings(items: unknown): ProposedMeeting[] {
  return list(items).flatMap((raw) => {
    const days = [...new Set(Array.isArray(raw.days) ? (raw.days as unknown[]) : [])]
      .filter((day): day is number => Number.isInteger(day) && (day as number) >= 0 && (day as number) <= 6)
      .sort((a, b) => a - b);
    if (!days.length) return [];
    const kind: ClassKind = CLASS_KINDS.includes(raw.kind as ClassKind) ? (raw.kind as ClassKind) : "lecture";
    return [{
      title: plainText(raw.title, 120) || kind[0].toUpperCase() + kind.slice(1),
      kind,
      section: plainText(raw.section, 60),
      days,
      time: clockTime(raw.time),
      location: plainText(raw.location, 120),
      firstDate: realDate(raw.firstDate),
      lastDate: realDate(raw.lastDate),
      source: plainText(raw.source, 500),
    }];
  }).slice(0, MAX_MEETINGS);
}

export function normalizeBreaks(items: unknown): DateRange[] {
  return list(items).flatMap((raw) => {
    const from = realDate(raw.from);
    const to = realDate(raw.to);
    return from ? [{ from, to: to >= from ? to : from }] : [];
  });
}

// Why a weekly class can't be added as it stands, or null when it can.
export function checkMeeting(meeting: { days: number[]; starts: string; ends: string }, noClass: DateRange[] = []): string | null {
  if (!meeting.days.length) return "Choose at least one day.";
  if (!realDate(meeting.starts) || !realDate(meeting.ends)) return "Choose when each class starts and ends.";
  if (meeting.ends <= meeting.starts) return "Choose an end date after the start date.";
  if ((Date.parse(meeting.ends) - Date.parse(meeting.starts)) / DAY_MS > MAX_CLASS_DAYS) return "Repeating events can run for at most one year.";
  if (!meetingDates(meeting, noClass).length) return "This class has no meetings between its start and end dates.";
  return null;
}

// Each date the class meets, first to last, skipping days with no class. Dates are counted in UTC, as
// calendar days, so a clock change can't move a class to another day.
export function meetingDates(meeting: { days: number[]; starts: string; ends: string }, noClass: DateRange[] = []): string[] {
  const dates: string[] = [];
  const end = Date.parse(meeting.ends);
  for (let time = Date.parse(meeting.starts); time <= end; time += DAY_MS) {
    const day = new Date(time);
    const date = day.toISOString().slice(0, 10);
    if (meeting.days.includes(day.getUTCDay()) && !noClass.some((range) => date >= range.from && date <= range.to)) dates.push(date);
  }
  return dates;
}

// Card 235: the review screen asks for the student's section only where a span or week item needs it.
export const isRanged = (e: Pick<DetectedEvent, "rangeStart" | "week">) => !!(e.rangeStart || e.week);
export type SectionAnswers = Partial<Record<ClassKind, { choice: string; time: string }>>;
export interface SectionQuestion {
  kind: ClassKind;
  // Indexes of the posted sections in the meetings list; empty means ask for a day instead.
  sections: number[];
}
// A type is asked about when a span or week item belongs to it and the read doesn't name exactly one meeting
// of that type. A choice is "m<index>" for a posted section or "d<0-6>" for a day; "" is "Not sure".
export function sectionQuestions(events: DetectedEvent[], meetings: DetectedMeeting[]): SectionQuestion[] {
  return CLASS_KINDS.flatMap((kind) => {
    const ofKind = meetings.flatMap((m, i) => (m.kind === kind ? [i] : []));
    if (ofKind.length === 1 || !events.some((e) => isRanged(e) && e.meeting === kind)) return [];
    return [{ kind, sections: ofKind.filter((i) => meetings[i].section) }];
  });
}
const chosen = (m: DetectedMeeting): ChosenMeeting => ({ days: m.days, time: m.time, first: m.starts || undefined, last: m.ends || undefined });
export function placementContext(meetings: DetectedMeeting[], noClass: DateRange[] = [], answers: SectionAnswers, classesStart?: string): PlacementContext {
  const found: PlacementContext["meetings"] = {};
  for (const kind of CLASS_KINDS) {
    const ofKind = meetings.filter((m) => m.kind === kind);
    const { choice = "", time = "" } = answers[kind] ?? {};
    if (ofKind.length === 1) found[kind] = chosen(ofKind[0]);
    else if (choice[0] === "m" && meetings[+choice.slice(1)]?.kind === kind) found[kind] = chosen(meetings[+choice.slice(1)]);
    else if (choice[0] === "d") found[kind] = { days: [+choice.slice(1)], time };
  }
  return { meetings: found, noClass, classesStart };
}
// The event as the review shows it: a span or week item sits on its placed day, with the reason. When no
// day can be worked out it stays as the reader gave it (undated and unchecked).
export function applyPlacement(e: DetectedEvent, ctx: PlacementContext): DetectedEvent & { hint?: string } {
  if (!isRanged(e) || e.date !== "") return e;
  const p = placeRangedEvent(e, ctx);
  return p.derived
    ? { ...e, date: p.date, time: p.time, needsReview: false, include: e.include ?? true, hint: p.reason }
    : { ...e, include: e.include ?? false };
}
