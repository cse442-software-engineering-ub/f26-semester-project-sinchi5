import type { CourseEvent } from "../domain";

export interface RepeatRule {
  every: 1 | 2;
  days: number[];
  until: string;
}

export type RepeatableCourseEvent = CourseEvent & {
  repeat?: RepeatRule;
  repeatOf?: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function dateValue(date: string) {
  const [year, month, day] = date.split("-").map(Number);

  return Date.UTC(year, month - 1, day);
}

function dateKey(value: number) {
  const date = new Date(value);

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function weekStart(value: number) {
  const date = new Date(value);

  return value - date.getUTCDay() * DAY_MS;
}

function oneYearAfter(date: string) {
  const [year, month, day] = date.split("-").map(Number);

  const lastDay = new Date(
    Date.UTC(year + 1, month, 0),
  ).getUTCDate();

  return dateKey(
    Date.UTC(
      year + 1,
      month - 1,
      Math.min(day, lastDay),
    ),
  );
}

export function checkRepeat(
  rule: RepeatRule,
  start: string,
) {
  if (rule.until < start) {
    return "Choose an end date after the start date.";
  }

  if (rule.until > oneYearAfter(start)) {
    return "Repeating events can run for at most one year.";
  }

  if (rule.days.length === 0) {
    return "Choose at least one day.";
  }

  return null;
}

export function expandRepeats(
  event: RepeatableCourseEvent,
  from: string,
  to: string,
): RepeatableCourseEvent[] {
  if (from > to) return [];

  const rule = event.repeat;

  if (!rule) {
    return event.date >= from && event.date <= to
      ? [{ ...event }]
      : [];
  }

  const start = dateValue(event.date);
  const first = Math.max(start, dateValue(from));
  const last = Math.min(
    dateValue(rule.until),
    dateValue(to),
  );

  if (first > last) return [];

  const startWeek = weekStart(start);
  const selectedDays = new Set(rule.days);
  const repeats: RepeatableCourseEvent[] = [];

  for (
    let value = first;
    value <= last;
    value += DAY_MS
  ) {
    const weekday = new Date(value).getUTCDay();

    if (!selectedDays.has(weekday)) continue;

    const weeksFromStart = Math.floor(
      (weekStart(value) - startWeek) /
        (7 * DAY_MS),
    );

    if (
      weeksFromStart < 0 ||
      weeksFromStart % rule.every !== 0
    ) {
      continue;
    }

    repeats.push({
      ...event,
      date: dateKey(value),
      repeatOf: event.id,
    });
  }

  return repeats;
}