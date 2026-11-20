import type { CourseEvent } from "../domain";
import { formatEventTime } from "../shared/ui";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// "Lecture Mon, Wed 10:00 AM · Lab Fri 2:00 PM": one part per weekly class saved from a syllabus (card 47).
export function meetingTimes(events: CourseEvent[]): string {
  const series = new Map<string, CourseEvent[]>();
  for (const e of events) if (e.seriesId) series.set(e.seriesId, [...(series.get(e.seriesId) ?? []), e]);
  return [...series.values()].map((list) => {
    const days = [...new Set(list.map((e) => new Date(`${e.date}T12:00:00`).getDay()))]
      .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => DAYS[d]).join(", ");
    const kind = list[0].kind[0].toUpperCase() + list[0].kind.slice(1);
    return `${kind} ${days}${list[0].time ? ` ${formatEventTime(list[0].time)}` : ""}`;
  }).join(" · ");
}
