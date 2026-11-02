// Card 44: cleans what the server's reader (Gemini, card 127) found in a syllabus, and turns each weekly
// class into its dates. Nothing here touches the schedule.
export type SyllabusEventKind = "assignment" | "exam" | "quiz" | "deadline" | "other";
export const SYLLABUS_EVENT_KINDS: readonly SyllabusEventKind[] = ["assignment", "exam", "quiz", "deadline", "other"];
export type ClassKind = "lecture" | "recitation" | "lab";
export const CLASS_KINDS: readonly ClassKind[] = ["lecture", "recitation", "lab"];
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
    const key = `${title.toLowerCase()}|${date}|${time}`;
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
    const kind = CLASS_KINDS.includes(raw.kind as ClassKind) ? (raw.kind as ClassKind) : "lecture";
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
