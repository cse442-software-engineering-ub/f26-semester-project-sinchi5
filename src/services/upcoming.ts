import { isClass, type CourseEvent } from "../domain";

export interface WeekAheadGroup {
  date: string;
  label: string;
  events: CourseEvent[];
}

export type ComingUpEvent = CourseEvent & { daysAway: number };

const DAY = 86_400_000;
const dayLabel = new Intl.DateTimeFormat("en-US", {
  weekday: "long", month: "long", day: "numeric", timeZone: "UTC",
});

// Task #134: numeric calendar-day values avoid timezone-sensitive date-only parsing.
// UTC is only a calendar coordinate here, so DST cannot shorten or lengthen a day.
function calendarDay(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  const utc = new Date(0);
  utc.setUTCFullYear(year, month - 1, day);
  return utc.getTime() / DAY;
}

function byTime(a: CourseEvent, b: CourseEvent): number {
  // Empty times sort first; equal times retain input order through stable Array.sort.
  return a.time.localeCompare(b.time);
}

/** Due events for Story #133's seven-day overview, including today. */
export function weekAhead(events: readonly CourseEvent[], today: string): WeekAheadGroup[] {
  const start = calendarDay(today);
  const groups = new Map<string, WeekAheadGroup>();
  for (const event of events) {
    const daysAway = calendarDay(event.date) - start;
    // Normal class meetings belong on the schedule, rather than the due-this-week list.
    if (isClass(event.kind) || daysAway < 0 || daysAway >= 7) continue;
    let group = groups.get(event.date);
    if (!group) {
      group = {
        date: event.date,
        label: daysAway === 0 ? "Today" : daysAway === 1 ? "Tomorrow"
          : dayLabel.format(new Date((start + daysAway) * DAY)),
        events: [],
      };
      groups.set(event.date, group);
    }
    group.events.push(event);
  }
  // Sort newly allocated groups and arrays, leaving the original events untouched.
  return [...groups.values()]
    .sort((a, b) => calendarDay(a.date) - calendarDay(b.date))
    .map((group) => ({ ...group, events: group.events.sort(byTime) }));
}

/** Next exams and project deadlines for Story #133 (projects use kind "deadline"). */
export function comingUp(events: readonly CourseEvent[], today: string, limit = 3): ComingUpEvent[] {
  const start = calendarDay(today);
  return events
    .filter((event) => event.kind === "exam" || event.kind === "deadline")
    // Calendar subtraction keeps daysAway correct even across daylight-saving changes.
    .map((event) => ({ ...event, daysAway: calendarDay(event.date) - start }))
    // Start after the seven-day window so the two Task #134 collections don't overlap.
    .filter((event) => event.daysAway >= 7)
    .sort((a, b) => a.daysAway - b.daysAway || byTime(a, b))
    .slice(0, Math.max(0, limit));
}
