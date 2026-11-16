// Test helper: an in-memory stand-in for the PHP API's notes, courses and events routes (cards 120, 141, 142).
import type { Course, CourseEvent, Note, NoteRepository } from "../domain";
import type { CoursesApi } from "./courses-http";
import type { SyllabusApi } from "./imports-http";
import { NoteServiceError } from "./notes-http";
import { filterNotes } from "./repositories";
import { courses as sampleCourses, dateKey } from "./fixtures";

export function fakeApi(seed: { courses?: Course[]; events?: CourseEvent[]; syllabus?: object; ownerId?: string } = {}) {
  const store = {
    courses: structuredClone(seed.courses ?? sampleCourses),
    events: structuredClone(seed.events ?? []),
    notes: [] as Note[],
  };
  const calls: { route: string; body?: unknown }[] = [];
  // Set to make a request fail the way the server would.
  const api = { failWhen: (_route: string, _body: unknown): NoteServiceError | void => undefined };
  let next = 100;
  const call = (route: string, body?: unknown) => {
    calls.push(body === undefined ? { route } : { route, body: structuredClone(body) });
    const error = api.failWhen(route, body);
    if (error) throw error;
  };
  const notFound = (what: string) => new NoteServiceError(`This ${what} could not be found.`, 404);
  const notes = {
    async list(q) { call("notes"); return filterNotes(store.notes, q); },
    async get(id) { const note = store.notes.find((n) => n.id === id); if (!note) throw notFound("note"); return { ...note }; },
    async create(data) {
      call("note-create", data);
      const now = new Date().toISOString();
      const note: Note = { id: String(next++), title: "Untitled note", body: "", courseId: "", lectureDate: dateKey(), category: "School",
        visibility: "private", tags: [], pinned: false, createdAt: now, updatedAt: now, ...data, ownerId: seed.ownerId ?? "1" };
      store.notes.unshift(note);
      return { ...note };
    },
    async delete(id) { call("note-delete", { id }); store.notes = store.notes.filter((n) => n.id !== id); },
  } as Partial<NoteRepository> as NoteRepository;
  const courses: CoursesApi = {
    async list() { call("courses"); return structuredClone(store.courses); },
    async save(course) {
      call("course-save", course);
      const saved = { ...course, id: course.id || `c-${next++}` } as Course;
      const at = store.courses.findIndex((c) => c.id === saved.id);
      if (at < 0) store.courses.push(saved); else store.courses[at] = saved;
      return { ...saved };
    },
    async delete(id) {
      call("course-delete", { id });
      if (!store.courses.some((c) => c.id === id)) throw notFound("course");
      store.courses = store.courses.filter((c) => c.id !== id);
      store.events = store.events.filter((e) => e.courseId !== id);
    },
    async clearWorkspace() {
      call("workspace-clear", { confirm: "CLEAR" });
      store.courses = []; store.events = []; store.notes = [];
    },
    async saveEvent(event) {
      call("event-save", Object.fromEntries(Object.entries(event).filter(([key, value]) => key !== "id" || value)));
      if (event.id && !/^\d+$/.test(event.id)) throw new NoteServiceError("Choose a valid event.", 422);
      const old = store.events.find((e) => e.id === event.id);
      if (event.id && !old) throw notFound("event");
      const saved: CourseEvent = { ...event, id: event.id || String(next++), source: old?.source ?? "manual" };
      store.events = [...store.events.filter((e) => e.id !== saved.id), saved];
      return { ...saved };
    },
  };
  const syllabus = {
    async events() { call("events"); return structuredClone(store.events); },
    async deleteEvent(id: string, wholeSeries = false) {
      call("event-delete", wholeSeries ? { id, series: true } : { id });
      const found = store.events.find((e) => e.id === id);
      if (!found) throw notFound("event");
      store.events = store.events.filter((e) => e.id !== id && !(wholeSeries && found.seriesId && e.seriesId === found.seriesId));
    },
    ...seed.syllabus,
  } as unknown as SyllabusApi;
  return Object.assign(api, { notes, courses, syllabus, calls, store });
}
