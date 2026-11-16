import type { Course, CourseEvent } from "../domain";
import { createApiClient } from "./notes-http";

// Courses and hand-made events for signed-in accounts (card 142, routes from card 141).
// The student's events are listed and deleted through the syllabus client's `events` and `event-delete`.
export function createHttpCourses(endpoint = `${import.meta.env.BASE_URL}api/index.php`, fetcher: typeof fetch = fetch) {
  const send = createApiClient(endpoint, fetcher, "Could not reach Notely. Check your connection and try again.",
    "Your courses and events are unavailable right now. Please try again later.");
  return {
    async list() {
      return (await send<{ courses: Course[] }>("courses")).courses;
    },
    // No id: the server makes one. An id: update, or create with that id (how old browser courses are adopted).
    async save({ id, code, name, color, term, classesStart, classesEnd }: Omit<Course, "id"> & { id?: string }) {
      return (await send<{ course: Course }>("course-save", {
        ...(id ? { id } : {}), code, name, color, term,
        ...(classesStart ? { classesStart } : {}), ...(classesEnd ? { classesEnd } : {}),
      })).course;
    },
    // Also removes the course's events; its notes keep their text and lose the course.
    async delete(id: string) {
      await send("course-delete", { id });
    },
    // No id: a new hand-made event. An id: the whole event (hand-made or imported) is replaced, so every field is sent.
    async saveEvent({ id, courseId, title, kind, date, time, location, description, repeat }: CourseEvent) {
      return (await send<{ event: CourseEvent }>("event-save", {
        ...(id ? { id } : {}), courseId, title, kind, date, time, location, description: description ?? "",
        ...(repeat ? { repeat: { every: repeat.every, days: repeat.days, until: repeat.until } } : {}),
      })).event;
    },
  };
}
export type CoursesApi = ReturnType<typeof createHttpCourses>;
