import type { Course, CourseEvent } from "../domain";
import type { CoursesApi } from "./courses-http";

// shortcut: one-time adoption of pre-Nov-2026 browser data, delete after Sprint 4
// Before card 142 a signed-in student's courses and events (hand-made ones, and edited copies of syllabus
// events) were kept only in this browser. This sends each one to the server once. Each item that is saved
// is taken out of the stored copy at once, so a retry on the next load never sends it twice (a course
// deleted on the server meanwhile doesn't come back, and a hand-made event isn't duplicated). The key is
// removed only when nothing is left; anything that failed stays and is tried again on the next load.
export const workspaceKey = (userId: string) => `notely-workspace-v1-${userId}`;

export async function adoptBrowserWorkspace(userId: string, api: Pick<CoursesApi, "save" | "saveEvent">, storage: Storage = localStorage) {
  const key = workspaceKey(userId);
  let data: { courses?: unknown; events?: unknown; notes?: unknown; [key: string]: unknown };
  try {
    const saved = storage.getItem(key);
    if (!saved) return;
    data = JSON.parse(saved);
    if (!data || typeof data !== "object") return;
  } catch {
    return; // Unreadable storage or a damaged copy: leave it untouched rather than lose it.
  }
  const courses = Array.isArray(data.courses) ? [...data.courses as Course[]] : [];
  const events = Array.isArray(data.events) ? [...data.events as CourseEvent[]] : [];
  const write = () => storage.setItem(key, JSON.stringify({ ...data, courses, events }));
  for (const course of [...courses]) {
    try { await api.save(course); } catch { continue; }
    courses.splice(courses.indexOf(course), 1);
    write();
  }
  for (const event of [...events]) {
    // Browser-made ids are UUIDs, which the server refuses: those are sent as new events. A numeric id is a
    // syllabus event edited here, saved over the server's copy; if that copy is gone, the edit becomes new.
    const own = /^\d+$/.test(event.id ?? "");
    try {
      await api.saveEvent({ ...event, id: own ? event.id : "" }).catch((e) => {
        if (own && (e as { status?: number }).status === 404) return api.saveEvent({ ...event, id: "" });
        throw e;
      });
    } catch { continue; }
    events.splice(events.indexOf(event), 1);
    write();
  }
  // Notes saved here before task #120 were never copied to the server, so a copy that still has some is kept.
  if (!courses.length && !events.length && !(Array.isArray(data.notes) && data.notes.length)) storage.removeItem(key);
}
