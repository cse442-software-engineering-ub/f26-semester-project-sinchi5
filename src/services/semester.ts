import type { CourseEvent } from "../domain";

export interface SemesterWeek {
  weekStart: string;
  label: string;
  events: CourseEvent[];
}

export interface SemesterList {
  upcoming: SemesterWeek[];
  past: CourseEvent[];
}

function dateValue(date: string) {
  return new Date(`${date}T12:00:00`);
}

function weekStart(date: string) {
  const value = dateValue(date);
  value.setDate(value.getDate() - value.getDay());

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function weekLabel(date: string) {
  return `Week of ${dateValue(date).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  })}`;
}

function compareUpcoming(a: CourseEvent, b: CourseEvent) {
  const dateCompare = a.date.localeCompare(b.date);

  if (dateCompare !== 0) return dateCompare;

  if (!a.time && b.time) return -1;
  if (a.time && !b.time) return 1;

  return a.time.localeCompare(b.time);
}

export function semesterList(
  events: CourseEvent[],
  today: string,
  courseId?: string,
): SemesterList {
  const filtered = events.filter((event) => {
    if (event.kind === "lecture") return false;

    if (courseId === undefined) return true;

    return event.courseId === courseId;
  });

  const upcomingEvents = filtered
    .filter((event) => event.date >= today)
    .sort(compareUpcoming);

  const past = filtered
    .filter((event) => event.date < today)
    .sort((a, b) => {
      const dateCompare = b.date.localeCompare(a.date);

      if (dateCompare !== 0) return dateCompare;

      if (!a.time && b.time) return -1;
      if (a.time && !b.time) return 1;

      return b.time.localeCompare(a.time);
    });

  const groups = new Map<string, CourseEvent[]>();

  for (const event of upcomingEvents) {
    const start = weekStart(event.date);
    const group = groups.get(start) ?? [];

    group.push(event);
    groups.set(start, group);
  }

  const upcoming = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([start, weekEvents]) => ({
      weekStart: start,
      label: weekLabel(start),
      events: weekEvents,
    }));

  return {
    upcoming,
    past,
  };
}